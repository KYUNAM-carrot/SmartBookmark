/**
 * @file ThemeToggle.tsx
 * @description SmartBookmark Pro - 테마 토글 버튼 컴포넌트
 *
 * light -> dark -> system 순으로 순환하며 테마를 전환합니다.
 * Zustand 스토어와 persistTheme/applyTheme을 모두 업데이트하여
 * 팝업, 사이드패널, 옵션 페이지에서 일관된 다크모드가 적용됩니다.
 */

import { useCallback, type ReactNode } from 'react';
import { useAppStore } from '@/lib/store';
import { applyTheme, persistTheme } from '@/lib/theme';
import type { ThemeValue } from '@/lib/theme';

// ---------------------------------------------------------------------------
// 순환 순서
// ---------------------------------------------------------------------------

const THEME_CYCLE: ThemeValue[] = ['light', 'dark', 'system'];

function nextTheme(current: ThemeValue): ThemeValue {
  const idx = THEME_CYCLE.indexOf(current);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
}

// ---------------------------------------------------------------------------
// 아이콘 (인라인 SVG)
// ---------------------------------------------------------------------------

/** 태양 아이콘 (light) */
function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42
           M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      />
    </svg>
  );
}

/** 달 아이콘 (dark) */
function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
      />
    </svg>
  );
}

/** 모니터 아이콘 (system) */
function MonitorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
    </svg>
  );
}

const THEME_ICONS: Record<ThemeValue, ReactNode> = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <MonitorIcon />,
};

const THEME_LABELS: Record<ThemeValue, string> = {
  light: '라이트',
  dark: '다크',
  system: '자동',
};

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

interface ThemeToggleProps {
  /** 버튼에 추가할 CSS 클래스 */
  className?: string;
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const theme = useAppStore((s) => s.theme) as ThemeValue;
  const setTheme = useAppStore((s) => s.setTheme);

  const handleClick = useCallback(async () => {
    const next = nextTheme(theme);

    // 1. Zustand 스토어 업데이트 (UI 즉각 반응)
    setTheme(next);

    // 2. DOM에 즉시 적용
    applyTheme(next);

    // 3. chrome.storage에 비동기 저장
    await persistTheme(next);
  }, [theme, setTheme]);

  const icon = THEME_ICONS[theme];
  const label = THEME_LABELS[theme];
  const nextLabel = THEME_LABELS[nextTheme(theme)];

  return (
    <button
      onClick={handleClick}
      title={`현재: ${label} | 클릭하면 ${nextLabel}으로 전환`}
      aria-label={`테마 전환 (현재: ${label})`}
      className={[
        'flex items-center justify-center w-7 h-7 rounded-md',
        'text-gray-500 dark:text-gray-400',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        'hover:text-gray-700 dark:hover:text-gray-200',
        'active:scale-90',
        'transition-all duration-150',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
    </button>
  );
}
