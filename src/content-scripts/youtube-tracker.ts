/// <reference types="chrome" />

/**
 * @file youtube-tracker.ts
 * @description SmartBookmark Pro - YouTube 시청 기록 추적 Content Script
 *
 * YouTube SPA 네비게이션을 감지하고 동영상 시청 데이터를 추출하여
 * Service Worker로 전송합니다.
 *
 * 매칭 URL: https://www.youtube.com/*
 */

import type {
  YouTubeVideoData,
  SavedTimestamp,
} from '../types/index';

// ---------------------------------------------------------------------------
// 상태 관리
// ---------------------------------------------------------------------------

/** 현재 추적 중인 동영상 ID */
let currentVideoId: string | null = null;

/** 현재 동영상 시청 시작 시각 (ms) */
let watchStartTime: number | null = null;

/** 타임스탬프 버튼 주입 여부 */
let timestampButtonInjected = false;

/** progress 전송 타이머 ID */
let progressTimerId: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// URL 파싱 유틸리티
// ---------------------------------------------------------------------------

/**
 * YouTube URL에서 videoId를 파싱합니다.
 *
 * 지원 형식:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID&t=123
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 *
 * @param url 파싱할 URL 문자열
 * @returns videoId 또는 null
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // /watch?v= 형식
    if (parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }

    // /shorts/VIDEO_ID 형식
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];

    // /embed/VIDEO_ID 형식
    const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];

    // youtu.be/VIDEO_ID 형식
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // URL 파싱 실패 - 무시
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOM 데이터 추출
// ---------------------------------------------------------------------------

/**
 * YouTube 플레이어 페이지에서 동영상 데이터를 추출합니다.
 *
 * @param videoId 추출 대상 동영상 ID
 * @returns YouTubeVideoData (watchDuration, timestamps 제외)
 */
export function captureVideoData(
  videoId: string
): Omit<YouTubeVideoData, 'watchDuration' | 'timestamps'> {
  // 제목
  const titleEl =
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ??
    document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ??
    document.querySelector('#title h1 yt-formatted-string') ??
    document.querySelector('title');

  const title =
    titleEl?.textContent?.trim() ??
    document.title.replace(' - YouTube', '').trim() ??
    'Unknown Title';

  // 채널명 & 채널 URL
  const channelLinkEl =
    document.querySelector<HTMLAnchorElement>(
      'ytd-channel-name a.yt-simple-endpoint'
    ) ??
    document.querySelector<HTMLAnchorElement>(
      '#owner #channel-name a'
    ) ??
    document.querySelector<HTMLAnchorElement>(
      'ytd-video-owner-renderer a.yt-simple-endpoint'
    );

  const channelName =
    channelLinkEl?.textContent?.trim() ?? 'Unknown Channel';

  const channelHref = channelLinkEl?.href ?? '';
  const channelUrl = channelHref
    ? new URL(channelHref, 'https://www.youtube.com').href
    : '';

  // 썸네일 URL (YouTube API 표준 URL 구성)
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // 동영상 길이 (초)
  const duration = parseVideoDuration();

  return {
    videoId,
    title,
    channelName,
    channelUrl,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl,
    duration,
    watchedAt: new Date().toISOString(),
  };
}

/**
 * 플레이어의 재생 길이(초)를 파싱합니다.
 * ytd-thumbnail-overlay-time-status-renderer 또는 video 엘리먼트에서 추출합니다.
 *
 * @returns 초 단위 정수, 없으면 undefined
 */
function parseVideoDuration(): number | undefined {
  // video 엘리먼트에서 직접 읽기 (가장 정확)
  const videoEl = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (videoEl && videoEl.duration && isFinite(videoEl.duration)) {
    return Math.floor(videoEl.duration);
  }

  // 재생 시간 표시 텍스트에서 파싱
  const timeEl = document.querySelector(
    'ytd-thumbnail-overlay-time-status-renderer span.ytd-thumbnail-overlay-time-status-renderer'
  );
  if (timeEl?.textContent) {
    return parseDurationText(timeEl.textContent.trim());
  }

  return undefined;
}

/**
 * "H:MM:SS" 또는 "M:SS" 형식의 시간 문자열을 초로 변환합니다.
 */
function parseDurationText(text: string): number | undefined {
  const parts = text.split(':').map(Number);
  if (parts.some(isNaN)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

// ---------------------------------------------------------------------------
// Service Worker 메시지 전송
// ---------------------------------------------------------------------------

/**
 * 새 동영상 시청 시작을 Service Worker에 알립니다.
 */
async function sendVideoStarted(
  data: Omit<YouTubeVideoData, 'watchDuration' | 'timestamps'>
): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'YOUTUBE_VIDEO_STARTED',
      data,
    });
  } catch (err) {
    console.warn('[SmartBookmark] YOUTUBE_VIDEO_STARTED 전송 실패:', err);
  }
}

/**
 * 시청 진행 상황을 Service Worker에 주기적으로 전송합니다.
 */
async function sendVideoProgress(videoId: string, watchedSeconds: number): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'YOUTUBE_VIDEO_PROGRESS',
      data: { videoId, watchedSeconds },
    });
  } catch {
    // 무시 - progress는 best-effort
  }
}

/**
 * 동영상 시청 종료/전환 시 최종 시청 시간을 Service Worker에 전송합니다.
 */
async function sendVideoEnded(videoId: string, totalWatchedSeconds: number): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'YOUTUBE_VIDEO_ENDED',
      data: { videoId, totalWatchedSeconds },
    });
  } catch (err) {
    console.warn('[SmartBookmark] YOUTUBE_VIDEO_ENDED 전송 실패:', err);
  }
}

/**
 * 타임스탬프를 Service Worker에 전송합니다.
 */
async function sendSaveTimestamp(videoId: string, timestamp: SavedTimestamp): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_YOUTUBE_TIMESTAMP',
      data: { videoId, timestamp },
    });
  } catch (err) {
    console.warn('[SmartBookmark] SAVE_YOUTUBE_TIMESTAMP 전송 실패:', err);
  }
}

// ---------------------------------------------------------------------------
// 추적 핵심 로직
// ---------------------------------------------------------------------------

/**
 * 진행 중이던 동영상 추적을 종료하고 시청 시간을 기록합니다.
 */
async function finishCurrentTracking(): Promise<void> {
  if (!currentVideoId || !watchStartTime) return;

  const totalWatchedSeconds = Math.floor((Date.now() - watchStartTime) / 1000);

  if (progressTimerId !== null) {
    clearInterval(progressTimerId);
    progressTimerId = null;
  }

  await sendVideoEnded(currentVideoId, totalWatchedSeconds);

  currentVideoId = null;
  watchStartTime = null;
}

/**
 * 새 동영상 추적을 시작합니다.
 * DOM이 안정화될 때까지 약간의 지연 후 데이터를 캡처합니다.
 *
 * @param videoId 추적할 동영상 ID
 */
async function startTracking(videoId: string): Promise<void> {
  // 이전 추적 마무리
  await finishCurrentTracking();

  // 타임스탬프 버튼 제거 (이전 영상 것)
  removeTimestampButton();
  timestampButtonInjected = false;

  currentVideoId = videoId;
  watchStartTime = Date.now();

  // DOM 안정화 대기 (SPA 전환 직후 DOM이 아직 업데이트 중일 수 있음)
  await new Promise<void>((resolve) => setTimeout(resolve, 1200));

  // 현재 추적 중인 videoId와 다르면 이미 다른 영상으로 전환된 것
  if (currentVideoId !== videoId) return;

  const data = captureVideoData(videoId);
  await sendVideoStarted(data);

  // 타임스탬프 버튼 주입
  injectTimestampButton(videoId);

  // 30초마다 progress 전송
  progressTimerId = setInterval(async () => {
    if (!currentVideoId || !watchStartTime) return;
    const elapsed = Math.floor((Date.now() - watchStartTime) / 1000);
    await sendVideoProgress(currentVideoId, elapsed);
  }, 30_000);
}

// ---------------------------------------------------------------------------
// 타임스탬프 북마크 UI 주입
// ---------------------------------------------------------------------------

/**
 * 플레이어 하단 컨트롤 영역에 타임스탬프 저장 버튼을 주입합니다.
 */
function injectTimestampButton(videoId: string): void {
  if (timestampButtonInjected) return;

  // 버튼을 삽입할 타깃 컨테이너 탐색
  const target =
    document.querySelector('.ytp-right-controls') ??
    document.querySelector('.ytp-chrome-controls');

  if (!target) {
    // 컨트롤이 아직 없으면 최대 5초 재시도
    retryInjectButton(videoId, 0);
    return;
  }

  const btn = buildTimestampButton(videoId);
  target.prepend(btn);
  timestampButtonInjected = true;
}

/**
 * 버튼 엘리먼트를 생성하고 반환합니다.
 */
function buildTimestampButton(videoId: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'sb-timestamp-btn';
  btn.title = '현재 시점 북마크 (SmartBookmark)';
  btn.setAttribute('aria-label', '현재 시점 북마크');
  btn.style.cssText = `
    background: rgba(0,0,0,0.7);
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    margin: 0 4px;
    padding: 4px 8px;
    height: 24px;
    line-height: 1;
    vertical-align: middle;
    transition: background 0.2s;
  `;
  btn.textContent = 'SB';

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(37,99,235,0.85)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(0,0,0,0.7)';
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleTimestampSave(videoId);
  });

  return btn;
}

/**
 * 컨트롤 엘리먼트가 나타날 때까지 최대 5회 재시도합니다.
 */
function retryInjectButton(videoId: string, attempt: number): void {
  if (attempt >= 5 || timestampButtonInjected) return;

  setTimeout(() => {
    const target =
      document.querySelector('.ytp-right-controls') ??
      document.querySelector('.ytp-chrome-controls');

    if (target && !timestampButtonInjected) {
      const btn = buildTimestampButton(videoId);
      target.prepend(btn);
      timestampButtonInjected = true;
    } else {
      retryInjectButton(videoId, attempt + 1);
    }
  }, 1000);
}

/**
 * 기존에 주입된 타임스탬프 버튼을 제거합니다.
 */
function removeTimestampButton(): void {
  const existing = document.getElementById('sb-timestamp-btn');
  existing?.remove();
}

/**
 * 현재 재생 위치를 저장합니다.
 * 사용자에게 레이블 입력을 요청하고 Service Worker로 전송합니다.
 */
async function handleTimestampSave(videoId: string): Promise<void> {
  const videoEl = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  const currentSeconds = videoEl ? Math.floor(videoEl.currentTime) : 0;

  // 간단한 인라인 입력 UI
  const label = await promptTimestampLabel(currentSeconds);
  if (label === null) return; // 취소됨

  const timestamp: SavedTimestamp = {
    seconds: currentSeconds,
    label: label.trim() || formatSecondsToTimestamp(currentSeconds),
    createdAt: new Date().toISOString(),
  };

  await sendSaveTimestamp(videoId, timestamp);
  showTimestampSavedToast(timestamp);
}

/**
 * 초 단위를 "H:MM:SS" 또는 "M:SS" 형식으로 변환합니다.
 */
function formatSecondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 타임스탬프 레이블 입력 프롬프트 UI를 생성하고 사용자 입력을 받습니다.
 * 취소하면 null을 반환합니다.
 */
function promptTimestampLabel(seconds: number): Promise<string | null> {
  return new Promise((resolve) => {
    // 기존 프롬프트가 있으면 제거
    document.getElementById('sb-ts-prompt')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sb-ts-prompt';
    overlay.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #1a1a2e;
      border: 1px solid #3b82f6;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      color: #fff;
      font-family: sans-serif;
      padding: 16px 20px;
      width: 280px;
      z-index: 2147483647;
    `;

    const timeDisplay = formatSecondsToTimestamp(seconds);
    overlay.innerHTML = `
      <p style="font-size:12px;color:#93c5fd;margin:0 0 8px;">
        SmartBookmark - 타임스탬프 저장 (${timeDisplay})
      </p>
      <input id="sb-ts-input" type="text" placeholder="레이블 (선택 사항)"
        style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
               border-radius:4px;color:#fff;font-size:13px;padding:6px 8px;outline:none;" />
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;">
        <button id="sb-ts-cancel"
          style="background:#334155;border:none;border-radius:4px;color:#94a3b8;
                 cursor:pointer;font-size:12px;padding:5px 12px;">취소</button>
        <button id="sb-ts-save"
          style="background:#2563eb;border:none;border-radius:4px;color:#fff;
                 cursor:pointer;font-size:12px;font-weight:600;padding:5px 12px;">저장</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector<HTMLInputElement>('#sb-ts-input')!;
    input.focus();

    const cleanup = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector('#sb-ts-save')?.addEventListener('click', () =>
      cleanup(input.value)
    );
    overlay.querySelector('#sb-ts-cancel')?.addEventListener('click', () =>
      cleanup(null)
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value);
      if (e.key === 'Escape') cleanup(null);
    });
  });
}

/**
 * 저장 성공 토스트를 화면에 잠시 표시합니다.
 */
function showTimestampSavedToast(ts: SavedTimestamp): void {
  document.getElementById('sb-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'sb-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 72px;
    right: 20px;
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    color: #fff;
    font-family: sans-serif;
    font-size: 12px;
    padding: 8px 14px;
    z-index: 2147483647;
  `;
  toast.textContent = `타임스탬프 저장됨: ${ts.label} (${formatSecondsToTimestamp(ts.seconds)})`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ---------------------------------------------------------------------------
// SPA 네비게이션 감지
// ---------------------------------------------------------------------------

/**
 * YouTube SPA 네비게이션 이벤트를 처리합니다.
 * 현재 URL의 videoId를 확인하고, 변경되었으면 추적을 시작합니다.
 */
async function handleNavigation(): Promise<void> {
  const videoId = extractVideoId(window.location.href);

  if (!videoId) {
    // 동영상 페이지가 아님 - 진행 중인 추적 종료
    if (currentVideoId) {
      await finishCurrentTracking();
      removeTimestampButton();
      timestampButtonInjected = false;
    }
    return;
  }

  // 동일 동영상이면 재추적 불필요
  if (videoId === currentVideoId) return;

  await startTracking(videoId);
}

// ---------------------------------------------------------------------------
// 초기화 및 이벤트 리스너 등록
// ---------------------------------------------------------------------------

/**
 * YouTube 타이틀 변경을 감지하는 MutationObserver.
 * 'yt-navigate-finish' 이벤트의 fallback으로 사용합니다.
 */
let titleObserver: MutationObserver | null = null;

/** 마지막으로 감지한 document.title */
let lastTitle = '';

function setupTitleObserver(): void {
  const titleEl = document.querySelector('title');
  if (!titleEl) return;

  lastTitle = document.title;

  titleObserver = new MutationObserver(() => {
    if (document.title !== lastTitle) {
      lastTitle = document.title;
      // 타이틀 변경은 SPA 전환의 신호 - 약간 지연 후 처리
      setTimeout(() => handleNavigation(), 800);
    }
  });

  titleObserver.observe(titleEl, { subtree: true, characterData: true, childList: true });
}

/**
 * Content Script 진입점.
 * 이벤트 리스너를 등록하고 초기 페이지를 처리합니다.
 */
function init(): void {
  console.log('[SmartBookmark] YouTube tracker initialized');

  // 기본 이벤트: YouTube SPA 네비게이션 완료 이벤트
  document.addEventListener('yt-navigate-finish', () => {
    handleNavigation();
  });

  // Fallback: title MutationObserver
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTitleObserver);
  } else {
    setupTitleObserver();
  }

  // 초기 페이지 처리 (이미 동영상 페이지로 열린 경우)
  handleNavigation();

  // 탭/창 닫힐 때 마무리 처리
  window.addEventListener('beforeunload', () => {
    if (currentVideoId && watchStartTime) {
      const totalWatchedSeconds = Math.floor((Date.now() - watchStartTime) / 1000);
      // beforeunload에서는 비동기 처리가 보장되지 않으므로 sendBeacon 패턴 불가 - best effort
      chrome.runtime.sendMessage({
        type: 'YOUTUBE_VIDEO_ENDED',
        data: { videoId: currentVideoId, totalWatchedSeconds },
      }).catch(() => {});
    }
  });
}

init();
