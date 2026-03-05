/**
 * SmartBookmark Pro - 전체 프로젝트 타입 정의
 *
 * 이 파일은 SmartBookmark Pro Chrome 확장 프로그램의 모든 타입을 정의합니다.
 * 모든 모듈은 이 파일에서 타입을 import하여 사용합니다.
 */

// =============================================================================
// 북마크 핵심 타입
// =============================================================================

/**
 * 페이지 스냅샷 데이터
 * 북마크 저장 시점의 페이지 상태를 캡처한 정보
 */
export interface PageSnapshot {
  /** 스냅샷 캡처 시각 (ISO 8601) */
  capturedAt: string;
  /** 페이지 본문 텍스트 미리보기 (최대 500자) */
  textPreview: string;
  /** 스크린샷 dataURL (선택) */
  screenshotDataUrl?: string;
}

/**
 * 페이지 메타데이터
 * content script가 추출한 페이지의 풍부한 메타 정보
 */
export interface PageMetadata {
  /** 브라우저 원본 페이지 제목 */
  originalTitle: string;
  /** 페이지 URL */
  url: string;
  /** 도메인 (예: 'github.com') */
  domain: string;
  /** 사이트 이름 (예: 'GitHub') */
  siteName: string;

  // Open Graph
  /** OG 제목 */
  ogTitle?: string;
  /** OG 설명 */
  ogDescription?: string;
  /** OG 콘텐츠 타입 (예: 'article', 'website') */
  ogType?: string;
  /** OG 이미지 URL */
  ogImage?: string;

  // Twitter Card
  /** Twitter Card 제목 */
  twitterTitle?: string;

  // 기본 메타 태그
  /** meta description 내용 */
  metaDescription?: string;
  /** meta keywords 배열 */
  metaKeywords?: string[];

  // Schema.org 구조화 데이터
  /** Schema.org 타입 (예: 'Article', 'Product') */
  schemaType?: string;
  /** Schema.org name 필드 */
  schemaName?: string;
  /** Schema.org author 필드 */
  schemaAuthor?: string;
  /** Schema.org datePublished 필드 */
  schemaDatePublished?: string;
  /** Schema.org price 필드 */
  schemaPrice?: string;

  // 콘텐츠 추출
  /** 첫 번째 H1 텍스트 */
  h1Text?: string;
  /** article 본문 텍스트 */
  articleBody?: string;
  /** 페이지 텍스트 미리보기 (최대 300자) */
  pageTextPreview?: string;

  // YouTube 전용
  /** YouTube 채널명 */
  ytChannel?: string;
  /** YouTube 동영상 길이 (예: 'PT1H23M45S') */
  ytDuration?: string;

  // 쇼핑/제품 전용
  /** 제품명 */
  productName?: string;
  /** 제품 가격 */
  productPrice?: string;
  /** 제품 브랜드 */
  productBrand?: string;
}

/**
 * 스마트 타이틀 생성 결과
 * AI가 분석하여 생성한 최적화된 제목 정보
 */
export interface SmartTitleResult {
  /** 최종 선택된 스마트 제목 */
  title: string;
  /** 페이지 요약 (1~2문장) */
  summary: string;
  /** AI가 제안한 후보 제목 목록 */
  candidates: string[];
  /** 생성 신뢰도 */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 북마크 데이터
 * SmartBookmark Pro의 핵심 데이터 모델.
 * chrome.bookmarks.BookmarkTreeNode를 확장하여 스마트 기능을 추가한 형태.
 */
export interface BookmarkData {
  /** 고유 식별자 (chrome bookmark id와 동일) */
  id: string;
  /** 브라우저 원본 제목 */
  originalTitle: string;
  /** AI가 생성한 스마트 제목 (생성 전에는 originalTitle과 동일) */
  smartTitle: string;
  /** 표시 제목 (사용자가 편집 가능) */
  title: string;
  /** 북마크 URL */
  url: string;
  /** 부모 폴더 ID */
  parentId: string;
  /** 사용자 태그 목록 */
  tags: string[];
  /** 북마크 추가 시각 (ISO 8601) */
  addedAt: string;
  /** 마지막 방문 시각 (ISO 8601, 선택) */
  lastVisited?: string;
  /** 총 방문 횟수 */
  visitCount?: number;
  /** AI 분류 카테고리 */
  category?: string;
  /** 파비콘 dataURL 또는 URL */
  favicon?: string;
  /** 페이지 내 하이라이트 정보 */
  highlight?: Highlight;
  /** 사용자 메모 */
  memo?: string;
  /** 저장 시점 페이지 스냅샷 */
  snapshot?: PageSnapshot;
  /** 페이지 메타데이터 */
  pageInfo?: PageMetadata;
}

// =============================================================================
// 하이라이트 타입
// =============================================================================

/** 하이라이트 색상 옵션 */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

/**
 * 페이지 하이라이트
 * 사용자가 웹페이지에서 선택하여 저장한 텍스트 강조 정보
 */
export interface Highlight {
  /** 연결된 북마크 ID */
  bookmarkId: string;
  /** 선택된 텍스트 내용 */
  text: string;
  /** DOM 위치를 나타내는 XPath */
  xpath: string;
  /** 하이라이트 색상 */
  color: HighlightColor;
  /** 해당 하이라이트에 대한 메모 (선택) */
  memo?: string;
  /** 하이라이트 생성 시각 (ISO 8601) */
  createdAt: string;
}

// =============================================================================
// 중복 북마크 타입
// =============================================================================

/**
 * 중복 북마크 그룹
 * 동일한 정규화 URL을 가진 북마크들의 묶음
 */
export interface DuplicateGroup {
  /** 정규화된 URL (쿼리스트링/해시 제거 후) */
  normalizedUrl: string;
  /** 중복으로 묶인 Chrome 북마크 노드 배열 */
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
}

// =============================================================================
// 방문 패턴 분석 타입
// =============================================================================

/**
 * URL 방문 패턴
 * 브라우저 방문 기록을 분석하여 도출한 패턴 정보
 */
export interface VisitPattern {
  /** 방문 URL */
  url: string;
  /** 페이지 제목 */
  title: string;
  /** 도메인 */
  domain: string;
  /** 누적 방문 횟수 */
  totalVisits: number;
  /** 최근 7일 방문 횟수 */
  recentVisits: number;
  /** 주간 평균 방문 횟수 */
  avgVisitsPerWeek: number;
  /** 마지막 방문 시각 (ISO 8601) */
  lastVisited: string;
  /** AI 분류 카테고리 (선택) */
  category?: string;
  /** 현재 북마크 여부 */
  isBookmarked: boolean;
}

// =============================================================================
// 스마트 알림 타입
// =============================================================================

/**
 * 알림 유형 열거
 * SmartBookmark Pro가 발생시키는 모든 알림의 종류
 */
export type NotificationType =
  /** 자주 방문하는 페이지 북마크 추천 */
  | 'FREQUENT_VISIT_SUGGEST'
  /** 오랫동안 읽지 않은 북마크 리마인드 */
  | 'UNREAD_BOOKMARK_REMIND'
  /** 사용하지 않는 북마크 정리 제안 */
  | 'UNUSED_BOOKMARK_CLEANUP'
  /** 중복 북마크 감지 경고 */
  | 'DUPLICATE_WARNING'
  /** 접속 불가 링크 감지 */
  | 'DEAD_LINK_DETECTED';

/**
 * 스마트 알림
 * SmartBookmark Pro가 사용자에게 보내는 인텔리전트 알림
 */
export interface SmartNotification {
  /** 알림 고유 ID */
  id: string;
  /** 알림 유형 */
  type: NotificationType;
  /** 알림 제목 */
  title: string;
  /** 알림 본문 메시지 */
  message: string;
  /** 알림과 관련된 부가 데이터 (유형별로 다름) */
  data: Record<string, unknown>;
  /** 알림 생성 시각 (ISO 8601) */
  createdAt: string;
  /** 사용자가 닫음 처리 여부 */
  dismissed: boolean;
}

// =============================================================================
// YouTube 추적 타입
// =============================================================================

/**
 * 저장된 타임스탬프
 * YouTube 동영상 내 특정 시점을 저장한 북마크
 */
export interface SavedTimestamp {
  /** 시작 시간 (초 단위) */
  seconds: number;
  /** 사용자 지정 레이블 (예: '핵심 설명 시작') */
  label: string;
  /** 타임스탬프 저장 시각 (ISO 8601) */
  createdAt: string;
}

/**
 * YouTube 동영상 시청 데이터
 * YouTube 콘텐츠 소비 패턴을 분석하기 위한 시청 기록
 */
export interface YouTubeVideoData {
  /** YouTube 동영상 ID */
  videoId: string;
  /** 동영상 제목 */
  title: string;
  /** 채널명 */
  channelName: string;
  /** 채널 URL */
  channelUrl: string;
  /** 동영상 URL */
  url: string;
  /** 썸네일 이미지 URL */
  thumbnailUrl: string;
  /** 동영상 전체 길이 (초 단위, 선택) */
  duration?: number;
  /** 시청 시작 시각 (ISO 8601) */
  watchedAt: string;
  /** 실제 시청 시간 (초 단위, 선택) */
  watchDuration?: number;
  /** AI 분류 카테고리 (선택) */
  category?: string;
  /** 관련 태그 (선택) */
  tags?: string[];
  /** 저장된 타임스탬프 목록 (선택) */
  timestamps?: SavedTimestamp[];
}

// =============================================================================
// 탭 세션 타입
// =============================================================================

/**
 * 저장된 탭 정보
 * 탭 세션 내 개별 탭의 상태 정보
 */
export interface SavedTab {
  /** 탭 URL */
  url: string;
  /** 탭 제목 */
  title: string;
  /** 파비콘 URL (선택) */
  favicon?: string;
  /** 고정 탭 여부 */
  pinned: boolean;
  /** Chrome 탭 그룹 ID (선택) */
  groupId?: number;
}

/**
 * 탭 세션
 * 특정 시점의 브라우저 탭 상태를 저장한 세션
 */
export interface TabSession {
  /** 세션 고유 ID */
  id: string;
  /** 사용자 지정 세션 이름 */
  name: string;
  /** 저장된 탭 목록 */
  tabs: SavedTab[];
  /** 세션 생성 시각 (ISO 8601) */
  createdAt: string;
  /** 마지막으로 복원한 시각 (ISO 8601, 선택) */
  lastOpenedAt?: string;
  /** 세션 카테고리 레이블 (선택) */
  category?: string;
}

// =============================================================================
// 인증 타입
// =============================================================================

/**
 * 인증 방식
 * 확장 프로그램 잠금 해제에 사용하는 인증 방법
 */
export type AuthMethod =
  /** 비밀번호 인증 */
  | 'password'
  /** 패턴 인증 */
  | 'pattern'
  /** 인증 없음 */
  | 'none';

/**
 * 인증 상태
 * 확장 프로그램의 현재 잠금/잠금해제 상태
 */
export interface AuthState {
  /** 현재 설정된 인증 방식 */
  method: AuthMethod;
  /** 현재 잠금 해제 상태 */
  isUnlocked: boolean;
  /** 잠금 해제된 시각 (ISO 8601, 선택) */
  unlockTimestamp?: string;
  /** 자동 잠금까지의 대기 시간 (분) */
  autoLockMinutes: number;
}

// =============================================================================
// AI 설정 타입
// =============================================================================

/**
 * AI 제공자
 * 스마트 기능에 사용 가능한 AI 서비스 제공자
 */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'custom';

/**
 * AI 설정
 * 스마트 제목/분류 기능에 사용되는 AI 서비스 연결 정보
 */
export interface AIConfig {
  /** AI 제공자 */
  provider: AIProvider;
  /** API 키 (ollama/custom은 빈 문자열 허용) */
  apiKey: string;
  /** 사용할 모델 이름 (예: 'gpt-4o-mini', 'claude-3-haiku') */
  model: string;
  /** 커스텀/Ollama 엔드포인트 URL (선택) */
  endpoint?: string;
  /** 최대 출력 토큰 수 */
  maxTokens: number;
  /** 생성 다양성 조절 (0.0 ~ 2.0) */
  temperature: number;
}

/**
 * AI 분류 결과
 * AI가 북마크/페이지를 분석하여 반환하는 분류 정보
 */
export interface ClassificationResult {
  /** 분류된 카테고리 (예: '개발', '뉴스', '쇼핑') */
  category: string;
  /** 분류 신뢰도 (0.0 ~ 1.0) */
  confidence: number;
  /** AI가 제안하는 태그 목록 */
  suggestedTags: string[];
}

// =============================================================================
// 광고/수익화 타입
// =============================================================================

/**
 * 네이티브 광고 데이터
 * 피드에 자연스럽게 삽입되는 네이티브 광고 정보
 */
export interface NativeAdData {
  /** 광고 고유 ID */
  id: string;
  /** 광고 유형 */
  type: 'recommendation' | 'sponsored' | 'affiliate';
  /** 광고 제목 */
  title: string;
  /** 광고 설명문 */
  description: string;
  /** 랜딩 페이지 URL */
  url: string;
  /** 광고 이미지 URL (선택) */
  imageUrl?: string;
  /** 광고주 이름 */
  advertiser: string;
  /** 광고 카테고리 */
  category: string;
  /** 행동 유도 문구 (Call to Action) */
  cta: string;
  /** 법적 광고 표시 문구 (예: '광고', 'sponsored') */
  disclosure: string;
}

/**
 * 광고 노출 위치 설정
 * 광고가 표시될 UI 위치와 노출 조건
 */
export interface AdPlacement {
  /** 광고 노출 위치 */
  location:
    | 'popup_bottom'
    | 'sidepanel_feed'
    | 'search_results'
    | 'dashboard_widget';
  /** 최대 노출 광고 수 */
  maxAds: number;
  /** 광고 갱신 주기 (초 단위) */
  refreshInterval: number;
}

// =============================================================================
// 구독/업그레이드 타입
// =============================================================================

/**
 * 업그레이드 유도 프롬프트
 * 특정 조건에서 사용자에게 Pro 업그레이드를 유도하는 메시지
 */
export interface UpgradePrompt {
  /** 유도 트리거 조건 (예: 'ai_limit_reached', 'feature_locked') */
  trigger: string;
  /** 사용자에게 보여줄 메시지 */
  message: string;
  /** 업그레이드 시 얻는 혜택 설명 */
  benefit: string;
  /** 행동 유도 문구 (예: 'Pro로 업그레이드') */
  cta: string;
}

/**
 * 구독 등급
 * SmartBookmark Pro의 사용자 구독 티어
 */
export type SubscriptionTier = 'free' | 'pro' | 'team';

// =============================================================================
// 앱 설정 타입
// =============================================================================

/**
 * 앱 전역 설정
 * 사용자가 옵션 페이지에서 설정할 수 있는 모든 설정값
 */
export interface AppSettings {
  /** 자동 잠금까지의 대기 시간 (분, 0이면 비활성화) */
  autoLockMinutes: number;
  /** 방문 기록 분석 주기 (시간 단위) */
  historyAnalysisInterval: number;
  /** YouTube 시청 기록 추적 활성화 여부 */
  youtubeTrackerEnabled: boolean;
  /** 최소 시청 시간 기준 (초, 이 이상 시청한 경우만 기록) */
  minWatchSeconds: number;
  /** 광고 표시 활성화 여부 */
  adsEnabled: boolean;
  /** UI 테마 */
  theme: 'light' | 'dark' | 'system';
  /** 인터페이스 언어 */
  language: 'ko' | 'en';
  /** 스마트 제목 자동 생성 활성화 여부 */
  smartTitleEnabled: boolean;
  /**
   * 스마트 제목 표시 형식
   * 예: '{title} - {domain}', '[{category}] {title}'
   */
  smartTitleFormat: string;
  /** 페이지 요약 자동 저장 여부 */
  summaryAutoSave: boolean;
  /** 북마크 추가 시 AI 제목 자동 생성 여부 */
  aiTitleAutoGenerate: boolean;
}

// =============================================================================
// Chrome Storage 스키마
// =============================================================================

/**
 * Chrome Storage 전체 스키마
 * chrome.storage.local / chrome.storage.sync에 저장되는 모든 데이터의 구조.
 * 스토리지 접근 시 이 인터페이스를 기준으로 타입 안전성을 보장합니다.
 */
export interface ChromeStorageSchema {
  // --- 핵심 북마크 데이터 ---
  /** 북마크 ID를 키로 하는 스마트 북마크 데이터 맵 */
  bookmarks: Record<string, BookmarkData>;

  // --- 하이라이트 ---
  /** 북마크 ID를 키로 하는 하이라이트 맵 */
  highlights: Record<string, Highlight[]>;

  // --- YouTube 추적 ---
  /** 동영상 ID를 키로 하는 YouTube 시청 기록 맵 */
  youtubeHistory: Record<string, YouTubeVideoData>;

  // --- 탭 세션 ---
  /** 세션 ID를 키로 하는 탭 세션 맵 */
  tabSessions: Record<string, TabSession>;

  // --- 알림 ---
  /** 스마트 알림 목록 */
  notifications: SmartNotification[];

  // --- 설정 ---
  /** 앱 전역 설정 */
  settings: AppSettings;

  // --- AI 설정 ---
  /** AI 서비스 연결 설정 */
  aiConfig: AIConfig;

  // --- 인증 ---
  /** 인증 설정 정보 (민감 정보는 별도 암호화 처리) */
  authConfig: Pick<AuthState, 'method' | 'autoLockMinutes'>;

  // --- 구독 ---
  /** 현재 구독 등급 */
  subscriptionTier: SubscriptionTier;

  // --- 방문 패턴 캐시 ---
  /** URL을 키로 하는 방문 패턴 캐시 */
  visitPatternCache: Record<string, VisitPattern>;

  // --- 메타데이터 ---
  /** 스토리지 스키마 버전 (마이그레이션 관리용) */
  schemaVersion: number;
  /** 마지막 분석 실행 시각 (ISO 8601) */
  lastAnalysisAt: string;
}

// =============================================================================
// Chrome 메시지 타입 (Discriminated Union 패턴)
// =============================================================================

/**
 * 모든 메시지 유형 열거
 * chrome.runtime.sendMessage / chrome.tabs.sendMessage에 사용되는 모든 메시지 타입
 */
export type MessageType =
  // 인증 관련
  | 'GET_AUTH_STATUS'
  | 'UNLOCK_EXTENSION'
  | 'LOCK_EXTENSION'
  | 'SET_AUTH_METHOD'

  // 북마크 관련
  | 'ADD_BOOKMARK'
  | 'UPDATE_BOOKMARK'
  | 'DELETE_BOOKMARK'
  | 'GET_BOOKMARK'
  | 'GET_ALL_BOOKMARKS'
  | 'SEARCH_BOOKMARKS'

  // AI 기능
  | 'GENERATE_SMART_TITLE'
  | 'CLASSIFY_BOOKMARK'
  | 'GENERATE_SUMMARY'

  // 페이지 메타데이터
  | 'GET_PAGE_METADATA'
  | 'PAGE_METADATA_RESULT'

  // 하이라이트
  | 'SAVE_HIGHLIGHT'
  | 'DELETE_HIGHLIGHT'
  | 'GET_HIGHLIGHTS'

  // YouTube 추적
  | 'YOUTUBE_VIDEO_STARTED'
  | 'YOUTUBE_VIDEO_PROGRESS'
  | 'YOUTUBE_VIDEO_ENDED'
  | 'SAVE_YOUTUBE_TIMESTAMP'

  // 방문 기록 분석
  | 'ANALYZE_VISIT_PATTERNS'
  | 'GET_VISIT_PATTERNS'

  // 탭 세션
  | 'SAVE_TAB_SESSION'
  | 'RESTORE_TAB_SESSION'
  | 'DELETE_TAB_SESSION'

  // 알림
  | 'GET_NOTIFICATIONS'
  | 'DISMISS_NOTIFICATION'
  | 'CLEAR_ALL_NOTIFICATIONS'

  // 설정
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_AI_CONFIG'
  | 'UPDATE_AI_CONFIG'

  // 시스템
  | 'GET_SUBSCRIPTION_TIER'
  | 'CHECK_DEAD_LINKS'
  | 'FIND_DUPLICATES'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA';

// --- 개별 메시지 페이로드 타입 ---

/** 응답 없음 (fire-and-forget 메시지의 data 타입) */
export type EmptyPayload = Record<string, never>;

/** 일반적인 성공/실패 응답 */
export interface BaseResponse {
  success: boolean;
  error?: string;
}

// 인증 메시지
export interface GetAuthStatusMessage {
  type: 'GET_AUTH_STATUS';
  data: EmptyPayload;
}
export interface GetAuthStatusResponse {
  isUnlocked: boolean;
  method: AuthMethod;
  autoLockMinutes: number;
}

export interface UnlockExtensionMessage {
  type: 'UNLOCK_EXTENSION';
  /** 비밀번호 또는 패턴 값 */
  data: { credential: string };
}

export interface LockExtensionMessage {
  type: 'LOCK_EXTENSION';
  data: EmptyPayload;
}

export interface SetAuthMethodMessage {
  type: 'SET_AUTH_METHOD';
  data: { method: AuthMethod; credential?: string };
}

// 북마크 메시지
export interface AddBookmarkMessage {
  type: 'ADD_BOOKMARK';
  data: {
    url: string;
    title: string;
    parentId?: string;
    pageMetadata?: PageMetadata;
  };
}

export interface UpdateBookmarkMessage {
  type: 'UPDATE_BOOKMARK';
  data: { id: string; updates: Partial<BookmarkData> };
}

export interface DeleteBookmarkMessage {
  type: 'DELETE_BOOKMARK';
  data: { id: string };
}

export interface GetBookmarkMessage {
  type: 'GET_BOOKMARK';
  data: { id: string };
}

export interface GetAllBookmarksMessage {
  type: 'GET_ALL_BOOKMARKS';
  data: EmptyPayload;
}

export interface SearchBookmarksMessage {
  type: 'SEARCH_BOOKMARKS';
  data: { query: string; limit?: number };
}

// AI 기능 메시지
export interface GenerateSmartTitleMessage {
  type: 'GENERATE_SMART_TITLE';
  data: { bookmarkId: string; pageMetadata: PageMetadata };
}

export interface ClassifyBookmarkMessage {
  type: 'CLASSIFY_BOOKMARK';
  data: { bookmarkId: string; pageMetadata: PageMetadata };
}

export interface GenerateSummaryMessage {
  type: 'GENERATE_SUMMARY';
  data: { url: string; pageText: string };
}

// 페이지 메타데이터 메시지
export interface GetPageMetadataMessage {
  type: 'GET_PAGE_METADATA';
  data: { tabId: number };
}

export interface PageMetadataResultMessage {
  type: 'PAGE_METADATA_RESULT';
  data: { metadata: PageMetadata };
}

// 하이라이트 메시지
export interface SaveHighlightMessage {
  type: 'SAVE_HIGHLIGHT';
  data: { bookmarkId: string; highlight: Omit<Highlight, 'bookmarkId'> };
}

export interface DeleteHighlightMessage {
  type: 'DELETE_HIGHLIGHT';
  data: { bookmarkId: string; xpath: string };
}

export interface GetHighlightsMessage {
  type: 'GET_HIGHLIGHTS';
  data: { bookmarkId: string };
}

// YouTube 추적 메시지
export interface YouTubeVideoStartedMessage {
  type: 'YOUTUBE_VIDEO_STARTED';
  data: Omit<YouTubeVideoData, 'watchDuration' | 'timestamps'>;
}

export interface YouTubeVideoProgressMessage {
  type: 'YOUTUBE_VIDEO_PROGRESS';
  data: { videoId: string; watchedSeconds: number };
}

export interface YouTubeVideoEndedMessage {
  type: 'YOUTUBE_VIDEO_ENDED';
  data: { videoId: string; totalWatchedSeconds: number };
}

export interface SaveYouTubeTimestampMessage {
  type: 'SAVE_YOUTUBE_TIMESTAMP';
  data: { videoId: string; timestamp: SavedTimestamp };
}

// 방문 기록 분석 메시지
export interface AnalyzeVisitPatternsMessage {
  type: 'ANALYZE_VISIT_PATTERNS';
  data: { daysBack?: number };
}

export interface GetVisitPatternsMessage {
  type: 'GET_VISIT_PATTERNS';
  data: { limit?: number; minVisits?: number };
}

// 탭 세션 메시지
export interface SaveTabSessionMessage {
  type: 'SAVE_TAB_SESSION';
  data: { name: string; category?: string };
}

export interface RestoreTabSessionMessage {
  type: 'RESTORE_TAB_SESSION';
  data: { sessionId: string };
}

export interface DeleteTabSessionMessage {
  type: 'DELETE_TAB_SESSION';
  data: { sessionId: string };
}

// 알림 메시지
export interface GetNotificationsMessage {
  type: 'GET_NOTIFICATIONS';
  data: { includeDismissed?: boolean };
}

export interface DismissNotificationMessage {
  type: 'DISMISS_NOTIFICATION';
  data: { notificationId: string };
}

export interface ClearAllNotificationsMessage {
  type: 'CLEAR_ALL_NOTIFICATIONS';
  data: EmptyPayload;
}

// 설정 메시지
export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
  data: EmptyPayload;
}

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  data: { updates: Partial<AppSettings> };
}

export interface GetAIConfigMessage {
  type: 'GET_AI_CONFIG';
  data: EmptyPayload;
}

export interface UpdateAIConfigMessage {
  type: 'UPDATE_AI_CONFIG';
  data: { updates: Partial<AIConfig> };
}

// 시스템 메시지
export interface GetSubscriptionTierMessage {
  type: 'GET_SUBSCRIPTION_TIER';
  data: EmptyPayload;
}

export interface CheckDeadLinksMessage {
  type: 'CHECK_DEAD_LINKS';
  data: { bookmarkIds?: string[] };
}

export interface FindDuplicatesMessage {
  type: 'FIND_DUPLICATES';
  data: EmptyPayload;
}

export interface ExportDataMessage {
  type: 'EXPORT_DATA';
  data: { format: 'json' | 'html' };
}

export interface ImportDataMessage {
  type: 'IMPORT_DATA';
  data: { format: 'json' | 'html'; content: string };
}

/**
 * 메시지 판별 유니온 타입
 * chrome.runtime.sendMessage / chrome.runtime.onMessage에서 사용하는
 * 모든 메시지 타입의 완전한 판별 유니온(Discriminated Union).
 *
 * @example
 * chrome.runtime.onMessage.addListener((message: Message) => {
 *   switch (message.type) {
 *     case 'GET_AUTH_STATUS':
 *       // message.data가 EmptyPayload로 좁혀짐
 *       break;
 *     case 'ADD_BOOKMARK':
 *       // message.data가 { url, title, ... }로 좁혀짐
 *       break;
 *   }
 * });
 */
export type Message =
  | GetAuthStatusMessage
  | UnlockExtensionMessage
  | LockExtensionMessage
  | SetAuthMethodMessage
  | AddBookmarkMessage
  | UpdateBookmarkMessage
  | DeleteBookmarkMessage
  | GetBookmarkMessage
  | GetAllBookmarksMessage
  | SearchBookmarksMessage
  | GenerateSmartTitleMessage
  | ClassifyBookmarkMessage
  | GenerateSummaryMessage
  | GetPageMetadataMessage
  | PageMetadataResultMessage
  | SaveHighlightMessage
  | DeleteHighlightMessage
  | GetHighlightsMessage
  | YouTubeVideoStartedMessage
  | YouTubeVideoProgressMessage
  | YouTubeVideoEndedMessage
  | SaveYouTubeTimestampMessage
  | AnalyzeVisitPatternsMessage
  | GetVisitPatternsMessage
  | SaveTabSessionMessage
  | RestoreTabSessionMessage
  | DeleteTabSessionMessage
  | GetNotificationsMessage
  | DismissNotificationMessage
  | ClearAllNotificationsMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | GetAIConfigMessage
  | UpdateAIConfigMessage
  | GetSubscriptionTierMessage
  | CheckDeadLinksMessage
  | FindDuplicatesMessage
  | ExportDataMessage
  | ImportDataMessage;

// =============================================================================
// 유틸리티 타입
// =============================================================================

/**
 * 특정 키를 필수로 만드는 유틸리티 타입
 * @example RequireFields<BookmarkData, 'id' | 'url'>
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * 깊은 부분 선택 타입
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/**
 * chrome.storage.local.get / set의 타입 안전한 래퍼용 키 타입
 */
export type StorageKey = keyof ChromeStorageSchema;

/**
 * 특정 스토리지 키에 해당하는 값 타입을 추론
 * @example StorageValue<'bookmarks'> => Record<string, BookmarkData>
 */
export type StorageValue<K extends StorageKey> = ChromeStorageSchema[K];

/**
 * 메시지 타입 문자열에서 해당 메시지 인터페이스를 추론
 * @example ExtractMessage<'ADD_BOOKMARK'> => AddBookmarkMessage
 */
export type ExtractMessage<T extends MessageType> = Extract<
  Message,
  { type: T }
>;

/**
 * 메시지에서 data 페이로드 타입만 추출
 * @example MessageData<'ADD_BOOKMARK'> => { url: string; title: string; ... }
 */
export type MessageData<T extends MessageType> = ExtractMessage<T>['data'];
