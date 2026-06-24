/**
 * 文档问答增强模块
 * 支持多文档问答、对话历史、引用来源等功能
 */

import { db } from "@/lib/db";

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
      if (files.length > 3) {
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

  // 检查AI配额
  // TODO: 实现配额检查

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
  // TODO: 实际调用AI模型
  // 这里返回模拟结果
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

  return {
    answer,
    citations,
    confidence: 0.85, // 模拟置信度
    model,
    tokensUsed: estimateTokens(question + answer + context),
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
 */
export async function checkAiQnAQuota(
  userId: string,
  tenantId: string
): Promise<{ available: boolean; remaining: number; limit: number }> {
  // TODO: 实现配额检查
  // 这里返回模拟数据
  return {
    available: true,
    remaining: 100,
    limit: 100,
  };
}

/**
 * 记录AI问答使用
 */
export async function recordAiQnAUsage(
  userId: string,
  tenantId: string,
  tokensUsed: number
): Promise<void> {
  // TODO: 实现使用记录
  console.log(`AI QnA usage: ${userId}, ${tenantId}, ${tokensUsed} tokens`);
}
