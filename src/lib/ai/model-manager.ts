/**
 * AI模型管理器
 * 负责AI模型的配置、选择和调用
 */

import {
  AIModelConfig,
  AIModelType,
  AIUsageStatistics,
  AIQuotaConfig,
  AIChatMessage,
  AIChatSession,
} from "./types";

/**
 * AI模型管理器类
 */
export class AIModelManager {
  private models: Map<string, AIModelConfig> = new Map();
  private defaultModelId?: string;
  private usageStatistics: AIUsageStatistics;

  constructor() {
    this.usageStatistics = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byFeature: {},
      byDay: [],
      quotaUsed: 0,
      quotaLimit: 1000, // 默认1000次/天
    };
  }

  /**
   * 注册模型
   */
  registerModel(model: AIModelConfig): void {
    this.models.set(model.id, model);

    if (model.isDefault) {
      this.defaultModelId = model.id;
    }
  }

  /**
   * 获取模型
   */
  getModel(modelId: string): AIModelConfig | undefined {
    return this.models.get(modelId);
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(type?: AIModelType): AIModelConfig | undefined {
    if (type) {
      // 查找指定类型的默认模型
      const modelsOfType = this.getModelsByType(type);
      return modelsOfType.find((m) => m.isDefault) || modelsOfType[0];
    }

    if (this.defaultModelId) {
      return this.models.get(this.defaultModelId);
    }

    // 返回第一个活跃的模型
    return Array.from(this.models.values()).find((m) => m.status === "active");
  }

  /**
   * 按类型获取模型列表
   */
  getModelsByType(type: AIModelType): AIModelConfig[] {
    return Array.from(this.models.values()).filter(
      (m) => m.type === type && m.status === "active"
    );
  }

  /**
   * 获取所有模型
   */
  getAllModels(): AIModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * 更新模型配置
   */
  updateModel(modelId: string, updates: Partial<AIModelConfig>): boolean {
    const model = this.models.get(modelId);

    if (!model) {
      return false;
    }

    this.models.set(modelId, {
      ...model,
      ...updates,
      updatedAt: new Date(),
    });

    return true;
  }

  /**
   * 删除模型
   */
  deleteModel(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  /**
   * 设置默认模型
   */
  setDefaultModel(modelId: string): boolean {
    const model = this.models.get(modelId);

    if (!model || model.status !== "active") {
      return false;
    }

    // 取消其他模型的默认状态
    for (const [id, m] of this.models) {
      if (m.isDefault) {
        this.models.set(id, { ...m, isDefault: false });
      }
    }

    this.models.set(modelId, { ...model, isDefault: true });
    this.defaultModelId = modelId;

    return true;
  }

  /**
   * 测试模型连接
   */
  async testModel(modelId: string): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const model = this.models.get(modelId);

    if (!model) {
      return { success: false, error: "模型不存在" };
    }

    const startTime = Date.now();

    try {
      // TODO: 实际调用模型API进行测试
      // 这里模拟测试
      await new Promise((resolve) => setTimeout(resolve, 100));

      const latency = Date.now() - startTime;

      return {
        success: true,
        latency,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 记录使用统计
   */
  recordUsage(
    modelId: string,
    feature: string,
    tokens: number,
    cost: number
  ): void {
    this.usageStatistics.totalRequests++;
    this.usageStatistics.totalTokens += tokens;
    this.usageStatistics.totalCost += cost;
    this.usageStatistics.quotaUsed++;

    // 按模型统计
    if (!this.usageStatistics.byModel[modelId]) {
      this.usageStatistics.byModel[modelId] = {
        requests: 0,
        tokens: 0,
        cost: 0,
      };
    }
    this.usageStatistics.byModel[modelId].requests++;
    this.usageStatistics.byModel[modelId].tokens += tokens;
    this.usageStatistics.byModel[modelId].cost += cost;

    // 按功能统计
    if (!this.usageStatistics.byFeature[feature]) {
      this.usageStatistics.byFeature[feature] = {
        requests: 0,
        tokens: 0,
        cost: 0,
      };
    }
    this.usageStatistics.byFeature[feature].requests++;
    this.usageStatistics.byFeature[feature].tokens += tokens;
    this.usageStatistics.byFeature[feature].cost += cost;

    // 按天统计
    const today = new Date().toISOString().split("T")[0];
    const dayStats = this.usageStatistics.byDay.find(
      (d) => d.date === today
    );

    if (dayStats) {
      dayStats.requests++;
      dayStats.tokens += tokens;
      dayStats.cost += cost;
    } else {
      this.usageStatistics.byDay.push({
        date: today,
        requests: 1,
        tokens,
        cost,
      });
    }
  }

  /**
   * 获取使用统计
   */
  getUsageStatistics(): AIUsageStatistics {
    return { ...this.usageStatistics };
  }

  /**
   * 检查配额
   */
  checkQuota(): {
    available: boolean;
    used: number;
    limit: number;
    remaining: number;
  } {
    const { quotaUsed, quotaLimit } = this.usageStatistics;
    return {
      available: quotaUsed < quotaLimit,
      used: quotaUsed,
      limit: quotaLimit,
      remaining: Math.max(0, quotaLimit - quotaUsed),
    };
  }

  /**
   * 重置每日配额
   */
  resetDailyQuota(): void {
    this.usageStatistics.quotaUsed = 0;
    this.usageStatistics.quotaResetAt = new Date();
  }

  /**
   * 生成文本
   */
  async generateText(
    prompt: string,
    options?: {
      modelId?: string;
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      stream?: boolean;
    }
  ): Promise<{
    text: string;
    model: string;
    tokens: number;
    cost: number;
  }> {
    const model = options?.modelId
      ? this.getModel(options.modelId)
      : this.getDefaultModel("text_generation");

    if (!model) {
      throw new Error("没有可用的文本生成模型");
    }

    // TODO: 实际调用模型API
    // 这里模拟生成
    const tokens = Math.ceil(prompt.length / 4);
    const cost = (tokens / 1000) * (model.costPer1kTokens || 0);

    this.recordUsage(model.id, "text_generation", tokens, cost);

    return {
      text: "这是AI生成的文本内容...",
      model: model.modelName,
      tokens,
      cost,
    };
  }

  /**
   * 生成嵌入向量
   */
  async generateEmbedding(
    text: string,
    options?: {
      modelId?: string;
    }
  ): Promise<{
    embedding: number[];
    model: string;
    tokens: number;
    cost: number;
  }> {
    const model = options?.modelId
      ? this.getModel(options.modelId)
      : this.getDefaultModel("text_embedding");

    if (!model) {
      throw new Error("没有可用的文本嵌入模型");
    }

    // TODO: 实际调用模型API
    // 这里模拟生成
    const tokens = Math.ceil(text.length / 4);
    const cost = (tokens / 1000) * (model.costPer1kTokens || 0);

    this.recordUsage(model.id, "embedding", tokens, cost);

    return {
      embedding: new Array(1536).fill(0).map(() => Math.random() - 0.5),
      model: model.modelName,
      tokens,
      cost,
    };
  }

  /**
   * 创建对话会话
   */
  createChatSession(
    tenantId: string,
    userId: string,
    options?: {
      title?: string;
      modelId?: string;
      systemPrompt?: string;
    }
  ): AIChatSession {
    const model = options?.modelId
      ? this.getModel(options.modelId)
      : this.getDefaultModel("text_generation");

    return {
      id: `chat-${Date.now()}`,
      tenantId,
      userId,
      title: options?.title || "新对话",
      messages: [],
      modelId: model?.id || "",
      systemPrompt: options?.systemPrompt,
      status: "active",
      totalTokens: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 发送对话消息
   */
  async sendChatMessage(
    session: AIChatSession,
    userMessage: string
  ): Promise<AIChatMessage> {
    const model = this.getModel(session.modelId);

    if (!model) {
      throw new Error("模型不存在");
    }

    // TODO: 实际调用模型API
    // 这里模拟回复
    const tokens = Math.ceil(userMessage.length / 4);
    const cost = (tokens / 1000) * (model.costPer1kTokens || 0);

    this.recordUsage(model.id, "chat", tokens, cost);

    const assistantMessage: AIChatMessage = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: "这是AI的回复内容...",
      timestamp: new Date(),
      model: model.modelName,
      tokens,
    };

    return assistantMessage;
  }

  /**
   * 获取支持的功能列表
   */
  getSupportedFeatures(): string[] {
    const features = new Set<string>();

    for (const model of this.models.values()) {
      if (model.status === "active") {
        model.capabilities.forEach((c) => features.add(c));
      }
    }

    return Array.from(features);
  }

  /**
   * 检查功能是否可用
   */
  isFeatureAvailable(feature: string): boolean {
    return this.getSupportedFeatures().includes(feature);
  }
}

// 导出单例
export const aiModelManager = new AIModelManager();
