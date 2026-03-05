/**
 * @file bookmark-engine.ts
 * @description SmartBookmark Pro - 북마크 CRUD 엔진
 *
 * chrome.bookmarks API를 사용한 북마크 생성/조회/수정/삭제와
 * chrome.storage를 통한 확장 메타데이터(태그, 카테고리, 하이라이트, 메모) 관리를 담당합니다.
 */

/// <reference types="chrome" />

import type { BookmarkData, Highlight, PageMetadata } from '@/types';
import { chromeStorage } from '@/lib/storage';

// ---------------------------------------------------------------------------
// 내부 타입
// ---------------------------------------------------------------------------

/** 북마크 메타데이터 (chrome.storage에 저장되는 확장 정보) */
export interface BookmarkMetadata {
  tags: string[];
  category?: string;
  highlight?: Highlight;
  memo?: string;
  favicon?: string;
  pageInfo?: PageMetadata;
  addedAt: string;
  lastVisited?: string;
  visitCount?: number;
  smartTitle?: string;
}

/** addBookmark 파라미터 */
export interface AddBookmarkParams {
  url: string;
  title: string;
  parentId?: string;
  tags?: string[];
  pageInfo?: PageMetadata;
  favicon?: string;
}

/** updateBookmark 파라미터 */
export interface UpdateBookmarkParams {
  title?: string;
  url?: string;
  tags?: string[];
  category?: string;
  memo?: string;
  highlight?: Highlight;
  favicon?: string;
  smartTitle?: string;
}

/** 폴더 트리 노드 (UI 표시용) */
export interface BookmarkFolderNode {
  id: string;
  title: string;
  parentId?: string;
  children: BookmarkFolderNode[];
}

// chrome.storage의 bookmarks 메타데이터 스토리지 키
const METADATA_KEY = 'bookmark_metadata';

// ---------------------------------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------------------------------

/**
 * chrome.bookmarks.BookmarkTreeNode 트리를 플랫 배열로 변환합니다.
 * 폴더(url이 없는 노드)는 제외하고 북마크만 반환합니다.
 */
function flattenTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[]
): chrome.bookmarks.BookmarkTreeNode[] {
  const result: chrome.bookmarks.BookmarkTreeNode[] = [];

  function traverse(nodeList: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodeList) {
      if (node.url) {
        // 실제 북마크 (url이 있는 노드)
        result.push(node);
      }
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return result;
}

/**
 * chrome.bookmarks.BookmarkTreeNode 트리에서 폴더만 추출하여
 * UI에서 사용하기 좋은 BookmarkFolderNode 트리로 변환합니다.
 */
function extractFolderTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  parentId?: string
): BookmarkFolderNode[] {
  const result: BookmarkFolderNode[] = [];

  for (const node of nodes) {
    if (!node.url) {
      // 폴더 노드
      const folderNode: BookmarkFolderNode = {
        id: node.id,
        title: node.title || '(이름 없음)',
        parentId,
        children: node.children
          ? extractFolderTree(node.children, node.id)
          : [],
      };
      result.push(folderNode);
    }
  }

  return result;
}

/**
 * chrome.bookmarks.BookmarkTreeNode와 BookmarkMetadata를 합쳐
 * BookmarkData 객체를 생성합니다.
 */
function mergeToBookmarkData(
  node: chrome.bookmarks.BookmarkTreeNode,
  meta: BookmarkMetadata | undefined
): BookmarkData {
  const now = new Date().toISOString();

  return {
    id: node.id,
    originalTitle: node.title ?? '',
    smartTitle: meta?.smartTitle ?? node.title ?? '',
    title: node.title ?? '',
    url: node.url ?? '',
    parentId: node.parentId ?? '',
    tags: meta?.tags ?? [],
    addedAt: meta?.addedAt ?? (node.dateAdded ? new Date(node.dateAdded).toISOString() : now),
    lastVisited: meta?.lastVisited,
    visitCount: meta?.visitCount,
    category: meta?.category,
    favicon: meta?.favicon,
    highlight: meta?.highlight,
    memo: meta?.memo,
    pageInfo: meta?.pageInfo,
  };
}

// ---------------------------------------------------------------------------
// 메타데이터 스토리지 접근 함수
// ---------------------------------------------------------------------------

/**
 * chrome.storage에서 전체 메타데이터 맵을 가져옵니다.
 */
async function loadMetadataMap(): Promise<Record<string, BookmarkMetadata>> {
  const stored = await chromeStorage.get<Record<string, BookmarkMetadata>>(METADATA_KEY);
  return stored ?? {};
}

/**
 * chrome.storage에 전체 메타데이터 맵을 저장합니다.
 */
async function saveMetadataMap(map: Record<string, BookmarkMetadata>): Promise<void> {
  await chromeStorage.set(METADATA_KEY, map);
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 모든 북마크를 플랫 배열로 가져옵니다.
 * chrome.bookmarks.getTree()로 전체 트리를 받아 재귀 순회합니다.
 *
 * @returns BookmarkData 배열 (메타데이터 포함)
 */
export async function getAllBookmarks(): Promise<BookmarkData[]> {
  try {
    const [tree, metaMap] = await Promise.all([
      chrome.bookmarks.getTree(),
      loadMetadataMap(),
    ]);

    const flatNodes = flattenTree(tree);
    return flatNodes.map((node) => mergeToBookmarkData(node, metaMap[node.id]));
  } catch (error) {
    console.error('[BookmarkEngine] getAllBookmarks 실패', error);
    return [];
  }
}

/**
 * 북마크를 검색합니다.
 * chrome.bookmarks.search()를 사용하여 제목/URL로 검색하고,
 * 태그는 메타데이터에서 클라이언트 측으로 추가 필터링합니다.
 *
 * @param query 검색어 (제목, URL, 태그 대상)
 * @returns 매칭된 BookmarkData 배열
 */
export async function searchBookmarks(query: string): Promise<BookmarkData[]> {
  if (!query.trim()) {
    return getAllBookmarks();
  }

  try {
    const [chromeResults, metaMap] = await Promise.all([
      chrome.bookmarks.search(query.trim()),
      loadMetadataMap(),
    ]);

    // chrome.bookmarks.search 결과 (제목/URL 기반)
    const resultMap = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
    for (const node of chromeResults) {
      if (node.url) {
        resultMap.set(node.id, node);
      }
    }

    // 태그 검색: 메타데이터에서 태그에 query가 포함된 북마크를 추가합니다.
    const lowerQuery = query.toLowerCase();
    for (const [id, meta] of Object.entries(metaMap)) {
      if (meta.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
        if (!resultMap.has(id)) {
          // 태그 매칭 북마크가 chrome 검색 결과에 없으면 직접 조회
          try {
            const nodes = await chrome.bookmarks.get(id);
            if (nodes[0]?.url) {
              resultMap.set(id, nodes[0]);
            }
          } catch {
            // 삭제된 북마크는 무시
          }
        }
      }
    }

    return Array.from(resultMap.values()).map((node) =>
      mergeToBookmarkData(node, metaMap[node.id])
    );
  } catch (error) {
    console.error('[BookmarkEngine] searchBookmarks 실패', error);
    return [];
  }
}

/**
 * 새 북마크를 추가합니다.
 * chrome.bookmarks.create()로 북마크를 생성하고,
 * 태그/페이지 정보 등 메타데이터는 chrome.storage에 저장합니다.
 *
 * @param params 북마크 생성 파라미터
 * @returns 생성된 BookmarkData
 */
export async function addBookmark(params: AddBookmarkParams): Promise<BookmarkData> {
  const { url, title, parentId, tags = [], pageInfo, favicon } = params;

  // 1. chrome.bookmarks API로 북마크 생성
  const createDetails: { url: string; title: string; parentId?: string } = { url, title };
  if (parentId) {
    createDetails.parentId = parentId;
  }

  const node = await chrome.bookmarks.create(createDetails);

  // 2. 메타데이터를 chrome.storage에 저장
  const meta: BookmarkMetadata = {
    tags,
    addedAt: new Date().toISOString(),
    pageInfo,
    favicon,
  };

  await saveBookmarkMetadata(node.id, meta);

  return mergeToBookmarkData(node, meta);
}

/**
 * 기존 북마크를 업데이트합니다.
 * chrome.bookmarks.update()로 제목/URL을 업데이트하고,
 * 태그 등 메타데이터는 chrome.storage에 병합 저장합니다.
 *
 * @param id 북마크 ID
 * @param changes 변경할 필드
 * @returns 업데이트된 BookmarkData
 */
export async function updateBookmark(
  id: string,
  changes: UpdateBookmarkParams
): Promise<BookmarkData> {
  // 1. chrome.bookmarks API 업데이트 (title, url)
  const chromeChanges: chrome.bookmarks.BookmarkChangesArg = {};
  if (changes.title !== undefined) chromeChanges.title = changes.title;
  if (changes.url !== undefined) chromeChanges.url = changes.url;

  let node: chrome.bookmarks.BookmarkTreeNode;
  if (Object.keys(chromeChanges).length > 0) {
    node = await chrome.bookmarks.update(id, chromeChanges);
  } else {
    const nodes = await chrome.bookmarks.get(id);
    node = nodes[0];
  }

  // 2. 메타데이터 업데이트 (병합)
  const metaMap = await loadMetadataMap();
  const existingMeta = metaMap[id] ?? { tags: [], addedAt: new Date().toISOString() };

  const updatedMeta: BookmarkMetadata = {
    ...existingMeta,
    ...(changes.tags !== undefined && { tags: changes.tags }),
    ...(changes.category !== undefined && { category: changes.category }),
    ...(changes.memo !== undefined && { memo: changes.memo }),
    ...(changes.highlight !== undefined && { highlight: changes.highlight }),
    ...(changes.favicon !== undefined && { favicon: changes.favicon }),
    ...(changes.smartTitle !== undefined && { smartTitle: changes.smartTitle }),
  };

  metaMap[id] = updatedMeta;
  await saveMetadataMap(metaMap);

  return mergeToBookmarkData(node, updatedMeta);
}

/**
 * 북마크를 삭제합니다.
 * chrome.bookmarks.remove()로 북마크를 삭제하고,
 * chrome.storage에서도 해당 메타데이터를 정리합니다.
 *
 * @param id 삭제할 북마크 ID
 */
export async function removeBookmark(id: string): Promise<void> {
  try {
    // 1. chrome 북마크 삭제
    await chrome.bookmarks.remove(id);
  } catch (error) {
    console.error(`[BookmarkEngine] chrome.bookmarks.remove 실패 - id: ${id}`, error);
    throw error;
  }

  // 2. 메타데이터 정리
  try {
    const metaMap = await loadMetadataMap();
    delete metaMap[id];
    await saveMetadataMap(metaMap);
  } catch (error) {
    console.warn(`[BookmarkEngine] 메타데이터 정리 실패 - id: ${id}`, error);
  }
}

/**
 * 북마크를 다른 폴더로 이동합니다.
 *
 * @param id 이동할 북마크 ID
 * @param parentId 목적지 폴더 ID
 * @returns 이동된 BookmarkData
 */
export async function moveBookmark(id: string, parentId: string): Promise<BookmarkData> {
  const node = await chrome.bookmarks.move(id, { parentId });
  const metaMap = await loadMetadataMap();
  return mergeToBookmarkData(node, metaMap[id]);
}

/**
 * 북마크 폴더 트리를 반환합니다.
 * UI의 폴더 네비게이션 등에 사용합니다.
 *
 * @returns 폴더 트리 배열
 */
export async function getBookmarkFolders(): Promise<BookmarkFolderNode[]> {
  try {
    const tree = await chrome.bookmarks.getTree();
    return extractFolderTree(tree);
  } catch (error) {
    console.error('[BookmarkEngine] getBookmarkFolders 실패', error);
    return [];
  }
}

/**
 * 특정 북마크의 메타데이터를 가져옵니다.
 * 태그, 카테고리, 하이라이트, 메모 등 chrome.storage에 저장된 확장 정보를 반환합니다.
 *
 * @param id 북마크 ID
 * @returns 메타데이터 또는 undefined (없는 경우)
 */
export async function getBookmarkMetadata(id: string): Promise<BookmarkMetadata | undefined> {
  const metaMap = await loadMetadataMap();
  return metaMap[id];
}

/**
 * 특정 북마크의 메타데이터를 저장합니다.
 * 기존 데이터와 병합(merge)하여 저장합니다.
 *
 * @param id 북마크 ID
 * @param meta 저장할 메타데이터 (부분 업데이트 가능)
 */
export async function saveBookmarkMetadata(
  id: string,
  meta: Partial<BookmarkMetadata>
): Promise<void> {
  const metaMap = await loadMetadataMap();
  const existing = metaMap[id] ?? { tags: [], addedAt: new Date().toISOString() };
  metaMap[id] = { ...existing, ...meta };
  await saveMetadataMap(metaMap);
}

/**
 * 특정 북마크의 방문 횟수와 마지막 방문 시각을 업데이트합니다.
 *
 * @param id 북마크 ID
 */
export async function recordVisit(id: string): Promise<void> {
  const metaMap = await loadMetadataMap();
  const existing = metaMap[id] ?? { tags: [], addedAt: new Date().toISOString() };
  metaMap[id] = {
    ...existing,
    visitCount: (existing.visitCount ?? 0) + 1,
    lastVisited: new Date().toISOString(),
  };
  await saveMetadataMap(metaMap);
}
