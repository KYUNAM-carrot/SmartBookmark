import { useState, useEffect } from 'react';

type TabId = 'bookmarks' | 'youtube' | 'sessions' | 'analysis' | 'settings';

const TAB_LABELS: Record<TabId, string> = {
  bookmarks: '즐겨찾기',
  youtube: '유튜브',
  sessions: '세션',
  analysis: '분석',
  settings: '설정',
};

export default function Popup() {
  const [activeTab, setActiveTab] = useState<TabId>('bookmarks');

  return (
    <div className="popup-container bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-bold text-primary-600">SmartBookmark</h1>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
          설정
        </button>
      </header>

      {/* Search Bar */}
      <div className="px-4 py-2">
        <input
          type="text"
          placeholder="검색어 입력..."
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                     bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Tab Navigation */}
      <nav className="flex border-b border-gray-200 dark:border-gray-700 px-2">
        {(Object.entries(TAB_LABELS) as [TabId, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors
              ${
                activeTab === id
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main className="p-4 flex-1 overflow-y-auto">
        <div className="text-center text-gray-400 text-sm py-8">
          {TAB_LABELS[activeTab]} 탭 - 준비 중
        </div>
      </main>
    </div>
  );
}
