/// <reference types="chrome" />

/**
 * @file page-highlighter.ts
 * @description SmartBookmark Pro - 페이지 하이라이트 Content Script
 *
 * chrome.scripting.executeScript()로 동적 주입되는 content script입니다.
 * manifest.json의 content_scripts 항목에 등록하지 않습니다.
 *
 * 주요 기능:
 * - 텍스트 선택 시 플로팅 메뉴 표시 (저장 / 색상 선택 / 메모 추가)
 * - SAVE_HIGHLIGHT 메시지: 선택 텍스트를 XPath 위치와 함께 저장
 * - LOAD_HIGHLIGHTS 메시지: 페이지 재방문 시 하이라이트 복원
 * - 하이라이트 삭제
 *
 * 스토리지 접근: chrome.runtime.sendMessage를 통해 service worker에 위임
 */

import type { Highlight, HighlightColor } from '@/types';

// =============================================================================
// 상수
// =============================================================================

/** 하이라이트 색상 팔레트 */
const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#FFEB3B',
  green:  '#C8E6C9',
  blue:   '#BBDEFB',
  pink:   '#F8BBD0',
  orange: '#FFE0B2',
};

/** 플로팅 메뉴 DOM ID */
const MENU_ID = 'smartbookmark-highlight-menu';

/** 하이라이트 mark 요소의 data 속성 */
const HIGHLIGHT_DATA_ATTR = 'data-smartbookmark-id';

/** 현재 페이지 URL (북마크 ID 확인용) */
const CURRENT_URL = window.location.href;

// =============================================================================
// 내부 상태
// =============================================================================

/** 현재 활성화된 플로팅 메뉴 요소 */
let activeMenu: HTMLElement | null = null;

/** 현재 선택된 Range */
let currentRange: Range | null = null;

/** 현재 선택된 하이라이트 색상 */
let selectedColor: HighlightColor = 'yellow';

// =============================================================================
// XPath 유틸리티
// =============================================================================

/**
 * DOM 요소의 XPath 문자열을 생성합니다.
 * 루트(document)로부터 해당 요소까지의 경로를 표현합니다.
 *
 * @param el XPath를 생성할 DOM 요소
 * @returns XPath 문자열 (예: '/html/body/div[2]/p[1]')
 */
export function getXPathForElement(el: Node): string {
  if (el.nodeType === Node.DOCUMENT_NODE) {
    return '';
  }

  if (el.nodeType === Node.TEXT_NODE) {
    // 텍스트 노드는 부모 요소의 XPath + text() 인덱스
    const parent = el.parentElement;
    if (!parent) return '';
    const parentXPath = getXPathForElement(parent);
    const siblings = Array.from(parent.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE
    );
    const index = siblings.indexOf(el as Text) + 1;
    return `${parentXPath}/text()[${index}]`;
  }

  if (el.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = el as Element;
  const parent = element.parentNode;

  if (!parent || parent.nodeType === Node.DOCUMENT_NODE) {
    return `/${element.tagName.toLowerCase()}`;
  }

  // 같은 태그명을 가진 형제 요소들 중 인덱스 계산
  const siblings = Array.from(parent.childNodes).filter(
    (n): n is Element =>
      n.nodeType === Node.ELEMENT_NODE &&
      (n as Element).tagName === element.tagName
  );

  const index = siblings.indexOf(element) + 1;
  const tagName = element.tagName.toLowerCase();

  // 형제가 하나뿐이면 인덱스 생략
  const suffix = siblings.length > 1 ? `[${index}]` : '';

  return `${getXPathForElement(parent)}/${tagName}${suffix}`;
}

/**
 * XPath 문자열로 DOM 요소를 찾습니다.
 *
 * @param xpath 검색할 XPath 문자열
 * @returns 찾은 Node, 없으면 null
 */
export function getElementByXPath(xpath: string): Node | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (error) {
    console.error('[PageHighlighter] XPath 평가 실패:', xpath, error);
    return null;
  }
}

// =============================================================================
// 하이라이트 렌더링
// =============================================================================

/**
 * 지정한 Range를 <mark> 요소로 감싸 하이라이트를 적용합니다.
 *
 * @param range 하이라이트를 적용할 Range 객체
 * @param color 하이라이트 색상
 * @param id 하이라이트 식별자 (xpath 또는 고유 ID)
 * @returns 생성된 mark 요소, 실패 시 null
 */
export function highlightRange(
  range: Range,
  color: HighlightColor,
  id: string
): HTMLElement | null {
  try {
    const mark = document.createElement('mark');
    mark.style.backgroundColor = HIGHLIGHT_COLORS[color];
    mark.style.color = 'inherit';
    mark.style.borderRadius = '2px';
    mark.style.padding = '0 1px';
    mark.style.cursor = 'pointer';
    mark.setAttribute(HIGHLIGHT_DATA_ATTR, id);
    mark.title = '클릭하여 하이라이트 옵션 보기';

    // 클릭 시 하이라이트 메뉴 표시
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      showHighlightOptionsMenu(mark, id);
    });

    range.surroundContents(mark);
    return mark;
  } catch (error) {
    // surroundContents는 Range가 여러 요소에 걸친 경우 실패할 수 있음
    // 이 경우 extractContents + insertNode 방식으로 처리
    try {
      const fragment = range.extractContents();
      const mark = document.createElement('mark');
      mark.style.backgroundColor = HIGHLIGHT_COLORS[color];
      mark.style.color = 'inherit';
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 1px';
      mark.style.cursor = 'pointer';
      mark.setAttribute(HIGHLIGHT_DATA_ATTR, id);
      mark.title = '클릭하여 하이라이트 옵션 보기';
      mark.appendChild(fragment);

      mark.addEventListener('click', (e) => {
        e.stopPropagation();
        showHighlightOptionsMenu(mark, id);
      });

      range.insertNode(mark);
      return mark;
    } catch (innerError) {
      console.error('[PageHighlighter] 하이라이트 적용 실패:', innerError);
      return null;
    }
  }
}

/**
 * 특정 하이라이트를 DOM에서 제거합니다.
 * <mark> 요소를 해제하고 원래 텍스트 노드로 복원합니다.
 *
 * @param id 제거할 하이라이트 식별자
 */
export function removeHighlight(id: string): void {
  const mark = document.querySelector(
    `mark[${HIGHLIGHT_DATA_ATTR}="${CSS.escape(id)}"]`
  );

  if (!mark) {
    console.warn('[PageHighlighter] 하이라이트를 찾을 수 없음:', id);
    return;
  }

  // mark 요소를 해제하고 자식 노드로 교체
  const parent = mark.parentNode;
  if (!parent) return;

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
  }
  parent.removeChild(mark);

  // 인접한 텍스트 노드 병합
  parent.normalize();
}

// =============================================================================
// 플로팅 메뉴
// =============================================================================

/**
 * 텍스트 선택 시 표시되는 플로팅 메뉴를 생성하고 표시합니다.
 * 메뉴 항목: 저장 버튼, 색상 선택기, 메모 추가
 *
 * @param selectionRect 선택 영역의 DOMRect
 */
function createHighlightMenu(selectionRect: DOMRect): HTMLElement {
  // 기존 메뉴 제거
  removeActiveMenu();

  const menu = document.createElement('div');
  menu.id = MENU_ID;

  // 메뉴 스타일
  Object.assign(menu.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: '#1a1a2e',
    color: '#ffffff',
    borderRadius: '8px',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    userSelect: 'none',
    transition: 'opacity 0.15s ease',
    opacity: '0',
  });

  // 메뉴 위치 계산 (선택 영역 위)
  const top = selectionRect.top + window.scrollY - 48;
  const left = selectionRect.left + window.scrollX + selectionRect.width / 2;
  menu.style.top = `${Math.max(top, 8)}px`;
  menu.style.left = `${left}px`;
  menu.style.transform = 'translateX(-50%)';

  // === 색상 선택기 ===
  const colorPicker = document.createElement('div');
  colorPicker.style.cssText = 'display:flex;gap:4px;align-items:center;';

  (Object.entries(HIGHLIGHT_COLORS) as [HighlightColor, string][]).forEach(
    ([colorKey, hex]) => {
      const dot = document.createElement('button');
      dot.title = colorKey;
      Object.assign(dot.style, {
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: hex,
        border: selectedColor === colorKey ? '2px solid #fff' : '2px solid transparent',
        cursor: 'pointer',
        padding: '0',
        outline: 'none',
        transition: 'transform 0.1s',
      });

      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = colorKey;

        // 선택 상태 업데이트
        colorPicker.querySelectorAll('button').forEach((btn) => {
          (btn as HTMLElement).style.border = '2px solid transparent';
        });
        dot.style.border = '2px solid #fff';
      });

      dot.addEventListener('mouseenter', () => {
        dot.style.transform = 'scale(1.2)';
      });
      dot.addEventListener('mouseleave', () => {
        dot.style.transform = 'scale(1)';
      });

      colorPicker.appendChild(dot);
    }
  );

  // === 구분선 ===
  const divider = document.createElement('div');
  divider.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.2);';

  // === 저장 버튼 ===
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '하이라이트 저장';
  Object.assign(saveBtn.style, {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  });

  saveBtn.addEventListener('mouseenter', () => {
    saveBtn.style.background = '#4f46e5';
  });
  saveBtn.addEventListener('mouseleave', () => {
    saveBtn.style.background = '#6366f1';
  });
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCurrentSelection();
  });

  // === 메모 버튼 ===
  const memoBtn = document.createElement('button');
  memoBtn.textContent = '메모';
  Object.assign(memoBtn.style, {
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  });

  memoBtn.addEventListener('mouseenter', () => {
    memoBtn.style.background = 'rgba(255,255,255,0.2)';
  });
  memoBtn.addEventListener('mouseleave', () => {
    memoBtn.style.background = 'rgba(255,255,255,0.1)';
  });
  memoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showMemoInput(menu);
  });

  menu.appendChild(colorPicker);
  menu.appendChild(divider);
  menu.appendChild(saveBtn);
  menu.appendChild(memoBtn);

  document.body.appendChild(menu);
  activeMenu = menu;

  // 부드러운 등장 애니메이션
  requestAnimationFrame(() => {
    menu.style.opacity = '1';
  });

  return menu;
}

/**
 * 메모 입력 UI를 메뉴 하단에 표시합니다.
 *
 * @param menu 메모 입력을 추가할 부모 메뉴 요소
 */
function showMemoInput(menu: HTMLElement): void {
  // 이미 메모 입력창이 있으면 무시
  if (menu.querySelector('#smartbookmark-memo-input')) return;

  const memoContainer = document.createElement('div');
  memoContainer.style.cssText =
    'position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#1a1a2e;border-radius:6px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

  const input = document.createElement('textarea');
  input.id = 'smartbookmark-memo-input';
  input.placeholder = '메모를 입력하세요...';
  Object.assign(input.style, {
    width: '100%',
    minHeight: '60px',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  });

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      memoContainer.remove();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      saveCurrentSelection(input.value.trim());
    }
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '저장 (Ctrl+Enter)';
  Object.assign(confirmBtn.style, {
    marginTop: '6px',
    width: '100%',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '5px',
    cursor: 'pointer',
    fontSize: '11px',
  });

  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveCurrentSelection(input.value.trim());
  });

  memoContainer.appendChild(input);
  memoContainer.appendChild(confirmBtn);
  menu.style.position = 'fixed';
  menu.appendChild(memoContainer);

  input.focus();
}

/**
 * 하이라이트 클릭 시 표시되는 옵션 메뉴를 생성합니다.
 * (삭제 기능 포함)
 *
 * @param markEl 클릭된 mark 요소
 * @param highlightId 하이라이트 식별자
 */
function showHighlightOptionsMenu(markEl: HTMLElement, highlightId: string): void {
  removeActiveMenu();

  const rect = markEl.getBoundingClientRect();

  const menu = document.createElement('div');
  Object.assign(menu.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: '#1a1a2e',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    fontSize: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    top: `${rect.bottom + window.scrollY + 4}px`,
    left: `${rect.left + window.scrollX}px`,
    minWidth: '120px',
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '하이라이트 삭제';
  Object.assign(deleteBtn.style, {
    background: 'rgba(239,68,68,0.15)',
    color: '#fca5a5',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '4px',
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'left',
    width: '100%',
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeHighlight(highlightId);
    sendDeleteHighlight(highlightId);
    removeActiveMenu();
  });

  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);
  activeMenu = menu;
}

/**
 * 현재 활성화된 플로팅 메뉴를 DOM에서 제거합니다.
 */
function removeActiveMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

// =============================================================================
// 하이라이트 저장 / 로드
// =============================================================================

/**
 * 현재 텍스트 선택을 하이라이트로 저장합니다.
 * service worker에 SAVE_HIGHLIGHT 메시지를 전송합니다.
 *
 * @param memo 선택적 메모 텍스트
 */
function saveCurrentSelection(memo?: string): void {
  if (!currentRange) {
    console.warn('[PageHighlighter] 저장할 선택 영역이 없습니다.');
    return;
  }

  const selectedText = currentRange.toString().trim();
  if (!selectedText) return;

  // XPath 생성 (시작 컨테이너 기준)
  const startContainer = currentRange.startContainer;
  const xpath = getXPathForElement(startContainer);

  if (!xpath) {
    console.error('[PageHighlighter] XPath 생성 실패');
    return;
  }

  // 하이라이트 ID 생성 (xpath + timestamp)
  const highlightId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // DOM에 하이라이트 적용
  const rangeClone = currentRange.cloneRange();
  const markEl = highlightRange(rangeClone, selectedColor, highlightId);

  if (!markEl) {
    console.error('[PageHighlighter] 하이라이트 DOM 적용 실패');
    return;
  }

  // 하이라이트 데이터 구성
  const highlight: Omit<Highlight, 'bookmarkId'> = {
    text: selectedText,
    xpath,
    color: selectedColor,
    memo: memo || undefined,
    createdAt: new Date().toISOString(),
  };

  // service worker에 저장 요청
  chrome.runtime.sendMessage({
    type: 'SAVE_HIGHLIGHT',
    data: {
      bookmarkId: CURRENT_URL,
      highlight,
    },
  }).catch((err) => {
    console.error('[PageHighlighter] SAVE_HIGHLIGHT 메시지 전송 실패:', err);
  });

  removeActiveMenu();
  window.getSelection()?.removeAllRanges();
  currentRange = null;
}

/**
 * service worker에 하이라이트 삭제를 요청합니다.
 *
 * @param highlightId 삭제할 하이라이트 식별자 (xpath)
 */
function sendDeleteHighlight(highlightId: string): void {
  chrome.runtime.sendMessage({
    type: 'DELETE_HIGHLIGHT',
    data: {
      bookmarkId: CURRENT_URL,
      xpath: highlightId,
    },
  }).catch((err) => {
    console.error('[PageHighlighter] DELETE_HIGHLIGHT 메시지 전송 실패:', err);
  });
}

/**
 * 저장된 하이라이트 목록을 DOM에 복원합니다.
 * 각 하이라이트의 XPath로 위치를 찾아 <mark> 요소를 적용합니다.
 *
 * @param highlights 복원할 Highlight 배열
 */
function restoreHighlights(highlights: Highlight[]): void {
  for (const highlight of highlights) {
    try {
      const node = getElementByXPath(highlight.xpath);
      if (!node) {
        console.warn('[PageHighlighter] XPath에 해당하는 노드를 찾을 수 없음:', highlight.xpath);
        continue;
      }

      // 텍스트 노드에서 선택 텍스트를 찾아 Range 생성
      const textContent = node.textContent ?? '';
      const textIndex = textContent.indexOf(highlight.text);

      if (textIndex === -1) {
        console.warn('[PageHighlighter] 하이라이트 텍스트를 찾을 수 없음:', highlight.text);
        continue;
      }

      const range = document.createRange();

      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, textIndex);
        range.setEnd(node, textIndex + highlight.text.length);
      } else {
        // 요소 노드인 경우 자식 텍스트 노드 탐색
        let charCount = 0;
        let startNode: Node | null = null;
        let startOffset = 0;
        let endNode: Node | null = null;
        let endOffset = 0;

        const walker = document.createTreeWalker(
          node,
          NodeFilter.SHOW_TEXT,
          null
        );

        let textNode: Node | null = walker.nextNode();
        while (textNode) {
          const nodeLength = textNode.textContent?.length ?? 0;

          if (startNode === null && charCount + nodeLength > textIndex) {
            startNode = textNode;
            startOffset = textIndex - charCount;
          }

          if (
            startNode !== null &&
            charCount + nodeLength >= textIndex + highlight.text.length
          ) {
            endNode = textNode;
            endOffset = textIndex + highlight.text.length - charCount;
            break;
          }

          charCount += nodeLength;
          textNode = walker.nextNode();
        }

        if (!startNode || !endNode) {
          console.warn('[PageHighlighter] Range 설정 실패:', highlight.text);
          continue;
        }

        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
      }

      // ID는 xpath 기반으로 재생성 (저장 시 사용한 ID와 다를 수 있으므로 xpath를 식별자로 사용)
      const highlightId = highlight.xpath;
      highlightRange(range, highlight.color, highlightId);
    } catch (error) {
      console.error('[PageHighlighter] 하이라이트 복원 실패:', highlight, error);
    }
  }
}

// =============================================================================
// 이벤트 리스너
// =============================================================================

/**
 * 텍스트 선택 이벤트 핸들러.
 * 선택이 완료되면 플로팅 메뉴를 표시합니다.
 */
function handleSelectionChange(): void {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return;
  }

  const selectedText = selection.toString().trim();
  if (selectedText.length < 2) return;

  const range = selection.getRangeAt(0);
  currentRange = range.cloneRange();

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  createHighlightMenu(rect);
}

/**
 * mouseup 이벤트 시 텍스트 선택을 감지합니다.
 * (selectionchange보다 mouseup이 더 안정적으로 Range를 가져올 수 있음)
 */
document.addEventListener('mouseup', (e) => {
  // 메뉴 내부 클릭은 무시
  if (activeMenu && activeMenu.contains(e.target as Node)) return;

  // 약간의 지연을 두어 선택이 완료된 후 처리
  setTimeout(handleSelectionChange, 10);
});

/**
 * 문서 클릭 시 활성 메뉴를 닫습니다.
 */
document.addEventListener('click', (e) => {
  if (activeMenu && !activeMenu.contains(e.target as Node)) {
    removeActiveMenu();
    currentRange = null;
  }
});

/**
 * 키보드 Escape 키로 메뉴를 닫습니다.
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    removeActiveMenu();
    currentRange = null;
  }
});

// =============================================================================
// chrome.runtime.onMessage 핸들러
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'SAVE_HIGHLIGHT': {
      // popup/service worker에서 직접 저장 명령을 받은 경우
      const { highlight } = message.data as {
        highlight: Omit<Highlight, 'bookmarkId'>;
      };

      if (!currentRange) {
        sendResponse({ success: false, error: '선택된 텍스트가 없습니다.' });
        return false;
      }

      const selectedText = currentRange.toString().trim();
      const xpath = getXPathForElement(currentRange.startContainer);

      if (!xpath || !selectedText) {
        sendResponse({ success: false, error: 'XPath 생성 실패' });
        return false;
      }

      const rangeClone = currentRange.cloneRange();
      const highlightId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const markEl = highlightRange(
        rangeClone,
        highlight.color ?? 'yellow',
        highlightId
      );

      sendResponse({ success: !!markEl, xpath });
      return false;
    }

    case 'LOAD_HIGHLIGHTS': {
      // 페이지 로드 시 저장된 하이라이트 복원
      const { highlights } = message.data as { highlights: Highlight[] };

      if (!Array.isArray(highlights)) {
        sendResponse({ success: false, error: '유효하지 않은 하이라이트 데이터' });
        return false;
      }

      restoreHighlights(highlights);
      sendResponse({ success: true, count: highlights.length });
      return false;
    }

    default:
      return false;
  }
});

// =============================================================================
// 페이지 로드 시 하이라이트 자동 복원
// =============================================================================

/**
 * 페이지 로드 후 service worker에 현재 URL의 하이라이트를 요청하여 복원합니다.
 */
(async function initHighlights(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_HIGHLIGHTS',
      data: { bookmarkId: CURRENT_URL },
    }) as { highlights?: Highlight[] } | undefined;

    if (response?.highlights && Array.isArray(response.highlights)) {
      restoreHighlights(response.highlights);
      console.log(
        `[PageHighlighter] ${response.highlights.length}개 하이라이트 복원 완료`
      );
    }
  } catch (error) {
    // 하이라이트가 없는 페이지에서는 정상적으로 오류 없이 종료
    if (
      error instanceof Error &&
      !error.message.includes('Could not establish connection')
    ) {
      console.error('[PageHighlighter] 하이라이트 초기화 실패:', error);
    }
  }
})();

console.log('[SmartBookmark] Page Highlighter 로드 완료');
