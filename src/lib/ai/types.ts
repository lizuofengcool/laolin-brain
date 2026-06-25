/**
 * AI功能增强类型定义
 */

// AI模型类型
export type AIModelType =
  | "text_generation" // 文本生成
  | "text_embedding" // 文本嵌入
  | "image_generation" // 图像生成
  | "image_understanding" // 图像理解
  | "ocr" // OCR识别
  | "speech_to_text" // 语音转文字
  | "text_to_speech"; // 文字转语音

// AI模型状态
export type AIModelStatus = "active" | "inactive" | "error" | "maintenance";

// AI模型配置
export interface AIModelConfig {
  id: string;
  name: string;
  description?: string;
  type: AIModelType;
  provider: string; // 提供商：openai、anthropic、local等
  modelName: string; // 模型名称
  apiKey?: string; // API密钥（加密存储）
  baseUrl?: string; // API基础URL
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  maxRetries?: number;
  timeout?: number; // 毫秒
  status: AIModelStatus;
  isDefault?: boolean;
  costPer1kTokens?: number; // 每1000token成本
  supportedLanguages?: string[];
  capabilities: string[]; // 能力列表
  createdAt: Date;
  updatedAt: Date;
}

// AI对话消息
export interface AIChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  tokens?: number;
  citations?: Citation[]; // 引用来源
  metadata?: Record<string, any>;
}

// 引用来源
export interface Citation {
  fileId: string;
  fileName: string;
  filePath: string;
  pageNumber?: number;
  snippet: string;
  confidence: number; // 0-1
}

// AI对话会话
export interface AIChatSession {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  messages: AIChatMessage[];
  modelId: string;
  systemPrompt?: string;
  contextFiles?: string[]; // 关联的文件ID
  status: "active" | "archived" | "deleted";
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
}

// AI摘要配置
export interface AISummaryConfig {
  length: "short" | "medium" | "long";
  style: "bullet" | "paragraph" | "structured";
  language?: string;
  includeKeyPoints: boolean;
  includeTags: boolean;
  maxLength?: number;
  minLength?: number;
}

// AI标签配置
export interface AITagConfig {
  tagCount: number;
  language?: string;
  includeCategories: boolean;
  includeKeywords: boolean;
  mergeWithExisting: boolean;
}

// AI OCR配置
export interface AIOcrConfig {
  language?: string;
  detectTables: boolean;
  detectFormulas: boolean;
  detectHandwriting: boolean;
  preserveLayout: boolean;
  outputFormat: "text" | "markdown" | "json";
}

// AI图像描述配置
export interface AIImageDescriptionConfig {
  style: "concise" | "detailed" | "creative";
  language?: string;
  includeTags: boolean;
  includeScene: boolean;
  includeObjects: boolean;
  includeText: boolean;
}

// AI搜索配置
export interface AISearchConfig {
  topK: number;
  threshold: number; // 相似度阈值
  hybrid: boolean; // 混合搜索
  rerank: boolean; // 重排序
  expandQuery: boolean; // 查询扩展
}

// AI使用统计
export interface AIUsageStatistics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byFeature: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  quotaUsed: number;
  quotaLimit: number;
  quotaResetAt?: Date;
}

// AI配额配置
export interface AIQuotaConfig {
  dailyLimit: number; // 每日请求数限制
  monthlyLimit: number; // 每月请求数限制
  tokenDailyLimit: number; // 每日token限制
  tokenMonthlyLimit: number; // 每月token限制
  costLimit: number; // 成本限制
  features: Record<string, boolean>; // 功能开关
  models: Record<string, boolean>; // 模型开关
}

// AI创作配置
export interface AICreationConfig {
  type: "generate" | "continue" | "rewrite" | "polish" | "translate" | "summarize";
  style?: string;
  tone?: string;
  length?: "short" | "medium" | "long";
  language?: string;
  targetLanguage?: string;
}

// 内置AI模型模板
export const BUILTIN_MODEL_TEMPLATES: Omit<AIModelConfig, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "GPT-4",
    description: "OpenAI GPT-4 模型，强大的文本生成能力",
    type: "text_generation",
    provider: "openai",
    modelName: "gpt-4",
    maxTokens: 8192,
    temperature: 0.7,
    maxRetries: 3,
    timeout: 60000,
    status: "active",
    costPer1kTokens: 0.03,
    supportedLanguages: ["zh", "en", "ja", "ko"],
    capabilities: [
      "文本生成",
      "对话",
      "摘要",
      "翻译",
      "代码生成",
      "逻辑推理",
    ],
  },
  {
    name: "GPT-3.5 Turbo",
    description: "OpenAI GPT-3.5 Turbo，性价比高",
    type: "text_generation",
    provider: "openai",
    modelName: "gpt-3.5-turbo",
    maxTokens: 4096,
    temperature: 0.7,
    maxRetries: 3,
    timeout: 30000,
    status: "active",
    isDefault: true,
    costPer1kTokens: 0.0015,
    supportedLanguages: ["zh", "en", "ja", "ko"],
    capabilities: [
      "文本生成",
      "对话",
      "摘要",
      "翻译",
      "代码生成",
    ],
  },
  {
    name: "text-embedding-ada-002",
    description: "OpenAI 文本嵌入模型，用于语义搜索",
    type: "text_embedding",
    provider: "openai",
    modelName: "text-embedding-ada-002",
    maxRetries: 3,
    timeout: 30000,
    status: "active",
    costPer1kTokens: 0.0001,
    capabilities: [
      "文本嵌入",
      "语义搜索",
      "相似度计算",
      "聚类",
    ],
  },
  {
    name: "GPT-4 Vision",
    description: "OpenAI GPT-4 视觉模型，支持图像理解",
    type: "image_understanding",
    provider: "openai",
    modelName: "gpt-4-vision-preview",
    maxTokens: 4096,
    temperature: 0.7,
    maxRetries: 3,
    timeout: 60000,
    status: "active",
    costPer1kTokens: 0.03,
    capabilities: [
      "图像描述",
      "OCR识别",
      "图像分析",
      "视觉问答",
    ],
  },
  {
    name: "Claude 3 Opus",
    description: "Anthropic Claude 3 Opus，强大的推理能力",
    type: "text_generation",
    provider: "anthropic",
    modelName: "claude-3-opus-20240229",
    maxTokens: 200000,
    temperature: 0.7,
    maxRetries: 3,
    timeout: 120000,
    status: "active",
    costPer1kTokens: 0.015,
    supportedLanguages: ["zh", "en", "ja", "ko"],
    capabilities: [
      "文本生成",
      "对话",
      "长文档处理",
      "摘要",
      "翻译",
      "逻辑推理",
    ],
  },
];

// AI功能列表
export const AI_FEATURES = [
  {
    id: "summarize",
    name: "文档摘要",
    description: "自动生成文档摘要和关键要点",
    category: "文档处理",
    icon: "file-text",
  },
  {
    id: "ocr",
    name: "OCR识别",
    description: "从图片中提取文字内容",
    category: "图像处理",
    icon: "scan",
  },
  {
    id: "describe",
    name: "图像描述",
    description: "自动生成图片的文字描述",
    category: "图像处理",
    icon: "image",
  },
  {
    id: "generate_tags",
    name: "智能标签",
    description: "自动为文件生成相关标签",
    category: "分类整理",
    icon: "tag",
  },
  {
    id: "chat",
    name: "AI对话",
    description: "与AI对话，提问和交流",
    category: "对话交互",
    icon: "message-square",
  },
  {
    id: "semantic_search",
    name: "语义搜索",
    description: "基于语义的智能搜索",
    category: "搜索",
    icon: "search",
  },
  {
    id: "translate",
    name: "文档翻译",
    description: "翻译文档内容",
    category: "文档处理",
    icon: "languages",
  },
  {
    id: "generate",
    name: "内容生成",
    description: "AI生成各类内容",
    category: "创作",
    icon: "sparkles",
  },
];
