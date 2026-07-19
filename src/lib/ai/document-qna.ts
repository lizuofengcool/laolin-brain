/**
 * 文档问答增强模块
 * 支持多文档问答、对话历史、引用来源等功能
 *
 * 会话持久化：经 Prisma ChatConversation（type='knowledge_qa'）+ ChatMessage 落库，
 * fileIds 存于 ChatConversation.metadata（JSON），citations 存于 ChatMessage.metadata
 * （JSON）。跨用户/租户隔离由查询 where 子句 + 取回后双匹配校验保证。此前为内存 Map
 * （chatSessionsCache），server 重启即丢、多实例不共享，已替换为 Prisma 持久化。
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

// ─── Prisma 行映射到公开接口 ─────────────────────────────

// ChatConversation 行（含 messages include）的结构子集，用于映射到 ChatSession
interface ConversationRow {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: MessageRow[];
}

// ChatMessage 行的结构子集，用于映射到 ChatMessage 接口
interface MessageRow {
  id: string;
  role: string;
  content: string;
  timestamp: Date;
  metadata: string | null;
}

/**
 * 将 Prisma ChatConversation 行映射为 ChatSession 接口。
 * fileIds 从 metadata JSON 解析（损坏时回退空数组）；messages 经 mapMessage 映射。
 */
function mapConversation(row: ConversationRow): ChatSession {
  let fileIds: string[] = [];
  if (row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata) as { fileIds?: string[] };
      fileIds = parsed.fileIds || [];
    } catch {
      // metadata 损坏时回退为空数组
      fileIds = [];
    }
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    title: row.title,
    fileIds,
    messages: (row.messages || []).map(mapMessage),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 将 Prisma ChatMessage 行映射为 ChatMessage 接口。
 * citations 从 metadata JSON 解析（损坏时回退 undefined）；role 强制为联合类型。
 */
function mapMessage(row: MessageRow): ChatMessage {
  let citations: Citation[] | undefined;
  if (row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata) as { citations?: Citation[] };
      citations = parsed.citations;
    } catch {
      citations = undefined;
    }
  }
  return {
    id: row.id,
    role: row.role as ChatMessage["role"],
    content: row.content,
    timestamp: row.timestamp,
    citations,
  };
}

/**
 * 创建新的对话会话
 *
 * 落库到 ChatConversation（type='knowledge_qa'），fileIds 存于 metadata JSON。
 * 标题规则：title 优先透传；无 title 且 fileIds 非空时，查 db.file.findMany（take:3）
 * 拼接文件名作为标题，fileIds.length>3 时追加 "等N个文件" 后缀；无 title 无 fileIds
 * 时标题为 "新对话"。
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

  const created = await db.chatConversation.create({
    data: {
      tenantId,
      userId,
      title: sessionTitle,
      type: "knowledge_qa",
      metadata: JSON.stringify({ fileIds }),
    },
  });

  // 新建会话无消息；mapConversation 对 messages 缺省回退空数组
  return mapConversation({ ...created, messages: [] });
}

/**
 * 获取用户的对话列表
 *
 * 按 tenantId + userId + type='knowledge_qa' + isArchived=false 过滤，updatedAt 倒序，
 * take limit（默认 20）。含 messages（timestamp 升序）以便调用方直接渲染历史。
 */
export async function getChatSessions(
  userId: string,
  tenantId: string,
  limit: number = 20
): Promise<ChatSession[]> {
  const rows = await db.chatConversation.findMany({
    where: { tenantId, userId, type: "knowledge_qa", isArchived: false },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  return rows.map((row) => mapConversation(row as ConversationRow));
}

/**
 * 获取对话详情
 *
 * 按 id 取回（含 messages），再校验 userId/tenantId 双匹配（跨用户/租户隔离）。
 * 不匹配或不存在返回 null。
 */
export async function getChatSession(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<ChatSession | null> {
  const row = await db.chatConversation.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!row || row.userId !== userId || row.tenantId !== tenantId) {
    return null;
  }

  return mapConversation(row as ConversationRow);
}

/**
 * 添加消息到对话
 *
 * 先按 id 取回会话（select userId/tenantId）校验归属，再创建 ChatMessage 行
 * （citations 存于 metadata JSON），最后推进会话 lastMessageAt（updatedAt 由
 * @updatedAt 自动推进）。归属不匹配返回 null。
 */
export async function addChatMessage(
  sessionId: string,
  userId: string,
  tenantId: string,
  message: Omit<ChatMessage, "id" | "timestamp">
): Promise<ChatMessage | null> {
  const session = await db.chatConversation.findUnique({
    where: { id: sessionId },
    select: { userId: true, tenantId: true },
  });

  if (!session || session.userId !== userId || session.tenantId !== tenantId) {
    return null;
  }

  const now = new Date();
  const created = await db.chatMessage.create({
    data: {
      tenantId,
      conversationId: sessionId,
      userId,
      role: message.role,
      content: message.content,
      timestamp: now,
      metadata: message.citations
        ? JSON.stringify({ citations: message.citations })
        : null,
    },
  });

  // 推进会话的 lastMessageAt；updatedAt 由 @updatedAt 自动推进到 now
  await db.chatConversation.update({
    where: { id: sessionId },
    data: { lastMessageAt: now },
  });

  return mapMessage(created as MessageRow);
}

/**
 * 删除对话
 *
 * 先按 id 取回会话（select userId/tenantId）校验归属，再删除会话；ChatMessage 经
 * schema onDelete: Cascade 级联删除。归属不匹配返回 false。
 */
export async function deleteChatSession(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const session = await db.chatConversation.findUnique({
    where: { id: sessionId },
    select: { userId: true, tenantId: true },
  });

  if (!session || session.userId !== userId || session.tenantId !== tenantId) {
    return false;
  }

  await db.chatConversation.delete({ where: { id: sessionId } });
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
