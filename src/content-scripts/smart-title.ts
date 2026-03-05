/// <reference types="chrome" />

/**
 * @file smart-title.ts
 * @description SmartBookmark Pro - 페이지 메타데이터 추출 콘텐츠 스크립트
 *
 * chrome.scripting.executeScript()를 통해 대상 탭에 주입되어 실행됩니다.
 * 페이지의 Open Graph, Twitter Card, Schema.org JSON-LD, H1, 본문 등
 * 다양한 소스에서 메타데이터를 추출하여 서비스 워커에 반환합니다.
 */

import type { PageMetadata } from '@/types';

// ---------------------------------------------------------------------------
// 도메인 → 사이트명 매핑 (content script 내 자체 보유)
// ---------------------------------------------------------------------------

const DOMAIN_TO_SITE_NAME: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'stackoverflow.com': 'Stack Overflow',
  'developer.mozilla.org': 'MDN',
  'medium.com': 'Medium',
  'dev.to': 'DEV',
  'velog.io': 'Velog',
  'tistory.com': 'Tistory',
  'naver.com': 'Naver',
  'brunch.co.kr': 'Brunch',
  'coupang.com': '쿠팡',
  'gmarket.co.kr': 'G마켓',
  'udemy.com': 'Udemy',
  'reddit.com': 'Reddit',
  'twitter.com': 'Twitter',
  'x.com': 'X',
  'linkedin.com': 'LinkedIn',
  'wikipedia.org': 'Wikipedia',
  'notion.so': 'Notion',
};

// ---------------------------------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------------------------------

/** meta 태그 content 값 조회 (name 또는 property 기준) */
function getMeta(selector: string): string {
  const el = document.querySelector<HTMLMetaElement>(selector);
  return el?.content?.trim() ?? '';
}

/** 텍스트 앞뒤 공백 제거 및 최대 길이 제한 */
function trimText(text: string, maxLen: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * 도메인에서 표시 이름을 추출합니다.
 */
function extractSiteName(domain: string): string {
  const clean = domain.replace(/^www\./, '').toLowerCase();

  if (DOMAIN_TO_SITE_NAME[clean]) return DOMAIN_TO_SITE_NAME[clean];

  for (const [key, name] of Object.entries(DOMAIN_TO_SITE_NAME)) {
    if (clean.endsWith(key)) return name;
  }

  // TLD 제거하여 반환
  const parts = clean.split('.');
  const base = parts.length >= 2 ? parts[parts.length - 2] : clean;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------------------------------------------------------------------------
// Schema.org JSON-LD 파서
// ---------------------------------------------------------------------------

interface SchemaOrgData {
  type?: string;
  name?: string;
  author?: string;
  datePublished?: string;
  price?: string;
}

/** 페이지 내 모든 JSON-LD 스크립트 태그를 파싱하여 구조화 데이터를 추출합니다. */
function parseSchemaOrg(): SchemaOrgData {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]'
  );

  for (const script of Array.from(scripts)) {
    try {
      const data = JSON.parse(script.textContent ?? '{}');

      // 배열인 경우 첫 번째 항목 사용
      const obj = Array.isArray(data) ? data[0] : data;
      if (!obj || typeof obj !== 'object') continue;

      const type: string = (obj['@type'] as string) ?? '';

      // 유효한 스키마 타입만 처리
      if (!type) continue;

      const result: SchemaOrgData = { type };

      if (obj['name']) result.name = String(obj['name']);

      // 저자 (author는 문자열이거나 {name: string} 객체일 수 있음)
      if (obj['author']) {
        const author = obj['author'];
        if (typeof author === 'string') {
          result.author = author;
        } else if (typeof author === 'object' && author['name']) {
          result.author = String(author['name']);
        }
      }

      if (obj['datePublished']) result.datePublished = String(obj['datePublished']);

      // 가격 (제품 스키마)
      if (obj['offers']) {
        const offers = Array.isArray(obj['offers']) ? obj['offers'][0] : obj['offers'];
        if (offers?.price) {
          const currency = offers.priceCurrency ? `${offers.priceCurrency} ` : '';
          result.price = `${currency}${offers.price}`;
        }
      }
      if (obj['price']) result.price = String(obj['price']);

      return result;
    } catch {
      // 파싱 오류 무시
    }
  }

  return {};
}

// ---------------------------------------------------------------------------
// YouTube 전용 추출
// ---------------------------------------------------------------------------

interface YouTubeData {
  channel?: string;
  duration?: string;
}

/** YouTube 페이지에서 채널명과 재생시간을 추출합니다. */
function extractYouTubeData(): YouTubeData {
  const result: YouTubeData = {};

  // 채널명: 채널 링크 또는 메타 태그에서 추출
  const channelEl =
    document.querySelector<HTMLElement>('#channel-name a') ??
    document.querySelector<HTMLElement>('#owner-name a') ??
    document.querySelector<HTMLElement>('ytd-channel-name a');

  if (channelEl?.textContent) {
    result.channel = channelEl.textContent.trim();
  }

  // ytInitialData에서 채널명 추출 (fallback)
  if (!result.channel) {
    const channelMeta = (getMeta('meta[itemprop="channelId"]') ||
      document.querySelector<HTMLElement>('[itemprop="author"] [itemprop="name"]')?.getAttribute('content')) ?? '';
    if (channelMeta) result.channel = channelMeta;
  }

  // 재생시간: meta 태그
  const durationMeta = document.querySelector<HTMLMetaElement>('meta[itemprop="duration"]');
  if (durationMeta?.content) {
    result.duration = durationMeta.content;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 제품 전용 추출
// ---------------------------------------------------------------------------

interface ProductData {
  name?: string;
  price?: string;
  brand?: string;
}

/** 상품 페이지에서 제품명, 가격, 브랜드를 추출합니다. */
function extractProductData(): ProductData {
  const result: ProductData = {};

  // 제품명
  const nameEl =
    document.querySelector<HTMLElement>('[itemprop="name"]') ??
    document.querySelector<HTMLElement>('.product-name') ??
    document.querySelector<HTMLElement>('.prod-name');
  if (nameEl?.textContent) {
    result.name = nameEl.textContent.trim();
  }

  // 가격
  const priceEl =
    document.querySelector<HTMLElement>('[itemprop="price"]') ??
    document.querySelector<HTMLElement>('.price') ??
    document.querySelector<HTMLElement>('[class*="price"]');
  if (priceEl) {
    result.price = (priceEl.getAttribute('content') ?? priceEl.textContent ?? '').trim();
  }

  // 브랜드
  const brandEl = document.querySelector<HTMLElement>('[itemprop="brand"]');
  if (brandEl?.textContent) {
    result.brand = brandEl.textContent.trim();
  }

  return result;
}

// ---------------------------------------------------------------------------
// 메인 추출 함수
// ---------------------------------------------------------------------------

/**
 * 현재 페이지에서 PageMetadata를 추출합니다.
 * 이 함수는 content script로 주입되어 실행됩니다.
 *
 * @returns PageMetadata 객체
 */
export function extractPageMetadata(): PageMetadata {
  const url = location.href;
  const domain = location.hostname.replace(/^www\./, '');
  const siteName = getMeta('meta[property="og:site_name"]') || extractSiteName(domain);

  // --- Open Graph ---
  const ogTitle = getMeta('meta[property="og:title"]');
  const ogDescription = getMeta('meta[property="og:description"]');
  const ogType = getMeta('meta[property="og:type"]');
  const ogImage = getMeta('meta[property="og:image"]');

  // --- Twitter Card ---
  const twitterTitle =
    getMeta('meta[name="twitter:title"]') ||
    getMeta('meta[property="twitter:title"]');

  // --- 기본 메타 태그 ---
  const metaDescription =
    getMeta('meta[name="description"]') ||
    getMeta('meta[property="description"]');

  const keywordsRaw =
    getMeta('meta[name="keywords"]') ||
    getMeta('meta[property="keywords"]');
  const metaKeywords = keywordsRaw
    ? keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean)
    : undefined;

  // --- Schema.org JSON-LD ---
  const schema = parseSchemaOrg();

  // --- H1 텍스트 ---
  const h1El = document.querySelector<HTMLElement>('h1');
  const h1Text = h1El?.textContent ? trimText(h1El.textContent, 200) : undefined;

  // --- article 본문 (첫 300자) ---
  const articleEl =
    document.querySelector<HTMLElement>('article') ??
    document.querySelector<HTMLElement>('[role="main"]') ??
    document.querySelector<HTMLElement>('main');
  const articleBody = articleEl?.textContent
    ? trimText(articleEl.textContent, 300)
    : undefined;

  // --- 페이지 텍스트 미리보기 (body 첫 500자) ---
  const bodyText = document.body?.textContent ?? '';
  const pageTextPreview = trimText(bodyText, 500);

  // --- YouTube 전용 ---
  const isYouTube = domain.includes('youtube.com') || domain.includes('youtu.be');
  const ytData = isYouTube ? extractYouTubeData() : {};

  // --- 제품 전용 ---
  const isProductPage =
    ogType === 'product' ||
    schema.type === 'Product' ||
    schema.type === 'Offer';
  const productData = isProductPage ? extractProductData() : {};

  return {
    originalTitle: document.title ?? '',
    url,
    domain,
    siteName,

    // Open Graph
    ogTitle: ogTitle || undefined,
    ogDescription: ogDescription || undefined,
    ogType: ogType || undefined,
    ogImage: ogImage || undefined,

    // Twitter Card
    twitterTitle: twitterTitle || undefined,

    // 기본 메타
    metaDescription: metaDescription || undefined,
    metaKeywords,

    // Schema.org
    schemaType: schema.type,
    schemaName: schema.name,
    schemaAuthor: schema.author,
    schemaDatePublished: schema.datePublished,
    schemaPrice: schema.price,

    // 콘텐츠
    h1Text,
    articleBody,
    pageTextPreview,

    // YouTube
    ytChannel: ytData.channel,
    ytDuration: ytData.duration,

    // 제품
    productName: productData.name ?? (isProductPage ? schema.name : undefined),
    productPrice: productData.price ?? (isProductPage ? schema.price : undefined),
    productBrand: productData.brand,
  };
}

// ---------------------------------------------------------------------------
// 메시지 리스너
// ---------------------------------------------------------------------------

/**
 * 서비스 워커에서 'GET_PAGE_METADATA' 메시지를 수신하면
 * extractPageMetadata()를 실행하고 결과를 반환합니다.
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { metadata: PageMetadata }) => void
  ) => {
    if (message.type === 'GET_PAGE_METADATA') {
      try {
        const metadata = extractPageMetadata();
        sendResponse({ metadata });
      } catch (error) {
        console.error('[SmartTitle] 메타데이터 추출 실패', error);
        // 최소한의 데이터라도 반환
        sendResponse({
          metadata: {
            originalTitle: document.title ?? '',
            url: location.href,
            domain: location.hostname,
            siteName: location.hostname,
          },
        });
      }
    }
    // 동기 응답이므로 true 반환 불필요 (sendResponse 즉시 호출)
  }
);
