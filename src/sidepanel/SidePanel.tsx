import { useState, useEffect, useCallback } from 'react';
import type {
  BookmarkData,
  TabSession,
  SubscriptionTier,
  VisitPattern,
} from '../types/index';

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface Stats {
  totalBookmarks: number;
  youtubeCount: number;
  sessionCount: number;
  highlightCount: number;
}

interface RecentBookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  addedAt: string;
}

interface TopSite {
  url: string;
  title: string;
  visitCount: number;
  domain: string;
}

// ---------------------------------------------------------------------------
// 유틸리티 함수
// ---------------------------------------------------------------------------

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).origin;
    return `${domain}/favicon.ico`;
  } catch {
    return '';
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 서브 컴포넌트
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: string;
  label: string;
  value: number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className={`rounded-xl p-3 ${color} flex flex-col gap-1`}>
      <span className="text-xl">{icon}</span>
      <span className="text-2xl font-bold text-gray-800 dark:text-white">
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
        {label}
      </span>
    </div>
  );
}

interface QuickActionProps {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
}

function QuickAction({ icon, label, onClick, loading }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50
        dark:hover:bg-gray-700 dark:hover:border-primary-500 transition-all duration-150
        text-center disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight">
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export default function SidePanel() {
  // --- 테마 상태 ---
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

  // --- 데이터 상태 ---
  const [stats, setStats] = useState<Stats>({
    totalBookmarks: 0,
    youtubeCount: 0,
    sessionCount: 0,
    highlightCount: 0,
  });
  const [recentBookmarks, setRecentBookmarks] = useState<RecentBookmark[]>([]);
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [suggestions, setSuggestions] = useState<VisitPattern[]>([]);
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // --- 테마 토글 ---
  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      setIsDark(false);
      try {
        chrome.storage.local.set({ 'settings.theme': 'light' });
      } catch {}
    } else {
      html.classList.add('dark');
      setIsDark(true);
      try {
        chrome.storage.local.set({ 'settings.theme': 'dark' });
      } catch {}
    }
  }, []);

  // --- 데이터 로드 ---
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Chrome storage 에서 데이터 로드
        const result = await chrome.storage.local.get([
          'bookmarks',
          'youtubeHistory',
          'tabSessions',
          'highlights',
          'subscriptionTier',
          'visitPatternCache',
          'settings',
        ]);

        // 북마크 통계
        const bookmarks = (result.bookmarks as Record<string, BookmarkData>) ?? {};
        const bookmarkList = Object.values(bookmarks);
        const totalBookmarks = bookmarkList.length;

        // 최근 북마크 (최신 5개)
        const sorted = [...bookmarkList]
          .sort(
            (a, b) =>
              new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
          )
          .slice(0, 5);
        setRecentBookmarks(
          sorted.map((b) => ({
            id: b.id,
            title: b.title || b.originalTitle || '제목 없음',
            url: b.url,
            favicon: b.favicon,
            addedAt: b.addedAt,
          }))
        );

        // YouTube 시청 기록 수
        const youtubeHistory =
          (result.youtubeHistory as Record<string, unknown>) ?? {};
        const youtubeCount = Object.keys(youtubeHistory).length;

        // 탭 세션 수
        const tabSessions =
          (result.tabSessions as Record<string, TabSession>) ?? {};
        const sessionCount = Object.keys(tabSessions).length;

        // 하이라이트 수
        const highlights =
          (result.highlights as Record<string, unknown[]>) ?? {};
        const highlightCount = Object.values(highlights).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );

        setStats({ totalBookmarks, youtubeCount, sessionCount, highlightCount });

        // 구독 등급
        setTier((result.subscriptionTier as SubscriptionTier) ?? 'free');

        // 방문 패턴 캐시 - 북마크 안 된 자주 방문 사이트
        const visitPatternCache =
          (result.visitPatternCache as Record<string, VisitPattern>) ?? {};
        const unBookmarked = Object.values(visitPatternCache)
          .filter((p) => !p.isBookmarked && p.recentVisits >= 3)
          .sort((a, b) => b.recentVisits - a.recentVisits)
          .slice(0, 5);
        setSuggestions(unBookmarked);

        // 테마 적용
        const settings = result.settings as { theme?: string } | undefined;
        if (settings?.theme === 'dark') {
          document.documentElement.classList.add('dark');
          setIsDark(true);
        } else if (settings?.theme === 'light') {
          document.documentElement.classList.remove('dark');
          setIsDark(false);
        }
      } catch (err) {
        console.warn('[SidePanel] Chrome storage 접근 불가:', err);
      } finally {
        setLoading(false);
      }
    }

    // Chrome history API 에서 상위 사이트 로드
    async function loadTopSites() {
      try {
        const microsecondsPerWeek = 1000 * 60 * 60 * 24 * 7;
        const items = await chrome.history.search({
          text: '',
          startTime: Date.now() - microsecondsPerWeek,
          maxResults: 100,
        });

        // 도메인별 집계
        const domainMap = new Map<
          string,
          { url: string; title: string; visitCount: number; domain: string }
        >();
        for (const item of items) {
          if (!item.url) continue;
          const domain = getDomain(item.url);
          const existing = domainMap.get(domain);
          const visits = item.visitCount ?? 1;
          if (existing) {
            existing.visitCount += visits;
          } else {
            domainMap.set(domain, {
              url: item.url,
              title: item.title || domain,
              visitCount: visits,
              domain,
            });
          }
        }

        const top5 = [...domainMap.values()]
          .sort((a, b) => b.visitCount - a.visitCount)
          .slice(0, 5);
        setTopSites(top5);
      } catch (err) {
        console.warn('[SidePanel] Chrome history 접근 불가:', err);
      }
    }

    loadData();
    loadTopSites();
  }, []);

  // --- 빠른 액션 핸들러 ---
  async function sendAction(type: string, label: string) {
    setActionLoading(label);
    try {
      await chrome.runtime.sendMessage({ type, data: {} });
    } catch (err) {
      console.warn(`[SidePanel] 메시지 전송 실패 (${type}):`, err);
    } finally {
      setActionLoading(null);
    }
  }

  function handleAddBookmark() {
    sendAction('ADD_BOOKMARK', '새 북마크 추가');
  }

  function handleSaveSession() {
    sendAction('SAVE_TAB_SESSION', '세션 저장');
  }

  function handleFindDuplicates() {
    sendAction('FIND_DUPLICATES', '중복 검사');
  }

  function handleAnalyze() {
    sendAction('ANALYZE_VISIT_PATTERNS', '분석 실행');
  }

  function handleAddSuggestion(pattern: VisitPattern) {
    try {
      chrome.runtime.sendMessage({
        type: 'ADD_BOOKMARK',
        data: { url: pattern.url, title: pattern.title },
      });
    } catch {}
  }

  function handleOpenOptions() {
    try {
      chrome.runtime.openOptionsPage();
    } catch {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      } catch {}
    }
  }

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔖</span>
          <h1 className="text-base font-bold text-primary-600 dark:text-primary-400 tracking-tight">
            SmartBookmark Pro
          </h1>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-yellow-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm7.071 2.929a1 1 0 0 1 0 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM21 11a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1zm-2.929 7.071a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 1 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414zM12 19a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm-7.071-1.929a1 1 0 0 1 0-1.414l.707-.707a1 1 0 1 1 1.414 1.414l-.707.707a1 1 0 0 1-1.414 0zM4 11a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1zm1.636-6.364a1 1 0 0 1 1.414 0l.707.707A1 1 0 0 1 6.343 6.757l-.707-.707a1 1 0 0 1 0-1.414zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-gray-600"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
            </svg>
          )}
        </button>
      </header>

      {/* ── 본문 ── */}
      <main className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">데이터 로드 중...</p>
          </div>
        ) : (
          <>
            {/* ── 빠른 통계 ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                통계 요약
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon="🔖"
                  label="전체 북마크"
                  value={stats.totalBookmarks}
                  color="bg-blue-50 dark:bg-blue-900/20"
                />
                <StatCard
                  icon="▶️"
                  label="YouTube 시청"
                  value={stats.youtubeCount}
                  color="bg-red-50 dark:bg-red-900/20"
                />
                <StatCard
                  icon="💾"
                  label="저장된 세션"
                  value={stats.sessionCount}
                  color="bg-green-50 dark:bg-green-900/20"
                />
                <StatCard
                  icon="✏️"
                  label="하이라이트"
                  value={stats.highlightCount}
                  color="bg-yellow-50 dark:bg-yellow-900/20"
                />
              </div>
            </section>

            {/* ── 빠른 액션 ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                빠른 실행
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <QuickAction
                  icon="➕"
                  label="새 북마크 추가"
                  onClick={handleAddBookmark}
                  loading={actionLoading === '새 북마크 추가'}
                />
                <QuickAction
                  icon="💾"
                  label="세션 저장"
                  onClick={handleSaveSession}
                  loading={actionLoading === '세션 저장'}
                />
                <QuickAction
                  icon="🔍"
                  label="중복 검사"
                  onClick={handleFindDuplicates}
                  loading={actionLoading === '중복 검사'}
                />
                <QuickAction
                  icon="📊"
                  label="분석 실행"
                  onClick={handleAnalyze}
                  loading={actionLoading === '분석 실행'}
                />
              </div>
            </section>

            {/* ── 최근 북마크 ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                최근 북마크
              </h2>
              {recentBookmarks.length === 0 ? (
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 text-center text-sm text-gray-400">
                  저장된 북마크가 없습니다
                </div>
              ) : (
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {recentBookmarks.map((bm) => (
                    <a
                      key={bm.id}
                      href={bm.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <img
                        src={bm.favicon || getFaviconUrl(bm.url)}
                        alt=""
                        className="w-4 h-4 flex-shrink-0 rounded-sm"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%23e5e7eb"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="%236b7280">B</text></svg>';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                          {bm.title}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {getDomain(bm.url)}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatRelativeTime(bm.addedAt)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* ── 자주 방문하는 사이트 ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                자주 방문한 사이트 (7일)
              </h2>
              {topSites.length === 0 ? (
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 text-center text-sm text-gray-400">
                  방문 기록이 없습니다
                </div>
              ) : (
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {topSites.map((site, index) => (
                    <a
                      key={site.url}
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                    >
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-500 flex-shrink-0">
                        {index + 1}
                      </span>
                      <img
                        src={getFaviconUrl(site.url)}
                        alt=""
                        className="w-4 h-4 flex-shrink-0 rounded-sm"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            'none';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                          {site.title}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {site.domain}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                        {site.visitCount}회
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {/* ── 북마크 추천 (자주 방문하지만 북마크 안 된 사이트) ── */}
            {suggestions.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  북마크 추천
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                  자주 방문하지만 북마크되지 않은 사이트
                </p>
                <div className="rounded-xl bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900/50 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                  {suggestions.map((pattern) => (
                    <div
                      key={pattern.url}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <img
                        src={getFaviconUrl(pattern.url)}
                        alt=""
                        className="w-4 h-4 flex-shrink-0 rounded-sm"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            'none';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {pattern.title || pattern.domain}
                        </p>
                        <p className="text-xs text-gray-400">
                          최근 {pattern.recentVisits}회 방문
                        </p>
                      </div>
                      <button
                        onClick={() => handleAddSuggestion(pattern)}
                        className="flex-shrink-0 text-xs px-2 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 font-medium transition-colors"
                      >
                        추가
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* ── 푸터 ── */}
      <footer className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-4 py-2.5 flex items-center justify-between">
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            tier === 'pro' || tier === 'team'
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
          }`}
        >
          {tier === 'pro' ? 'Pro' : tier === 'team' ? 'Team' : 'Free'}
        </span>
        <button
          onClick={handleOpenOptions}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-colors flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
          설정
        </button>
      </footer>
    </div>
  );
}
