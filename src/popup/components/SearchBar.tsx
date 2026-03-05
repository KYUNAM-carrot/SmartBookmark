/**
 * @file SearchBar.tsx
 * @description SmartBookmark Pro - Fuse.js 기반 검색 컴포넌트
 *
 * 북마크·유튜브·세션에 걸친 퍼지(fuzzy) 검색을 지원합니다.
 * 300ms 디바운스, 검색 결과 드롭다운, 매칭 텍스트 하이라이트, 필터 탭을 포함합니다.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Fuse, { type FuseResult, type IFuseOptions } from 'fuse.js';
import type { BookmarkData, YouTubeVideoData, TabSession } from '@/types';
import { getAllBookmarks } from '@/lib/bookmark-engine';
import { chromeStorage } from '@/lib/storage';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type SearchFilter = 'all' | 'bookmarks' | 'youtube' | 'sessions';

/** 통합 검색 결과 항목 */
export interface SearchResultItem {
  type: 'bookmark' | 'youtube' | 'session';
  id: string;
  title: string;
  subtitle: string;
  url?: string;
  favicon?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Fuse.js 설정
// ---------------------------------------------------------------------------

const BOOKMARK_FUSE_OPTIONS: IFuseOptions<BookmarkData> = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'url', weight: 0.2 },
    { name: 'tags', weight: 0.3 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 1,
  ignoreLocation: true,
};

const YOUTUBE_FUSE_OPTIONS: IFuseOptions<YouTubeVideoData> = {
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'channelName', weight: 0.4 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 1,
  ignoreLocation: true,
};

const SESSION_FUSE_OPTIONS: IFuseOptions<TabSession> = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'category', weight: 0.3 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 1,
  ignoreLocation: true,
};

// ---------------------------------------------------------------------------
// 매칭 텍스트 하이라이트
// ---------------------------------------------------------------------------

/**
 * Fuse.js 매치 정보를 이용해 매칭된 부분에 하이라이트 마크를 삽입합니다.
 */
function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices?: readonly [number, number][];
}) {
  if (!indices || indices.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // 인덱스를 오름차순으로 정렬
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);

  for (const [start, end] of sorted) {
    if (start > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, start)}</span>);
    }
    parts.push(
      <mark
        key={`h-${start}`}
        className="bg-yellow-200 dark:bg-yellow-800/60 text-inherit rounded-sm px-0.5"
      >
        {text.slice(start, end + 1)}
      </mark>
    );
    lastIndex = end + 1;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// 결과 아이템 렌더러
// ---------------------------------------------------------------------------

interface ResultItemProps {
  item: SearchResultItem;
  fuseResult: FuseResult<BookmarkData | YouTubeVideoData | TabSession>;
  onSelect: (item: SearchResultItem) => void;
}

function ResultItem({ item, fuseResult, onSelect }: ResultItemProps) {
  // 매치된 필드에서 제목 관련 인덱스 추출
  const titleMatch = fuseResult.matches?.find(
    (m) => m.key === 'title' || m.key === 'name'
  );

  const typeIcon: Record<SearchResultItem['type'], React.ReactNode> = {
    bookmark: (
      <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    ),
    youtube: (
      <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356
          2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246
          15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615
          12.816v-8l8 3.993-8 4.007z" />
      </svg>
    ),
    session: (
      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  };

  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-2.5 px-3 py-2
                 text-left rounded-lg
                 hover:bg-blue-50 dark:hover:bg-blue-900/20
                 active:scale-[0.99] transition-all"
    >
      {/* 파비콘 또는 타입 아이콘 */}
      <div className="shrink-0 w-5 h-5 rounded overflow-hidden bg-gray-100 dark:bg-gray-700
                      flex items-center justify-center">
        {item.favicon ? (
          <img
            src={item.favicon}
            alt=""
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          typeIcon[item.type]
        )}
      </div>

      {/* 제목 + 부제목 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
          <HighlightedText
            text={item.title}
            indices={titleMatch?.indices}
          />
        </span>
        {item.subtitle && (
          <span className="truncate text-[11px] text-gray-400 dark:text-gray-500">
            {item.subtitle}
          </span>
        )}
      </div>

      {/* 태그 (북마크) */}
      {item.tags && item.tags.length > 0 && (
        <div className="shrink-0 flex gap-1">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 dark:bg-gray-700
                         px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 필터 탭
// ---------------------------------------------------------------------------

const FILTER_LABELS: Record<SearchFilter, string> = {
  all: '전체',
  bookmarks: '북마크',
  youtube: '유튜브',
  sessions: '세션',
};

interface FilterTabsProps {
  active: SearchFilter;
  onChange: (filter: SearchFilter) => void;
}

function FilterTabs({ active, onChange }: FilterTabsProps) {
  return (
    <div className="flex gap-1 px-1">
      {(Object.entries(FILTER_LABELS) as [SearchFilter, string][]).map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
            ${active === id
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

interface SearchBarProps {
  /** 검색어 변경 콜백 (상위 컴포넌트와 검색어 공유용) */
  onQueryChange?: (query: string) => void;
  /** 검색 결과 선택 콜백 */
  onResultSelect?: (item: SearchResultItem) => void;
  /** placeholder 텍스트 */
  placeholder?: string;
}

export default function SearchBar({
  onQueryChange,
  onResultSelect,
  placeholder = '북마크, 유튜브, 세션 검색...',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [results, setResults] = useState<
    Array<{ item: SearchResultItem; raw: FuseResult<BookmarkData | YouTubeVideoData | TabSession> }>
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 데이터 캐시 (검색 시마다 재요청 방지)
  const bookmarksRef = useRef<BookmarkData[]>([]);
  const youtubeRef = useRef<YouTubeVideoData[]>([]);
  const sessionsRef = useRef<TabSession[]>([]);

  // Fuse 인스턴스 캐시
  const bookmarkFuseRef = useRef<Fuse<BookmarkData> | null>(null);
  const youtubeFuseRef = useRef<Fuse<YouTubeVideoData> | null>(null);
  const sessionFuseRef = useRef<Fuse<TabSession> | null>(null);

  /** 검색 데이터를 로드하고 Fuse 인스턴스를 초기화합니다. */
  const initializeData = useCallback(async () => {
    try {
      const [bookmarks, ytHistory, tabSessions] = await Promise.all([
        getAllBookmarks(),
        chromeStorage.get<Record<string, YouTubeVideoData>>('youtubeHistory'),
        chromeStorage.get<Record<string, TabSession>>('tabSessions'),
      ]);

      bookmarksRef.current = bookmarks;
      youtubeRef.current = Object.values(ytHistory ?? {});
      sessionsRef.current = Object.values(tabSessions ?? {});

      bookmarkFuseRef.current = new Fuse(bookmarksRef.current, BOOKMARK_FUSE_OPTIONS);
      youtubeFuseRef.current = new Fuse(youtubeRef.current, YOUTUBE_FUSE_OPTIONS);
      sessionFuseRef.current = new Fuse(sessionsRef.current, SESSION_FUSE_OPTIONS);
    } catch (err) {
      console.error('[SearchBar] 데이터 초기화 실패:', err);
    }
  }, []);

  // 마운트 시 데이터 로드
  useEffect(() => {
    initializeData();
  }, [initializeData]);

  // 300ms 디바운스
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // 상위 컴포넌트에 검색어 전달
  useEffect(() => {
    onQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onQueryChange]);

  /** Fuse.js로 퍼지 검색 실행 */
  const runSearch = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsSearching(true);

      const combined: Array<{
        item: SearchResultItem;
        raw: FuseResult<BookmarkData | YouTubeVideoData | TabSession>;
        score: number;
      }> = [];

      // 북마크 검색
      if ((filter === 'all' || filter === 'bookmarks') && bookmarkFuseRef.current) {
        const bmResults = bookmarkFuseRef.current.search(q);
        for (const r of bmResults) {
          const bm = r.item;
          combined.push({
            item: {
              type: 'bookmark',
              id: bm.id,
              title: bm.title || bm.url,
              subtitle: bm.url,
              url: bm.url,
              favicon: bm.favicon,
              tags: bm.tags,
            },
            raw: r as FuseResult<BookmarkData | YouTubeVideoData | TabSession>,
            score: r.score ?? 1,
          });
        }
      }

      // YouTube 검색
      if ((filter === 'all' || filter === 'youtube') && youtubeFuseRef.current) {
        const ytResults = youtubeFuseRef.current.search(q);
        for (const r of ytResults) {
          const yt = r.item;
          combined.push({
            item: {
              type: 'youtube',
              id: yt.videoId,
              title: yt.title,
              subtitle: yt.channelName,
              url: yt.url,
              favicon: yt.thumbnailUrl,
            },
            raw: r as FuseResult<BookmarkData | YouTubeVideoData | TabSession>,
            score: r.score ?? 1,
          });
        }
      }

      // 세션 검색
      if ((filter === 'all' || filter === 'sessions') && sessionFuseRef.current) {
        const sessionResults = sessionFuseRef.current.search(q);
        for (const r of sessionResults) {
          const session = r.item;
          combined.push({
            item: {
              type: 'session',
              id: session.id,
              title: session.name,
              subtitle: `탭 ${session.tabs.length}개${session.category ? ` · ${session.category}` : ''}`,
            },
            raw: r as FuseResult<BookmarkData | YouTubeVideoData | TabSession>,
            score: r.score ?? 1,
          });
        }
      }

      // 점수 기준 오름차순 정렬 (0이 완벽 매칭)
      combined.sort((a, b) => a.score - b.score);

      setResults(combined.slice(0, 20).map(({ item, raw }) => ({ item, raw })));
      setIsOpen(true);
      setIsSearching(false);
    },
    [filter]
  );

  // 디바운스된 쿼리 또는 필터 변경 시 검색 실행
  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, filter, runSearch]);

  /** 드롭다운 바깥 클릭 시 닫기 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SearchResultItem) => {
    if (item.url) {
      chrome.tabs.create({ url: item.url });
    }
    onResultSelect?.(item);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      {/* 검색 입력창 */}
      <div className="relative flex items-center">
        {/* 검색 아이콘 */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          {isSearching ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 text-xs rounded-lg
                     border border-gray-200 dark:border-gray-600
                     bg-gray-50 dark:bg-gray-800
                     text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-blue-500
                     focus:border-transparent
                     transition-all"
        />

        {/* 지우기 버튼 */}
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2
                       text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                       active:scale-90 transition-all"
            aria-label="검색어 지우기"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 검색 결과 드롭다운 */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-50 mt-1
                     rounded-xl border border-gray-200 dark:border-gray-700
                     bg-white dark:bg-gray-800
                     shadow-lg shadow-black/10 dark:shadow-black/30
                     max-h-80 overflow-hidden flex flex-col"
        >
          {/* 필터 탭 */}
          <div className="pt-2 pb-1 border-b border-gray-100 dark:border-gray-700">
            <FilterTabs active={filter} onChange={setFilter} />
          </div>

          {/* 결과 목록 */}
          <div className="overflow-y-auto flex-1 py-1 px-1">
            {results.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-gray-400 dark:text-gray-500">
                '{debouncedQuery}'에 대한 결과가 없습니다
              </div>
            ) : (
              <>
                {results.map(({ item, raw }) => (
                  <ResultItem
                    key={`${item.type}-${item.id}`}
                    item={item}
                    fuseResult={raw}
                    onSelect={handleSelect}
                  />
                ))}
                {/* 결과 수 표시 */}
                <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 text-right border-t border-gray-100 dark:border-gray-700 mt-1">
                  결과 {results.length}개
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
