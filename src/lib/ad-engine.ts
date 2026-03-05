// 광고 엔진 모듈 - 네이티브 광고 서빙 및 추적
import type { NativeAdData, AdPlacement } from '@/types';

// 사용자 컨텍스트 타입
interface UserContext {
  category?: string;
  recentCategories?: string[];
  tier?: 'free' | 'pro' | 'team';
}

// 광고 빈도 제한 저장 타입
interface AdFrequencyCap {
  adId: string;
  impressions: number;
  lastShown: number;
}

interface FrequencyCapStore {
  caps: Record<string, AdFrequencyCap>;
  updatedAt: number;
}

// 최대 일일 노출 횟수
const MAX_DAILY_IMPRESSIONS = 5;
// 최소 재노출 간격 (밀리초) - 1시간
const MIN_RESHOW_INTERVAL_MS = 60 * 60 * 1000;
// 빈도 제한 스토리지 키
const FREQUENCY_CAP_KEY = 'ad_frequency_caps';

// 목업 광고 데이터베이스
const MOCK_AD_DATABASE: NativeAdData[] = [
  // 개발 카테고리
  {
    id: 'ad_dev_001',
    type: 'sponsored',
    title: 'GitHub Copilot로 코딩 속도 2배 향상',
    description: 'AI 기반 코드 자동완성으로 반복 작업을 줄이고 창의적인 개발에 집중하세요.',
    url: 'https://github.com/features/copilot',
    imageUrl: 'https://example.com/images/copilot.png',
    advertiser: 'GitHub',
    category: '개발',
    cta: '무료로 시작하기',
    disclosure: '광고',
  },
  {
    id: 'ad_dev_002',
    type: 'recommendation',
    title: 'JetBrains IDE - 스마트한 개발 환경',
    description: '지능형 코드 분석과 강력한 리팩토링 도구로 생산성을 높이세요.',
    url: 'https://www.jetbrains.com',
    advertiser: 'JetBrains',
    category: '개발',
    cta: '30일 무료 체험',
    disclosure: '스폰서',
  },
  {
    id: 'ad_dev_003',
    type: 'affiliate',
    title: 'Vercel - 프론트엔드 배포의 새로운 기준',
    description: 'Next.js 앱을 원클릭으로 배포하고 글로벌 CDN으로 최고의 성능을 경험하세요.',
    url: 'https://vercel.com',
    advertiser: 'Vercel',
    category: '개발',
    cta: '지금 배포하기',
    disclosure: '파트너 광고',
  },

  // 생산성 카테고리
  {
    id: 'ad_prod_001',
    type: 'sponsored',
    title: 'Notion - 팀의 모든 지식을 한 곳에',
    description: '노트, 데이터베이스, 프로젝트 관리를 하나의 강력한 도구로 통합하세요.',
    url: 'https://notion.so',
    imageUrl: 'https://example.com/images/notion.png',
    advertiser: 'Notion',
    category: '생산성',
    cta: '무료로 시작하기',
    disclosure: '광고',
  },
  {
    id: 'ad_prod_002',
    type: 'recommendation',
    title: 'Todoist - 할 일 관리의 최강자',
    description: '스마트한 일정 관리와 팀 협업 기능으로 업무 효율을 극대화하세요.',
    url: 'https://todoist.com',
    advertiser: 'Doist',
    category: '생산성',
    cta: '앱 다운로드',
    disclosure: '스폰서',
  },
  {
    id: 'ad_prod_003',
    type: 'sponsored',
    title: 'Slack - 더 스마트한 팀 커뮤니케이션',
    description: '메시지, 파일, 도구를 한 곳에서 연결하여 원격 팀과 효과적으로 협업하세요.',
    url: 'https://slack.com',
    advertiser: 'Slack',
    category: '생산성',
    cta: '팀 만들기',
    disclosure: '광고',
  },

  // 교육 카테고리
  {
    id: 'ad_edu_001',
    type: 'affiliate',
    title: '인프런 - 국내 최대 개발자 교육 플랫폼',
    description: '실무 중심의 강의로 현업에서 바로 써먹는 기술을 배우세요.',
    url: 'https://inflearn.com',
    imageUrl: 'https://example.com/images/inflearn.png',
    advertiser: '인프런',
    category: '교육',
    cta: '강의 둘러보기',
    disclosure: '파트너 광고',
  },
  {
    id: 'ad_edu_002',
    type: 'sponsored',
    title: 'Coursera - 세계 최고 대학의 강의를 온라인으로',
    description: 'MIT, Stanford, Google의 전문가 강의로 커리어를 한 단계 업그레이드하세요.',
    url: 'https://coursera.org',
    advertiser: 'Coursera',
    category: '교육',
    cta: '무료 강의 보기',
    disclosure: '광고',
  },

  // 디자인 카테고리
  {
    id: 'ad_design_001',
    type: 'sponsored',
    title: 'Figma - 디자인 협업의 새로운 패러다임',
    description: '실시간 협업 디자인 툴로 팀과 함께 더 빠르게 제품을 만들어보세요.',
    url: 'https://figma.com',
    imageUrl: 'https://example.com/images/figma.png',
    advertiser: 'Figma',
    category: '디자인',
    cta: '무료로 시작하기',
    disclosure: '광고',
  },
  {
    id: 'ad_design_002',
    type: 'recommendation',
    title: 'Canva - 누구나 쉽게 만드는 전문가 디자인',
    description: '수천 개의 템플릿으로 소셜 미디어, 프레젠테이션, 포스터를 빠르게 제작하세요.',
    url: 'https://canva.com',
    advertiser: 'Canva',
    category: '디자인',
    cta: '디자인 시작하기',
    disclosure: '스폰서',
  },

  // 비즈니스 카테고리
  {
    id: 'ad_biz_001',
    type: 'sponsored',
    title: 'HubSpot - 성장하는 비즈니스를 위한 CRM',
    description: '마케팅, 영업, 고객 서비스를 하나의 플랫폼에서 관리하세요.',
    url: 'https://hubspot.com',
    advertiser: 'HubSpot',
    category: '비즈니스',
    cta: '무료 CRM 시작',
    disclosure: '광고',
  },
];

// 카테고리 매핑 - 사용자 카테고리와 광고 카테고리 연결
const CATEGORY_MAP: Record<string, string[]> = {
  개발: ['개발', '생산성'],
  생산성: ['생산성', '비즈니스'],
  교육: ['교육', '생산성'],
  디자인: ['디자인', '생산성'],
  비즈니스: ['비즈니스', '생산성'],
  기술: ['개발', '생산성'],
};

// chrome.storage.local 래퍼 (타입 안전)
async function getFromStorage<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(null);
      return;
    }
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve((result[key] as T) ?? null);
    });
  });
}

async function setToStorage<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

/**
 * 광고 엔진 클래스
 * 네이티브 광고 선택, 노출 추적, 클릭 추적, 빈도 제한을 담당
 */
export class AdEngine {
  private impressionQueue: string[] = [];
  private clickQueue: string[] = [];

  /**
   * 배치와 사용자 컨텍스트에 따라 광고를 반환
   */
  async getAds(placement: AdPlacement, userContext?: UserContext): Promise<NativeAdData[]> {
    try {
      // 광고를 보여줄지 여부 확인
      const tier = userContext?.tier ?? 'free';
      if (!this.shouldShowAd(tier)) {
        return [];
      }

      // 관련 광고 선택
      const candidates = this.selectCandidates(userContext);

      // 빈도 제한 필터링
      const filtered = await this.filterByFrequencyCap(candidates);

      // 배치에 맞게 최대 개수로 제한하고 반환
      return filtered.slice(0, placement.maxAds);
    } catch (error) {
      // 오류 시 빈 배열 반환 (Graceful degradation)
      console.warn('[AdEngine] 광고 로드 실패, 광고 없이 계속합니다:', error);
      return [];
    }
  }

  /**
   * 해당 티어에서 광고를 표시해야 하는지 확인
   * 무료 티어만 광고를 표시하고, pro/team은 표시하지 않음
   */
  shouldShowAd(tier: string): boolean {
    return tier === 'free';
  }

  /**
   * 광고 노출 추적
   */
  async trackImpression(adId: string): Promise<void> {
    try {
      this.impressionQueue.push(adId);
      await this.incrementFrequencyCap(adId);

      // 실제 환경에서는 분석 서버로 전송
      console.debug('[AdEngine] 노출 추적:', adId);
    } catch (error) {
      // 추적 실패는 사용자 경험에 영향 없음
      console.warn('[AdEngine] 노출 추적 실패:', error);
    }
  }

  /**
   * 광고 클릭 추적
   */
  async trackClick(adId: string): Promise<void> {
    try {
      this.clickQueue.push(adId);

      // 실제 환경에서는 분석 서버로 전송
      console.debug('[AdEngine] 클릭 추적:', adId);
    } catch (error) {
      // 추적 실패는 사용자 경험에 영향 없음
      console.warn('[AdEngine] 클릭 추적 실패:', error);
    }
  }

  /**
   * 사용자 컨텍스트에 따라 광고 후보 선택
   */
  private selectCandidates(userContext?: UserContext): NativeAdData[] {
    if (!userContext?.category && !userContext?.recentCategories?.length) {
      // 컨텍스트 없으면 무작위 선택
      return this.shuffleArray([...MOCK_AD_DATABASE]);
    }

    const relevantCategories = new Set<string>();

    // 현재 카테고리 매핑
    if (userContext.category) {
      const mapped = CATEGORY_MAP[userContext.category] ?? [userContext.category];
      mapped.forEach((c) => relevantCategories.add(c));
    }

    // 최근 카테고리 매핑
    if (userContext.recentCategories) {
      userContext.recentCategories.forEach((cat) => {
        const mapped = CATEGORY_MAP[cat] ?? [cat];
        mapped.forEach((c) => relevantCategories.add(c));
      });
    }

    // 관련 카테고리 광고 먼저, 나머지는 뒤에
    const relevant: NativeAdData[] = [];
    const others: NativeAdData[] = [];

    MOCK_AD_DATABASE.forEach((ad) => {
      if (relevantCategories.has(ad.category)) {
        relevant.push(ad);
      } else {
        others.push(ad);
      }
    });

    return [...this.shuffleArray(relevant), ...this.shuffleArray(others)];
  }

  /**
   * 빈도 제한을 초과한 광고를 필터링
   */
  private async filterByFrequencyCap(ads: NativeAdData[]): Promise<NativeAdData[]> {
    try {
      const store = await this.getFrequencyCapStore();
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      return ads.filter((ad) => {
        const cap = store.caps[ad.id];
        if (!cap) return true; // 처음 보는 광고는 허용

        // 일일 노출 초과 확인 (날짜 기준 리셋)
        if (cap.lastShown < oneDayAgo) return true;
        if (cap.impressions >= MAX_DAILY_IMPRESSIONS) return false;

        // 최소 재노출 간격 확인
        if (now - cap.lastShown < MIN_RESHOW_INTERVAL_MS) return false;

        return true;
      });
    } catch {
      // 빈도 제한 스토리지 오류 시 모든 광고 허용
      return ads;
    }
  }

  /**
   * 광고 노출 카운터 증가
   */
  private async incrementFrequencyCap(adId: string): Promise<void> {
    const store = await this.getFrequencyCapStore();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const existing = store.caps[adId];
    if (!existing || existing.lastShown < oneDayAgo) {
      // 새로운 날이거나 처음: 카운터 초기화
      store.caps[adId] = { adId, impressions: 1, lastShown: now };
    } else {
      store.caps[adId] = {
        adId,
        impressions: existing.impressions + 1,
        lastShown: now,
      };
    }

    store.updatedAt = now;
    await setToStorage(FREQUENCY_CAP_KEY, store);
  }

  /**
   * 빈도 제한 스토어 로드
   */
  private async getFrequencyCapStore(): Promise<FrequencyCapStore> {
    const stored = await getFromStorage<FrequencyCapStore>(FREQUENCY_CAP_KEY);
    if (!stored) {
      return { caps: {}, updatedAt: Date.now() };
    }
    return stored;
  }

  /**
   * 배열을 무작위로 섞기 (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// 싱글톤 인스턴스 내보내기
export const adEngine = new AdEngine();
