/**
 * SmartBookmark Pro - Zustand 상태 관리 스토어
 * chrome.storage와 연동하여 상태를 영속화
 */

import { create } from 'zustand';

/** 인증 상태 */
interface AuthState {
  isUnlocked: boolean;
  authMethod: 'password' | 'pattern' | 'none';
  autoLockMinutes: number;
}

/** 활성 탭 */
type ActiveTab = 'bookmarks' | 'youtube' | 'sessions' | 'analysis' | 'settings';

/** 앱 전역 상태 */
interface AppState {
  // 인증
  auth: AuthState;
  setAuth: (auth: Partial<AuthState>) => void;

  // 활성 탭
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // 검색
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // 테마
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // 구독 티어
  tier: 'free' | 'pro' | 'team';
  setTier: (tier: 'free' | 'pro' | 'team') => void;

  // 광고
  adsEnabled: boolean;
  setAdsEnabled: (enabled: boolean) => void;

  // 로딩
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // 알림 배지
  badgeCount: number;
  setBadgeCount: (count: number) => void;

  // 초기화
  initialize: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  // 초기값
  auth: { isUnlocked: false, authMethod: 'none', autoLockMinutes: 30 },
  activeTab: 'bookmarks',
  searchQuery: '',
  theme: 'system',
  tier: 'free',
  adsEnabled: true,
  isLoading: true,
  badgeCount: 0,

  // 세터
  setAuth: (auth) => set((s) => ({ auth: { ...s.auth, ...auth } })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTheme: (theme) => set({ theme }),
  setTier: (tier) => set({ tier }),
  setAdsEnabled: (adsEnabled) => set({ adsEnabled }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setBadgeCount: (badgeCount) => set({ badgeCount }),

  // chrome.storage에서 초기 상태 로드
  initialize: async () => {
    try {
      const result = await chrome.storage.local.get([
        'auth_method',
        'settings',
        'subscription',
        'ad_config',
      ]);

      const settings = result.settings || {};
      const subscription = result.subscription || {};
      const adConfig = result.ad_config || {};

      // 세션에서 잠금 상태 확인
      const session = await chrome.storage.session.get('isUnlocked');

      set({
        auth: {
          isUnlocked: session.isUnlocked ?? false,
          authMethod: result.auth_method || 'none',
          autoLockMinutes: settings.autoLockMinutes ?? 30,
        },
        theme: settings.theme || 'system',
        tier: subscription.tier || 'free',
        adsEnabled: adConfig.enabled ?? true,
        isLoading: false,
      });
    } catch (error) {
      console.error('[SmartBookmark] Failed to initialize store:', error);
      set({ isLoading: false });
    }
  },
}));
