/// <reference types="chrome" />

// SmartBookmark Pro - Background Service Worker
// MV3 Service Worker: event-driven, no persistent state in memory

console.log('[SmartBookmark] Service Worker initialized');

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'smartbookmark-add',
    title: 'SmartBookmark에 추가',
    contexts: ['page', 'link'],
  });

  chrome.contextMenus.create({
    id: 'smartbookmark-highlight',
    title: '하이라이트 저장',
    contexts: ['selection'],
  });

  console.log('[SmartBookmark] Extension installed, context menus created');
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AUTH_STATUS') {
    chrome.storage.session.get('isUnlocked').then((result) => {
      sendResponse({ isUnlocked: result.isUnlocked ?? false });
    });
    return true; // async response
  }
});

// Alarm listeners (will be extended in later waves)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`[SmartBookmark] Alarm fired: ${alarm.name}`);
});
