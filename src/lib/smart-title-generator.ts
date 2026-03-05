/**
 * @file smart-title-generator.ts
 * @description SmartBookmark Pro - 로컬 규칙 기반 스마트 제목 생성기
 *
 * AI 없이 사이트별 규칙과 메타데이터 파싱을 통해 최적화된 북마크 제목을 생성합니다.
 * 최대 80자 제한, 사이트별 포맷터, 대안 제목 목록 생성 기능을 포함합니다.
 */

import type { PageMetadata, SmartTitleResult } from '@/types';

// ---------------------------------------------------------------------------
// 상수 및 설정
// ---------------------------------------------------------------------------

/** 최대 제목 길이 (문자 수) */
const MAX_TITLE_LENGTH = 80;

/** 알려진 사이트 이름 → 표시명 매핑 */
export const KNOWN_SITES: Record<string, string> = {
  // 동영상
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'vimeo.com': 'Vimeo',
  'twitch.tv': 'Twitch',

  // 개발
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'stackoverflow.com': 'Stack Overflow',
  'developer.mozilla.org': 'MDN',
  'npmjs.com': 'npm',
  'pypi.org': 'PyPI',
  'docs.python.org': 'Python Docs',
  'reactjs.org': 'React',
  'vuejs.org': 'Vue',
  'nextjs.org': 'Next.js',

  // 뉴스/블로그
  'medium.com': 'Medium',
  'dev.to': 'DEV',
  'velog.io': 'Velog',
  'tistory.com': 'Tistory',
  'naver.com': 'Naver',
  'brunch.co.kr': 'Brunch',
  'substack.com': 'Substack',
  'hashnode.com': 'Hashnode',

  // 쇼핑
  'amazon.com': 'Amazon',
  'amazon.co.kr': 'Amazon KR',
  'coupang.com': '쿠팡',
  'gmarket.co.kr': 'G마켓',
  'auction.co.kr': '옥션',
  '11st.co.kr': '11번가',
  'musinsa.com': '무신사',

  // 학습
  'udemy.com': 'Udemy',
  'coursera.org': 'Coursera',
  'edx.org': 'edX',
  'inflearn.com': '인프런',
  'nomadcoders.co': '노마드코더',
  'fastcampus.co.kr': '패스트캠퍼스',

  // 소셜
  'twitter.com': 'Twitter',
  'x.com': 'X',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'reddit.com': 'Reddit',

  // 지식/문서
  'wikipedia.org': 'Wikipedia',
  'notion.so': 'Notion',
  'confluence.atlassian.com': 'Confluence',
  'docs.google.com': 'Google Docs',
};

/** 제목에서 제거할 사이트 이름 패턴 (접미사) */
const SITE_NAME_SUFFIXES = [
  // 대시 구분자
  / [-–—|] .+$/,
  // 콜론 뒤 사이트명 (단, 실제 내용 설명이 아닌 경우)
  /^(.+?) [：:] .{1,30}$/,
];

/** 스탑워드 (키워드 추출 시 제외) */
const STOPWORDS = new Set([
  // 한국어
  '의', '가', '이', '은', '들', '는', '좀', '잘', '걍', '과', '도', '를', '으로', '자', '에', '와',
  '한', '하다', '있다', '되다', '이다', '않다', '수', '것', '등', '및', '에서', '그', '그리고', '그러나',
  // 영어
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'how', 'what',
  'why', 'when', 'where', 'who', 'which',
]);

// ---------------------------------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------------------------------

/**
 * 제목을 최대 길이로 자르고 말줄임표를 붙입니다.
 */
function truncate(text: string, maxLen = MAX_TITLE_LENGTH): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

/**
 * ISO 8601 날짜 문자열을 'YYYY.MM.DD' 형식으로 변환합니다.
 */
function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

/**
 * YouTube ISO 8601 duration(예: 'PT1H23M45S')을 'HH:MM:SS' 또는 'MM:SS' 형식으로 변환합니다.
 */
function parseDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';

  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// 핵심 처리 함수
// ---------------------------------------------------------------------------

/**
 * 제목에서 사이트 이름 중복/접미사를 제거합니다.
 *
 * 예: "React Hooks 완전 정복 - 개발 블로그" → "React Hooks 완전 정복"
 *
 * @param title 원본 제목
 * @param siteName 사이트 이름 (예: 'GitHub', 'YouTube')
 * @returns 정리된 제목
 */
export function cleanTitle(title: string, siteName: string): string {
  if (!title) return title;

  let cleaned = title.trim();

  // 사이트 이름이 제목 끝에 포함된 경우 제거
  if (siteName) {
    const sitePattern = new RegExp(
      `\\s*[-–—|]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
      'i'
    );
    cleaned = cleaned.replace(sitePattern, '').trim();

    // 사이트 이름만 있는 경우 (제목이 사이트명과 동일한 경우)
    if (cleaned.toLowerCase() === siteName.toLowerCase()) {
      return cleaned;
    }
  }

  // 일반적인 접미사 패턴 제거: " - " 뒤에 짧은 사이트명
  const dashSuffix = cleaned.match(/^(.+?)\s*[-–—]\s*(.{1,30})$/);
  if (dashSuffix) {
    const [, main, suffix] = dashSuffix;
    // 접미사가 알려진 사이트명이거나 15자 이하면 제거
    const isSiteSuffix =
      Object.values(KNOWN_SITES).some((s) => s.toLowerCase() === suffix.trim().toLowerCase()) ||
      suffix.trim().length <= 15;
    if (isSiteSuffix && main.length > 5) {
      cleaned = main.trim();
    }
  }

  return cleaned;
}

/**
 * 텍스트에서 핵심 키프레이즈를 추출합니다.
 *
 * @param text 분석할 텍스트
 * @param count 추출할 키프레이즈 수 (기본값: 5)
 * @returns 핵심 키프레이즈 배열
 */
export function extractKeyPhrases(text: string, count = 5): string[] {
  if (!text) return [];

  // 단어 토큰화 (한국어 형태소는 단어 단위로 처리)
  const words = text
    .toLowerCase()
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  // 빈도 계산
  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // 빈도 기준 내림차순 정렬하여 상위 N개 반환
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// 사이트별 포맷터
// ---------------------------------------------------------------------------

/**
 * YouTube 영상에 특화된 제목 생성
 * 형식: "[채널명] 제목 (HH:MM:SS)"
 */
function formatYouTubeTitle(meta: PageMetadata, baseTitle: string): string {
  const parts: string[] = [];

  if (meta.ytChannel) {
    parts.push(`[${meta.ytChannel}]`);
  }
  parts.push(baseTitle);
  if (meta.ytDuration) {
    const dur = parseDuration(meta.ytDuration);
    if (dur) parts.push(`(${dur})`);
  }

  return truncate(parts.join(' '));
}

/**
 * 제품/쇼핑 페이지에 특화된 제목 생성
 * 형식: "브랜드 - 제품명 가격"
 */
function formatProductTitle(meta: PageMetadata, baseTitle: string): string {
  const parts: string[] = [];

  if (meta.productBrand || meta.schemaAuthor) {
    parts.push(meta.productBrand ?? meta.schemaAuthor ?? '');
  }

  const productName = meta.productName ?? meta.schemaName ?? baseTitle;
  if (productName) parts.push(productName);

  const price = meta.productPrice ?? meta.schemaPrice;
  if (price) parts.push(price);

  const result = parts.join(' - ');
  return truncate(result || baseTitle);
}

/**
 * 기사/블로그 포스트에 특화된 제목 생성
 * 형식: "제목 (저자, YYYY.MM.DD)"
 */
function formatArticleTitle(meta: PageMetadata, baseTitle: string): string {
  const author = meta.schemaAuthor;
  const date = meta.schemaDatePublished;

  if (!author && !date) return truncate(baseTitle);

  const metaParts: string[] = [];
  if (author) metaParts.push(author);
  if (date) metaParts.push(formatDate(date));

  const suffix = metaParts.join(', ');
  const candidate = `${baseTitle} (${suffix})`;
  return truncate(candidate);
}

/**
 * GitHub 레포지토리/이슈/PR에 특화된 제목 생성
 * 형식: "owner/repo - 이슈/PR 제목" 또는 "owner/repo: 제목"
 */
function formatGitHubTitle(meta: PageMetadata, baseTitle: string): string {
  const urlMatch = meta.url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!urlMatch) return truncate(baseTitle);

  const repo = urlMatch[1];
  const isIssue = meta.url.includes('/issues/');
  const isPR = meta.url.includes('/pull/');

  if (isIssue || isPR) {
    const type = isIssue ? '#' : 'PR';
    const numMatch = meta.url.match(/\/(issues|pull)\/(\d+)/);
    const num = numMatch ? numMatch[2] : '';
    return truncate(`[${repo}] ${type}${num}: ${baseTitle}`);
  }

  return truncate(`${repo}: ${baseTitle}`);
}

// ---------------------------------------------------------------------------
// 대안 제목 생성
// ---------------------------------------------------------------------------

/**
 * 2~3개의 대안 제목을 생성합니다.
 *
 * @param meta 페이지 메타데이터
 * @param siteName 사이트 이름
 * @returns 대안 제목 배열 (중복 제외)
 */
export function generateAlternatives(meta: PageMetadata, siteName: string): string[] {
  const alternatives = new Set<string>();
  const sources = [
    meta.ogTitle,
    meta.twitterTitle,
    meta.h1Text,
    meta.schemaName,
    meta.originalTitle,
  ].filter(Boolean) as string[];

  for (const source of sources) {
    const cleaned = cleanTitle(source, siteName);
    if (cleaned && cleaned.length > 3) {
      alternatives.add(truncate(cleaned));
    }
    if (alternatives.size >= 3) break;
  }

  // 키워드 기반 대안 (OG 설명에서 추출)
  if (alternatives.size < 3 && meta.ogDescription) {
    const phrases = extractKeyPhrases(meta.ogDescription, 3);
    if (phrases.length > 0) {
      alternatives.add(truncate(phrases.join(' · ')));
    }
  }

  return Array.from(alternatives).slice(0, 3);
}

// ---------------------------------------------------------------------------
// 메인 생성 함수
// ---------------------------------------------------------------------------

/**
 * 페이지 메타데이터를 분석하여 최적화된 스마트 제목을 생성합니다.
 *
 * 우선순위:
 * 1. 사이트별 포맷터 (YouTube, GitHub, 제품, 기사)
 * 2. OG 제목 → Twitter 제목 → H1 → 원본 제목 순으로 베이스 선택
 * 3. 사이트 이름 접미사 제거
 * 4. 80자 제한 트런케이션
 *
 * @param meta 페이지 메타데이터
 * @returns SmartTitleResult 객체
 */
export function generateSmartTitle(meta: PageMetadata): SmartTitleResult {
  const siteName = meta.siteName || extractSiteNameFromDomain(meta.domain);

  // 1. 베이스 제목 결정 (우선순위 순)
  const rawBase =
    meta.ogTitle ||
    meta.twitterTitle ||
    meta.h1Text ||
    meta.schemaName ||
    meta.originalTitle ||
    meta.url;

  const base = cleanTitle(rawBase, siteName);

  // 2. 사이트별 전용 포맷터 적용
  let finalTitle: string;
  let confidence: SmartTitleResult['confidence'] = 'medium';

  const domain = meta.domain.toLowerCase();

  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    finalTitle = formatYouTubeTitle(meta, base);
    confidence = meta.ytChannel ? 'high' : 'medium';
  } else if (domain.includes('github.com')) {
    finalTitle = formatGitHubTitle(meta, base);
    confidence = 'high';
  } else if (
    meta.ogType === 'product' ||
    meta.schemaType === 'Product' ||
    meta.productName !== undefined
  ) {
    finalTitle = formatProductTitle(meta, base);
    confidence = meta.productName ? 'high' : 'medium';
  } else if (
    meta.ogType === 'article' ||
    meta.schemaType === 'Article' ||
    meta.schemaType === 'BlogPosting' ||
    meta.schemaAuthor !== undefined
  ) {
    finalTitle = formatArticleTitle(meta, base);
    confidence = meta.schemaAuthor ? 'high' : 'medium';
  } else {
    finalTitle = truncate(base);
    // 베이스가 원본 제목과 동일하면 신뢰도 낮음
    confidence = meta.ogTitle || meta.h1Text ? 'high' : 'low';
  }

  // 3. 요약 생성
  const summary = buildSummary(meta);

  // 4. 대안 제목 생성
  const candidates = generateAlternatives(meta, siteName);

  return {
    title: finalTitle,
    summary,
    candidates,
    confidence,
  };
}

/**
 * 페이지 메타데이터에서 1~2문장 요약을 생성합니다.
 */
function buildSummary(meta: PageMetadata): string {
  const sources = [
    meta.ogDescription,
    meta.metaDescription,
    meta.articleBody,
    meta.pageTextPreview,
  ].filter(Boolean) as string[];

  for (const src of sources) {
    const trimmed = src.trim();
    if (trimmed.length > 10) {
      // 첫 2문장만 추출
      const sentences = trimmed.split(/(?<=[.!?。])\s+/);
      const twoSentences = sentences.slice(0, 2).join(' ');
      return truncate(twoSentences, 200);
    }
  }

  return '';
}

/**
 * 도메인에서 표시 사이트 이름을 추출합니다.
 * KNOWN_SITES 매핑을 먼저 확인하고, 없으면 도메인을 정리하여 반환합니다.
 *
 * @param domain 예: 'github.com', 'www.naver.com'
 * @returns 표시 이름 예: 'GitHub', 'naver'
 */
export function extractSiteNameFromDomain(domain: string): string {
  if (!domain) return '';

  const cleanDomain = domain.replace(/^www\./, '').toLowerCase();

  // 정확히 일치하는 경우
  if (KNOWN_SITES[cleanDomain]) {
    return KNOWN_SITES[cleanDomain];
  }

  // 부분 일치 (서브도메인 포함 케이스)
  for (const [key, name] of Object.entries(KNOWN_SITES)) {
    if (cleanDomain.endsWith(key) || cleanDomain.includes(key)) {
      return name;
    }
  }

  // 알 수 없는 사이트: 도메인에서 TLD 제거하여 반환
  const parts = cleanDomain.split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : cleanDomain;
}
