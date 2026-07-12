/**
 * 文档问答增强模块
 * 支持多文档问答、对话历史、引用来源等功能
 */

import { db } from "@/lib/db";
import { incrementTenantAiUsage } from "./ai-processor";

// 对话消息类型
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  citations?: Citation[]; // 引用来源
}

// 引用来源
export interface Citation {
  fileId: string;
  fileName: string;
  snippet: string; // 引用的片段
  page?: number;
  score?: number;
}

// 对话会话
export interface ChatSession {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  fileIds: string[]; // 关联的文件ID
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// 问答选项
export interface QnAOptions {
  fileIds?: string[]; // 指定问答的文件
  model?: string; // AI模型
  temperature?: number; // 温度参数
  maxTokens?: number; // 最大token数
  includeCitations?: boolean; // 是否包含引用
  stream?: boolean; // 是否流式响应
}

// 问答结果
export interface QnAResult {
  answer: string;
  citations: Citation[];
  confidence: number; // 置信度
  model: string;
  tokensUsed: number;
}

/**
 * 创建新的对话会话
 */
export async function createChatSession(
  userId: string,
  tenantId: string,
  fileIds: string[] = [],
  title?: string
): Promise<ChatSession> {
  // 生成默认标题
  let sessionTitle = title || "新对话";
  if (!title && fileIds.length > 0) {
    const files = await db.file.findMany({
      where: { id: { in: fileIds }, tenantId, userId },
      select: { fileName: true },
      take: 3,
    });
    if (files.length > 0) {
      sessionTitle = files.map((f) => f.fileName).join(", ");
      // db.file.findMany take:3 致 files.length ≤ 3，这里以 fileIds.length 判断
      // 用户选中的文件数是否超过展示阈值，超过则在标题后追加 "等N个文件"
      if (fileIds.length > 3) {
        sessionTitle += ` 等${fileIds.length}个文件`;
      }
    }
  }

  // 创建会话（注意：这里使用内存存储，实际应该用数据库）
  // 由于Prisma schema可能没有ChatSession模型，我们先使用内存存储
  // 实际项目中应该添加到Prisma schema中

  const session: ChatSession = {
    id: generateId(),
    tenantId,
    userId,
    title: sessionTitle,
    fileIds,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 保存到内存缓存（实际应该存数据库）
  chatSessionsCache.set(session.id, session);

  return session;
}

// 内存缓存（临时方案，实际应该用数据库）
const chatSessionsCache = new Map<string, ChatSession>();

/**
 * 获取用户的对话列表
 */
export async function getChatSessions(
  userId: string,
  tenantId: string,
  limit: number = 20
): Promise<ChatSession[]> {
  // 从缓存中获取（实际应该从数据库查询）
  const sessions = Array.from(chatSessionsCache.values())
    .filter((s) => s.userId === userId && s.tenantId === tenantId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);

  return sessions;
}

/**
 * 获取对话详情
 */
export async function getChatSession(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<ChatSession | null> {
  const session = chatSessionsCache.get(sessionId);

  if (!session || session.userId !== userId || session.tenantId !== tenantId) {
    return null;
  }

  return session;
}

/**
 * 添加消息到对话
 */
export async function addChatMessage(
  sessionId: string,
  userId: string,
  tenantId: string,
  message: Omit<ChatMessage, "id" | "timestamp">
): Promise<ChatMessage | null> {
  const session = chatSessionsCache.get(sessionId);

  if (!session || session.userId !== userId || session.tenantId !== tenantId) {
    return null;
  }

  const newMessage: ChatMessage = {
    ...message,
    id: generateId(),
    timestamp: new Date(),
  };

  session.messages.push(newMessage);
  session.updatedAt = new Date();

  return newMessage;
}

/**
 * 删除对话
 */
export async function deleteChatSession(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const session = chatSessionsCache.get(sessionId);

  if (!session || session.userId !== userId || session.tenantId !== tenantId) {
    return false;
  }

  chatSessionsCache.delete(sessionId);
  return true;
}

/**
 * 文档问答
 */
export async function askQuestion(
  question: string,
  userId: string,
  tenantId: string,
  options: QnAOptions = {}
): Promise<QnAResult> {
  const {
    fileIds = [],
    includeCitations = true,
    model = "default",
  } = options;

  // 检查AI配额：复用租户级配额机制（Tenant.aiUsed/aiQuota/aiResetDate），
  // 与 summarize/ocr/describe/generate-tags 四类 AI 路由同口径。配额耗尽时抛错，
  // 由调用方（路由层）捕获并返回 429。checkAiQnAQuota 在窗口过期时负责重置 aiUsed。
  const quota = await checkAiQnAQuota(userId, tenantId);
  if (!quota.available) {
    throw new Error("AI配额已用完，请明天再试或升级套餐");
  }

  // 检索相关文档片段
  const relevantDocs = await retrieveRelevantDocuments(
    question,
    userId,
    tenantId,
    fileIds
  );

  // 构建提示词
  const context = buildContext(relevantDocs);
  const prompt = buildPrompt(question, context);

  // 调用AI模型
  // TODO: 实际调用AI模型（需接入外部模型 API，属功能完整性缺口，待模型 SDK 接入后落地）
  // 当前返回基于检索文档的模拟结果，配额校验与用量记录已真实生效
  const answer = generateMockAnswer(question, relevantDocs);

  // 构建引用
  const citations: Citation[] = includeCitations
    ? relevantDocs.slice(0, 3).map((doc) => ({
        fileId: doc.fileId,
        fileName: doc.fileName,
        snippet: doc.snippet,
        score: doc.score,
      }))
    : [];

  const tokensUsed = estimateTokens(question + answer + context);

  // 记录AI问答使用：原子自增 Tenant.aiUsed + 写 AiUsageLog(operation='qna') 明细，
  // 与四类 AI 路由的 incrementTenantAiUsage 同机制，保证租户配额计数与审计日志一致。
  // tokensUsed 当前仅计次（AiUsageLog schema 无 tokens 字段），待 schema 扩展后落库。
  await recordAiQnAUsage(userId, tenantId, tokensUsed);

  return {
    answer,
    citations,
    confidence: 0.85, // 模拟置信度
    model,
    tokensUsed,
  };
}

/**
 * 检索相关文档
 */
async function retrieveRelevantDocuments(
  question: string,
  userId: string,
  tenantId: string,
  fileIds: string[]
): Promise<Array<{ fileId: string; fileName: string; snippet: string; score: number }>> {
  // 简单的关键词匹配检索
  // 实际应该使用向量搜索

  const where: any = {
    tenantId,
    userId,
    isDeleted: false,
  };

  if (fileIds.length > 0) {
    where.id = { in: fileIds };
  }

  // 搜索包含关键词的文件
  const keywords = question
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5);

  const files = await db.file.findMany({
    where: {
      ...where,
      OR: keywords.map((keyword) => ({
        fileName: { contains: keyword, mode: "insensitive" },
      })),
    },
    take: 10,
  });

  // 生成模拟的相关片段
  return files.map((file, index) => ({
    fileId: file.id,
    fileName: file.fileName,
    snippet: file.summary || `这是 ${file.fileName} 中的相关内容片段...`,
    score: 1 - index * 0.1, // 模拟分数递减
  }));
}

/**
 * 构建上下文
 */
function buildContext(
  docs: Array<{ fileId: string; fileName: string; snippet: string }>
): string {
  return docs
    .map((doc, index) => `[文档${index + 1}: ${doc.fileName}]\n${doc.snippet}`)
    .join("\n\n");
}

/**
 * 构建提示词
 */
function buildPrompt(question: string, context: string): string {
  return `请根据以下文档内容回答问题。

文档内容：
${context}

问题：${question}

请基于文档内容回答，如果文档中没有相关信息，请说明。回答时请引用相关文档。`;
}

/**
 * 生成模拟答案
 */
function generateMockAnswer(
  question: string,
  docs: Array<{ fileId: string; fileName: string; snippet: string }>
): string {
  if (docs.length === 0) {
    return "抱歉，我没有找到相关的文档来回答你的问题。你可以尝试上传更多相关文档，或者换一个问题。";
  }

  const docNames = docs.slice(0, 3).map((d) => d.fileName).join("、");

  return `根据 ${docNames} 等文档，关于"${question}"的回答如下：

这是一个基于文档内容的智能回答。在实际使用中，系统会分析相关文档的内容，提取关键信息，并生成准确的回答。回答会包含引用来源，方便你追溯原始文档。

**主要要点：**
1. 基于相关文档的内容进行回答
2. 支持多文档信息整合
3. 提供引用来源便于验证
4. 支持追问和上下文对话

你可以继续提问，我会基于对话上下文给出更准确的回答。`;
}

/**
 * 估算token数
 */
function estimateTokens(text: string): number {
  // 简单估算：中文约1.5字一个token，英文约4字符一个token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 生成ID
 */
function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
  );
}

/**
 * 检查AI配额
 *
 * 复用租户级 AI 配额机制（Tenant.aiQuota / aiUsed / aiResetDate），与
 * checkAiQuotaAndTenant 同口径：窗口（aiResetDate）过期或未设置时重置 aiUsed=0
 * 并把 aiResetDate 推进 24h，保证过期窗口不会让配额永久卡死；随后按
 * aiUsed >= aiQuota 判定是否可用。
 *
 * 注意：本函数为租户级配额校验（与 summarize/ocr/describe/tags 四类 AI 路由一致），
 * userId 仅用于日志上下文保留入参语义，不参与用户级配额判定。
 *
 * @returns available 是否还可调用；remaining 剩余次数；limit 租户配额上限
 */
export async function checkAiQnAQuota(
  userId: string,
  tenantId: string
): Promise<{ available: boolean; remaining: number; limit: number }> {
  // userId 当前仅用于审计上下文保留，租户级配额不按用户拆分
  void userId;

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { aiQuota: true, aiUsed: true, aiResetDate: true, status: true },
  });

  // 租户不存在或已停用：不可用，配额上限按 0 报告
  if (!tenant || tenant.status !== "active") {
    return { available: false, remaining: 0, limit: 0 };
  }

  const limit = tenant.aiQuota;
  const now = new Date();

  // 窗口过期或未设置：重置 aiUsed 并把 aiResetDate 推进 24h（与 checkAiQuotaAndTenant 一致），
  // 避免过期窗口残留的 aiUsed 永久卡死配额。重置后按 aiUsed=0 口径计算剩余。
  if (!tenant.aiResetDate || tenant.aiResetDate < now) {
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        aiUsed: 0,
        aiResetDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    return { available: limit > 0, remaining: limit, limit };
  }

  const remaining = Math.max(0, limit - tenant.aiUsed);
  return { available: remaining > 0, remaining, limit };
}

/**
 * 记录AI问答使用
 *
 * 经 incrementTenantAiUsage 在单个事务内原子自增 Tenant.aiUsed 并写 AiUsageLog
 * 明细（operation='qna'），与四类 AI 路由同机制，保证配额计数与审计日志一致。
 * tokensUsed 当前仅计次（AiUsageLog schema 无 tokens 字段），保留入参语义待
 * schema 扩展后落库。
 */
export async function recordAiQnAUsage(
  userId: string,
  tenantId: string,
  tokensUsed: number
): Promise<void> {
  // tokensUsed 当前未落库（schema 无 tokens 字段），保留入参待 schema 扩展
  void tokensUsed;
  await incrementTenantAiUsage(tenantId, "qna", userId);
}
