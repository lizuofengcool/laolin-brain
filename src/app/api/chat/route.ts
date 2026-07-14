/**
 * AI 对话 API
 * POST /api/chat
 * 支持流式响应和 Function Calling
 */

import { NextRequest, NextResponse } from "next/server";
import { createAiProvider, type ChatMessage, type AiProviderType, PROVIDER_DEFAULTS } from "@/lib/ai/providers/base";
import { AI_TOOLS } from "@/lib/ai/tools/definitions";
import { executeTool } from "@/lib/ai/tools/executor";
import { authenticateRequest } from "@/lib/api-auth";
import { checkAiUsage } from "@/lib/ai-usage";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/cloud-sync/config-crypto";

const SYSTEM_PROMPT = `你是"老林大脑"的AI助手，一个智能文件管理助手。你可以帮助用户管理文件、搜索内容、添加标签、生成摘要等。

你的能力：
- 搜索文件：按名称、标签、类型搜索
- 列出文件：按条件筛选和排序
- 添加标签：为文件添加分类标签
- 收藏管理：收藏或取消收藏文件
- 删除文件：将文件移到回收站
- 查看文件详情：获取文件完整信息
- 存储统计：查看存储使用情况
- 文件摘要：查看文件内容摘要

回答规则：
1. 用中文回答
2. 简洁明了，重点突出
3. 调用工具后，用自然语言总结结果
4. 如果用户意图不明确，主动询问
5. 文件操作前确认，避免误操作
6. 列出文件时显示文件名、类型、大小等关键信息`;

const MAX_TOOL_ITERATIONS = 5;

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const usage = checkAiUsage(auth.userId);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "AI调用已达每日限额，请明天再试" },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const { messages, provider: providerType, stream } = body as {
      messages: ChatMessage[];
      provider?: AiProviderType;
      stream?: boolean;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    // 获取 AI Provider 配置（优先从数据库读取用户配置）
    const provider = createAiProvider(await getProviderConfig(providerType, auth.userId, auth.tenantId));

    // 构建完整消息列表
    const fullMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    if (stream) {
      return handleStreamResponse(provider, fullMessages, auth.userId, auth.tenantId);
    }

    return handleNormalResponse(provider, fullMessages, auth.userId, auth.tenantId);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "AI 对话失败，请稍后再试" },
      { status: 500 },
    );
  }
}

/** 非流式响应：支持多轮工具调用 */
async function handleNormalResponse(
  provider: ReturnType<typeof createAiProvider>,
  messages: ChatMessage[],
  userId: string,
  tenantId: string,
) {
  let currentMessages = [...messages];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    const result = await provider.chat(currentMessages, AI_TOOLS);

    // 如果没有工具调用，直接返回
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return NextResponse.json({
        message: {
          role: "assistant",
          content: result.content || "",
        },
        toolResults: [],
      });
    }

    // 有工具调用，执行工具
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: result.content || "",
      toolCalls: result.toolCalls,
    };
    currentMessages.push(assistantMessage);

    const toolResults: { name: string; result: unknown }[] = [];

    for (const toolCall of result.toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      const toolResult = await executeTool(toolCall.function.name, args, userId, tenantId);

      toolResults.push({
        name: toolCall.function.name,
        result: toolResult,
      });

      currentMessages.push({
        role: "tool",
        content: JSON.stringify(toolResult),
        toolCallId: toolCall.id,
      });
    }

    // 继续循环，让AI总结工具结果
  }

  return NextResponse.json({
    message: {
      role: "assistant",
      content: "抱歉，工具调用次数超出限制，请简化你的请求。",
    },
    toolResults: [],
  });
}

/** 流式响应 */
function handleStreamResponse(
  provider: ReturnType<typeof createAiProvider>,
  messages: ChatMessage[],
  userId: string,
  tenantId: string,
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let currentMessages = [...messages];
        let iterations = 0;

        while (iterations < MAX_TOOL_ITERATIONS) {
          iterations++;

          // 先尝试获取完整结果（含工具调用）
          const result = await provider.chat(currentMessages, AI_TOOLS);

          // 如果有内容，先发送
          if (result.content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "content", content: result.content })}\n\n`),
            );
          }

          // 没有工具调用，结束
          if (!result.toolCalls || result.toolCalls.length === 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
            );
            break;
          }

          // 执行工具调用
          const assistantMessage: ChatMessage = {
            role: "assistant",
            content: result.content || "",
            toolCalls: result.toolCalls,
          };
          currentMessages.push(assistantMessage);

          for (const toolCall of result.toolCalls) {
            const args = JSON.parse(toolCall.function.arguments);

            // 通知前端正在执行工具
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "tool_start", name: toolCall.function.name, args })}\n\n`,
              ),
            );

            const toolResult = await executeTool(toolCall.function.name, args, userId, tenantId);

            // 发送工具结果
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "tool_result", name: toolCall.function.name, result: toolResult })}\n\n`,
              ),
            );

            currentMessages.push({
              role: "tool",
              content: JSON.stringify(toolResult),
              toolCallId: toolCall.id,
            });
          }

          // 继续循环让AI总结
        }

        controller.close();
      } catch (error) {
        console.error("Stream error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: "AI 响应异常" })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** 获取 Provider 配置（优先从数据库读取用户配置） */
async function getProviderConfig(type?: AiProviderType, userId?: string, tenantId?: string) {
  const providerType = type || "zhipu";
  const defaults = PROVIDER_DEFAULTS[providerType];

  let userConfig: { apiKey: string | null; baseUrl: string | null; model: string | null } | null = null;
  if (userId && tenantId) {
    try {
      userConfig = await db.aiProviderConfig.findFirst({
        where: { userId, tenantId, provider: providerType },
        select: { apiKey: true, baseUrl: true, model: true },
        orderBy: { isDefault: 'desc' },
      });
    } catch {
      // ignore
    }
  }

  // apiKey 落库为 AES-256-GCM 密文（见 /api/ai/providers POST），使用前解密。
  // 解密失败（密钥轮换/数据损坏）回退到环境变量，避免阻塞对话。
  let userApiKey: string | null = null;
  if (userConfig?.apiKey) {
    try {
      userApiKey = decryptSecret(userConfig.apiKey);
    } catch {
      userApiKey = null;
    }
  }

  switch (providerType) {
    case "zhipu":
      return {
        type: "zhipu" as const,
        apiKey: userApiKey || process.env.ZHIPU_API_KEY,
        model: userConfig?.model || undefined,
      };
    case "deepseek":
      return {
        type: "deepseek" as const,
        apiKey: userApiKey || process.env.DEEPSEEK_API_KEY,
        baseUrl: userConfig?.baseUrl || undefined,
        model: userConfig?.model || process.env.DEEPSEEK_MODEL,
      };
    case "openai":
      return {
        type: "openai" as const,
        apiKey: userApiKey || process.env.OPENAI_API_KEY,
        baseUrl: userConfig?.baseUrl || process.env.OPENAI_BASE_URL,
        model: userConfig?.model || process.env.OPENAI_MODEL,
      };
    case "ollama":
      return {
        type: "ollama" as const,
        baseUrl: userConfig?.baseUrl || process.env.OLLAMA_BASE_URL || defaults.baseUrl,
        model: userConfig?.model || process.env.OLLAMA_MODEL || defaults.model,
      };
    default:
      return { type: "zhipu" as const };
  }
}
