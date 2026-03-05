import React from 'react';
import ReactDOM from 'react-dom/client';
import Options from './Options';
import '../globals.css';
import { initTheme, watchSystemTheme, applyTheme } from '../lib/theme';
import { useAppStore } from '../lib/store';

// 초기 테마 적용 (FOUC 방지)
initTheme();

// 시스템 테마 변경 감지
watchSystemTheme((_isDark) => {
  const currentTheme = useAppStore.getState().theme;
  if (currentTheme === 'system') {
    applyTheme('system');
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
