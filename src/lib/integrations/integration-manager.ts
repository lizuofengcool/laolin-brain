/**
 * 第三方集成框架核心模块
 * 支持统一的集成接口、OAuth认证、API密钥管理、Webhook接收等功能
 */

// 集成类型
export type IntegrationType =
  | "wechat-work" // 企业微信
  | "dingtalk" // 钉钉
  | "feishu" // 飞书
  | "wechat-official" // 微信公众号
  | "github" // GitHub
  | "gitlab" // GitLab
  | "aliyun-storage" // 阿里云存储
  | "tencent-storage" // 腾讯云存储
  | "qiniu-storage" // 七牛云存储
  | "custom"; // 自定义

// 集成状态
export type IntegrationStatus = "disconnected" | "connected" | "error" | "expired";

// 认证类型
export type AuthType = "oauth2" | "api-key" | "webhook" | "basic";

// 集成配置
export interface IntegrationConfig {
  [key: string]: string | number | boolean | string[] | object | undefined;
}

// 集成元数据
export interface IntegrationMeta {
  id: IntegrationType | string;
  name: string;
  description: string;
  icon?: string;
  type: IntegrationType;
  category: "communication" | "development" | "storage" | "productivity" | "other";
  authType: AuthType;
  features: string[];
  isOfficial: boolean;
  documentationUrl?: string;
  websiteUrl?: string;
}

// 已连接的集成
export interface ConnectedIntegration {
  id: string;
  integrationId: IntegrationType | string;
  tenantId: string;
  userId: string;
  name: string;
  status: IntegrationStatus;
  config: IntegrationConfig;
  connectedAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date;
  errorMessage?: string;
  expiresAt?: Date;
}

// 同步任务状态
export type SyncTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

// 同步任务
export interface SyncTask {
  id: string;
  integrationId: string;
  tenantId: string;
  type: string; // 同步类型：full, incremental, etc.
  status: SyncTaskStatus;
  progress: number; // 0-100
  totalItems?: number;
  processedItems?: number;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

// 同步日志
export interface SyncLog {
  id: string;
  taskId: string;
  integrationId: string;
  tenantId: string;
  level: "info" | "warning" | "error";
  message: string;
  details?: object;
  createdAt: Date;
}

// Webhook事件
export interface WebhookEvent {
  id: string;
  integrationId: string;
  tenantId: string;
  eventType: string;
  payload: any;
  receivedAt: Date;
  processedAt?: Date;
  status: "pending" | "processed" | "failed";
  errorMessage?: string;
}

/**
 * 集成提供者接口
 */
export interface IntegrationProvider {
  meta: IntegrationMeta;

  // 连接
  connect(config: IntegrationConfig): Promise<ConnectedIntegration>;
  disconnect(integrationId: string): Promise<void>;

  // 状态检查
  checkStatus(integrationId: string): Promise<IntegrationStatus>;

  // 同步
  sync?(integrationId: string, options?: any): Promise<SyncTask>;
  getSyncStatus?(taskId: string): Promise<SyncTask>;

  // Webhook
  handleWebhook?(event: WebhookEvent): Promise<void>;

  // 测试连接
  testConnection?(config: IntegrationConfig): Promise<{ success: boolean; message?: string }>;
}

/**
 * 集成管理器类
 */
export class IntegrationManager {
  private providers = new Map<string, IntegrationProvider>();
  private integrations = new Map<string, ConnectedIntegration>();
  private syncTasks = new Map<string, SyncTask>();
  private webhookEvents = new Map<string, WebhookEvent>();

  constructor() {
    // 初始化
  }

  /**
   * 注册集成提供者
   */
  registerProvider(provider: IntegrationProvider): void {
    this.providers.set(provider.meta.id, provider);
  }

  /**
   * 获取所有可用集成
   */
  getAvailableIntegrations(): IntegrationMeta[] {
    return Array.from(this.providers.values()).map((p) => p.meta);
  }

  /**
   * 获取集成提供者
   */
  getProvider(integrationId: string): IntegrationProvider | undefined {
    return this.providers.get(integrationId);
  }

  /**
   * 连接集成
   */
  async connectIntegration(
    integrationId: string,
    tenantId: string,
    userId: string,
    config: IntegrationConfig
  ): Promise<ConnectedIntegration> {
    const provider = this.providers.get(integrationId);
    if (!provider) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const connected = await provider.connect(config);

    const integration: ConnectedIntegration = {
      id: `${tenantId}-${integrationId}`,
      integrationId,
      tenantId,
      userId,
      name: provider.meta.name,
      status: "connected",
      config,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    this.integrations.set(`${tenantId}-${integrationId}`, integration);

    return integration;
  }

  /**
   * 断开集成
   */
  async disconnectIntegration(
    integrationId: string,
    tenantId: string
  ): Promise<void> {
    const key = `${tenantId}-${integrationId}`;
    const integration = this.integrations.get(key);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not connected`);
    }

    const provider = this.providers.get(integrationId);
    if (provider) {
      await provider.disconnect(integration.id);
    }

    this.integrations.delete(key);
  }

  /**
   * 获取已连接的集成列表
   */
  getConnectedIntegrations(tenantId: string): ConnectedIntegration[] {
    return Array.from(this.integrations.values()).filter(
      (i) => i.tenantId === tenantId
    );
  }

  /**
   * 获取已连接的集成
   */
  getConnectedIntegration(
    integrationId: string,
    tenantId: string
  ): ConnectedIntegration | undefined {
    return this.integrations.get(`${tenantId}-${integrationId}`);
  }

  /**
   * 检查集成状态
   */
  async checkIntegrationStatus(
    integrationId: string,
    tenantId: string
  ): Promise<IntegrationStatus> {
    const integration = this.getConnectedIntegration(integrationId, tenantId);
    if (!integration) {
      return "disconnected";
    }

    const provider = this.providers.get(integrationId);
    if (provider) {
      return await provider.checkStatus(integration.id);
    }

    return integration.status;
  }

  /**
   * 更新集成配置
   */
  updateIntegrationConfig(
    integrationId: string,
    tenantId: string,
    config: IntegrationConfig
  ): ConnectedIntegration {
    const key = `${tenantId}-${integrationId}`;
    const integration = this.integrations.get(key);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not connected`);
    }

    integration.config = { ...integration.config, ...config };
    integration.updatedAt = new Date();

    return integration;
  }

  /**
   * 测试连接
   */
  async testConnection(
    integrationId: string,
    config: IntegrationConfig
  ): Promise<{ success: boolean; message?: string }> {
    const provider = this.providers.get(integrationId);
    if (!provider) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    if (provider.testConnection) {
      return await provider.testConnection(config);
    }

    // 默认测试：检查是否有基本配置
    return { success: Object.keys(config).length > 0 };
  }

  /**
   * 创建同步任务
   */
  async createSyncTask(
    integrationId: string,
    tenantId: string,
    type: string = "full"
  ): Promise<SyncTask> {
    const integration = this.getConnectedIntegration(integrationId, tenantId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not connected`);
    }

    const task: SyncTask = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      integrationId,
      tenantId,
      type,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
    };

    this.syncTasks.set(task.id, task);

    // 异步执行同步
    this.executeSyncTask(task.id, integrationId, tenantId);

    return task;
  }

  /**
   * 执行同步任务（异步）
   */
  private async executeSyncTask(
    taskId: string,
    integrationId: string,
    tenantId: string
  ): Promise<void> {
    const task = this.syncTasks.get(taskId);
    if (!task) return;

    task.status = "running";
    task.startedAt = new Date();

    const provider = this.providers.get(integrationId);

    try {
      if (provider?.sync) {
        await provider.sync(integrationId, { taskId });
      }

      task.status = "completed";
      task.progress = 100;
      task.completedAt = new Date();
    } catch (error: any) {
      task.status = "failed";
      task.errorMessage = error.message;
      task.failedAt = new Date();
    }

    // 更新集成的最后同步时间
    const integration = this.getConnectedIntegration(integrationId, tenantId);
    if (integration) {
      integration.lastSyncAt = new Date();
    }
  }

  /**
   * 获取同步任务状态
   */
  getSyncTask(taskId: string): SyncTask | undefined {
    return this.syncTasks.get(taskId);
  }

  /**
   * 获取集成的同步任务列表
   */
  getSyncTasks(integrationId: string, tenantId: string): SyncTask[] {
    return Array.from(this.syncTasks.values()).filter(
      (t) => t.integrationId === integrationId && t.tenantId === tenantId
    );
  }

  /**
   * 处理Webhook事件
   */
  async handleWebhook(
    integrationId: string,
    tenantId: string,
    eventType: string,
    payload: any
  ): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      id: `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      integrationId,
      tenantId,
      eventType,
      payload,
      receivedAt: new Date(),
      status: "pending",
    };

    this.webhookEvents.set(event.id, event);

    // 异步处理
    const provider = this.providers.get(integrationId);
    if (provider?.handleWebhook) {
      try {
        await provider.handleWebhook(event);
        event.status = "processed";
        event.processedAt = new Date();
      } catch (error: any) {
        event.status = "failed";
        event.errorMessage = error.message;
      }
    } else {
      event.status = "processed";
      event.processedAt = new Date();
    }

    return event;
  }

  /**
   * 获取Webhook事件
   */
  getWebhookEvent(eventId: string): WebhookEvent | undefined {
    return this.webhookEvents.get(eventId);
  }
}

// 全局集成管理器实例
export const integrationManager = new IntegrationManager();

/**
 * 内置集成定义（预留接口）
 */
export const BUILTIN_INTEGRATIONS: IntegrationMeta[] = [
  // 企业微信
  {
    id: "wechat-work",
    name: "企业微信",
    description: "集成企业微信，支持消息通知、通讯录同步等功能",
    icon: "message-circle",
    type: "wechat-work",
    category: "communication",
    authType: "api-key",
    features: ["消息通知", "通讯录同步", "文件分享", "审批通知"],
    isOfficial: true,
    documentationUrl: "https://developer.work.weixin.qq.com/",
  },

  // 钉钉
  {
    id: "dingtalk",
    name: "钉钉",
    description: "集成钉钉，支持消息通知、审批、文件同步等功能",
    icon: "bell",
    type: "dingtalk",
    category: "communication",
    authType: "oauth2",
    features: ["消息通知", "审批通知", "文件同步", "日程同步"],
    isOfficial: true,
    documentationUrl: "https://open.dingtalk.com/",
  },

  // 飞书
  {
    id: "feishu",
    name: "飞书",
    description: "集成飞书，支持消息通知、文档协作、日历同步等功能",
    icon: "send",
    type: "feishu",
    category: "communication",
    authType: "oauth2",
    features: ["消息通知", "文档协作", "日历同步", "审批通知"],
    isOfficial: true,
    documentationUrl: "https://open.feishu.cn/",
  },

  // 微信公众号
  {
    id: "wechat-official",
    name: "微信公众号",
    description: "集成微信公众号，支持消息推送、用户管理等功能",
    icon: "message-square",
    type: "wechat-official",
    category: "communication",
    authType: "api-key",
    features: ["消息推送", "用户管理", "素材管理", "菜单管理"],
    isOfficial: true,
    documentationUrl: "https://developers.weixin.qq.com/doc/",
  },

  // GitHub
  {
    id: "github",
    name: "GitHub",
    description: "集成GitHub，支持代码仓库同步、Issue管理等功能",
    icon: "github",
    type: "github",
    category: "development",
    authType: "oauth2",
    features: ["仓库同步", "Issue管理", "PR通知", "代码搜索"],
    isOfficial: true,
    documentationUrl: "https://docs.github.com/en/rest",
  },

  // GitLab
  {
    id: "gitlab",
    name: "GitLab",
    description: "集成GitLab，支持代码仓库同步、CI/CD等功能",
    icon: "git-branch",
    type: "gitlab",
    category: "development",
    authType: "oauth2",
    features: ["仓库同步", "Issue管理", "CI/CD通知", "代码搜索"],
    isOfficial: true,
    documentationUrl: "https://docs.gitlab.com/ee/api/",
  },

  // 阿里云存储
  {
    id: "aliyun-storage",
    name: "阿里云OSS",
    description: "集成阿里云对象存储，支持文件存储和CDN加速",
    icon: "cloud",
    type: "aliyun-storage",
    category: "storage",
    authType: "api-key",
    features: ["文件存储", "CDN加速", "图片处理", "数据备份"],
    isOfficial: true,
    documentationUrl: "https://help.aliyun.com/product/oss/",
  },

  // 腾讯云存储
  {
    id: "tencent-storage",
    name: "腾讯云COS",
    description: "集成腾讯云对象存储，支持文件存储和CDN加速",
    icon: "cloud-upload",
    type: "tencent-storage",
    category: "storage",
    authType: "api-key",
    features: ["文件存储", "CDN加速", "图片处理", "数据备份"],
    isOfficial: true,
    documentationUrl: "https://cloud.tencent.com/product/cos",
  },
];
