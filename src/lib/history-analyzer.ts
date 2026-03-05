/// <reference types="chrome" />

/**
 * @file history-analyzer.ts
 * @description SmartBookmark Pro - 방문 기록 분석 엔진
 *
 * chrome.history API를 사용하여 사용자의 브라우저 방문 기록을 분석하고,
 * 자주 방문하지만 북마크되지 않은 페이지 및 오랫동안 방문하지 않은 북마크를
 * 감지하여 스마트 알림 제안을 생성합니다.
 */

import type { VisitPattern, SmartNotification } from '@/types';

// =============================================================================
// 내부 상수
// =============================================================================

/** 밀리초 단위 하루 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 밀리초 단위 일주일 */
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** 자주 방문으로 판단하는 최소 주간 평균 방문 횟수 */
const FREQUENT_VISIT_THRESHOLD = 5;

/** 분석에서 제외할 URL 프리픽스 목록 */
const EXCLUDED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'about:',
  'data:',
  'file://',
  'javascript:',
];

// =============================================================================
// 도메인 카테고리 매핑 (간단한 휴리스틱)
// =============================================================================

/** 도메인 키워드 → 카테고리 매핑 */
const DOMAIN_CATEGORY_MAP: Record<string, string> = {
  github: '개발',
  gitlab: '개발',
  stackoverflow: '개발',
  npmjs: '개발',
  developer: '개발',
  docs: '개발',
  youtube: '미디어',
  netflix: '미디어',
  twitch: '미디어',
  naver: '뉴스',
  daum: '뉴스',
  news: '뉴스',
  reddit: '커뮤니티',
  twitter: '소셜',
  x: '소셜',
  instagram: '소셜',
  facebook: '소셜',
  linkedin: '소셜',
  amazon: '쇼핑',
  coupang: '쇼핑',
  gmarket: '쇼핑',
  notion: '생산성',
  figma: '생산성',
  jira: '생산성',
  confluence: '생산성',
  google: '검색/생산성',
};

// =============================================================================
// 유틸리티 함수
// =============================================================================

/**
 * URL을 정규화하여 비교 가능한 형태로 변환합니다.
 * - 후행 슬래시 제거
 * - 해시 프래그먼트 제거
 * - 소문자 변환
 * - 일부 추적 쿼리 파라미터 제거
 *
 * @param url 정규화할 원본 URL
 * @returns 정규화된 URL 문자열
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // 추적용 쿼리 파라미터 제거
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source',
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    // 해시 제거
    parsed.hash = '';

    // 후행 슬래시 정리 (pathname이 '/'가 아닌 경우)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    return parsed.toString().toLowerCase();
  } catch {
    // URL 파싱 실패 시 소문자 변환만 적용
    return url.toLowerCase().trim();
  }
}

/**
 * URL에서 도메인(hostname)을 추출합니다.
 *
 * @param url 도메인을 추출할 URL
 * @returns 도메인 문자열 (예: 'github.com'), 실패 시 빈 문자열
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * 도메인을 기반으로 카테고리를 추론합니다.
 *
 * @param domain 카테고리를 추론할 도메인
 * @returns 추론된 카테고리 문자열
 */
function inferCategory(domain: string): string {
  const lowerDomain = domain.toLowerCase();
  for (const [keyword, category] of Object.entries(DOMAIN_CATEGORY_MAP)) {
    if (lowerDomain.includes(keyword)) {
      return category;
    }
  }
  return '기타';
}

/**
 * URL이 분석에서 제외되어야 하는지 확인합니다.
 *
 * @param url 확인할 URL
 * @returns 제외 대상이면 true
 */
function isExcludedUrl(url: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// =============================================================================
// 핵심 분석 함수
// =============================================================================

/**
 * 방문 기록 항목들을 도메인별로 그룹화합니다.
 *
 * @param items chrome.history.HistoryItem 배열
 * @returns 도메인을 키로 하는 HistoryItem 배열 맵
 */
export function groupByDomain(
  items: chrome.history.HistoryItem[]
): Map<string, chrome.history.HistoryItem[]> {
  const grouped = new Map<string, chrome.history.HistoryItem[]>();

  for (const item of items) {
    if (!item.url) continue;
    const domain = extractDomain(item.url);
    if (!domain) continue;

    const existing = grouped.get(domain) ?? [];
    existing.push(item);
    grouped.set(domain, existing);
  }

  return grouped;
}

/**
 * 방문 기록 항목들의 주간 평균 방문 횟수를 계산합니다.
 *
 * @param items 분석할 HistoryItem 배열
 * @param days 분석 기간 (일 단위)
 * @returns 주간 평균 방문 횟수
 */
export function calculateVisitFrequency(
  items: chrome.history.HistoryItem[],
  days: number
): number {
  if (items.length === 0 || days <= 0) return 0;

  const totalVisits = items.reduce(
    (sum, item) => sum + (item.visitCount ?? 1),
    0
  );
  const weeks = days / 7;

  return parseFloat((totalVisits / weeks).toFixed(2));
}

/**
 * 모든 북마크 URL을 Set으로 반환합니다.
 * 정규화된 URL로 저장하여 비교 정확도를 높입니다.
 *
 * @returns 정규화된 북마크 URL Set
 */
export async function getAllBookmarkUrls(): Promise<Set<string>> {
  const bookmarkUrls = new Set<string>();

  try {
    const tree = await chrome.bookmarks.getTree();

    const traverse = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of nodes) {
        if (node.url) {
          bookmarkUrls.add(normalizeUrl(node.url));
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(tree);
  } catch (error) {
    console.error('[HistoryAnalyzer] 북마크 목록 조회 실패', error);
  }

  return bookmarkUrls;
}

/**
 * 지정한 기간의 브라우저 방문 기록을 분석하여 VisitPattern 배열을 반환합니다.
 *
 * @param days 분석할 기간 (일 단위, 기본값: 30)
 * @returns VisitPattern 배열 (방문 횟수 내림차순 정렬)
 */
export async function analyzeHistory(days = 30): Promise<VisitPattern[]> {
  const startTime = Date.now() - days * MS_PER_DAY;
  const recentStartTime = Date.now() - 7 * MS_PER_DAY;

  let historyItems: chrome.history.HistoryItem[] = [];

  try {
    historyItems = await chrome.history.search({
      text: '',
      startTime,
      maxResults: 10000,
    });
  } catch (error) {
    console.error('[HistoryAnalyzer] 방문 기록 조회 실패', error);
    return [];
  }

  // 제외 URL 필터링
  const filteredItems = historyItems.filter(
    (item) => item.url && !isExcludedUrl(item.url)
  );

  // 북마크 URL 목록 조회
  const bookmarkUrls = await getAllBookmarkUrls();

  // URL 기준으로 그룹화 (정규화 URL로 중복 통합)
  const urlGroups = new Map<string, chrome.history.HistoryItem[]>();

  for (const item of filteredItems) {
    if (!item.url) continue;
    const normalized = normalizeUrl(item.url);
    const existing = urlGroups.get(normalized) ?? [];
    existing.push(item);
    urlGroups.set(normalized, existing);
  }

  // 각 URL 그룹을 VisitPattern으로 변환
  const patterns: VisitPattern[] = [];

  for (const [normalizedUrl, items] of urlGroups.entries()) {
    // 대표 항목 선택 (가장 최근 방문 항목)
    const representative = items.reduce((latest, current) => {
      const latestTime = latest.lastVisitTime ?? 0;
      const currentTime = current.lastVisitTime ?? 0;
      return currentTime > latestTime ? current : latest;
    });

    const originalUrl = representative.url ?? normalizedUrl;
    const domain = extractDomain(originalUrl);

    if (!domain) continue;

    // 총 방문 횟수 합산
    const totalVisits = items.reduce(
      (sum, item) => sum + (item.visitCount ?? 1),
      0
    );

    // 최근 7일 방문 횟수 계산
    const recentVisits = items.filter(
      (item) => (item.lastVisitTime ?? 0) >= recentStartTime
    ).reduce((sum, item) => sum + (item.visitCount ?? 1), 0);

    const avgVisitsPerWeek = calculateVisitFrequency(items, days);
    const lastVisited = new Date(
      representative.lastVisitTime ?? Date.now()
    ).toISOString();
    const isBookmarked = bookmarkUrls.has(normalizedUrl);
    const category = inferCategory(domain);
    const title = representative.title ?? domain;

    patterns.push({
      url: originalUrl,
      title,
      domain,
      totalVisits,
      recentVisits,
      avgVisitsPerWeek,
      lastVisited,
      category,
      isBookmarked,
    });
  }

  // 방문 횟수 내림차순 정렬
  patterns.sort((a, b) => b.totalVisits - a.totalVisits);

  return patterns;
}

/**
 * 자주 방문하지만 북마크되지 않은 패턴을 필터링합니다.
 *
 * @param patterns 전체 VisitPattern 배열
 * @returns avgVisitsPerWeek >= 5 이고 isBookmarked === false인 패턴 배열
 */
export function getFrequentUnbookmarked(patterns: VisitPattern[]): VisitPattern[] {
  return patterns.filter(
    (p) => p.avgVisitsPerWeek >= FREQUENT_VISIT_THRESHOLD && !p.isBookmarked
  );
}

/**
 * 지정한 기간 동안 방문하지 않은 북마크 목록을 반환합니다.
 *
 * @param days 미방문 기준 기간 (일 단위, 기본값: 30)
 * @returns 미방문 BookmarkTreeNode 배열
 */
export async function getUnusedBookmarks(
  days = 30
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const cutoffTime = Date.now() - days * MS_PER_DAY;
  const unusedBookmarks: chrome.bookmarks.BookmarkTreeNode[] = [];

  try {
    const tree = await chrome.bookmarks.getTree();

    const traverse = async (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of nodes) {
        if (node.url) {
          // 해당 URL의 최근 방문 기록 조회
          const history = await chrome.history.search({
            text: node.url,
            startTime: cutoffTime,
            maxResults: 1,
          });

          // 지정 기간 내 방문 기록이 없으면 미사용으로 분류
          const hasRecentVisit = history.some(
            (item) =>
              item.url &&
              normalizeUrl(item.url) === normalizeUrl(node.url ?? '')
          );

          if (!hasRecentVisit) {
            unusedBookmarks.push(node);
          }
        }

        if (node.children) {
          await traverse(node.children);
        }
      }
    };

    await traverse(tree);
  } catch (error) {
    console.error('[HistoryAnalyzer] 미사용 북마크 조회 실패', error);
  }

  return unusedBookmarks;
}

/**
 * 방문 패턴을 기반으로 스마트 알림 제안을 생성합니다.
 *
 * - 자주 방문하지만 북마크되지 않은 페이지: FREQUENT_VISIT_SUGGEST
 * - 오래된 북마크 존재 시: UNUSED_BOOKMARK_CLEANUP
 *
 * @param patterns 분석된 VisitPattern 배열
 * @returns SmartNotification 배열
 */
export function generateSuggestions(patterns: VisitPattern[]): SmartNotification[] {
  const suggestions: SmartNotification[] = [];
  const now = new Date().toISOString();

  // 자주 방문하지만 북마크 미등록 페이지 추천
  const frequentUnbookmarked = getFrequentUnbookmarked(patterns);

  if (frequentUnbookmarked.length > 0) {
    // 상위 5개만 제안
    const topCandidates = frequentUnbookmarked.slice(0, 5);

    for (const pattern of topCandidates) {
      suggestions.push({
        id: `suggest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'FREQUENT_VISIT_SUGGEST',
        title: '자주 방문하는 페이지를 북마크에 추가하세요',
        message: `"${pattern.title}" 페이지를 주 ${pattern.avgVisitsPerWeek.toFixed(1)}회 방문하고 있습니다. 북마크에 추가하시겠습니까?`,
        data: {
          url: pattern.url,
          title: pattern.title,
          domain: pattern.domain,
          avgVisitsPerWeek: pattern.avgVisitsPerWeek,
        },
        createdAt: now,
        dismissed: false,
      });
    }
  }

  return suggestions;
}

// =============================================================================
// 편의 통합 함수
// =============================================================================

/**
 * 방문 기록 전체 분석을 실행하고 결과를 반환합니다.
 * analyzeHistory → getFrequentUnbookmarked → generateSuggestions 파이프라인을 실행합니다.
 *
 * @param days 분석 기간 (일 단위, 기본값: 30)
 * @returns 분석 결과 객체
 */
export async function runFullAnalysis(days = 30): Promise<{
  patterns: VisitPattern[];
  frequentUnbookmarked: VisitPattern[];
  suggestions: SmartNotification[];
  unusedBookmarks: chrome.bookmarks.BookmarkTreeNode[];
}> {
  const [patterns, unusedBookmarks] = await Promise.all([
    analyzeHistory(days),
    getUnusedBookmarks(days),
  ]);

  const frequentUnbookmarked = getFrequentUnbookmarked(patterns);
  const suggestions = generateSuggestions(patterns);

  // 미사용 북마크 정리 제안 추가
  if (unusedBookmarks.length > 0) {
    suggestions.push({
      id: `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'UNUSED_BOOKMARK_CLEANUP',
      title: '오래된 북마크를 정리하세요',
      message: `${days}일 동안 방문하지 않은 북마크가 ${unusedBookmarks.length}개 있습니다. 정리하시겠습니까?`,
      data: {
        count: unusedBookmarks.length,
        bookmarkIds: unusedBookmarks.map((b) => b.id),
      },
      createdAt: new Date().toISOString(),
      dismissed: false,
    });
  }

  return { patterns, frequentUnbookmarked, suggestions, unusedBookmarks };
}
