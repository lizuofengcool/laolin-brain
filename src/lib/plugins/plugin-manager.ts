/**
 * 插件系统核心模块
 * 支持插件生命周期管理、加载、配置、权限控制等功能
 */

import { db } from "@/lib/db";

// 插件类型
export type PluginType = "feature" | "theme" | "integration" | "ai";

// 插件状态
export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

// 插件权限
export type PluginPermission =
  | "file:read"
  | "file:write"
  | "file:delete"
  | "folder:read"
  | "folder:write"
  | "user:read"
  | "settings:read"
  | "settings:write"
  | "ai:use"
  | "storage:read"
  | "storage:write"
  | "webhook:receive"
  | "api:access";

// 插件元数据
export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  icon?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  categories?: string[];
  tags?: string[];
  screenshotUrls?: string[];
}

// 插件配置
export interface PluginConfig {
  [key: string]: string | number | boolean | string[] | object | undefined;
}

// 插件定义
export interface PluginDefinition {
  meta: PluginMeta;
  permissions: PluginPermission[];
  configSchema?: object; // JSON Schema for config validation
  defaultConfig?: PluginConfig;
}

// 已安装的插件实例
export interface InstalledPlugin {
  id: string;
  pluginId: string;
  tenantId: string;
  userId: string;
  name: string;
  version: string;
  type: PluginType;
  status: PluginStatus;
  config: PluginConfig;
  installedAt: Date;
  updatedAt: Date;
  enabledAt?: Date;
  errorMessage?: string;
}

// 插件市场项
export interface PluginMarketItem {
  meta: PluginMeta;
  rating: number;
  downloadCount: number;
  installedCount: number;
  isOfficial: boolean;
  isFeatured: boolean;
  lastUpdated: Date;
}

// 插件生命周期钩子
export interface PluginLifecycle {
  onInstall?: (config: PluginConfig) => Promise<void>;
  onUninstall?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
  onUpdate?: (oldVersion: string, newVersion: string) => Promise<void>;
  onConfigChange?: (newConfig: PluginConfig) => Promise<void>;
}

// 插件API接口（提供给插件调用的API）
export interface PluginAPI {
  // 文件操作
  getFiles: (options?: any) => Promise<any[]>;
  getFile: (fileId: string) => Promise<any>;
  createFile: (data: any) => Promise<any>;
  updateFile: (fileId: string, data: any) => Promise<any>;
  deleteFile: (fileId: string) => Promise<void>;

  // 文件夹操作
  getFolders: (options?: any) => Promise<any[]>;
  createFolder: (data: any) => Promise<any>;

  // 搜索
  search: (query: string, options?: any) => Promise<any[]>;

  // AI功能
  aiSummarize: (fileId: string) => Promise<any>;
  aiOcr: (fileId: string) => Promise<any>;
  aiDescribe: (fileId: string) => Promise<any>;

  // 设置
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<any>;

  // 存储
  getStorage: (key: string) => Promise<any>;
  setStorage: (key: string, value: any) => Promise<void>;

  // 事件
  on: (event: string, handler: Function) => void;
  off: (event: string, handler: Function) => void;
  emit: (event: string, data: any) => void;
}

/**
 * 插件管理器类
 */
export class PluginManager {
  private plugins = new Map<string, PluginDefinition & PluginLifecycle>();
  private installedPlugins = new Map<string, InstalledPlugin>();
  private eventListeners = new Map<string, Set<Function>>();

  constructor() {
    // 初始化
  }

  /**
   * 注册插件定义
   */
  registerPlugin(plugin: PluginDefinition & PluginLifecycle): void {
    this.plugins.set(plugin.meta.id, plugin);
  }

  /**
   * 获取所有可用插件
   */
  getAvailablePlugins(): PluginDefinition[] {
    return Array.from(this.plugins.values()).map((p) => ({
      meta: p.meta,
      permissions: p.permissions,
      configSchema: p.configSchema,
      defaultConfig: p.defaultConfig,
    }));
  }

  /**
   * 获取插件定义
   */
  getPluginDefinition(pluginId: string): (PluginDefinition & PluginLifecycle) | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * 安装插件
   */
  async installPlugin(
    pluginId: string,
    tenantId: string,
    userId: string,
    config?: PluginConfig
  ): Promise<InstalledPlugin> {
    const pluginDef = this.plugins.get(pluginId);
    if (!pluginDef) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // 检查是否已安装
    const existing = this.installedPlugins.get(`${tenantId}-${pluginId}`);
    if (existing) {
      throw new Error(`Plugin ${pluginId} already installed`);
    }

    // 使用默认配置
    const pluginConfig = config || pluginDef.defaultConfig || {};

    // 调用安装钩子
    if (pluginDef.onInstall) {
      await pluginDef.onInstall(pluginConfig);
    }

    const installedPlugin: InstalledPlugin = {
      id: `${tenantId}-${pluginId}`,
      pluginId,
      tenantId,
      userId,
      name: pluginDef.meta.name,
      version: pluginDef.meta.version,
      type: pluginDef.meta.type,
      status: "installed",
      config: pluginConfig,
      installedAt: new Date(),
      updatedAt: new Date(),
    };

    this.installedPlugins.set(`${tenantId}-${pluginId}`, installedPlugin);

    return installedPlugin;
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(
    pluginId: string,
    tenantId: string
  ): Promise<void> {
    const key = `${tenantId}-${pluginId}`;
    const installed = this.installedPlugins.get(key);
    if (!installed) {
      throw new Error(`Plugin ${pluginId} not installed`);
    }

    const pluginDef = this.plugins.get(pluginId);

    // 调用卸载钩子
    if (pluginDef?.onUninstall) {
      await pluginDef.onUninstall();
    }

    this.installedPlugins.delete(key);
  }

  /**
   * 启用插件
   */
  async enablePlugin(
    pluginId: string,
    tenantId: string
  ): Promise<InstalledPlugin> {
    const key = `${tenantId}-${pluginId}`;
    const installed = this.installedPlugins.get(key);
    if (!installed) {
      throw new Error(`Plugin ${pluginId} not installed`);
    }

    if (installed.status === "enabled") {
      return installed;
    }

    const pluginDef = this.plugins.get(pluginId);

    // 调用启用钩子
    if (pluginDef?.onEnable) {
      try {
        await pluginDef.onEnable();
      } catch (error: any) {
        installed.status = "error";
        installed.errorMessage = error.message;
        return installed;
      }
    }

    installed.status = "enabled";
    installed.enabledAt = new Date();
    installed.updatedAt = new Date();
    installed.errorMessage = undefined;

    return installed;
  }

  /**
   * 禁用插件
   */
  async disablePlugin(
    pluginId: string,
    tenantId: string
  ): Promise<InstalledPlugin> {
    const key = `${tenantId}-${pluginId}`;
    const installed = this.installedPlugins.get(key);
    if (!installed) {
      throw new Error(`Plugin ${pluginId} not installed`);
    }

    if (installed.status === "disabled") {
      return installed;
    }

    const pluginDef = this.plugins.get(pluginId);

    // 调用禁用钩子
    if (pluginDef?.onDisable) {
      await pluginDef.onDisable();
    }

    installed.status = "disabled";
    installed.updatedAt = new Date();

    return installed;
  }

  /**
   * 更新插件配置
   */
  async updatePluginConfig(
    pluginId: string,
    tenantId: string,
    config: PluginConfig
  ): Promise<InstalledPlugin> {
    const key = `${tenantId}-${pluginId}`;
    const installed = this.installedPlugins.get(key);
    if (!installed) {
      throw new Error(`Plugin ${pluginId} not installed`);
    }

    const pluginDef = this.plugins.get(pluginId);

    // 调用配置变更钩子
    if (pluginDef?.onConfigChange) {
      await pluginDef.onConfigChange(config);
    }

    installed.config = { ...installed.config, ...config };
    installed.updatedAt = new Date();

    return installed;
  }

  /**
   * 获取已安装的插件列表
   */
  getInstalledPlugins(tenantId: string): InstalledPlugin[] {
    return Array.from(this.installedPlugins.values()).filter(
      (p) => p.tenantId === tenantId
    );
  }

  /**
   * 获取已安装的插件
   */
  getInstalledPlugin(
    pluginId: string,
    tenantId: string
  ): InstalledPlugin | undefined {
    return this.installedPlugins.get(`${tenantId}-${pluginId}`);
  }

  /**
   * 检查插件是否启用
   */
  isPluginEnabled(pluginId: string, tenantId: string): boolean {
    const installed = this.installedPlugins.get(`${tenantId}-${pluginId}`);
    return installed?.status === "enabled";
  }

  /**
   * 检查插件权限
   */
  checkPluginPermission(
    pluginId: string,
    permission: PluginPermission
  ): boolean {
    const pluginDef = this.plugins.get(pluginId);
    if (!pluginDef) return false;
    return pluginDef.permissions.includes(permission);
  }

  /**
   * 事件系统
   */
  on(event: string, handler: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Plugin event handler error for ${event}:`, error);
      }
    });
  }
}

// 全局插件管理器实例
export const pluginManager = new PluginManager();

/**
 * 内置插件列表（示例）
 */
export const BUILTIN_PLUGINS: (PluginDefinition & PluginLifecycle)[] = [
  // 示例：AI增强插件
  {
    meta: {
      id: "ai-enhanced",
      name: "AI增强",
      version: "1.0.0",
      description: "增强AI功能，提供更多AI能力",
      author: "Official",
      type: "ai",
      icon: "sparkles",
      keywords: ["ai", "智能", "增强"],
      categories: ["AI"],
    },
    permissions: ["ai:use", "file:read", "storage:read", "storage:write"],
    defaultConfig: {
      autoSummarize: true,
      autoOcr: false,
      model: "default",
    },
  },

  // 示例：云存储集成插件
  {
    meta: {
      id: "cloud-storage",
      name: "云存储扩展",
      version: "1.0.0",
      description: "支持更多云存储服务",
      author: "Official",
      type: "integration",
      icon: "cloud",
      keywords: ["云存储", "阿里云", "腾讯云"],
      categories: ["集成"],
    },
    permissions: ["storage:read", "storage:write", "file:read", "file:write"],
    defaultConfig: {
      providers: ["aliyun", "tencent"],
      autoSync: false,
    },
  },

  // 示例：暗色主题插件
  {
    meta: {
      id: "dark-theme",
      name: "深色主题",
      version: "1.0.0",
      description: "优雅的深色主题",
      author: "Official",
      type: "theme",
      icon: "moon",
      keywords: ["主题", "深色", "暗色"],
      categories: ["主题"],
    },
    permissions: [],
    defaultConfig: {
      accentColor: "#3b82f6",
      borderRadius: "medium",
    },
  },
];

// 初始化内置插件
for (const plugin of BUILTIN_PLUGINS) {
  pluginManager.registerPlugin(plugin);
}
