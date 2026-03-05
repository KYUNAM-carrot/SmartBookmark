/**
 * @file dedup.ts
 * @description SmartBookmark Pro - 중복 북마크 감지 모듈
 *
 * URL 정규화, 정확한 중복 그룹 검출, 유사도 기반 유사 북마크 검출 기능을 제공합니다.
 */

/// <reference types="chrome" />

import type { DuplicateGroup } from '@/types';

// ---------------------------------------------------------------------------
// URL 정규화
// ---------------------------------------------------------------------------

/** 제거할 URL 트래킹 쿼리 파라미터 목록 */
const TRACKING_PARAMS = new Set([
  // UTM
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  // 기타 트래킹
  'fbclid', 'gclid', 'gad_source', 'msclkid', 'yclid',
  'ref', 'referrer', 'source', 'from',
  // 소셜
  '_ga', '_gid', 'mc_cid', 'mc_eid',
]);

/**
 * URL을 정규화하여 중복 감지에 사용할 표준 형태로 변환합니다.
 *
 * 정규화 단계:
 * 1. 소문자 변환
 * 2. www. 제거
 * 3. HTTP/HTTPS 통일 (https로)
 * 4. 트레일링 슬래시 제거
 * 5. 트래킹 쿼리 파라미터 제거
 * 6. 남은 쿼리 파라미터 알파벳순 정렬
 * 7. 해시(#) 제거
 *
 * @param rawUrl 정규화할 원본 URL 문자열
 * @returns 정규화된 URL 문자열, 파싱 실패 시 소문자 변환된 원본 반환
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  try {
    // 프로토콜 없는 경우 보완
    const urlStr = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const url = new URL(urlStr);

    // 1. HTTPS로 통일 (HTTP → HTTPS)
    url.protocol = 'https:';

    // 2. www. 제거
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
    }

    // 3. 소문자 호스트명
    url.hostname = url.hostname.toLowerCase();

    // 4. 트래킹 파라미터 제거 + 정렬
    const paramsToKeep: [string, string][] = [];
    url.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        paramsToKeep.push([key, value]);
      }
    });

    // 파라미터 초기화 후 알파벳순으로 재설정
    const newParams = new URLSearchParams();
    paramsToKeep.sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of paramsToKeep) {
      newParams.append(key, value);
    }
    url.search = newParams.toString();

    // 5. 해시 제거
    url.hash = '';

    // 6. 경로 트레일링 슬래시 제거 (루트 '/'는 유지)
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    url.pathname = pathname;

    return url.toString().toLowerCase();
  } catch {
    // URL 파싱 실패 시 소문자 변환만 수행
    return rawUrl.trim().toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// 유사도 계산
// ---------------------------------------------------------------------------

/**
 * 두 URL의 도메인+경로 유사도를 0~1 범위로 계산합니다.
 *
 * 계산 방식:
 * - 도메인이 다르면 0.0 반환
 * - 도메인이 같을 때 경로의 공통 세그먼트 비율로 유사도 결정
 *
 * @param url1 첫 번째 URL
 * @param url2 두 번째 URL
 * @returns 유사도 점수 (0.0 ~ 1.0)
 */
export function calculateSimilarity(url1: string, url2: string): number {
  try {
    const norm1 = normalizeUrl(url1);
    const norm2 = normalizeUrl(url2);

    if (norm1 === norm2) return 1.0;

    const u1 = new URL(norm1);
    const u2 = new URL(norm2);

    // 도메인이 다르면 유사하지 않음
    if (u1.hostname !== u2.hostname) return 0.0;

    // 경로 세그먼트 비교
    const seg1 = u1.pathname.split('/').filter(Boolean);
    const seg2 = u2.pathname.split('/').filter(Boolean);

    if (seg1.length === 0 && seg2.length === 0) return 1.0;

    // 공통 접두사 세그먼트 수
    let commonCount = 0;
    const minLen = Math.min(seg1.length, seg2.length);
    for (let i = 0; i < minLen; i++) {
      if (seg1[i] === seg2[i]) {
        commonCount++;
      } else {
        break;
      }
    }

    const maxLen = Math.max(seg1.length, seg2.length);
    if (maxLen === 0) return 1.0;

    // 유사도 = 공통 세그먼트 / 최대 세그먼트 수
    const pathSimilarity = commonCount / maxLen;

    // 쿼리 파라미터 비교 (있는 경우 소폭 반영)
    const q1 = u1.searchParams.toString();
    const q2 = u2.searchParams.toString();
    const querySimilarity = q1 === q2 ? 1.0 : 0.5;

    // 가중치: 경로 80%, 쿼리 20%
    return pathSimilarity * 0.8 + querySimilarity * 0.2;
  } catch {
    return 0.0;
  }
}

// ---------------------------------------------------------------------------
// 중복 감지
// ---------------------------------------------------------------------------

/**
 * 모든 북마크에서 정확한 중복 그룹을 찾습니다.
 * 정규화 URL이 동일한 북마크들을 그룹화합니다.
 *
 * @returns 2개 이상의 북마크를 포함하는 DuplicateGroup 배열
 */
export async function findDuplicates(): Promise<DuplicateGroup[]> {
  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = flattenBookmarkTree(tree);

    // 정규화 URL → 북마크 목록 맵
    const urlMap = new Map<string, chrome.bookmarks.BookmarkTreeNode[]>();

    for (const node of allBookmarks) {
      if (!node.url) continue;
      const normalized = normalizeUrl(node.url);
      const existing = urlMap.get(normalized) ?? [];
      existing.push(node);
      urlMap.set(normalized, existing);
    }

    // 2개 이상인 그룹만 반환
    const groups: DuplicateGroup[] = [];
    for (const [normalizedUrl, bookmarks] of urlMap.entries()) {
      if (bookmarks.length >= 2) {
        groups.push({ normalizedUrl, bookmarks });
      }
    }

    // 중복 수 내림차순 정렬
    groups.sort((a, b) => b.bookmarks.length - a.bookmarks.length);

    return groups;
  } catch (error) {
    console.error('[Dedup] findDuplicates 실패', error);
    return [];
  }
}

/**
 * 유사하지만 정확히 동일하지 않은 북마크 쌍을 찾습니다.
 * 예: 같은 기사의 다른 파라미터 URL, 모바일/데스크톱 URL 등
 *
 * @param threshold 유사도 임계값 (기본값: 0.85, 0.0 ~ 1.0)
 * @returns 유사 북마크 그룹 배열 (각 그룹에는 2개 이상의 북마크)
 */
export async function findSimilar(
  threshold = 0.85
): Promise<SimilarGroup[]> {
  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = flattenBookmarkTree(tree).filter((n) => !!n.url);

    const groups: SimilarGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < allBookmarks.length; i++) {
      const nodeA = allBookmarks[i];
      if (!nodeA.url || processed.has(nodeA.id)) continue;

      const similarGroup: chrome.bookmarks.BookmarkTreeNode[] = [nodeA];

      for (let j = i + 1; j < allBookmarks.length; j++) {
        const nodeB = allBookmarks[j];
        if (!nodeB.url || processed.has(nodeB.id)) continue;

        // 정확히 같은 URL은 이미 findDuplicates에서 처리됨 - 제외
        const normA = normalizeUrl(nodeA.url);
        const normB = normalizeUrl(nodeB.url);
        if (normA === normB) continue;

        const similarity = calculateSimilarity(nodeA.url, nodeB.url);
        if (similarity >= threshold) {
          similarGroup.push(nodeB);
          processed.add(nodeB.id);
        }
      }

      if (similarGroup.length >= 2) {
        processed.add(nodeA.id);
        groups.push({
          bookmarks: similarGroup,
          similarity: calculateGroupSimilarity(similarGroup),
        });
      }
    }

    // 유사도 내림차순 정렬
    groups.sort((a, b) => b.similarity - a.similarity);

    return groups;
  } catch (error) {
    console.error('[Dedup] findSimilar 실패', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/** 유사 북마크 그룹 타입 */
export interface SimilarGroup {
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
  /** 그룹 내 최소 유사도 */
  similarity: number;
}

/**
 * chrome.bookmarks.BookmarkTreeNode 트리를 플랫 배열로 변환합니다.
 * URL이 있는 노드(실제 북마크)만 포함합니다.
 */
function flattenBookmarkTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[]
): chrome.bookmarks.BookmarkTreeNode[] {
  const result: chrome.bookmarks.BookmarkTreeNode[] = [];

  function traverse(nodeList: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodeList) {
      if (node.url) result.push(node);
      if (node.children) traverse(node.children);
    }
  }

  traverse(nodes);
  return result;
}

/**
 * 그룹 내 북마크들의 평균 쌍별 유사도를 계산합니다.
 */
function calculateGroupSimilarity(
  bookmarks: chrome.bookmarks.BookmarkTreeNode[]
): number {
  if (bookmarks.length < 2) return 1.0;

  let totalSim = 0;
  let pairCount = 0;

  for (let i = 0; i < bookmarks.length; i++) {
    for (let j = i + 1; j < bookmarks.length; j++) {
      const urlA = bookmarks[i].url ?? '';
      const urlB = bookmarks[j].url ?? '';
      totalSim += calculateSimilarity(urlA, urlB);
      pairCount++;
    }
  }

  return pairCount > 0 ? totalSim / pairCount : 0;
}
