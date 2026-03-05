import { useState, useEffect, useCallback } from 'react';
import { aiClient } from '@/lib/ai-client';
import type { AIProvider, AIConfig, ClassificationResult } from '@/types';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  ollama: 'Ollama (로컬)',
  custom: '사용자 정의',
};

const PROVIDER_MODEL_PLACEHOLDERS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-6',
  gemini: 'gemini-2.0-flash',
  ollama: 'llama3.2',
  custom: 'model-name',
};

const PROVIDERS_REQUIRING_ENDPOINT: AIProvider[] = ['ollama', 'custom'];

const DEFAULT_CONFIG: AIConfig = {
  provider: 'openai',
  apiKey: '',
  model: '',
  endpoint: '',
  maxTokens: 1024,
  temperature: 0.7,
};

interface ClassificationEntry {
  title: string;
  url: string;
  result: ClassificationResult;
}

interface ConnectionStatus {
  tested: boolean;
  success: boolean;
  message: string;
}

export function AIAssistant() {
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    tested: false,
    success: false,
    message: '',
  });

  const [classifying, setClassifying] = useState(false);
  const [classificationResults, setClassificationResults] = useState<ClassificationEntry[]>([]);
  const [classificationError, setClassificationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    aiClient.loadConfig().then((loaded) => {
      if (!cancelled) {
        if (loaded) {
          setConfig(loaded);
        }
        setConfigLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setConfigLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showsEndpoint = PROVIDERS_REQUIRING_ENDPOINT.includes(config.provider);

  const handleProviderChange = useCallback((provider: AIProvider) => {
    setConfig((prev) => ({
      ...prev,
      provider,
      model: '',
      endpoint: PROVIDERS_REQUIRING_ENDPOINT.includes(provider)
        ? (prev.endpoint || '')
        : '',
    }));
    setConnectionStatus({ tested: false, success: false, message: '' });
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof AIConfig>(field: K, value: AIConfig[K]) => {
      setConfig((prev) => ({ ...prev, [field]: value }));
      setConnectionStatus({ tested: false, success: false, message: '' });
    },
    [],
  );

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setConnectionStatus({ tested: false, success: false, message: '' });
    try {
      await aiClient.saveConfig(config);
      const ok = await aiClient.testConnection();
      setConnectionStatus({
        tested: true,
        success: ok,
        message: ok ? '연결 성공' : '연결 실패: 설정을 확인해 주세요.',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setConnectionStatus({ tested: true, success: false, message });
    } finally {
      setTesting(false);
    }
  }, [config]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await aiClient.saveConfig(config);
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleClassify = useCallback(async () => {
    setClassifying(true);
    setClassificationError(null);
    setClassificationResults([]);

    try {
      const tabs = await chrome.tabs.query({});
      const items = tabs
        .filter((t): t is chrome.tabs.Tab & { title: string; url: string } =>
          Boolean(t.title && t.url),
        )
        .map((t) => ({ title: t.title, url: t.url }));

      if (items.length === 0) {
        setClassificationError('분류할 북마크가 없습니다.');
        return;
      }

      const resultsMap = await aiClient.classifyBookmarks(items);
      const entries: ClassificationEntry[] = [];
      resultsMap.forEach((result, key) => {
        const item = items.find((i) => i.url === key || i.title === key);
        entries.push({
          title: item?.title ?? key,
          url: item?.url ?? key,
          result,
        });
      });
      setClassificationResults(entries);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '분류 중 오류가 발생했습니다.';
      setClassificationError(message);
    } finally {
      setClassifying(false);
    }
  }, []);

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="ml-2 text-sm text-gray-500">설정 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* ── AI 설정 섹션 ── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">AI 설정</h2>

        <div className="flex flex-col gap-3">
          {/* 공급자 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">AI 공급자</span>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          {/* API 키 */}
          {!PROVIDERS_REQUIRING_ENDPOINT.includes(config.provider) || config.provider === 'custom' ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">API 키</span>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">API 키 (선택)</span>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                placeholder="필요한 경우 입력"
                autoComplete="off"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          )}

          {/* 모델 */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">모델</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) => handleFieldChange('model', e.target.value)}
              placeholder={PROVIDER_MODEL_PLACEHOLDERS[config.provider]}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>

          {/* 엔드포인트 (ollama / custom 전용) */}
          {showsEndpoint && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">엔드포인트 URL</span>
              <input
                type="url"
                value={config.endpoint ?? ''}
                onChange={(e) => handleFieldChange('endpoint', e.target.value)}
                placeholder={
                  config.provider === 'ollama'
                    ? 'http://localhost:11434'
                    : 'https://api.example.com/v1'
                }
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          )}

          {/* 연결 상태 피드백 */}
          {connectionStatus.tested && (
            <p
              className={`rounded-md px-3 py-2 text-xs ${
                connectionStatus.success
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {connectionStatus.message}
            </p>
          )}

          {/* 버튼 행 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || saving}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? '테스트 중...' : '연결 테스트'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || testing}
              className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </section>

      {/* ── AI 도구 섹션 ── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">AI 도구</h2>

        <button
          type="button"
          onClick={handleClassify}
          disabled={classifying}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {classifying ? '분류 중...' : '북마크 자동 분류'}
        </button>

        {classificationError && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {classificationError}
          </p>
        )}

        {classificationResults.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-medium text-gray-500">
              분류 결과 ({classificationResults.length}개)
            </p>
            <ul className="flex flex-col gap-2">
              {classificationResults.map((entry, idx) => (
                <li
                  key={idx}
                  className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <p
                    className="truncate text-xs font-medium text-gray-800"
                    title={entry.title}
                  >
                    {entry.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                      {entry.result.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      신뢰도 {Math.round(entry.result.confidence * 100)}%
                    </span>
                  </div>
                  {entry.result.suggestedTags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.result.suggestedTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
