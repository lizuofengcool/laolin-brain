/**
 * AI 模型统一接口
 * 支持多模型切换：智谱AI、DeepSeek、OpenAI、Ollama
 */

export type AiProviderType = "zhipu" | "deepseek" | "openai" | "ollama";

export interface AiProviderConfig {
  type: AiProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls?: ToolCall[];
  finishReason: string;
}

export interface AiProvider {
  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatCompletionResult>;

  chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncIterable<ChatStreamChunk>;
}

export interface ChatStreamChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>[];
  finishReason?: string;
}

/** 各模型提供商的默认配置 */
export const PROVIDER_DEFAULTS: Record<AiProviderType, { baseUrl: string; model: string }> = {
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:7b",
  },
};

/** 根据配置创建 AI Provider 实例 */
export function createAiProvider(config: AiProviderConfig): AiProvider {
  switch (config.type) {
    case "zhipu":
      return new ZhipuProvider(config);
    case "deepseek":
      return new OpenAICompatibleProvider(config);
    case "openai":
      return new OpenAICompatibleProvider(config);
    case "ollama":
      return new OpenAICompatibleProvider(config);
    default:
      return new ZhipuProvider(config);
  }
}

/** 智谱AI Provider（使用已有的 z-ai-web-dev-sdk） */
class ZhipuProvider implements AiProvider {
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.config = config;
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatCompletionResult> {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    // 智谱SDK的messages格式
    const formattedMessages = messages.map((m) => ({
      role: m.role as "user" | "system" | "assistant",
      content: m.content,
    }));

    const options: Record<string, unknown> = {};
    if (tools && tools.length > 0) {
      options.tools = tools;
    }

    const completion = await zai.chat.completions.create({
      messages: formattedMessages,
      model: this.config.model || PROVIDER_DEFAULTS.zhipu.model,
      ...options,
    });

    const choice = completion.choices[0];
    const result: ChatCompletionResult = {
      content: choice?.message?.content || null,
      finishReason: choice?.finish_reason || "stop",
    };

    // 解析智谱的tool_calls格式
    if (choice?.message?.tool_calls) {
      result.toolCalls = choice.message.tool_calls.map((tc: { id: string; type: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: typeof tc.function.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments),
        },
      }));
    }

    return result;
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncIterable<ChatStreamChunk> {
    // 智谱SDK流式支持有限，回退到非流式
    const result = await this.chat(messages, tools);
    if (result.content) {
      yield { content: result.content, finishReason: result.finishReason };
    }
    if (result.toolCalls) {
      yield { toolCalls: result.toolCalls, finishReason: result.finishReason };
    }
  }
}

/** OpenAI 兼容 Provider（DeepSeek、OpenAI、Ollama） */
class OpenAICompatibleProvider implements AiProvider {
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    const defaults = PROVIDER_DEFAULTS[this.config.type];
    return this.config.baseUrl || defaults.baseUrl;
  }

  private getModel(): string {
    const defaults = PROVIDER_DEFAULTS[this.config.type];
    return this.config.model || defaults.model;
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<ChatCompletionResult> {
    const body: Record<string, unknown> = {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      })),
      model: this.getModel(),
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    const result: ChatCompletionResult = {
      content: choice?.message?.content || null,
      finishReason: choice?.finish_reason || "stop",
    };

    if (choice?.message?.tool_calls) {
      result.toolCalls = choice.message.tool_calls;
    }

    return result;
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): AsyncIterable<ChatStreamChunk> {
    const body: Record<string, unknown> = {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      })),
      model: this.getModel(),
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;

          const chunk: ChatStreamChunk = {};
          if (delta.content) chunk.content = delta.content;
          if (delta.tool_calls) chunk.toolCalls = delta.tool_calls;
          if (data.choices?.[0]?.finish_reason) {
            chunk.finishReason = data.choices[0].finish_reason;
          }

          yield chunk;
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}
