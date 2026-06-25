// ==================== 插件类型定义 ====================

export type PluginType = "feature" | "theme" | "integration" | "tool" | "ai";

export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

export type PluginPermission =
  | "files:read"
  | "files:write"
  | "files:delete"
  | "folders:read"
  | "folders:write"
  | "search:read"
  | "user:read"
  | "user:write"
  | "settings:read"
  | "settings:write"
  | "ai:use"
  | "network:request"
  | "storage:local"
  | "ui:inject";

export interface PluginManifest {
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
  permissions: PluginPermission[];
  dependencies?: Record<string, string>;
  engines?: {
    laolin?: string;
  };
  main?: string;
  styles?: string[];
  settings?: PluginSettingDefinition[];
}

export interface PluginSettingDefinition {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "textarea";
  default?: any;
  options?: { label: string; value: string }[];
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export interface PluginInfo {
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: string;
  updatedAt?: string;
  enabledAt?: string;
  settings?: Record<string, any>;
  error?: string;
}

export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  api: PluginAPI;
  hooks: Record<string, Function[]>;
  enabled: boolean;
}

export interface PluginAPI {
  // 基础信息
  getPluginInfo: () => PluginManifest;
  
  // 设置
  getSettings: () => Record<string, any>;
  setSettings: (settings: Record<string, any>) => void;
  onSettingsChange: (callback: (settings: Record<string, any>) => void) => void;
  
  // 文件操作
  getFiles: (options?: any) => Promise<any[]>;
  getFile: (fileId: string) => Promise<any>;
  createFile: (data: any) => Promise<any>;
  updateFile: (fileId: string, data: any) => Promise<any>;
  deleteFile: (fileId: string) => Promise<void>;
  
  // 搜索
  search: (query: string, options?: any) => Promise<any[]>;
  
  // UI注入
  registerMenuItem: (item: MenuItem) => void;
  registerSidebarPanel: (panel: SidebarPanel) => void;
  registerFileAction: (action: FileAction) => void;
  
  // 事件
  on: (event: string, callback: Function) => void;
  off: (event: string, callback: Function) => void;
  emit: (event: string, data?: any) => void;
  
  // 存储
  getStorage: (key: string) => Promise<any>;
  setStorage: (key: string, value: any) => Promise<void>;
  removeStorage: (key: string) => Promise<void>;
  
  // 网络
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  
  // 通知
  showNotification: (notification: NotificationOptions) => void;
  
  // 日志
  log: (level: "info" | "warn" | "error", message: string, data?: any) => void;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  path?: string;
  onClick?: () => void;
  order?: number;
}

export interface SidebarPanel {
  id: string;
  title: string;
  icon?: string;
  component: any;
  order?: number;
}

export interface FileAction {
  id: string;
  label: string;
  icon?: string;
  onClick: (file: any) => void;
  fileTypes?: string[];
  order?: number;
}

export interface NotificationOptions {
  title: string;
  message?: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
  onClick?: () => void;
}

export interface PluginHook {
  name: string;
  description: string;
  parameters?: Record<string, string>;
  returns?: string;
}

// 内置钩子定义
export const BUILTIN_HOOKS: PluginHook[] = [
  { name: "file:uploaded", description: "文件上传后触发", parameters: { file: "File" } },
  { name: "file:deleted", description: "文件删除后触发", parameters: { fileId: "string" } },
  { name: "file:updated", description: "文件更新后触发", parameters: { file: "File" } },
  { name: "folder:created", description: "文件夹创建后触发", parameters: { folder: "Folder" } },
  { name: "folder:deleted", description: "文件夹删除后触发", parameters: { folderId: "string" } },
  { name: "user:login", description: "用户登录后触发", parameters: { user: "User" } },
  { name: "user:logout", description: "用户登出后触发", parameters: { userId: "string" } },
  { name: "search:query", description: "搜索查询时触发", parameters: { query: "string" }, returns: "SearchResult[]" },
  { name: "ui:render", description: "UI渲染时触发", parameters: { context: "RenderContext" } },
  { name: "settings:changed", description: "设置变更后触发", parameters: { settings: "Settings" } },
];

// 插件市场插件定义
export interface MarketPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  icon?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  category: string;
  tags: string[];
  installed: boolean;
  enabled: boolean;
  hasUpdate: boolean;
  latestVersion?: string;
  previewImages?: string[];
  releaseDate?: string;
  lastUpdated?: string;
}
