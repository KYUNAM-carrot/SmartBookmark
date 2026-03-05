/**
 * @file BookmarkManager.tsx
 * @description SmartBookmark Pro - 북마크 목록 관리 컴포넌트
 *
 * 북마크를 스크롤 가능한 목록으로 표시하며, 파비콘·제목·URL·태그·카테고리를 렌더링합니다.
 * 폴더 브레드크럼 네비게이션, 현재 탭 북마크 추가, 편집/삭제 액션을 지원합니다.
 */

import { useState, useEffect, useCallback } from 'react';
import type { BookmarkData } from '@/types';
import type { BookmarkFolderNode } from '@/lib/bookmark-engine';
import {
  getAllBookmarks,
  addBookmark,
  updateBookmark,
  removeBookmark,
  getBookmarkFolders,
} from '@/lib/bookmark-engine';

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 도메인에서 파비콘 URL을 생성합니다 (Google Favicon API 사용) */
function getFaviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return '';
  }
}

/** URL을 표시용으로 단축합니다 */
function shortenUrl(url: string, maxLen = 45): string {
  try {
    const { hostname, pathname } = new URL(url);
    const short = `${hostname}${pathname}`;
    if (short.length <= maxLen) return short;
    return short.slice(0, maxLen - 1) + '…';
  } catch {
    return url.slice(0, maxLen);
  }
}

// ---------------------------------------------------------------------------
// 편집 모달
// ---------------------------------------------------------------------------

interface EditModalProps {
  bookmark: BookmarkData;
  onSave: (id: string, title: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}

function EditModal({ bookmark, onSave, onClose }: EditModalProps) {
  const [title, setTitle] = useState(bookmark.title);
  const [tagsInput, setTagsInput] = useState(bookmark.tags.join(', '));
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await onSave(bookmark.id, title, parsedTags);
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 shadow-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          북마크 편집
        </h3>

        {/* 제목 */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 px-3 py-1.5 text-xs
                       text-gray-900 dark:text-gray-100 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 태그 */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
            태그 (쉼표로 구분)
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="예: 개발, React, 튜토리얼"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-700 px-3 py-1.5 text-xs
                       text-gray-900 dark:text-gray-100 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium
                       text-gray-600 dark:text-gray-300
                       hover:bg-gray-100 dark:hover:bg-gray-700
                       active:scale-95 transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium
                       text-white hover:bg-blue-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       active:scale-95 transition-all"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 북마크 카드
// ---------------------------------------------------------------------------

interface BookmarkCardProps {
  bookmark: BookmarkData;
  onEdit: (bookmark: BookmarkData) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function BookmarkCard({ bookmark, onEdit, onDelete, isDeleting }: BookmarkCardProps) {
  const faviconUrl = bookmark.favicon || getFaviconUrl(bookmark.url);

  return (
    <li
      className="group flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700
                 bg-white dark:bg-gray-800 px-3 py-2.5
                 hover:border-blue-300 dark:hover:border-blue-600
                 hover:shadow-sm transition-all"
    >
      {/* 파비콘 */}
      <div className="mt-0.5 shrink-0 w-5 h-5 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">
            B
          </div>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* 제목 */}
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs font-medium text-gray-900 dark:text-gray-100
                     hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title={bookmark.title}
        >
          {bookmark.title || bookmark.url}
        </a>

        {/* URL */}
        <span
          className="truncate text-[11px] text-gray-400 dark:text-gray-500"
          title={bookmark.url}
        >
          {shortenUrl(bookmark.url)}
        </span>

        {/* 태그 + 카테고리 */}
        <div className="flex items-center flex-wrap gap-1 mt-0.5">
          {/* 카테고리 배지 */}
          {bookmark.category && (
            <span
              className="rounded-full bg-purple-100 dark:bg-purple-900/40
                         px-2 py-0.5 text-[10px] font-medium
                         text-purple-700 dark:text-purple-300"
            >
              {bookmark.category}
            </span>
          )}
          {/* 태그 칩 */}
          {bookmark.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 dark:bg-gray-700
                         px-2 py-0.5 text-[10px]
                         text-gray-600 dark:text-gray-300"
            >
              {tag}
            </span>
          ))}
          {bookmark.tags.length > 4 && (
            <span className="text-[10px] text-gray-400">
              +{bookmark.tags.length - 4}
            </span>
          )}
        </div>
      </div>

      {/* 액션 버튼 (hover 시 표시) */}
      <div
        className="shrink-0 flex items-center gap-1
                   opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          onClick={() => onEdit(bookmark)}
          aria-label="편집"
          className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50
                     dark:hover:text-blue-400 dark:hover:bg-blue-900/30
                     active:scale-90 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                 m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(bookmark.id)}
          disabled={isDeleting}
          aria-label="삭제"
          className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50
                     dark:hover:text-red-400 dark:hover:bg-red-900/30
                     disabled:opacity-40 disabled:cursor-not-allowed
                     active:scale-90 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858
                 L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 브레드크럼 네비게이션
// ---------------------------------------------------------------------------

interface BreadcrumbProps {
  folders: BookmarkFolderNode[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

function Breadcrumb({ folders, currentFolderId, onNavigate }: BreadcrumbProps) {
  // 현재 폴더까지의 경로를 재귀적으로 추적
  function buildPath(
    nodes: BookmarkFolderNode[],
    targetId: string,
    path: BookmarkFolderNode[] = []
  ): BookmarkFolderNode[] | null {
    for (const node of nodes) {
      if (node.id === targetId) return [...path, node];
      const found = buildPath(node.children, targetId, [...path, node]);
      if (found) return found;
    }
    return null;
  }

  const path = currentFolderId ? buildPath(folders, currentFolderId) ?? [] : [];

  return (
    <nav className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 overflow-x-auto">
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-blue-600 dark:hover:text-blue-400 shrink-0 transition-colors"
      >
        전체
      </button>
      {path.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1 shrink-0">
          <svg className="w-3 h-3 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <button
            onClick={() => onNavigate(folder.id)}
            className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate max-w-[80px]"
            title={folder.title}
          >
            {folder.title}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

interface BookmarkManagerProps {
  /** 외부에서 전달된 검색어 (SearchBar와 연동용) */
  searchQuery?: string;
  /** 표시할 북마크 목록 (검색 결과 등을 외부에서 주입 가능) */
  bookmarks?: BookmarkData[];
}

export default function BookmarkManager({
  searchQuery = '',
  bookmarks: externalBookmarks,
}: BookmarkManagerProps) {
  const [allBookmarks, setAllBookmarks] = useState<BookmarkData[]>([]);
  const [folders, setFolders] = useState<BookmarkFolderNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 편집 모달
  const [editingBookmark, setEditingBookmark] = useState<BookmarkData | null>(null);

  // 삭제 진행 중인 북마크 ID
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 북마크 추가 진행 중
  const [isAdding, setIsAdding] = useState(false);

  /** 북마크 및 폴더 목록 로드 */
  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [bm, fl] = await Promise.all([getAllBookmarks(), getBookmarkFolders()]);
      setAllBookmarks(bm);
      setFolders(fl);
    } catch (err) {
      setError('북마크를 불러오는 데 실패했습니다.');
      console.error('[BookmarkManager] loadData 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 현재 폴더 또는 검색어로 필터링된 북마크 목록 */
  const displayBookmarks = (() => {
    // 외부에서 검색 결과를 주입한 경우 우선 사용
    if (externalBookmarks) return externalBookmarks;

    let list = allBookmarks;

    // 폴더 필터
    if (currentFolderId) {
      list = list.filter((b) => b.parentId === currentFolderId);
    }

    // 인라인 검색 (searchQuery가 있는 경우)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return list;
  })();

  /** 현재 탭을 북마크로 저장 */
  const handleAddCurrentTab = async () => {
    setIsAdding(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !tab.title) {
        setError('현재 탭 정보를 가져올 수 없습니다.');
        return;
      }
      await addBookmark({
        url: tab.url,
        title: tab.title,
        parentId: currentFolderId ?? undefined,
      });
      await loadData();
    } catch (err) {
      setError('북마크 추가에 실패했습니다.');
      console.error('[BookmarkManager] handleAddCurrentTab 실패:', err);
    } finally {
      setIsAdding(false);
    }
  };

  /** 북마크 편집 저장 */
  const handleEditSave = async (id: string, title: string, tags: string[]) => {
    try {
      await updateBookmark(id, { title, tags });
      setAllBookmarks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, title, tags } : b))
      );
      setEditingBookmark(null);
    } catch (err) {
      setError('북마크 수정에 실패했습니다.');
      console.error('[BookmarkManager] handleEditSave 실패:', err);
    }
  };

  /** 북마크 삭제 */
  const handleDelete = async (id: string) => {
    if (!confirm('이 북마크를 삭제하시겠습니까?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await removeBookmark(id);
      setAllBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError('북마크 삭제에 실패했습니다.');
      console.error('[BookmarkManager] handleDelete 실패:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Breadcrumb
          folders={folders}
          currentFolderId={currentFolderId}
          onNavigate={setCurrentFolderId}
        />
        <button
          onClick={handleAddCurrentTab}
          disabled={isAdding}
          className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium
                     text-white hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-95 transition-all flex items-center gap-1"
        >
          {isAdding ? (
            '추가 중...'
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              북마크 추가
            </>
          )}
        </button>
      </div>

      {/* 오류 메시지 */}
      {error && (
        <p
          className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800
                     px-3 py-2 text-[11px] text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {/* 폴더 목록 (현재 위치의 하위 폴더) */}
      {!searchQuery && !externalBookmarks && (
        <FolderList
          folders={folders}
          currentFolderId={currentFolderId}
          onNavigate={setCurrentFolderId}
        />
      )}

      {/* 북마크 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <span className="text-xs text-gray-400">불러오는 중...</span>
        </div>
      ) : displayBookmarks.length === 0 ? (
        <EmptyState hasSearch={!!searchQuery} />
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto flex-1">
          {displayBookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              onEdit={setEditingBookmark}
              onDelete={handleDelete}
              isDeleting={deletingId === bookmark.id}
            />
          ))}
        </ul>
      )}

      {/* 편집 모달 */}
      {editingBookmark && (
        <EditModal
          bookmark={editingBookmark}
          onSave={handleEditSave}
          onClose={() => setEditingBookmark(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 보조 컴포넌트
// ---------------------------------------------------------------------------

/** 현재 위치의 하위 폴더를 가로 스크롤로 표시 */
function FolderList({
  folders,
  currentFolderId,
  onNavigate,
}: {
  folders: BookmarkFolderNode[];
  currentFolderId: string | null;
  onNavigate: (id: string) => void;
}) {
  // 현재 위치의 직계 자식 폴더 찾기
  function findChildren(
    nodes: BookmarkFolderNode[],
    parentId: string | null
  ): BookmarkFolderNode[] {
    if (parentId === null) {
      // 최상위 폴더 반환 (루트의 직계 자식)
      return nodes;
    }
    for (const node of nodes) {
      if (node.id === parentId) return node.children;
      const found = findChildren(node.children, parentId);
      if (found.length > 0 || node.children.some((c) => c.id === parentId)) {
        return found;
      }
    }
    return [];
  }

  const children = findChildren(folders, currentFolderId);
  if (children.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {children.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onNavigate(folder.id)}
          className="shrink-0 flex items-center gap-1 rounded-lg
                     border border-gray-200 dark:border-gray-700
                     bg-gray-50 dark:bg-gray-800/50
                     px-2.5 py-1.5 text-[11px] text-gray-700 dark:text-gray-300
                     hover:border-blue-300 dark:hover:border-blue-600
                     hover:bg-blue-50 dark:hover:bg-blue-900/20
                     active:scale-95 transition-all"
        >
          <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="truncate max-w-[80px]">{folder.title}</span>
          {folder.children.length > 0 && (
            <span className="text-gray-400">({folder.children.length})</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 북마크가 없을 때 표시하는 빈 상태 컴포넌트 */
function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <svg
        className="w-10 h-10 text-gray-300 dark:text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
      {hasSearch ? (
        <>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            검색 결과가 없습니다
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            다른 검색어를 입력해보세요
          </p>
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            북마크가 없습니다
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            위의 '북마크 추가' 버튼으로 현재 페이지를 저장하세요
          </p>
        </>
      )}
    </div>
  );
}
