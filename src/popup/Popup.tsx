/**
 * @file Popup.tsx
 * @description SmartBookmark Pro - 팝업 루트 컴포넌트
 *
 * - 탭 네비게이션: bookmarks | youtube | sessions | analysis | ai
 * - 헤더에 ThemeToggle 배치
 * - SearchBar 통합 (Fuse.js 기반 전체 검색)
 * - 마운트 시 initTheme() 호출 → 다크모드 즉시 적용
 * - 무료 티어에서 하단 NativeAd 표시
 * - LockScreen 잠금 처리
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { initTheme, watchSystemTheme, applyTheme } from '@/lib/theme';

// 컴포넌트 imports
import BookmarkManager from './components/BookmarkManager';
import YouTubeHistory from './components/YouTubeHistory';
import TabSessionPanel from './components/TabSession';
import { AIAssistant } from './components/AIAssistant';
import { NativeAd } from './components/NativeAd';
import SearchBar from './components/SearchBar';
import ThemeToggle from './components/ThemeToggle';
import LockScreen from './components/LockScreen';

// 광고 엔진
import { adEngine } from '@/lib/ad-engine';
import type { NativeAdData } from '@/types';

// 방문 기록 분석
import {
  runFullAnalysis,
  getFrequentUnbookmarked,
} from '@/lib/history-analyzer';
import type { VisitPattern, SmartNotification } from '@/types';

// ---------------------------------------------------------------------------
// 탭 정의
// ---------------------------------------------------------------------------

type TabId = 'bookmarks' | 'youtube' | 'sessions' | 'analysis' | 'ai';

const TAB_CONFIG: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  {
    id: 'bookmarks',
    label: '북마크',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    label: '유튜브',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356
          2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246
          15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615
          12.816v-8l8 3.993-8 4.007z" />
      </svg>
    ),
  },
  {
    id: 'sessions',
    label: '세션',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'analysis',
    label: '분석',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0
             0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5
             a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'ai',
    label: 'AI',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3
             m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374
             3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// 분석 대시보드 컴포넌트
// ---------------------------------------------------------------------------

interface AnalysisDashboardProps {
  patterns: VisitPattern[];
  suggestions: SmartNotification[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function AnalysisDashboard({
  patterns,
  suggestions,
  isLoading,
  error,
  onRefresh,
}: AnalysisDashboardProps) {
  const frequent = getFrequentUnbookmarked(patterns);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
        방문 기록 분석 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
        <p className="text-xs text-red-500">{error}</p>
        <button
          onClick={onRefresh}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
        <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0
               0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5
               a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          분석할 방문 기록이 없습니다
        </p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          브라우저에서 웹사이트를 방문하면 분석이 시작됩니다
        </p>
        <button
          onClick={onRefresh}
          className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {/* 상단 통계 카드 */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="분석된 페이지"
          value={patterns.length.toString()}
          sub="최근 30일"
          color="blue"
        />
        <StatCard
          label="북마크 추천"
          value={frequent.length.toString()}
          sub="자주 방문한 미저장"
          color="purple"
        />
      </div>

      {/* 스마트 제안 */}
      {suggestions.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            스마트 제안
          </h3>
          <ul className="flex flex-col gap-1.5">
            {suggestions.slice(0, 5).map((s) => (
              <SuggestionItem key={s.id} suggestion={s} />
            ))}
          </ul>
        </section>
      )}

      {/* 자주 방문하지만 북마크되지 않은 페이지 */}
      {frequent.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            북마크 추천
          </h3>
          <ul className="flex flex-col gap-1.5">
            {frequent.slice(0, 8).map((p) => (
              <FrequentItem key={p.url} pattern={p} />
            ))}
          </ul>
        </section>
      )}

      {/* 새로고침 버튼 */}
      <button
        onClick={onRefresh}
        className="self-center mt-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
      >
        분석 새로고침
      </button>
    </div>
  );
}

// 통계 카드
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: 'blue' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
  };
  return (
    <div className={`rounded-lg p-3 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>
    </div>
  );
}

// 제안 아이템
function SuggestionItem({ suggestion }: { suggestion: SmartNotification }) {
  const typeColorMap: Partial<Record<string, string>> = {
    FREQUENT_VISIT_SUGGEST: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    UNUSED_BOOKMARK_CLEANUP: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    DUPLICATE_WARNING: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    UNREAD_BOOKMARK_REMIND: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    DEAD_LINK_DETECTED: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  };
  const typeLabelMap: Partial<Record<string, string>> = {
    FREQUENT_VISIT_SUGGEST: '추천',
    UNUSED_BOOKMARK_CLEANUP: '미사용',
    DUPLICATE_WARNING: '중복',
    UNREAD_BOOKMARK_REMIND: '리마인드',
    DEAD_LINK_DETECTED: '오류',
  };
  const colorClass = typeColorMap[suggestion.type] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  const typeLabel = typeLabelMap[suggestion.type] ?? suggestion.type;

  return (
    <li className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700
                   bg-white dark:bg-gray-800 px-3 py-2">
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
        {typeLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[11px] font-medium text-gray-800 dark:text-gray-100">
          {suggestion.title}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">
          {suggestion.message}
        </p>
      </div>
    </li>
  );
}

// 자주 방문한 페이지 아이템
function FrequentItem({ pattern }: { pattern: VisitPattern }) {
  const hostname = (() => {
    try { return new URL(pattern.url).hostname; } catch { return pattern.domain || pattern.url; }
  })();

  const handleOpen = () => {
    chrome.tabs.create({ url: pattern.url });
  };

  return (
    <li
      className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700
                 bg-white dark:bg-gray-800 px-3 py-2 hover:border-blue-300 dark:hover:border-blue-600
                 transition-colors cursor-pointer"
      onClick={handleOpen}
    >
      <div className="shrink-0 w-5 h-5 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
        <img
          src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
          alt=""
          className="w-full h-full object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[11px] font-medium text-gray-800 dark:text-gray-100">
          {pattern.title || hostname}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {pattern.totalVisits}회 방문
          {pattern.category ? ` · ${pattern.category}` : ''}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 메인 Popup 컴포넌트
// ---------------------------------------------------------------------------

export default function Popup() {
  // Zustand 스토어
  const { theme, tier, adsEnabled, auth, initialize } = useAppStore((s) => ({
    theme: s.theme,
    tier: s.tier,
    adsEnabled: s.adsEnabled,
    auth: s.auth,
    initialize: s.initialize,
  }));

  // 로컬 상태
  const [activeTab, setActiveTab] = useState<TabId>('bookmarks');
  const [searchQuery, setSearchQuery] = useState('');
  const [adData, setAdData] = useState<NativeAdData | null>(null);

  // 분석 상태
  const [analysisPatterns, setAnalysisPatterns] = useState<VisitPattern[]>([]);
  const [analysisSuggestions, setAnalysisSuggestions] = useState<SmartNotification[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 초기화
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // 1. 스토어 초기화 (theme, tier, auth 로드)
    initialize();

    // 2. 테마 초기 적용 (FOUC 방지)
    initTheme();
  }, [initialize]);

  // 시스템 테마 변경 감지 - 'system' 모드일 때만 DOM 업데이트
  useEffect(() => {
    const cleanup = watchSystemTheme((_isDark) => {
      const currentTheme = useAppStore.getState().theme;
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    });
    return cleanup;
  }, []);

  // 스토어 theme 변경 시 DOM 동기화
  useEffect(() => {
    applyTheme(theme as 'light' | 'dark' | 'system');
  }, [theme]);

  // ---------------------------------------------------------------------------
  // 광고 로드
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (tier !== 'free' || !adsEnabled) return;

    adEngine
      .getAds({ location: 'popup_bottom', maxAds: 1, refreshInterval: 300 })
      .then((ads) => {
        setAdData(ads[0] ?? null);
      })
      .catch(() => {
        // 광고 로드 실패는 무시
      });
  }, [tier, adsEnabled]);

  // ---------------------------------------------------------------------------
  // 방문 기록 분석 (analysis 탭 진입 시 로드)
  // ---------------------------------------------------------------------------

  const runAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const { patterns, suggestions } = await runFullAnalysis(30);
      setAnalysisPatterns(patterns);
      setAnalysisSuggestions(suggestions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.';
      setAnalysisError(msg);
      console.error('[Popup] runAnalysis 실패:', err);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'analysis' && analysisPatterns.length === 0 && !analysisLoading) {
      runAnalysis();
    }
  }, [activeTab, analysisPatterns.length, analysisLoading, runAnalysis]);

  // ---------------------------------------------------------------------------
  // 잠금 화면
  // ---------------------------------------------------------------------------

  if (auth.authMethod !== 'none' && !auth.isUnlocked) {
    return <LockScreen />;
  }

  // ---------------------------------------------------------------------------
  // 탭별 컨텐츠 렌더링
  // ---------------------------------------------------------------------------

  function renderContent() {
    switch (activeTab) {
      case 'bookmarks':
        return <BookmarkManager searchQuery={searchQuery} />;
      case 'youtube':
        return <YouTubeHistory />;
      case 'sessions':
        return <TabSessionPanel />;
      case 'analysis':
        return (
          <AnalysisDashboard
            patterns={analysisPatterns}
            suggestions={analysisSuggestions}
            isLoading={analysisLoading}
            error={analysisError}
            onRefresh={runAnalysis}
          />
        );
      case 'ai':
        return <AIAssistant />;
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  const showAd = tier === 'free' && adsEnabled && adData !== null;

  return (
    <div className="popup-container flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* ── 헤더 ── */}
      <header className="flex items-center justify-between px-4 py-2.5
                         border-b border-gray-200 dark:border-gray-700
                         bg-white dark:bg-gray-900 shrink-0">
        <h1 className="text-base font-bold text-blue-600 dark:text-blue-400 tracking-tight">
          SmartBookmark
        </h1>
        <ThemeToggle />
      </header>

      {/* ── 검색바 ── */}
      <div className="px-3 py-2 shrink-0 border-b border-gray-100 dark:border-gray-800">
        <SearchBar
          onQueryChange={(q) => setSearchQuery(q)}
          placeholder="북마크, 유튜브, 세션 검색..."
        />
      </div>

      {/* ── 탭 네비게이션 ── */}
      <nav className="flex border-b border-gray-200 dark:border-gray-700 shrink-0
                      bg-white dark:bg-gray-900">
        {TAB_CONFIG.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              activeTab === id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300',
            ].join(' ')}
            aria-selected={activeTab === id}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      {/* ── 콘텐츠 영역 ── */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {renderContent()}
      </main>

      {/* ── 하단 광고 (무료 티어) ── */}
      {showAd && (
        <div className="shrink-0 px-3 py-2 border-t border-gray-100 dark:border-gray-800">
          <NativeAd
            ad={adData}
            onDismiss={() => setAdData(null)}
            className="dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      )}
    </div>
  );
}
