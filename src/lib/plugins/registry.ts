import type {
  PluginManifest,
  PluginInstance,
  PluginAPI,
  PluginInfo,
  PluginStatus,
  PluginPermission,
  MenuItem,
  SidebarPanel,
  FileAction,
  NotificationOptions,
} from "./types";

// ==================== 插件注册中心 ====================

class PluginRegistry {
  private plugins: Map<string, PluginInstance> = new Map();
  private pluginSettings: Map<string, Record<string, any>> = new Map();
  private pluginStatus: Map<string, PluginStatus> = new Map();
  private globalHooks: Map<string, Map<string, Function[]>> = new Map();
  private listeners: Map<string, Set<Function>> = new Map();
  // UI 注入注册表：pluginId → 该插件注册的 UI 项数组
  private menuItems: Map<string, MenuItem[]> = new Map();
  private sidebarPanels: Map<string, SidebarPanel[]> = new Map();
  private fileActions: Map<string, FileAction[]> = new Map();
  // 插件注册时间戳（ms），用于 PluginInfo.installedAt
  private installedAtMap: Map<string, number> = new Map();

  constructor() {
    this.initializeBuiltinHooks();
  }

  private initializeBuiltinHooks() {
    const builtinHooks = [
      "file:uploaded",
      "file:deleted",
      "file:updated",
      "folder:created",
      "folder:deleted",
      "user:login",
      "user:logout",
      "search:query",
      "ui:render",
      "settings:changed",
    ];

    builtinHooks.forEach((hook) => {
      this.globalHooks.set(hook, new Map());
    });
  }

  // ==================== 插件注册 ====================

  /**
   * 注册插件
   */
  registerPlugin(manifest: PluginManifest, apiFactory: (api: PluginAPI) => any): boolean {
    if (this.plugins.has(manifest.id)) {
      console.warn(`Plugin ${manifest.id} already registered`);
      return false;
    }

    // 验证插件清单
    if (!this.validateManifest(manifest)) {
      console.error(`Plugin ${manifest.id} manifest validation failed`);
      return false;
    }

    // 创建插件API
    const pluginApi = this.createPluginAPI(manifest);

    // 创建插件实例
    const instance: PluginInstance = {
      id: manifest.id,
      manifest,
      api: pluginApi,
      hooks: {},
      enabled: false,
    };

    this.plugins.set(manifest.id, instance);
    this.pluginStatus.set(manifest.id, "installed");
    this.installedAtMap.set(manifest.id, Date.now());

    // 初始化默认设置
    const defaultSettings: Record<string, any> = {};
    manifest.settings?.forEach((setting) => {
      defaultSettings[setting.key] = setting.default;
    });
    this.pluginSettings.set(manifest.id, defaultSettings);

    // 执行插件初始化
    try {
      apiFactory(pluginApi);
      console.log(`Plugin ${manifest.id} registered successfully`);
      return true;
    } catch (error) {
      console.error(`Plugin ${manifest.id} initialization failed:`, error);
      this.pluginStatus.set(manifest.id, "error");
      return false;
    }
  }

  /**
   * 验证插件清单
   */
  private validateManifest(manifest: PluginManifest): boolean {
    if (!manifest.id || typeof manifest.id !== "string") return false;
    if (!manifest.name || typeof manifest.name !== "string") return false;
    if (!manifest.version || typeof manifest.version !== "string") return false;
    if (!manifest.description || typeof manifest.description !== "string") return false;
    if (!manifest.author || typeof manifest.author !== "string") return false;
    if (!manifest.type || typeof manifest.type !== "string") return false;
    if (!Array.isArray(manifest.permissions)) return false;
    return true;
  }

  /**
   * 创建插件API
   */
  private createPluginAPI(manifest: PluginManifest): PluginAPI {
    const self = this;
    const pluginId = manifest.id;
    const permissions = new Set(manifest.permissions);

    const checkPermission = (permission: PluginPermission) => {
      if (!permissions.has(permission)) {
        throw new Error(`Plugin ${pluginId} does not have permission: ${permission}`);
      }
    };

    return {
      // 基础信息
      getPluginInfo: () => manifest,

      // 设置
      getSettings: () => {
        checkPermission("settings:read");
        return { ...(self.pluginSettings.get(pluginId) || {}) };
      },

      setSettings: (settings: Record<string, any>) => {
        checkPermission("settings:write");
        const current = self.pluginSettings.get(pluginId) || {};
        self.pluginSettings.set(pluginId, { ...current, ...settings });
        self.emit("settings:changed", { pluginId, settings });
      },

      onSettingsChange: (callback: (settings: Record<string, any>) => void) => {
        self.on("settings:changed", (data: any) => {
          if (data.pluginId === pluginId) {
            callback(data.settings);
          }
        });
      },

      // 文件操作
      // 注：registry 为客户端单例（依赖 localStorage），文件数据经 /api/files 等受租户
      // 隔离保护的接口访问。接入需注入认证 token 与 fetch 适配器，属外部集成范畴，
      // 暂保持空返回；权限网关已生效，待接入时仅需替换 return。
      getFiles: async (options?: any) => {
        checkPermission("files:read");
        return [];
      },

      getFile: async (fileId: string) => {
        checkPermission("files:read");
        return null;
      },

      createFile: async (data: any) => {
        checkPermission("files:write");
        return null;
      },

      updateFile: async (fileId: string, data: any) => {
        checkPermission("files:write");
        return null;
      },

      deleteFile: async (fileId: string) => {
        checkPermission("files:delete");
      },

      // 搜索（同上，待接入 /api/search）
      search: async (query: string, options?: any) => {
        checkPermission("search:read");
        return [];
      },

      // UI注入
      registerMenuItem: (item: MenuItem) => {
        checkPermission("ui:inject");
        const list = self.menuItems.get(pluginId) || [];
        list.push(item);
        self.menuItems.set(pluginId, list);
        self.emit("ui:render", { pluginId, type: "menu", item });
      },

      registerSidebarPanel: (panel: SidebarPanel) => {
        checkPermission("ui:inject");
        const list = self.sidebarPanels.get(pluginId) || [];
        list.push(panel);
        self.sidebarPanels.set(pluginId, list);
        self.emit("ui:render", { pluginId, type: "sidebar", panel });
      },

      registerFileAction: (action: FileAction) => {
        checkPermission("ui:inject");
        const list = self.fileActions.get(pluginId) || [];
        list.push(action);
        self.fileActions.set(pluginId, list);
        self.emit("ui:render", { pluginId, type: "fileAction", action });
      },

      // 事件
      on: (event: string, callback: Function) => {
        self.on(event, callback);
      },

      off: (event: string, callback: Function) => {
        self.off(event, callback);
      },

      emit: (event: string, data?: any) => {
        self.emit(event, { pluginId, ...data });
      },

      // 存储
      getStorage: async (key: string) => {
        checkPermission("storage:local");
        try {
          const stored = localStorage.getItem(`plugin:${pluginId}:${key}`);
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      },

      setStorage: async (key: string, value: any) => {
        checkPermission("storage:local");
        localStorage.setItem(`plugin:${pluginId}:${key}`, JSON.stringify(value));
      },

      removeStorage: async (key: string) => {
        checkPermission("storage:local");
        localStorage.removeItem(`plugin:${pluginId}:${key}`);
      },

      // 网络
      fetch: async (url: string, options?: RequestInit) => {
        checkPermission("network:request");
        return fetch(url, options);
      },

      // 通知
      showNotification: (notification: NotificationOptions) => {
        // 通过事件总线派发通知，UI shell 监听 plugin:notification 渲染 toast。
        self.emit("plugin:notification", { pluginId, notification });
      },

      // 日志
      log: (level: "info" | "warn" | "error", message: string, data?: any) => {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] [Plugin ${pluginId}] ${message}`, data || "");
      },
    };
  }

  // ==================== 插件生命周期 ====================

  /**
   * 启用插件
   */
  enablePlugin(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.error(`Plugin ${pluginId} not found`);
      return false;
    }

    if (plugin.enabled) {
      return true;
    }

    try {
      plugin.enabled = true;
      this.pluginStatus.set(pluginId, "enabled");
      this.emit("plugin:enabled", { pluginId });
      console.log(`Plugin ${pluginId} enabled`);
      return true;
    } catch (error) {
      console.error(`Failed to enable plugin ${pluginId}:`, error);
      this.pluginStatus.set(pluginId, "error");
      return false;
    }
  }

  /**
   * 禁用插件
   */
  disablePlugin(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.error(`Plugin ${pluginId} not found`);
      return false;
    }

    if (!plugin.enabled) {
      return true;
    }

    try {
      plugin.enabled = false;
      this.pluginStatus.set(pluginId, "disabled");
      this.emit("plugin:disabled", { pluginId });
      console.log(`Plugin ${pluginId} disabled`);
      return true;
    } catch (error) {
      console.error(`Failed to disable plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * 卸载插件
   */
  uninstallPlugin(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      console.error(`Plugin ${pluginId} not found`);
      return false;
    }

    try {
      // 先禁用
      this.disablePlugin(pluginId);

      // 清理存储
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(`plugin:${pluginId}:`)
      );
      keys.forEach((k) => localStorage.removeItem(k));

      // 移除插件
      this.plugins.delete(pluginId);
      this.pluginSettings.delete(pluginId);
      this.pluginStatus.delete(pluginId);
      this.menuItems.delete(pluginId);
      this.sidebarPanels.delete(pluginId);
      this.fileActions.delete(pluginId);
      this.installedAtMap.delete(pluginId);

      this.emit("plugin:uninstalled", { pluginId });
      console.log(`Plugin ${pluginId} uninstalled`);
      return true;
    } catch (error) {
      console.error(`Failed to uninstall plugin ${pluginId}:`, error);
      return false;
    }
  }

  // ==================== 钩子系统 ====================

  /**
   * 注册钩子
   */
  registerHook(pluginId: string, hookName: string, callback: Function): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.enabled) {
      console.warn(`Cannot register hook: plugin ${pluginId} not enabled`);
      return;
    }

    if (!this.globalHooks.has(hookName)) {
      this.globalHooks.set(hookName, new Map());
    }

    const hookMap = this.globalHooks.get(hookName)!;
    if (!hookMap.has(pluginId)) {
      hookMap.set(pluginId, []);
    }

    hookMap.get(pluginId)!.push(callback);
  }

  /**
   * 触发钩子
   */
  async triggerHook(hookName: string, data?: any): Promise<any[]> {
    const hookMap = this.globalHooks.get(hookName);
    if (!hookMap) {
      return [];
    }

    const results: any[] = [];

    for (const [pluginId, callbacks] of hookMap) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin || !plugin.enabled) continue;

      for (const callback of callbacks) {
        try {
          const result = await callback(data);
          if (result !== undefined) {
            results.push({ pluginId, result });
          }
        } catch (error) {
          console.error(`Hook ${hookName} failed in plugin ${pluginId}:`, error);
        }
      }
    }

    return results;
  }

  // ==================== 事件系统 ====================

  /**
   * 监听事件
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除监听
   */
  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * 触发事件
   */
  emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event ${event} listener error:`, error);
      }
    });
  }

  // ==================== 查询方法 ====================

  /**
   * 将注册时间戳格式化为 ISO 字符串（PluginInfo.installedAt）。
   * 未记录时回退空串以保持类型兼容（历史契约：string）。
   */
  private formatInstalledAt(pluginId: string): string {
    const ts = this.installedAtMap.get(pluginId);
    return ts ? new Date(ts).toISOString() : "";
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): PluginInfo[] {
    const plugins: PluginInfo[] = [];

    this.plugins.forEach((plugin, id) => {
      plugins.push({
        manifest: plugin.manifest,
        status: this.pluginStatus.get(id) || "installed",
        installedAt: this.formatInstalledAt(id),
        settings: this.pluginSettings.get(id),
      });
    });

    return plugins;
  }

  /**
   * 获取已启用的插件
   */
  getEnabledPlugins(): PluginInfo[] {
    return this.getAllPlugins().filter((p) => p.status === "enabled");
  }

  /**
   * 获取插件信息
   */
  getPluginInfo(pluginId: string): PluginInfo | null {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;

    return {
      manifest: plugin.manifest,
      status: this.pluginStatus.get(pluginId) || "installed",
      installedAt: this.formatInstalledAt(pluginId),
      settings: this.pluginSettings.get(pluginId),
    };
  }

  /**
   * 获取所有插件注册的菜单项（扁平化，每项附加 pluginId 便于溯源）
   */
  getMenuItems(): Array<MenuItem & { pluginId: string }> {
    const result: Array<MenuItem & { pluginId: string }> = [];
    this.menuItems.forEach((items, pluginId) => {
      for (const item of items) {
        result.push({ ...item, pluginId });
      }
    });
    return result;
  }

  /**
   * 获取所有插件注册的侧边栏面板（扁平化，每项附加 pluginId）
   */
  getSidebarPanels(): Array<SidebarPanel & { pluginId: string }> {
    const result: Array<SidebarPanel & { pluginId: string }> = [];
    this.sidebarPanels.forEach((panels, pluginId) => {
      for (const panel of panels) {
        result.push({ ...panel, pluginId });
      }
    });
    return result;
  }

  /**
   * 获取所有插件注册的文件操作（扁平化，每项附加 pluginId）
   */
  getFileActions(): Array<FileAction & { pluginId: string }> {
    const result: Array<FileAction & { pluginId: string }> = [];
    this.fileActions.forEach((actions, pluginId) => {
      for (const action of actions) {
        result.push({ ...action, pluginId });
      }
    });
    return result;
  }

  /**
   * 检查插件是否已安装
   */
  isInstalled(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * 检查插件是否已启用
   */
  isEnabled(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    return plugin?.enabled || false;
  }
}

// 导出单例
export const pluginRegistry = new PluginRegistry();
export default pluginRegistry;
