/**
 * 集成管理器
 * 管理第三方服务集成
 */

// 集成类型
export type IntegrationType =
  | "wecom" // 企业微信
  | "dingtalk" // 钉钉
  | "feishu" // 飞书
  | "github" // GitHub
  | "wechat" // 微信公众号
  | "slack" // Slack
  | "custom"; // 自定义

// 集成状态
export type IntegrationStatus = "active" | "inactive" | "error";

// 集成配置
export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  description?: string;
  status: IntegrationStatus;
  enabled: boolean;
  config: Record<string, any>;
  tenantId: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  errorMessage?: string;
}

// 集成能力
export interface IntegrationCapabilities {
  auth: boolean; // 支持登录认证
  message: boolean; // 支持消息推送
  sync: boolean; // 支持数据同步
  webhook: boolean; // 支持Webhook
}

// 集成提供者接口
export interface IntegrationProvider {
  type: IntegrationType;
  name: string;
  description: string;
  capabilities: IntegrationCapabilities;
  icon?: string;

  // 初始化
  initialize(config: Record<string, any>): Promise<void>;

  // 测试连接
  testConnection(): Promise<boolean>;

  // 发送消息（如果支持）
  sendMessage?(to: string, message: any): Promise<void>;

  // 获取授权URL（如果支持OAuth）
  getAuthUrl?(redirectUri: string, state: string): string;

  // 处理授权回调
  handleAuthCallback?(code: string, state: string): Promise<any>;

  // 同步数据（如果支持）
  syncData?(options?: any): Promise<any>;

  // 处理Webhook
  handleWebhook?(payload: any, signature: string): Promise<any>;
}

// 集成管理器类
export class IntegrationManager {
  private providers: Map<IntegrationType, IntegrationProvider> = new Map();
  private integrations: Map<string, IntegrationConfig> = new Map();

  /**
   * 注册集成提供者
   */
  registerProvider(provider: IntegrationProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * 获取集成提供者
   */
  getProvider(type: IntegrationType): IntegrationProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * 获取所有可用的集成类型
   */
  getAvailableTypes(): Array<{
    type: IntegrationType;
    name: string;
    description: string;
    capabilities: IntegrationCapabilities;
  }> {
    return Array.from(this.providers.values()).map((provider) => ({
      type: provider.type,
      name: provider.name,
      description: provider.description,
      capabilities: provider.capabilities,
    }));
  }

  /**
   * 添加集成配置
   */
  addIntegration(config: IntegrationConfig): void {
    this.integrations.set(config.id, config);
  }

  /**
   * 获取集成配置
   */
  getIntegration(id: string): IntegrationConfig | undefined {
    return this.integrations.get(id);
  }

  /**
   * 获取租户的所有集成
   */
  getIntegrationsByTenant(tenantId: string): IntegrationConfig[] {
    return Array.from(this.integrations.values()).filter(
      (integration) => integration.tenantId === tenantId
    );
  }

  /**
   * 获取启用的集成
   */
  getEnabledIntegrations(tenantId: string): IntegrationConfig[] {
    return this.getIntegrationsByTenant(tenantId).filter(
      (integration) => integration.enabled && integration.status === "active"
    );
  }

  /**
   * 测试集成连接
   */
  async testIntegration(type: IntegrationType, config: Record<string, any>): Promise<boolean> {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Integration provider not found: ${type}`);
    }

    try {
      await provider.initialize(config);
      return await provider.testConnection();
    } catch (error) {
      return false;
    }
  }

  /**
   * 发送消息到所有启用的消息集成
   */
  async sendMessageToAll(tenantId: string, message: any): Promise<{
    success: number;
    failed: number;
    errors: Array<{ type: string; error: string }>;
  }> {
    const integrations = this.getEnabledIntegrations(tenantId).filter(
      (integration) => {
        const provider = this.providers.get(integration.type);
        return provider?.capabilities.message;
      }
    );

    let success = 0;
    let failed = 0;
    const errors: Array<{ type: string; error: string }> = [];

    for (const integration of integrations) {
      const provider = this.providers.get(integration.type);
      if (!provider?.sendMessage) continue;

      try {
        await provider.initialize(integration.config);
        await provider.sendMessage(message.to, message);
        success++;
      } catch (error: any) {
        failed++;
        errors.push({
          type: integration.type,
          error: error.message,
        });
      }
    }

    return { success, failed, errors };
  }
}

// 导出单例
export const integrationManager = new IntegrationManager();
