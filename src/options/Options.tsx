import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppSettings, AIConfig, AIProvider, AuthMethod } from '../types/index';

// ---------------------------------------------------------------------------
// 기본값 상수
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 0,
  historyAnalysisInterval: 24,
  youtubeTrackerEnabled: true,
  minWatchSeconds: 30,
  adsEnabled: true,
  theme: 'system',
  language: 'ko',
  smartTitleEnabled: true,
  smartTitleFormat: '{title}',
  summaryAutoSave: false,
  aiTitleAutoGenerate: false,
};

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'openai',
  apiKey: '',
  model: '',
  endpoint: '',
  maxTokens: 1000,
  temperature: 0.7,
};

const MODEL_PLACEHOLDERS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  gemini: 'gemini-1.5-flash',
  ollama: 'llama3',
  custom: 'your-model-name',
};

// ---------------------------------------------------------------------------
// 탭 목록
// ---------------------------------------------------------------------------

type TabId = 'general' | 'smartTitle' | 'youtube' | 'ai' | 'ads' | 'data' | 'about';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'general', label: '일반', icon: '⚙️' },
  { id: 'smartTitle', label: '스마트 제목', icon: '✨' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'ai', label: 'AI 설정', icon: '🤖' },
  { id: 'ads', label: '광고', icon: '📢' },
  { id: 'data', label: '데이터', icon: '🗄️' },
  { id: 'about', label: '정보', icon: 'ℹ️' },
];

// ---------------------------------------------------------------------------
// 서브 컴포넌트
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, label, description, disabled }: ToggleSwitchProps) {
  const id = `toggle-${label.replace(/\s+/g, '-')}`;
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-4 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex-1">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={`w-10 h-6 rounded-full transition-colors duration-200 ${
            checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </div>
    </label>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      </div>
      <div className="px-4 py-4 space-y-4">{children}</div>
    </div>
  );
}

interface FieldRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export default function Options() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [tier, setTier] = useState<'free' | 'pro' | 'team'>('free');
  const [isDark, setIsDark] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [importFileRef] = useState(() => ({ current: null as HTMLInputElement | null }));
  const [clearConfirm, setClearConfirm] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 초기 데이터 로드 ---
  useEffect(() => {
    async function load() {
      try {
        const result = await chrome.storage.local.get(['settings', 'aiConfig', 'subscriptionTier']);
        if (result.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...(result.settings as Partial<AppSettings>) });
        }
        if (result.aiConfig) {
          setAiConfig({ ...DEFAULT_AI_CONFIG, ...(result.aiConfig as Partial<AIConfig>) });
        }
        if (result.subscriptionTier) {
          setTier(result.subscriptionTier as 'free' | 'pro' | 'team');
        }
        // 테마 적용
        const s = result.settings as AppSettings | undefined;
        applyTheme(s?.theme ?? 'system');
      } catch (err) {
        console.warn('[Options] Chrome storage 접근 불가:', err);
      }
    }
    load();
  }, []);

  // --- 테마 적용 ---
  function applyTheme(theme: 'light' | 'dark' | 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldDark = theme === 'dark' || (theme === 'system' && prefersDark);
    if (shouldDark) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    }
  }

  // --- debounce 저장 ---
  const debounceSave = useCallback(
    (newSettings: AppSettings, newAi: AIConfig) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        try {
          await chrome.storage.local.set({ settings: newSettings, aiConfig: newAi });
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 2000);
        } catch (err) {
          console.warn('[Options] 저장 실패:', err);
        }
      }, 600);
    },
    []
  );

  // --- 설정 업데이트 헬퍼 ---
  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      debounceSave(next, aiConfig);
      if (patch.theme) applyTheme(patch.theme);
      return next;
    });
  }

  function updateAiConfig(patch: Partial<AIConfig>) {
    setAiConfig((prev) => {
      const next = { ...prev, ...patch };
      debounceSave(settings, next);
      return next;
    });
  }

  // --- AI 연결 테스트 ---
  async function testConnection() {
    setConnectionStatus('testing');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_AI_CONFIG',
        data: {},
      });
      if (response) {
        setConnectionStatus('ok');
      } else {
        setConnectionStatus('fail');
      }
    } catch {
      setConnectionStatus('fail');
    }
    setTimeout(() => setConnectionStatus('idle'), 3000);
  }

  // --- 내보내기 ---
  async function handleExport(format: 'json' | 'html') {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_DATA',
        data: { format },
      });
      if (response?.content) {
        const blob = new Blob([response.content], {
          type: format === 'json' ? 'application/json' : 'text/html',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartbookmark-export.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn('[Options] 내보내기 실패:', err);
    }
  }

  // --- 가져오기 ---
  function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.html';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const format = file.name.endsWith('.json') ? 'json' : 'html';
      const content = await file.text();
      try {
        await chrome.runtime.sendMessage({
          type: 'IMPORT_DATA',
          data: { format, content },
        });
        alert('가져오기 완료!');
      } catch (err) {
        console.warn('[Options] 가져오기 실패:', err);
        alert('가져오기 실패: ' + String(err));
      }
    };
    input.click();
  }

  // --- 전체 데이터 삭제 ---
  async function handleClearData() {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    try {
      await chrome.storage.local.clear();
      setClearConfirm(false);
      alert('모든 데이터가 삭제되었습니다.');
      window.location.reload();
    } catch (err) {
      console.warn('[Options] 데이터 삭제 실패:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 탭 콘텐츠 렌더링
  // ---------------------------------------------------------------------------

  function renderGeneral() {
    return (
      <div className="space-y-4">
        <Section title="외관 및 언어">
          {/* 테마 */}
          <FieldRow label="테마" description="UI 색상 테마를 선택합니다">
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateSettings({ theme: t })}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    settings.theme === t
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t === 'light' ? '라이트' : t === 'dark' ? '다크' : '시스템'}
                </button>
              ))}
            </div>
          </FieldRow>

          {/* 언어 */}
          <FieldRow label="언어">
            <select
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value as 'ko' | 'en' })}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </FieldRow>
        </Section>

        <Section title="보안 및 잠금">
          {/* 자동 잠금 */}
          <FieldRow
            label="자동 잠금 시간 (분)"
            description="0을 입력하면 자동 잠금이 비활성화됩니다"
          >
            <input
              type="number"
              min={0}
              max={1440}
              value={settings.autoLockMinutes}
              onChange={(e) =>
                updateSettings({ autoLockMinutes: parseInt(e.target.value, 10) || 0 })
              }
              className="w-20 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
            />
          </FieldRow>

          {/* 인증 방법 */}
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
              인증 방법
            </p>
            <div className="flex flex-col gap-1.5">
              {([
                { value: 'none', label: '없음' },
                { value: 'password', label: '비밀번호' },
                { value: 'pattern', label: '패턴' },
              ] as { value: AuthMethod; label: string }[]).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authMethod"
                    value={opt.value}
                    className="accent-primary-500"
                    readOnly
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>
      </div>
    );
  }

  function renderSmartTitle() {
    const previewTitle = settings.smartTitleFormat
      .replace('{title}', '예시 페이지 제목')
      .replace('{domain}', 'example.com')
      .replace('{category}', '개발')
      .replace('{date}', new Date().toLocaleDateString('ko-KR'));

    return (
      <div className="space-y-4">
        <Section title="스마트 제목 생성">
          <ToggleSwitch
            checked={settings.smartTitleEnabled}
            onChange={(v) => updateSettings({ smartTitleEnabled: v })}
            label="스마트 제목 활성화"
            description="AI를 사용하여 북마크 제목을 자동으로 최적화합니다"
          />

          <ToggleSwitch
            checked={settings.aiTitleAutoGenerate}
            onChange={(v) => updateSettings({ aiTitleAutoGenerate: v })}
            label="AI 자동 생성"
            description="북마크 추가 시 즉시 AI 제목을 생성합니다"
            disabled={!settings.smartTitleEnabled}
          />

          <ToggleSwitch
            checked={settings.summaryAutoSave}
            onChange={(v) => updateSettings({ summaryAutoSave: v })}
            label="페이지 요약 자동 저장"
            description="북마크 저장 시 페이지 요약을 함께 저장합니다"
            disabled={!settings.smartTitleEnabled}
          />
        </Section>

        <Section title="제목 형식">
          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
              제목 형식 템플릿
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
              사용 가능한 변수: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{title}'}</code>,{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{domain}'}</code>,{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{category}'}</code>,{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{date}'}</code>
            </p>
            <input
              type="text"
              value={settings.smartTitleFormat}
              onChange={(e) => updateSettings({ smartTitleFormat: e.target.value })}
              disabled={!settings.smartTitleEnabled}
              placeholder="{title} - {domain}"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">미리보기</p>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {previewTitle || '(비어 있음)'}
            </p>
          </div>
        </Section>
      </div>
    );
  }

  function renderYouTube() {
    return (
      <div className="space-y-4">
        <Section title="YouTube 추적 설정">
          <ToggleSwitch
            checked={settings.youtubeTrackerEnabled}
            onChange={(v) => updateSettings({ youtubeTrackerEnabled: v })}
            label="YouTube 시청 추적"
            description="YouTube에서 시청한 동영상을 자동으로 기록합니다"
          />

          <FieldRow
            label="최소 시청 시간 (초)"
            description="이 시간 이상 시청한 경우에만 기록합니다"
          >
            <input
              type="number"
              min={5}
              max={3600}
              value={settings.minWatchSeconds}
              onChange={(e) =>
                updateSettings({ minWatchSeconds: parseInt(e.target.value, 10) || 30 })
              }
              disabled={!settings.youtubeTrackerEnabled}
              className="w-20 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 text-right"
            />
          </FieldRow>

          <FieldRow
            label="방문 기록 분석 주기 (시간)"
            description="방문 패턴 분석 실행 간격입니다"
          >
            <input
              type="number"
              min={1}
              max={168}
              value={settings.historyAnalysisInterval}
              onChange={(e) =>
                updateSettings({
                  historyAnalysisInterval: parseInt(e.target.value, 10) || 24,
                })
              }
              className="w-20 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
            />
          </FieldRow>
        </Section>
      </div>
    );
  }

  function renderAI() {
    const showEndpoint = aiConfig.provider === 'ollama' || aiConfig.provider === 'custom';

    return (
      <div className="space-y-4">
        <Section title="AI 제공자 설정">
          {/* 제공자 선택 */}
          <FieldRow label="AI 제공자">
            <select
              value={aiConfig.provider}
              onChange={(e) => {
                const provider = e.target.value as AIProvider;
                updateAiConfig({ provider, model: '', apiKey: '' });
              }}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama (로컬)</option>
              <option value="custom">Custom</option>
            </select>
          </FieldRow>

          {/* API 키 */}
          {aiConfig.provider !== 'ollama' && (
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">
                API 키
              </label>
              <input
                type="password"
                value={aiConfig.apiKey}
                onChange={(e) => updateAiConfig({ apiKey: e.target.value })}
                placeholder="sk-... 또는 API 키 입력"
                autoComplete="off"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* 모델명 */}
          <div>
            <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">
              모델 이름
            </label>
            <input
              type="text"
              value={aiConfig.model}
              onChange={(e) => updateAiConfig({ model: e.target.value })}
              placeholder={MODEL_PLACEHOLDERS[aiConfig.provider]}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* 엔드포인트 URL (Ollama/Custom) */}
          {showEndpoint && (
            <div>
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200 block mb-1.5">
                엔드포인트 URL
              </label>
              <input
                type="url"
                value={aiConfig.endpoint ?? ''}
                onChange={(e) => updateAiConfig({ endpoint: e.target.value })}
                placeholder={
                  aiConfig.provider === 'ollama'
                    ? 'http://localhost:11434'
                    : 'https://api.example.com/v1'
                }
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
        </Section>

        <Section title="생성 파라미터">
          {/* 최대 토큰 */}
          <FieldRow label="최대 토큰" description="응답 최대 길이">
            <input
              type="number"
              min={100}
              max={8000}
              step={100}
              value={aiConfig.maxTokens}
              onChange={(e) =>
                updateAiConfig({ maxTokens: parseInt(e.target.value, 10) || 1000 })
              }
              className="w-24 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
            />
          </FieldRow>

          {/* 온도 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  창의성 (Temperature)
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  낮을수록 일관된 응답, 높을수록 창의적인 응답
                </p>
              </div>
              <span className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded">
                {aiConfig.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={aiConfig.temperature}
              onChange={(e) => updateAiConfig({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.0 (정확)</span>
              <span>1.0 (균형)</span>
              <span>2.0 (창의)</span>
            </div>
          </div>
        </Section>

        {/* 연결 테스트 */}
        <div className="flex items-center gap-3">
          <button
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionStatus === 'testing' ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                테스트 중...
              </>
            ) : (
              '연결 테스트'
            )}
          </button>
          {connectionStatus === 'ok' && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <span>✓</span> 연결 성공
            </span>
          )}
          {connectionStatus === 'fail' && (
            <span className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1">
              <span>✗</span> 연결 실패
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderAds() {
    return (
      <div className="space-y-4">
        <Section title="광고 설정">
          <ToggleSwitch
            checked={settings.adsEnabled}
            onChange={(v) => updateSettings({ adsEnabled: v })}
            label="광고 표시"
            description="네이티브 광고를 사이드패널 피드에 표시합니다"
            disabled={tier === 'pro' || tier === 'team'}
          />

          {(tier === 'pro' || tier === 'team') && (
            <div className="flex items-center gap-2 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
              <span className="text-primary-500">✓</span>
              <p className="text-sm text-primary-700 dark:text-primary-300">
                {tier === 'pro' ? 'Pro' : 'Team'} 플랜에서는 광고가 표시되지 않습니다
              </p>
            </div>
          )}
        </Section>

        <Section title="현재 구독">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">현재 등급</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {tier === 'free' ? '기본 기능 제공' : tier === 'pro' ? '모든 기능 무제한' : '팀 협업 기능 포함'}
              </p>
            </div>
            <span
              className={`text-sm font-bold px-3 py-1.5 rounded-full ${
                tier === 'pro' || tier === 'team'
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {tier === 'pro' ? 'Pro' : tier === 'team' ? 'Team' : 'Free'}
            </span>
          </div>
        </Section>
      </div>
    );
  }

  function renderData() {
    return (
      <div className="space-y-4">
        <Section title="북마크 내보내기">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            저장된 북마크를 JSON 또는 HTML 형식으로 내보냅니다.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('json')}
              className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <span>📄</span>
              JSON 내보내기
            </button>
            <button
              onClick={() => handleExport('html')}
              className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <span>🌐</span>
              HTML 내보내기
            </button>
          </div>
        </Section>

        <Section title="북마크 가져오기">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            JSON 또는 HTML 파일로부터 북마크를 가져옵니다. 기존 데이터는 유지됩니다.
          </p>
          <button
            onClick={handleImportClick}
            className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center justify-center gap-2"
          >
            <span>📂</span>
            파일 선택하여 가져오기
          </button>
          <input ref={(el) => { importFileRef.current = el; }} type="file" accept=".json,.html" className="hidden" />
        </Section>

        <Section title="데이터 초기화">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            모든 북마크, 설정, YouTube 기록, 세션 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          {clearConfirm ? (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg space-y-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                정말로 모든 데이터를 삭제하시겠습니까?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClearData}
                  className="flex-1 py-2 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                >
                  삭제 확인
                </button>
                <button
                  onClick={() => setClearConfirm(false)}
                  className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleClearData}
              className="w-full py-2.5 px-4 rounded-lg border border-red-300 dark:border-red-800 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
            >
              <span>🗑️</span>
              모든 데이터 삭제
            </button>
          )}
        </Section>
      </div>
    );
  }

  function renderAbout() {
    return (
      <div className="space-y-4">
        <Section title="SmartBookmark Pro">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-3xl">
              🔖
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">SmartBookmark Pro</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">버전 1.0.0</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            AI 기반 스마트 북마크 관리 Chrome 확장 프로그램입니다. 북마크를 자동으로 분류하고,
            스마트 제목을 생성하며, YouTube 시청 기록을 추적합니다.
          </p>
        </Section>

        <Section title="링크">
          <div className="space-y-2">
            <a
              href="https://github.com/smartbookmark-pro"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <span className="text-xl">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-gray-700 dark:text-gray-300">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                  GitHub 저장소
                </p>
                <p className="text-xs text-gray-400">소스 코드 및 이슈 트래커</p>
              </div>
              <span className="text-gray-400 group-hover:text-primary-500 text-xs">→</span>
            </a>
          </div>
        </Section>

        <Section title="기술 정보">
          <div className="space-y-1.5 text-sm">
            {[
              { label: '버전', value: '1.0.0' },
              { label: '빌드', value: 'React 18 + TypeScript + Tailwind CSS' },
              { label: '매니페스트', value: 'Chrome Extension MV3' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{label}</span>
                <span className="text-gray-800 dark:text-gray-200 font-medium text-right ml-4 truncate max-w-[60%]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 메인 렌더링
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* 저장 토스트 */}
      {savedToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          <span>✓</span>
          설정이 저장되었습니다
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8 flex items-center gap-3">
          <span className="text-3xl">🔖</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              SmartBookmark Pro 설정
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              확장 프로그램 환경 설정을 관리합니다
            </p>
          </div>
        </div>

        <div className="flex gap-6">
          {/* 사이드바 탭 내비게이션 */}
          <nav className="w-40 flex-shrink-0">
            <ul className="space-y-1">
              {TABS.map((tab) => (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeTab === tab.id
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* 콘텐츠 영역 */}
          <div className="flex-1 min-w-0">
            {activeTab === 'general' && renderGeneral()}
            {activeTab === 'smartTitle' && renderSmartTitle()}
            {activeTab === 'youtube' && renderYouTube()}
            {activeTab === 'ai' && renderAI()}
            {activeTab === 'ads' && renderAds()}
            {activeTab === 'data' && renderData()}
            {activeTab === 'about' && renderAbout()}
          </div>
        </div>
      </div>
    </div>
  );
}
