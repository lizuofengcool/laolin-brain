/**
 * 桌面端类型定义
 * 支持Tauri桌面端的系统集成、本地功能、同步功能等
 */

// ==================== 系统相关类型 ====================

/**
 * 操作系统类型
 */
export type DesktopOS = 'windows' | 'macos' | 'linux';

/**
 * 系统主题
 */
export type SystemTheme = 'light' | 'dark' | 'system';

/**
 * 系统信息
 */
export interface SystemInfo {
  os: DesktopOS;
  osVersion: string;
  arch: string;
  hostname: string;
  username: string;
  appVersion: string;
  tauriVersion: string;
  totalMemory: number;
  freeMemory: number;
  cpuCount: number;
  cpuUsage: number;
  diskTotal: number;
  diskFree: number;
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
}

// ==================== 窗口相关类型 ====================

/**
 * 窗口状态
 */
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen';

/**
 * 窗口配置
 */
export interface WindowConfig {
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable: boolean;
  minimizable: boolean;
  maximizable: boolean;
  closable: boolean;
  fullscreen: boolean;
  alwaysOnTop: boolean;
  skipTaskbar: boolean;
  decorations: boolean;
  transparent: boolean;
  center: boolean;
  x?: number;
  y?: number;
}

/**
 * 默认窗口配置
 */
export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  title: 'laolin-brain',
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  resizable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
  fullscreen: false,
  alwaysOnTop: false,
  skipTaskbar: false,
  decorations: true,
  transparent: false,
  center: true,
};

// ==================== 系统托盘 ====================

/**
 * 托盘菜单项
 */
export interface TrayMenuItem {
  id: string;
  label: string;
  icon?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: TrayMenuItem[];
  divider?: boolean;
  action?: () => void;
}

/**
 * 托盘配置
 */
export interface TrayConfig {
  icon: string;
  tooltip: string;
  menu: TrayMenuItem[];
  showOnLeftClick: boolean;
}

// ==================== 全局快捷键 ====================

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  id: string;
  name: string;
  accelerator: string; // 如 "Ctrl+Shift+A"
  description: string;
  enabled: boolean;
  global: boolean; // 是否为全局快捷键
  action: () => void;
}

/**
 * 默认快捷键
 */
export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    id: 'toggle-window',
    name: '显示/隐藏窗口',
    accelerator: 'Ctrl+Shift+A',
    description: '快速显示或隐藏主窗口',
    enabled: true,
    global: true,
    action: () => {},
  },
  {
    id: 'quick-upload',
    name: '快速上传',
    accelerator: 'Ctrl+Shift+U',
    description: '打开快速上传窗口',
    enabled: true,
    global: true,
    action: () => {},
  },
  {
    id: 'quick-search',
    name: '快速搜索',
    accelerator: 'Ctrl+Shift+F',
    description: '打开快速搜索窗口',
    enabled: true,
    global: true,
    action: () => {},
  },
  {
    id: 'new-note',
    name: '新建笔记',
    accelerator: 'Ctrl+Shift+N',
    description: '快速新建笔记',
    enabled: true,
    global: true,
    action: () => {},
  },
];

// ==================== 文件关联 ====================

/**
 * 文件关联配置
 */
export interface FileAssociation {
  extension: string;
  description: string;
  mimeType?: string;
  icon?: string;
  role: 'editor' | 'viewer';
}

/**
 * 默认文件关联
 */
export const DEFAULT_FILE_ASSOCIATIONS: FileAssociation[] = [
  {
    extension: '.md',
    description: 'Markdown文档',
    mimeType: 'text/markdown',
    role: 'editor',
  },
  {
    extension: '.txt',
    description: '文本文档',
    mimeType: 'text/plain',
    role: 'editor',
  },
  {
    extension: '.json',
    description: 'JSON文件',
    mimeType: 'application/json',
    role: 'editor',
  },
  {
    extension: '.csv',
    description: 'CSV表格',
    mimeType: 'text/csv',
    role: 'viewer',
  },
];

// ==================== 开机自启 ====================

/**
 * 开机自启配置
 */
export interface AutoLaunchConfig {
  enabled: boolean;
  minimized: boolean; // 是否最小化启动
  delay: number; // 延迟启动时间（秒）
}

/**
 * 默认开机自启配置
 */
export const DEFAULT_AUTO_LAUNCH_CONFIG: AutoLaunchConfig = {
  enabled: false,
  minimized: false,
  delay: 0,
};

// ==================== 自动更新 ====================

/**
 * 更新状态
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

/**
 * 更新信息
 */
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  size: number;
  checksum?: string;
}

/**
 * 更新进度
 */
export interface UpdateProgress {
  total: number;
  downloaded: number;
  percentage: number;
  speed: number; // 字节/秒
  eta: number; // 预计剩余时间（秒）
}

// ==================== 本地文件系统 ====================

/**
 * 文件系统事件类型
 */
export type FileSystemEventType =
  | 'created'
  | 'modified'
  | 'deleted'
  | 'moved'
  | 'renamed';

/**
 * 文件系统事件
 */
export interface FileSystemEvent {
  type: FileSystemEventType;
  path: string;
  oldPath?: string; // 重命名/移动时的旧路径
  isDirectory: boolean;
  timestamp: number;
}

/**
 * 文件监听配置
 */
export interface FileWatcherConfig {
  path: string;
  recursive: boolean;
  ignorePatterns: string[];
  debounce: number; // 防抖时间（毫秒）
}

/**
 * 默认文件监听配置
 */
export const DEFAULT_FILE_WATCHER_CONFIG: FileWatcherConfig = {
  path: '',
  recursive: true,
  ignorePatterns: [
    'node_modules',
    '.git',
    '*.tmp',
    '*.temp',
    '~$*',
  ],
  debounce: 200,
};

// ==================== 本地搜索 ====================

/**
 * 搜索选项
 */
export interface LocalSearchOptions {
  query: string;
  path: string;
  recursive: boolean;
  fileTypes?: string[];
  maxResults: number;
  includeContent: boolean;
  caseSensitive: boolean;
  regex: boolean;
}

/**
 * 搜索结果
 */
export interface LocalSearchResult {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  matches?: {
    line: number;
    column: number;
    text: string;
  }[];
  score: number;
}

// ==================== 本地通知 ====================

/**
 * 通知选项
 */
export interface LocalNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  sound?: boolean;
  badge?: number;
  silent?: boolean;
  timeout?: number; // 自动关闭时间（毫秒）
  actions?: NotificationAction[];
  data?: Record<string, any>;
}

/**
 * 通知动作
 */
export interface NotificationAction {
  id: string;
  title: string;
  icon?: string;
}

// ==================== 同步功能 ====================

/**
 * 同步状态
 */
export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'paused'
  | 'error'
  | 'conflict';

/**
 * 同步配置
 */
export interface SyncConfig {
  enabled: boolean;
  localPath: string;
  remotePath: string;
  direction: 'upload' | 'download' | 'both';
  mode: 'realtime' | 'interval' | 'manual';
  interval: number; // 同步间隔（分钟）
  autoResolveConflicts: boolean;
  conflictStrategy: 'local' | 'remote' | 'newer' | 'manual';
  ignorePatterns: string[];
  maxConcurrent: number;
  bandwidthLimit?: number; // 带宽限制（KB/s）
}

/**
 * 默认同步配置
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  localPath: '',
  remotePath: '/',
  direction: 'both',
  mode: 'interval',
  interval: 5,
  autoResolveConflicts: true,
  conflictStrategy: 'newer',
  ignorePatterns: [
    'node_modules',
    '.git',
    '*.tmp',
    '*.temp',
    '~$*',
    '.DS_Store',
    'Thumbs.db',
  ],
  maxConcurrent: 3,
};

/**
 * 同步进度
 */
export interface SyncProgress {
  status: SyncStatus;
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  totalBytes: number;
  processedBytes: number;
  speed: number; // 字节/秒
  eta: number; // 预计剩余时间（秒）
  errors: number;
  conflicts: number;
}

/**
 * 同步文件项
 */
export interface SyncFileItem {
  path: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'downloading' | 'success' | 'failed' | 'conflict';
  direction: 'upload' | 'download' | 'delete';
  progress: number;
  error?: string;
  localModifiedAt?: Date;
  remoteModifiedAt?: Date;
}

// ==================== 离线模式 ====================

/**
 * 离线配置
 */
export interface OfflineConfig {
  enabled: boolean;
  cachePath: string;
  maxCacheSize: number; // 最大缓存大小（字节）
  autoSyncOnWifi: boolean;
  autoSyncOnBattery: boolean;
  syncOnStartup: boolean;
  keepDeletedFiles: boolean;
}

/**
 * 默认离线配置
 */
export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  enabled: true,
  cachePath: '',
  maxCacheSize: 10 * 1024 * 1024 * 1024, // 10GB
  autoSyncOnWifi: true,
  autoSyncOnBattery: false,
  syncOnStartup: true,
  keepDeletedFiles: false,
};

// ==================== 桌面端设置 ====================

/**
 * 桌面端设置
 */
export interface DesktopSettings {
  // 窗口设置
  window: WindowConfig;
  startMinimized: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;

  // 系统设置
  autoLaunch: AutoLaunchConfig;
  autoUpdate: boolean;
  updateChannel: 'stable' | 'beta' | 'dev';
  theme: SystemTheme;
  language: string;

  // 托盘设置
  showTrayIcon: boolean;
  trayIcon: string;

  // 快捷键
  shortcuts: ShortcutConfig[];

  // 文件关联
  fileAssociations: FileAssociation[];

  // 同步设置
  sync: SyncConfig;

  // 离线设置
  offline: OfflineConfig;

  // 性能设置
  hardwareAcceleration: boolean;
  backgroundSync: boolean;
  lowPowerMode: boolean;

  // 通知设置
  notifications: boolean;
  notificationSound: boolean;
  notificationOnSyncComplete: boolean;
  notificationOnError: boolean;
}

/**
 * 默认桌面端设置
 */
export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  window: DEFAULT_WINDOW_CONFIG,
  startMinimized: false,
  minimizeToTray: true,
  closeToTray: true,
  autoLaunch: DEFAULT_AUTO_LAUNCH_CONFIG,
  autoUpdate: true,
  updateChannel: 'stable',
  theme: 'system',
  language: 'zh-CN',
  showTrayIcon: true,
  trayIcon: 'default',
  shortcuts: DEFAULT_SHORTCUTS,
  fileAssociations: DEFAULT_FILE_ASSOCIATIONS,
  sync: DEFAULT_SYNC_CONFIG,
  offline: DEFAULT_OFFLINE_CONFIG,
  hardwareAcceleration: true,
  backgroundSync: true,
  lowPowerMode: false,
  notifications: true,
  notificationSound: true,
  notificationOnSyncComplete: false,
  notificationOnError: true,
};

// ==================== 工具函数 ====================

/**
 * 判断是否为桌面端（Tauri环境）
 */
export function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  // @ts-ignore
  return typeof window.__TAURI__ !== 'undefined' || typeof window.tauri !== 'undefined';
}

/**
 * 获取桌面端操作系统
 */
export function getDesktopOS(): DesktopOS | null {
  if (typeof navigator === 'undefined') return null;
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux')) return 'linux';
  return null;
}

/**
 * 格式化文件大小（桌面端友好）
 */
export function formatFileSizeDesktop(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const size = bytes / Math.pow(k, i);

  // 桌面端显示更精确
  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * 格式化速度
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';

  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const k = 1024;
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  const speed = bytesPerSecond / Math.pow(k, i);

  return `${speed.toFixed(2)} ${units[i]}`;
}

/**
 * 格式化时间（秒）
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
  return `${Math.floor(seconds / 86400)}天${Math.floor((seconds % 86400) / 3600)}时`;
}
