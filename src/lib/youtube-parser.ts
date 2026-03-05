/**
 * @file youtube-parser.ts
 * @description SmartBookmark Pro - YouTube 데이터 처리 유틸리티
 *
 * YouTube 시청 기록 데이터의 파싱, 검색, 정렬, 통계 집계 기능을 제공합니다.
 */

import type { YouTubeVideoData } from '../types/index';

// ---------------------------------------------------------------------------
// 카테고리 정의
// ---------------------------------------------------------------------------

/** 단일 카테고리 정의 */
export interface VideoCategory {
  /** 카테고리 고유 ID */
  id: string;
  /** 표시 레이블 (한국어) */
  label: string;
  /** 카테고리 분류에 사용할 키워드 목록 (소문자) */
  keywords: string[];
  /** UI 표시용 이모지 */
  emoji: string;
}

/**
 * 사전 정의된 동영상 카테고리 목록.
 * 채널명 또는 동영상 제목 키워드로 분류합니다.
 */
export const VIDEO_CATEGORIES: VideoCategory[] = [
  {
    id: 'programming',
    label: '프로그래밍',
    emoji: 'code icon',
    keywords: [
      'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift',
      'react', 'vue', 'angular', 'node', 'spring', 'django', 'flutter',
      'coding', 'programming', 'developer', '개발', '프로그래밍', '코딩',
      'tutorial', '튜토리얼', 'algorithm', '알고리즘', 'leetcode',
      'github', 'docker', 'kubernetes', 'aws', 'gcp', 'azure',
      'frontend', 'backend', 'fullstack', '프론트', '백엔드',
    ],
  },
  {
    id: 'ai_ml',
    label: 'AI / 머신러닝',
    emoji: 'brain icon',
    keywords: [
      'ai', 'artificial intelligence', 'machine learning', 'deep learning',
      'neural network', 'gpt', 'chatgpt', 'llm', 'nlp', 'computer vision',
      '인공지능', '머신러닝', '딥러닝', '데이터사이언스', 'data science',
      'tensorflow', 'pytorch', 'openai', 'anthropic', 'gemini',
    ],
  },
  {
    id: 'education',
    label: '교육',
    emoji: 'graduation cap icon',
    keywords: [
      'lecture', 'course', 'learn', 'study', 'education', 'university',
      '강의', '수업', '공부', '학습', '교육', '강좌', '입문', '기초',
      'khan academy', 'coursera', 'udemy', '인프런', '노마드코더',
      'math', 'science', 'history', '수학', '과학', '역사',
    ],
  },
  {
    id: 'news',
    label: '뉴스 / 시사',
    emoji: 'newspaper icon',
    keywords: [
      'news', 'breaking', 'report', '뉴스', '시사', '보도', '속보',
      'cnn', 'bbc', 'mbc', 'kbs', 'sbs', 'jtbc', 'ytn',
      'politics', 'economy', 'society', '정치', '경제', '사회',
    ],
  },
  {
    id: 'entertainment',
    label: '엔터테인먼트',
    emoji: 'star icon',
    keywords: [
      'funny', 'comedy', 'entertainment', 'variety', '예능', '코미디',
      '개그', '웃긴', '재미', 'challenge', '챌린지', 'prank',
      '유머', 'vlog', 'daily', '일상',
    ],
  },
  {
    id: 'music',
    label: '음악',
    emoji: 'music note icon',
    keywords: [
      'music', 'song', 'album', 'mv', 'official', 'live', 'concert',
      '음악', '노래', '뮤직비디오', '앨범', '콘서트', '공연',
      'kpop', 'k-pop', 'pop', 'jazz', 'classical', 'hiphop', 'rap',
      'playlist', '플레이리스트',
    ],
  },
  {
    id: 'gaming',
    label: '게임',
    emoji: 'game controller icon',
    keywords: [
      'game', 'gaming', 'gameplay', 'walkthrough', 'playthrough',
      '게임', '플레이', '공략', '리뷰', 'minecraft', 'roblox',
      'lol', 'league of legends', 'valorant', 'overwatch', 'starcraft',
      'fps', 'rpg', 'moba', 'esports', '이스포츠',
    ],
  },
  {
    id: 'tech',
    label: '테크 / 리뷰',
    emoji: 'laptop icon',
    keywords: [
      'tech', 'technology', 'review', 'unboxing', 'setup', 'gadget',
      '테크', '기술', '리뷰', '언박싱', 'iphone', 'android', 'samsung',
      'apple', 'google', '스마트폰', '노트북', '컴퓨터', 'pc',
      'benchmark', '벤치마크',
    ],
  },
  {
    id: 'health_fitness',
    label: '건강 / 운동',
    emoji: 'muscle icon',
    keywords: [
      'fitness', 'workout', 'exercise', 'gym', 'yoga', 'pilates',
      '운동', '헬스', '다이어트', '요가', '필라테스', '홈트',
      'diet', 'nutrition', 'health', '건강', '영양', 'stretching',
    ],
  },
  {
    id: 'cooking',
    label: '요리 / 음식',
    emoji: 'chef hat icon',
    keywords: [
      'recipe', 'cooking', 'food', 'eat', 'restaurant', 'mukbang',
      '요리', '레시피', '음식', '먹방', '맛집', '식당', '요식업',
      'baking', '베이킹', 'chef', '셰프',
    ],
  },
  {
    id: 'finance',
    label: '재테크 / 금융',
    emoji: 'chart icon',
    keywords: [
      'stock', 'invest', 'finance', 'crypto', 'bitcoin', 'ethereum',
      '주식', '투자', '재테크', '암호화폐', '비트코인', '이더리움',
      'economy', '경제', 'trading', '트레이딩', '부동산',
    ],
  },
  {
    id: 'travel',
    label: '여행',
    emoji: 'plane icon',
    keywords: [
      'travel', 'trip', 'tour', 'vlog', 'destination', 'adventure',
      '여행', '투어', '해외', '국내여행', '배낭여행', '여행기',
    ],
  },
  {
    id: 'other',
    label: '기타',
    emoji: 'other icon',
    keywords: [],
  },
];

// ---------------------------------------------------------------------------
// 파싱 / 검증
// ---------------------------------------------------------------------------

/**
 * raw 동영상 데이터를 검증하고 정제하여 반환합니다.
 * 필수 필드가 누락되거나 유효하지 않으면 null을 반환합니다.
 *
 * @param rawData 파싱할 raw 데이터 (unknown 타입 허용)
 * @returns 정제된 YouTubeVideoData 또는 null
 */
export function parseYouTubeVideo(rawData: unknown): YouTubeVideoData | null {
  if (!rawData || typeof rawData !== 'object') return null;

  const data = rawData as Record<string, unknown>;

  // 필수 필드 검증
  if (
    typeof data.videoId !== 'string' || !data.videoId.trim() ||
    typeof data.title !== 'string' ||
    typeof data.channelName !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.watchedAt !== 'string'
  ) {
    return null;
  }

  // videoId 형식 검증 (11자리 alphanumeric + _ -)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(data.videoId)) return null;

  // watchedAt ISO 8601 검증
  const watchedDate = new Date(data.watchedAt);
  if (isNaN(watchedDate.getTime())) return null;

  return {
    videoId: data.videoId,
    title: String(data.title).trim() || 'Untitled',
    channelName: String(data.channelName).trim() || 'Unknown Channel',
    channelUrl: typeof data.channelUrl === 'string' ? data.channelUrl : '',
    url: String(data.url),
    thumbnailUrl:
      typeof data.thumbnailUrl === 'string'
        ? data.thumbnailUrl
        : `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`,
    duration: typeof data.duration === 'number' && data.duration > 0
      ? Math.floor(data.duration)
      : undefined,
    watchedAt: data.watchedAt,
    watchDuration: typeof data.watchDuration === 'number' && data.watchDuration >= 0
      ? Math.floor(data.watchDuration)
      : undefined,
    category: typeof data.category === 'string' ? data.category : undefined,
    tags: Array.isArray(data.tags)
      ? (data.tags as unknown[]).filter((t) => typeof t === 'string') as string[]
      : undefined,
    timestamps: Array.isArray(data.timestamps) ? data.timestamps : undefined,
  };
}

// ---------------------------------------------------------------------------
// 카테고리 분류
// ---------------------------------------------------------------------------

/**
 * 채널명과 동영상 제목을 분석하여 카테고리를 분류합니다.
 * VIDEO_CATEGORIES의 키워드와 매칭하여 가장 적합한 카테고리 ID를 반환합니다.
 *
 * @param video 분류할 동영상 데이터
 * @returns 카테고리 ID (기본값: 'other')
 */
export function categorizeVideo(
  video: Pick<YouTubeVideoData, 'title' | 'channelName'>
): string {
  const haystack = `${video.title} ${video.channelName}`.toLowerCase();

  for (const category of VIDEO_CATEGORIES) {
    if (category.id === 'other') continue;
    if (category.keywords.some((kw) => haystack.includes(kw))) {
      return category.id;
    }
  }

  return 'other';
}

// ---------------------------------------------------------------------------
// 포맷 유틸리티
// ---------------------------------------------------------------------------

/**
 * 초 단위 시간을 사람이 읽기 쉬운 문자열로 변환합니다.
 *
 * @example
 * formatDuration(3661) // "1시간 1분 1초"
 * formatDuration(125)  // "2분 5초"
 * formatDuration(45)   // "45초"
 * formatDuration(0)    // "0초"
 *
 * @param seconds 초 단위 시간
 * @returns 포맷된 문자열
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0초';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}초`);

  return parts.join(' ');
}

/**
 * ISO 8601 타임스탬프를 상대 시간 문자열로 변환합니다.
 *
 * @example
 * formatWatchedAt("2024-01-01T00:00:00Z") // "N일 전"
 *
 * @param isoTimestamp ISO 8601 날짜 문자열
 * @returns 상대 시간 문자열 (예: "방금 전", "3분 전", "2시간 전", "5일 전")
 */
export function formatWatchedAt(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isNaN(date.getTime())) return '알 수 없음';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return '방금 전';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / (86400 * 7))}주 전`;
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}달 전`;
  return `${Math.floor(diffSec / (86400 * 365))}년 전`;
}

// ---------------------------------------------------------------------------
// 검색
// ---------------------------------------------------------------------------

/**
 * 검색어로 동영상 목록을 필터링합니다.
 * 제목, 채널명, 카테고리를 대상으로 대소문자 무시 검색합니다.
 *
 * @param query 검색어 (공백 구분 다중 키워드 지원)
 * @param videos 검색 대상 동영상 배열
 * @returns 검색어와 일치하는 동영상 배열
 */
export function searchVideos(
  query: string,
  videos: YouTubeVideoData[]
): YouTubeVideoData[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return videos;

  const keywords = trimmed.split(/\s+/).filter(Boolean);

  return videos.filter((v) => {
    const haystack = [
      v.title,
      v.channelName,
      v.category ?? '',
      ...(v.tags ?? []),
    ]
      .join(' ')
      .toLowerCase();

    return keywords.every((kw) => haystack.includes(kw));
  });
}

// ---------------------------------------------------------------------------
// 정렬
// ---------------------------------------------------------------------------

/** 정렬 기준 */
export type VideoSortBy = 'watchedAt' | 'duration' | 'channel' | 'watchDuration';

/**
 * 동영상 목록을 지정한 기준으로 정렬합니다.
 * 원본 배열을 변경하지 않고 새 배열을 반환합니다.
 *
 * @param videos 정렬할 동영상 배열
 * @param sortBy 정렬 기준 ('watchedAt' | 'duration' | 'channel' | 'watchDuration')
 * @returns 정렬된 새 배열
 */
export function sortVideos(
  videos: YouTubeVideoData[],
  sortBy: VideoSortBy
): YouTubeVideoData[] {
  return [...videos].sort((a, b) => {
    switch (sortBy) {
      case 'watchedAt':
        return new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime();

      case 'duration':
        return (b.duration ?? 0) - (a.duration ?? 0);

      case 'watchDuration':
        return (b.watchDuration ?? 0) - (a.watchDuration ?? 0);

      case 'channel':
        return a.channelName.localeCompare(b.channelName, 'ko');

      default:
        return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------

/** 채널별 통계 */
export interface ChannelStat {
  /** 채널명 */
  name: string;
  /** 해당 채널 시청 동영상 수 */
  count: number;
  /** 해당 채널 총 시청 시간 (초) */
  totalWatchSeconds: number;
}

/** 카테고리별 통계 */
export interface CategoryStat {
  /** 카테고리 ID */
  id: string;
  /** 카테고리 레이블 */
  label: string;
  /** 해당 카테고리 동영상 수 */
  count: number;
}

/** 전체 시청 통계 집계 결과 */
export interface VideoStats {
  /** 총 시청 동영상 수 */
  totalVideos: number;
  /** 누적 시청 시간 (초, watchDuration 기준) */
  totalWatchSeconds: number;
  /** 누적 시청 시간 포맷 문자열 */
  totalWatchFormatted: string;
  /** 상위 5개 채널 통계 */
  topChannels: ChannelStat[];
  /** 카테고리별 분포 */
  categoryBreakdown: CategoryStat[];
  /** 일평균 시청 동영상 수 */
  avgVideosPerDay: number;
}

/**
 * 동영상 목록에서 집계 통계를 계산합니다.
 *
 * @param videos 분석할 동영상 배열
 * @returns VideoStats 집계 결과
 */
export function getVideoStats(videos: YouTubeVideoData[]): VideoStats {
  const totalVideos = videos.length;

  // 총 시청 시간
  const totalWatchSeconds = videos.reduce(
    (sum, v) => sum + (v.watchDuration ?? 0),
    0
  );

  // 채널별 집계
  const channelMap = new Map<string, ChannelStat>();
  for (const v of videos) {
    const existing = channelMap.get(v.channelName);
    if (existing) {
      existing.count += 1;
      existing.totalWatchSeconds += v.watchDuration ?? 0;
    } else {
      channelMap.set(v.channelName, {
        name: v.channelName,
        count: 1,
        totalWatchSeconds: v.watchDuration ?? 0,
      });
    }
  }
  const topChannels = [...channelMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 카테고리별 집계
  const categoryMap = new Map<string, number>();
  for (const v of videos) {
    const cat = v.category ?? 'other';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
  }

  const categoryBreakdown: CategoryStat[] = [...categoryMap.entries()]
    .map(([id, count]) => {
      const def = VIDEO_CATEGORIES.find((c) => c.id === id);
      return { id, label: def?.label ?? id, count };
    })
    .sort((a, b) => b.count - a.count);

  // 일평균 계산
  let avgVideosPerDay = 0;
  if (totalVideos > 0) {
    const timestamps = videos
      .map((v) => new Date(v.watchedAt).getTime())
      .filter((t) => !isNaN(t));

    if (timestamps.length >= 2) {
      const minDate = timestamps.reduce((a, b) => Math.min(a, b));
      const maxDate = timestamps.reduce((a, b) => Math.max(a, b));
      const diffDays = Math.max(1, (maxDate - minDate) / 86400_000);
      avgVideosPerDay = parseFloat((totalVideos / diffDays).toFixed(1));
    } else {
      avgVideosPerDay = totalVideos;
    }
  }

  return {
    totalVideos,
    totalWatchSeconds,
    totalWatchFormatted: formatDuration(totalWatchSeconds),
    topChannels,
    categoryBreakdown,
    avgVideosPerDay,
  };
}

// ---------------------------------------------------------------------------
// 카테고리 레이블 조회 헬퍼
// ---------------------------------------------------------------------------

/**
 * 카테고리 ID로 레이블을 반환합니다.
 *
 * @param categoryId 카테고리 ID
 * @returns 한국어 레이블 (없으면 categoryId 그대로)
 */
export function getCategoryLabel(categoryId: string): string {
  return VIDEO_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}
