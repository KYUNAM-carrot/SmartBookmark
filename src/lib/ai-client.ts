/**
 * SmartBookmark Pro - AI 클라이언트
 * 멀티 프로바이더 어댑터 패턴 (OpenAI, Claude, Gemini, Ollama, Custom)
 */

import type { AIProvider, AIConfig, ClassificationResult } from '@/types';

/** AI 응답 구조 */
interface AIResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/** 프로바이더별 어댑터 인터페이스 */
interface AIAdapter {
  chat(messages: ChatMessage[], config: AIConfig): Promise<AIResponse>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============================================================
// 프로바이더별 어댑터
// ============================================================

const openaiAdapter: AIAdapter = {
  async chat(messages, config) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages,
        max_tokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = await res.json();
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  },
};

const anthropicAdapter: AIAdapter = {
  async chat(messages, config) {
    const systemMsg = messages.find((m) => m.role === 'system')?.content;
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-20250514',
        max_tokens: config.maxTokens || 1000,
        system: systemMsg,
        messages: userMessages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const data = await res.json();
    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
      },
    };
  },
};

const geminiAdapter: AIAdapter = {
  async chat(messages, config) {
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === 'system')?.content;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-pro'}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction
            ? { parts: [{ text: systemInstruction }] }
            : undefined,
          generationConfig: {
            maxOutputTokens: config.maxTokens || 1000,
            temperature: config.temperature ?? 0.3,
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    return {
      content: data.candidates[0].content.parts[0].text,
    };
  },
};

const ollamaAdapter: AIAdapter = {
  async chat(messages, config) {
    const endpoint = config.endpoint || 'http://localhost:11434';
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'llama3.2',
        messages,
        stream: false,
        options: {
          num_predict: config.maxTokens || 1000,
          temperature: config.temperature ?? 0.3,
        },
      }),
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    return { content: data.message.content };
  },
};

const customAdapter: AIAdapter = {
  async chat(messages, config) {
    if (!config.endpoint) throw new Error('Custom endpoint not configured');
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        messages,
        model: config.model,
        max_tokens: config.maxTokens || 1000,
        temperature: config.temperature ?? 0.3,
      }),
    });
    if (!res.ok) throw new Error(`Custom API error: ${res.status}`);
    const data = await res.json();
    // OpenAI-compatible response format expected
    return {
      content: data.choices?.[0]?.message?.content ?? data.content ?? data.text ?? '',
    };
  },
};

/** 프로바이더 → 어댑터 매핑 */
const adapters: Record<AIProvider, AIAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  gemini: geminiAdapter,
  ollama: ollamaAdapter,
  custom: customAdapter,
};

// ============================================================
// AI 클라이언트 클래스
// ============================================================

export class AIClient {
  private config: AIConfig | null = null;

  /** 설정 로드 */
  async loadConfig(): Promise<AIConfig | null> {
    const result = await chrome.storage.local.get('ai_config');
    this.config = result.ai_config ?? null;
    return this.config;
  }

  /** 설정 저장 */
  async saveConfig(config: AIConfig): Promise<void> {
    this.config = config;
    await chrome.storage.local.set({ ai_config: config });
  }

  /** AI 호출 */
  async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.config) await this.loadConfig();
    if (!this.config) throw new Error('AI not configured');

    const adapter = adapters[this.config.provider];
    const messages: ChatMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await adapter.chat(messages, this.config);
    return response.content;
  }

  /** 즐겨찾기 분류 */
  async classifyBookmarks(
    items: Array<{ title: string; url: string }>,
  ): Promise<Map<string, ClassificationResult>> {
    const prompt = `다음 즐겨찾기들을 카테고리로 분류해주세요.
각 항목에 대해 category, confidence(0-1), suggestedTags(최대 3개)를 JSON 배열로 반환하세요.

카테고리 목록: 개발, 디자인, 비즈니스, 학습, 뉴스, 엔터테인먼트, 쇼핑, SNS, 도구, 기타

즐겨찾기:
${items.map((b, i) => `${i + 1}. ${b.title} (${b.url})`).join('\n')}

JSON만 반환:
[{"index": 1, "category": "개발", "confidence": 0.9, "suggestedTags": ["React", "Frontend"]}]`;

    const result = await this.callAI(prompt);
    const parsed: Array<{
      index: number;
      category: string;
      confidence: number;
      suggestedTags: string[];
    }> = JSON.parse(result);

    const map = new Map<string, ClassificationResult>();
    for (const item of parsed) {
      const bookmark = items[item.index - 1];
      if (bookmark) {
        map.set(bookmark.url, {
          category: item.category,
          confidence: item.confidence,
          suggestedTags: item.suggestedTags,
        });
      }
    }
    return map;
  }

  /** 페이지 요약 */
  async summarizePage(title: string, content: string): Promise<string> {
    const prompt = `다음 웹페이지의 내용을 한국어로 100자 이내로 요약해주세요.

제목: ${title}
내용: ${content.slice(0, 1000)}

요약만 반환:`;

    return this.callAI(prompt);
  }

  /** 연결 테스트 */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.callAI('Hello, respond with just "OK".');
      return result.length > 0;
    } catch {
      return false;
    }
  }
}

/** 싱글톤 인스턴스 */
export const aiClient = new AIClient();
