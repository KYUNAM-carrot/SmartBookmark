/**
 * SmartBookmark Pro - 보안 잠금 화면 컴포넌트
 * 비밀번호 및 패턴 잠금 UI
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../../lib/store';
import {
  hashPassword,
  constantTimeCompare,
  arrayToBuffer,
  patternToString,
} from '../../lib/crypto';

/** 패턴 그리드 크기 */
const GRID_SIZE = 3;
const DOT_SIZE = 16;
const DOT_GAP = 56;

export default function LockScreen() {
  const { auth, setAuth } = useAppStore();
  const [mode, setMode] = useState<'password' | 'pattern'>(
    auth.authMethod === 'pattern' ? 'pattern' : 'password',
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // 패턴 상태
  const [patternPoints, setPatternPoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 비밀번호 잠금 해제
  const handlePasswordUnlock = async () => {
    if (!password.trim()) return;
    setIsVerifying(true);
    setError('');

    try {
      const result = await chrome.storage.local.get(['auth_salt', 'auth_hash']);
      if (!result.auth_salt || !result.auth_hash) {
        setError('잠금 설정이 없습니다');
        return;
      }

      const salt = arrayToBuffer(result.auth_salt);
      const storedHash = arrayToBuffer(result.auth_hash);
      const inputHash = await hashPassword(password, salt);

      if (constantTimeCompare(inputHash, storedHash.buffer as ArrayBuffer)) {
        await unlockApp();
      } else {
        setError('비밀번호가 일치하지 않습니다');
        setPassword('');
      }
    } catch (err) {
      setError('인증 오류가 발생했습니다');
    } finally {
      setIsVerifying(false);
    }
  };

  // 패턴 잠금 해제
  const handlePatternUnlock = async (points: [number, number][]) => {
    if (points.length < 4) {
      setError('최소 4개의 점을 연결하세요');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const result = await chrome.storage.local.get(['auth_salt', 'auth_hash']);
      if (!result.auth_salt || !result.auth_hash) {
        setError('잠금 설정이 없습니다');
        return;
      }

      const patternStr = patternToString(points);
      const salt = arrayToBuffer(result.auth_salt);
      const storedHash = arrayToBuffer(result.auth_hash);
      const inputHash = await hashPassword(patternStr, salt);

      if (constantTimeCompare(inputHash, storedHash.buffer as ArrayBuffer)) {
        await unlockApp();
      } else {
        setError('패턴이 일치하지 않습니다');
        setPatternPoints([]);
        drawPattern([]);
      }
    } catch (err) {
      setError('인증 오류가 발생했습니다');
    } finally {
      setIsVerifying(false);
    }
  };

  // 잠금 해제 처리
  const unlockApp = async () => {
    await chrome.storage.session.set({ isUnlocked: true, unlockTimestamp: Date.now() });
    setAuth({ isUnlocked: true });
    chrome.runtime.sendMessage({ type: 'UNLOCKED' });
  };

  // 패턴 캔버스 그리기
  const drawPattern = useCallback(
    (points: [number, number][]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = canvas.width;
      ctx.clearRect(0, 0, size, size);

      // 점 그리기
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const x = col * DOT_GAP + DOT_GAP / 2;
          const y = row * DOT_GAP + DOT_GAP / 2;
          const isSelected = points.some(([r, c]) => r === row && c === col);

          ctx.beginPath();
          ctx.arc(x, y, DOT_SIZE / 2, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#3b82f6' : '#d1d5db';
          ctx.fill();

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // 선 그리기
      if (points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        points.forEach(([row, col], i) => {
          const x = col * DOT_GAP + DOT_GAP / 2;
          const y = row * DOT_GAP + DOT_GAP / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    },
    [],
  );

  // 패턴 터치/마우스 이벤트
  const getGridPosition = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cx = col * DOT_GAP + DOT_GAP / 2;
        const cy = row * DOT_GAP + DOT_GAP / 2;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < DOT_SIZE * 1.5) return [row, col];
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getGridPosition(e);
    if (pos) {
      setIsDrawing(true);
      setPatternPoints([pos]);
      setError('');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getGridPosition(e);
    if (pos && !patternPoints.some(([r, c]) => r === pos[0] && c === pos[1])) {
      const newPoints = [...patternPoints, pos];
      setPatternPoints(newPoints);
      drawPattern(newPoints);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && patternPoints.length > 0) {
      setIsDrawing(false);
      handlePatternUnlock(patternPoints);
    }
  };

  // 초기 캔버스 그리기
  useEffect(() => {
    if (mode === 'pattern') {
      drawPattern([]);
    }
  }, [mode, drawPattern]);

  // 잠금이 설정되지 않은 경우 - 초기 설정 안내
  if (auth.authMethod === 'none') {
    return (
      <div className="popup-container flex flex-col items-center justify-center bg-white dark:bg-gray-900 p-6">
        <div className="text-4xl mb-4">&#x1f512;</div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
          SmartBookmark Pro
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          보안 잠금이 설정되지 않았습니다.
          <br />
          설정에서 잠금을 활성화하세요.
        </p>
        <button
          onClick={() => unlockApp()}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium
                     hover:bg-primary-700 transition-colors"
        >
          시작하기
        </button>
      </div>
    );
  }

  return (
    <div className="popup-container flex flex-col items-center justify-center bg-white dark:bg-gray-900 p-6">
      <div className="text-4xl mb-4">&#x1f510;</div>
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
        SmartBookmark Pro
      </h2>
      <p className="text-xs text-gray-400 mb-6">잠금을 해제하세요</p>

      {/* 모드 전환 (비밀번호/패턴 모두 설정된 경우) */}
      {auth.authMethod === 'pattern' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('pattern')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              mode === 'pattern'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            패턴
          </button>
          <button
            onClick={() => setMode('password')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              mode === 'password'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            비밀번호
          </button>
        </div>
      )}

      {/* 비밀번호 모드 */}
      {mode === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePasswordUnlock();
          }}
          className="w-full max-w-xs space-y-3"
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력"
            autoFocus
            className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg
                       bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500
                       text-center"
          />
          <button
            type="submit"
            disabled={isVerifying || !password}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium
                       hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {isVerifying ? '확인 중...' : '잠금 해제'}
          </button>
        </form>
      )}

      {/* 패턴 모드 */}
      {mode === 'pattern' && (
        <div className="flex flex-col items-center">
          <canvas
            ref={canvasRef}
            width={GRID_SIZE * DOT_GAP}
            height={GRID_SIZE * DOT_GAP}
            className="cursor-pointer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {isVerifying && (
            <p className="text-xs text-gray-400 mt-2">확인 중...</p>
          )}
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <p className="text-xs text-red-500 mt-3 text-center">{error}</p>
      )}
    </div>
  );
}
