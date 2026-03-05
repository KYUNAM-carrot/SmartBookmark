/**
 * @file YouTubeHistory.tsx
 * @description SmartBookmark Pro - YouTube 시청 기록 탭 컴포넌트
 *
 * IndexedDB에서 YouTube 시청 기록을 로드하고 표시합니다.
 * 검색, 정렬, 카테고리 필터, 타임스탬프 보기, 페이지네이션을 지원합니다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { YouTubeVideoData, SavedTimestamp } from '@/types';
import { db } from '@/lib/storage';
import {
  searchVideos,
  sortVideos,
  formatDuration,
  formatWatchedAt,
  VIDEO_CATEGORIES,
  type VideoSortBy,
} from '@/lib/youtube-parser';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// IndexedDB에서 반환되는 레코드 타입 (id 필드 포함)
type VideoRecord = YouTubeVideoData & { id: string };

// ---------------------------------------------------------------------------
// 하위 컴포넌트: 개별 동영상 카드
// ---------------------------------------------------------------------------

interface VideoCardProps {
  video: VideoRecord;
  onOpenVideo: (url: string) => void;
  onOpenAtTimestamp: (url: string, seconds: number) => void;
}

function VideoCard({ video, onOpenVideo, onOpenAtTimestamp }: VideoCardProps) {
  const [showTimestamps, setShowTimestamps] = useState(false);

  const thumbnailUrl =
    video.thumbnailUrl ||
    `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

  return (
    <div className="flex gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      {/* 썸네일 */}
      <div className="relative flex-shrink-0 w-[96px] h-[54px] rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {video.duration !== undefined && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        {/* 제목 */}
        <p
          className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight mb-0.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
          title={video.title}
          onClick={() => onOpenVideo(video.url)}
        >
          {video.title}
        </p>

        {/* 채널명 */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mb-0.5">
          {video.channelName}
        </p>

        {/* 메타 정보 행 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 시청 시간 */}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatWatchedAt(video.watchedAt)}
          </span>

          {/* 실시청 시간 */}
          {video.watchDuration !== undefined && video.watchDuration > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              시청 {formatDuration(video.watchDuration)}
            </span>
          )}

          {/* 카테고리 뱃지 */}
          {video.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {VIDEO_CATEGORIES.find((c) => c.id === video.category)?.label ??
                video.category}
            </span>
          )}
        </div>

        {/* 액션 버튼 행 */}
        <div className="flex items-center gap-1.5 mt-1">
          <button
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => onOpenVideo(video.url)}
          >
            열기
          </button>

          {video.timestamps && video.timestamps.length > 0 && (
            <button
              className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
              onClick={() => setShowTimestamps((v) => !v)}
            >
              타임스탬프 {video.timestamps.length}개{showTimestamps ? ' 닫기' : ' 보기'}
            </button>
          )}
        </div>

        {/* 타임스탬프 목록 */}
        {showTimestamps && video.timestamps && video.timestamps.length > 0 && (
          <TimestampList
            videoId={video.videoId}
            timestamps={video.timestamps}
            onOpenAt={onOpenAtTimestamp}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트: 타임스탬프 목록
// ---------------------------------------------------------------------------

interface TimestampListProps {
  videoId: string;
  timestamps: SavedTimestamp[];
  onOpenAt: (url: string, seconds: number) => void;
}

function TimestampList({ videoId, timestamps, onOpenAt }: TimestampListProps) {
  return (
    <div className="mt-1.5 pl-1 border-l-2 border-purple-200 dark:border-purple-800 space-y-1">
      {timestamps.map((ts, idx) => {
        const url = `https://www.youtube.com/watch?v=${videoId}&t=${ts.seconds}s`;
        const timeLabel = formatSecondsCompact(ts.seconds);
        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 w-[40px] flex-shrink-0">
              {timeLabel}
            </span>
            <span className="text-[10px] text-gray-600 dark:text-gray-400 flex-1 truncate">
              {ts.label}
            </span>
            <button
              className="text-[10px] text-blue-500 hover:underline flex-shrink-0"
              onClick={() => onOpenAt(url, ts.seconds)}
            >
              이동
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** 초를 "H:MM:SS" 또는 "M:SS" 로 변환 */
function formatSecondsCompact(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트: YouTubeHistory
// ---------------------------------------------------------------------------

export default function YouTubeHistory() {
  // --- 데이터 상태 ---
  const [allVideos, setAllVideos] = useState<VideoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- 필터 / 정렬 상태 ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<VideoSortBy>('watchedAt');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // --- 페이지네이션 ---
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // 데이터 로드
  // ---------------------------------------------------------------------------

  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const records = await db.getAll<VideoRecord>('youtube_videos');
      // 최신순으로 기본 정렬
      records.sort(
        (a, b) =>
          new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
      );
      setAllVideos(records);
    } catch (err) {
      console.error('[YouTubeHistory] 데이터 로드 실패:', err);
      setLoadError('시청 기록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // ---------------------------------------------------------------------------
  // 필터링 / 정렬 파이프라인
  // ---------------------------------------------------------------------------

  const processedVideos: VideoRecord[] = (() => {
    let result: VideoRecord[] = allVideos;

    // 카테고리 필터
    if (selectedCategory) {
      result = result.filter((v) => v.category === selectedCategory);
    }

    // 검색 필터
    if (searchQuery.trim()) {
      result = searchVideos(searchQuery, result) as VideoRecord[];
    }

    // 정렬
    result = sortVideos(result, sortBy) as VideoRecord[];

    return result;
  })();

  // 표시할 동영상 (페이지네이션 적용)
  const displayedVideos = processedVideos.slice(0, displayCount);
  const hasMore = displayCount < processedVideos.length;

  // ---------------------------------------------------------------------------
  // Intersection Observer (무한 스크롤)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setDisplayCount((prev) => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  // 검색/정렬/카테고리 변경 시 displayCount 리셋
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchQuery, sortBy, selectedCategory]);

  // ---------------------------------------------------------------------------
  // 카테고리 칩 목록 (실제 데이터에 존재하는 것만)
  // ---------------------------------------------------------------------------

  const availableCategories: string[] = (() => {
    const set = new Set(allVideos.map((v) => v.category).filter(Boolean) as string[]);
    return VIDEO_CATEGORIES.filter((c) => set.has(c.id)).map((c) => c.id);
  })();

  // ---------------------------------------------------------------------------
  // 이벤트 핸들러
  // ---------------------------------------------------------------------------

  const handleOpenVideo = (url: string) => {
    chrome.tabs.create({ url });
  };

  const handleOpenAtTimestamp = (url: string, _seconds: number) => {
    chrome.tabs.create({ url });
  };

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-3" />
        시청 기록 불러오는 중...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <p className="text-sm text-red-500 mb-3">{loadError}</p>
        <button
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          onClick={loadVideos}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 검색 */}
      <div className="px-3 pt-2 pb-1">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목, 채널명 검색..."
          className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600
                     rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 정렬 옵션 */}
      <div className="flex items-center gap-1.5 px-3 pb-1 overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-gray-400 flex-shrink-0">정렬:</span>
        {(
          [
            { value: 'watchedAt', label: '최신순' },
            { value: 'duration', label: '길이순' },
            { value: 'watchDuration', label: '시청순' },
            { value: 'channel', label: '채널순' },
          ] as { value: VideoSortBy; label: string }[]
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSortBy(value)}
            className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] transition-colors ${
              sortBy === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 카테고리 필터 칩 */}
      {availableCategories.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedCategory('')}
            className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] transition-colors ${
              selectedCategory === ''
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            전체
          </button>
          {availableCategories.map((catId) => {
            const cat = VIDEO_CATEGORIES.find((c) => c.id === catId);
            return (
              <button
                key={catId}
                onClick={() =>
                  setSelectedCategory((prev) => (prev === catId ? '' : catId))
                }
                className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                  selectedCategory === catId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {cat?.label ?? catId}
              </button>
            );
          })}
        </div>
      )}

      {/* 결과 카운트 */}
      <div className="px-3 pb-1">
        <p className="text-[10px] text-gray-400">
          {processedVideos.length > 0
            ? `${processedVideos.length}개의 동영상`
            : ''}
        </p>
      </div>

      {/* 동영상 목록 */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {displayedVideos.length === 0 ? (
          <EmptyState
            hasQuery={!!searchQuery || !!selectedCategory}
            onClear={() => {
              setSearchQuery('');
              setSelectedCategory('');
            }}
          />
        ) : (
          <>
            {displayedVideos.map((video) => (
              <VideoCard
                key={video.videoId}
                video={video}
                onOpenVideo={handleOpenVideo}
                onOpenAtTimestamp={handleOpenAtTimestamp}
              />
            ))}
            {/* 무한 스크롤 감지 엘리먼트 */}
            <div ref={loaderRef} className="h-4" />
            {hasMore && (
              <div className="text-center pb-2">
                <span className="text-[10px] text-gray-400">
                  더 보기 ({processedVideos.length - displayCount}개 남음)
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트: 빈 상태
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  hasQuery: boolean;
  onClear: () => void;
}

function EmptyState({ hasQuery, onClear }: EmptyStateProps) {
  if (hasQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <p className="text-2xl mb-2">검색 아이콘</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          검색 결과가 없습니다
        </p>
        <button
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          onClick={onClear}
        >
          필터 초기화
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <p className="text-2xl mb-2">재생 아이콘</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        시청 기록이 없습니다
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        YouTube에서 동영상을 시청하면
        <br />
        자동으로 기록이 저장됩니다
      </p>
    </div>
  );
}
