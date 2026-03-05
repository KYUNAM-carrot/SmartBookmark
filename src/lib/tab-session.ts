/**
 * 탭 세션 관리 라이브러리
 * chrome.storage.local을 사용하여 탭 세션을 저장하고 복원합니다.
 */

import { chromeStorage } from '@/lib/storage';
import type { SavedTab, TabSession } from '@/types';

// storage 키 상수
const SESSIONS_KEY = 'tab_sessions';

/**
 * 고유 세션 ID 생성
 */
function generateSessionId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `ts_${Date.now()}_${random}`;
}

/**
 * 저장된 모든 세션 목록 조회
 */
export async function getAllSessions(): Promise<TabSession[]> {
  const data = await chromeStorage.get<TabSession[]>(SESSIONS_KEY);
  return data ?? [];
}

/**
 * 세션 목록 전체를 storage에 저장
 */
async function persistSessions(sessions: TabSession[]): Promise<void> {
  await chromeStorage.set(SESSIONS_KEY, sessions);
}

/**
 * 현재 열려 있는 모든 탭을 세션으로 저장
 * @param name - 세션 이름
 * @param category - 선택적 카테고리 레이블
 * @returns 생성된 TabSession 객체
 */
export async function saveCurrentSession(
  name: string,
  category?: string
): Promise<TabSession> {
  // 현재 창의 모든 탭 조회
  const chromeTabs = await chrome.tabs.query({ currentWindow: true });

  // chrome.tabs.Tab → SavedTab 변환
  const tabs: SavedTab[] = chromeTabs
    .filter((tab) => tab.url && tab.url.length > 0)
    .map((tab) => ({
      url: tab.url!,
      title: tab.title ?? tab.url!,
      favicon: tab.favIconUrl ?? undefined,
      pinned: tab.pinned ?? false,
      groupId: tab.groupId !== undefined && tab.groupId >= 0 ? tab.groupId : undefined,
    }));

  const session: TabSession = {
    id: generateSessionId(),
    name: name.trim(),
    tabs,
    createdAt: new Date().toISOString(),
    ...(category ? { category } : {}),
  };

  // 기존 목록에 추가 후 저장
  const sessions = await getAllSessions();
  sessions.unshift(session); // 최신 항목을 앞에 배치
  await persistSessions(sessions);

  return session;
}

/**
 * 세션 ID에 해당하는 세션의 탭을 모두 새 탭으로 복원
 * @param id - 복원할 세션 ID
 */
export async function restoreSession(id: string): Promise<void> {
  const sessions = await getAllSessions();
  const session = sessions.find((s) => s.id === id);

  if (!session) {
    throw new Error(`세션을 찾을 수 없습니다: ${id}`);
  }

  // 탭 순서대로 생성 (고정 탭 우선)
  const pinnedTabs = session.tabs.filter((t) => t.pinned);
  const normalTabs = session.tabs.filter((t) => !t.pinned);
  const orderedTabs = [...pinnedTabs, ...normalTabs];

  for (const tab of orderedTabs) {
    await chrome.tabs.create({
      url: tab.url,
      pinned: tab.pinned,
      active: false,
    });
  }

  // 마지막 열람 시각 업데이트
  await updateSession(id, { lastOpenedAt: new Date().toISOString() });
}

/**
 * 세션 삭제
 * @param id - 삭제할 세션 ID
 */
export async function deleteSession(id: string): Promise<void> {
  const sessions = await getAllSessions();
  const filtered = sessions.filter((s) => s.id !== id);

  if (filtered.length === sessions.length) {
    throw new Error(`세션을 찾을 수 없습니다: ${id}`);
  }

  await persistSessions(filtered);
}

/**
 * 세션 정보 부분 업데이트
 * @param id - 업데이트할 세션 ID
 * @param changes - 변경할 필드 (Partial<TabSession>)
 */
export async function updateSession(
  id: string,
  changes: Partial<Omit<TabSession, 'id' | 'createdAt'>>
): Promise<TabSession> {
  const sessions = await getAllSessions();
  const index = sessions.findIndex((s) => s.id === id);

  if (index === -1) {
    throw new Error(`세션을 찾을 수 없습니다: ${id}`);
  }

  const updated: TabSession = { ...sessions[index], ...changes };
  sessions[index] = updated;
  await persistSessions(sessions);

  return updated;
}
