/**
 * SmartBookmark Pro - 탭 세션 관리 컴포넌트
 * 현재 탭을 세션으로 저장하고, 저장된 세션을 복원/삭제합니다.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TabSession } from '@/types';
import {
  getAllSessions,
  saveCurrentSession,
  restoreSession,
  deleteSession,
} from '@/lib/tab-session';

/** 날짜 문자열을 한국어 상대 시간으로 변환 */
function formatRelativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

export default function TabSessionPanel() {
  // 세션 목록 상태
  const [sessions, setSessions] = useState<TabSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 세션 저장 폼 상태
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionCategory, setSessionCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 복원/삭제 진행 중인 세션 ID 추적
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 세션 목록 새로 고침 */
  const loadSessions = useCallback(async () => {
    setError(null);
    try {
      const data = await getAllSessions();
      setSessions(data);
    } catch (err) {
      setError('세션 목록을 불러오는 데 실패했습니다.');
      console.error('[TabSession] loadSessions error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /** 현재 탭 세션 저장 */
  const handleSave = async () => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) return;

    setIsSaving(true);
    setError(null);
    try {
      await saveCurrentSession(trimmedName, sessionCategory.trim() || undefined);
      setSessionName('');
      setSessionCategory('');
      setShowSaveForm(false);
      await loadSessions();
    } catch (err) {
      setError('세션 저장에 실패했습니다.');
      console.error('[TabSession] handleSave error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /** 세션 복원 */
  const handleRestore = async (id: string) => {
    setRestoringId(id);
    setError(null);
    try {
      await restoreSession(id);
      // 마지막 열람 시각이 업데이트되므로 목록 갱신
      await loadSessions();
    } catch (err) {
      setError('세션 복원에 실패했습니다.');
      console.error('[TabSession] handleRestore error:', err);
    } finally {
      setRestoringId(null);
    }
  };

  /** 세션 삭제 */
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError('세션 삭제에 실패했습니다.');
      console.error('[TabSession] handleDelete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          탭 세션
        </h2>
        <button
          onClick={() => setShowSaveForm((v) => !v)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white
                     hover:bg-blue-700 active:scale-95 transition-all"
        >
          {showSaveForm ? '취소' : '현재 탭 저장'}
        </button>
      </div>

      {/* 세션 저장 폼 */}
      {showSaveForm && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 p-3 flex flex-col gap-2">
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="세션 이름 입력 (필수)"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800 px-3 py-1.5 text-xs
                       text-gray-900 dark:text-gray-100 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <input
            type="text"
            value={sessionCategory}
            onChange={(e) => setSessionCategory(e.target.value)}
            placeholder="카테고리 (선택)"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800 px-3 py-1.5 text-xs
                       text-gray-900 dark:text-gray-100 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={isSaving || !sessionName.trim()}
            className="self-end rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium
                       text-white hover:bg-blue-700 disabled:opacity-50
                       disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 오류 메시지 */}
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800
                      px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* 세션 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <span className="text-xs text-gray-400">불러오는 중...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-1">
          <span className="text-2xl">📂</span>
          <p className="text-xs text-gray-400">저장된 세션이 없습니다.</p>
          <p className="text-xs text-gray-400">'현재 탭 저장'으로 세션을 만들어보세요.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700
                         bg-white dark:bg-gray-800 px-3 py-2.5 flex items-start justify-between gap-2
                         hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              {/* 세션 정보 */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                  {session.name}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    탭 {session.tabs.length}개
                  </span>
                  {session.category && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5
                                       text-[10px] text-gray-600 dark:text-gray-300">
                        {session.category}
                      </span>
                    </>
                  )}
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-[11px] text-gray-400">
                    {session.lastOpenedAt
                      ? `마지막 열람 ${formatRelativeDate(session.lastOpenedAt)}`
                      : `저장 ${formatRelativeDate(session.createdAt)}`}
                  </span>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleRestore(session.id)}
                  disabled={restoringId === session.id}
                  className="rounded-md bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-[11px]
                             font-medium text-blue-700 dark:text-blue-300
                             hover:bg-blue-100 dark:hover:bg-blue-800/40
                             disabled:opacity-50 disabled:cursor-not-allowed
                             active:scale-95 transition-all"
                >
                  {restoringId === session.id ? '복원 중' : '복원'}
                </button>
                <button
                  onClick={() => handleDelete(session.id)}
                  disabled={deletingId === session.id}
                  className="rounded-md bg-red-50 dark:bg-red-900/30 px-2.5 py-1 text-[11px]
                             font-medium text-red-600 dark:text-red-400
                             hover:bg-red-100 dark:hover:bg-red-800/40
                             disabled:opacity-50 disabled:cursor-not-allowed
                             active:scale-95 transition-all"
                >
                  {deletingId === session.id ? '삭제 중' : '삭제'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
