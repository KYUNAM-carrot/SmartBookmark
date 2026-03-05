import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'SmartBookmark Pro',
  version: '1.0.0',
  description: 'AI 기반 즐겨찾기·방문기록·유튜브 시청기록 통합 관리',
  permissions: [
    'bookmarks',
    'history',
    'storage',
    'tabs',
    'activeTab',
    'alarms',
    'sidePanel',
    'contextMenus',
    'scripting',
  ],
  host_permissions: [
    'https://www.youtube.com/*',
    'https://*.openai.com/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
    'http://localhost:11434/*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      '16': 'assets/icons/icon-16.png',
      '48': 'assets/icons/icon-48.png',
      '128': 'assets/icons/icon-128.png',
    },
  },
  side_panel: {
    default_path: 'src/sidepanel/sidepanel.html',
  },
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content-scripts/youtube-tracker.ts'],
      run_at: 'document_idle',
    },
  ],
  options_page: 'src/options/options.html',
  icons: {
    '16': 'assets/icons/icon-16.png',
    '48': 'assets/icons/icon-48.png',
    '128': 'assets/icons/icon-128.png',
  },
});
