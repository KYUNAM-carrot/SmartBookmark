/**
 * @file theme.ts
 * @description SmartBookmark Pro - 테마(다크모드) 유틸리티
 *
 * - applyTheme: document.documentElement에 'dark' 클래스 추가/제거
 * - initTheme: chrome.storage.local에서 테마를 읽어 초기 적용
 * - watchSystemTheme: 시스템 다크모드 변경을 감지하는 리스너 등록
 * - persistTheme: chrome.storage.local에 테마 설정 저장
 */

/** 지원하는 테마 값 */
export type ThemeValue = 'light' | 'dark' | 'system';

/** chrome.storage.local 키 */
const STORAGE_KEY = 'settings';

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/** 시스템이 다크모드를 선호하는지 반환합니다. */
function isSystemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** document.documentElement에 'dark' 클래스를 추가하거나 제거합니다. */
function setDarkClass(dark: boolean): void {
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 전달된 테마를 즉시 DOM에 적용합니다.
 * - 'light'  → dark 클래스 제거
 * - 'dark'   → dark 클래스 추가
 * - 'system' → 시스템 설정에 따라 자동 결정
 */
export function applyTheme(theme: ThemeValue): void {
  switch (theme) {
    case 'light':
      setDarkClass(false);
      break;
    case 'dark':
      setDarkClass(true);
      break;
    case 'system':
      setDarkClass(isSystemDark());
      break;
  }
}

/**
 * chrome.storage.local에서 테마 설정을 읽어 DOM에 적용합니다.
 * 저장된 값이 없으면 'system'으로 폴백합니다.
 * 읽기 실패 시 'system'을 적용하고 오류는 콘솔에만 출력합니다.
 */
export async function initTheme(): Promise<ThemeValue> {
  // 초기 플래시(FOUC) 방지를 위해 로드 전에 system 테마를 먼저 적용
  applyTheme('system');

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const settings = result[STORAGE_KEY] ?? {};
    const theme: ThemeValue = (settings.theme as ThemeValue) || 'system';
    applyTheme(theme);
    return theme;
  } catch (error) {
    console.error('[SmartBookmark] initTheme: 테마 로드 실패', error);
    applyTheme('system');
    return 'system';
  }
}

/**
 * chrome.storage.local에 테마 선택을 저장합니다.
 * 기존 settings 객체를 병합(merge)하여 다른 설정 값을 보존합니다.
 */
export async function persistTheme(theme: ThemeValue): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const settings = result[STORAGE_KEY] ?? {};
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...settings, theme },
    });
  } catch (error) {
    console.error('[SmartBookmark] persistTheme: 테마 저장 실패', error);
  }
}

/**
 * 시스템 다크모드 변경을 감지하는 리스너를 등록합니다.
 * 현재 테마가 'system'인 경우에만 DOM을 업데이트합니다.
 *
 * @param callback - 시스템 테마가 변경될 때 호출됩니다. 인수로 새 다크모드 여부를 전달합니다.
 * @returns cleanup 함수 (리스너 제거용)
 */
export function watchSystemTheme(callback: (isDark: boolean) => void): () => void {
  let mediaQuery: MediaQueryList | null = null;

  try {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    // matchMedia를 지원하지 않는 환경 (service worker 등)
    return () => {};
  }

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches);
  };

  // 모던 브라우저: addEventListener 사용
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery!.removeEventListener('change', handler);
  }

  // 레거시 폴백: addListener (deprecated)
  mediaQuery.addListener(handler);
  return () => {
    mediaQuery!.removeListener(handler);
  };
}
