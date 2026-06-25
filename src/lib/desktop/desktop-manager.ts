/**
 * 桌面端管理器
 * 负责Tauri桌面端的系统集成、窗口管理、托盘、快捷键、同步等
 */

import {
  DesktopSettings,
  DEFAULT_DESKTOP_SETTINGS,
  SystemInfo,
  WindowState,
  WindowConfig,
  TrayConfig,
  TrayMenuItem,
  ShortcutConfig,
  UpdateStatus,
  UpdateInfo,
  UpdateProgress,
  SyncConfig,
  SyncStatus,
  SyncProgress,
  SyncFileItem,
  FileSystemEvent,
  FileWatcherConfig,
  LocalSearchOptions,
  LocalSearchResult,
  LocalNotificationOptions,
  isDesktop,
  getDesktopOS,
} from './types';

/**
 * 桌面端管理器
 */
export class DesktopManager {
  private settings: DesktopSettings = { ...DEFAULT_DESKTOP_SETTINGS };
  private windowState: WindowState = 'normal';
  private syncStatus: SyncStatus = 'idle';
  private syncProgress: SyncProgress | null = null;
  private updateStatus: UpdateStatus = 'idle';
  private updateInfo: UpdateInfo | null = null;
  private fileWatchers: Map<string, () => void> = new Map();

  // 事件监听器
  private windowStateListeners: Set<(state: WindowState) => void> = new Set();
  private syncStatusListeners: Set<(status: SyncStatus) => void> = new Set();
  private syncProgressListeners: Set<(progress: SyncProgress) => void> = new Set();
  private updateStatusListeners: Set<(status: UpdateStatus) => void> = new Set();
  private fileSystemListeners: Set<(event: FileSystemEvent) => void> = new Set();

  constructor() {
    // 初始化
  }

  // ==================== 初始化 ====================

  /**
   * 初始化桌面端管理器
   */
  async init(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // 加载设置
      await this.loadSettings();

      // 初始化窗口
      await this.initWindow();

      // 初始化托盘
      await this.initTray();

      // 初始化快捷键
      await this.initShortcuts();

      // 初始化同步
      if (this.settings.sync.enabled) {
        await this.startSync();
      }

      // 监听系统主题变化
      this.listenThemeChange();
    } catch (error) {
      console.error('Failed to initialize desktop manager:', error);
    }
  }

  /**
   * 销毁桌面端管理器
   */
  async destroy(): Promise<void> {
    // 停止所有文件监听
    this.stopAllFileWatchers();

    // 停止同步
    await this.stopSync();

    // 清理监听器
    this.windowStateListeners.clear();
    this.syncStatusListeners.clear();
    this.syncProgressListeners.clear();
    this.updateStatusListeners.clear();
    this.fileSystemListeners.clear();
  }

  // ==================== 设置管理 ====================

  /**
   * 获取桌面端设置
   */
  getSettings(): DesktopSettings {
    return { ...this.settings };
  }

  /**
   * 更新桌面端设置
   */
  async updateSettings(updates: Partial<DesktopSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.saveSettings();

    // 应用设置变化
    if (updates.window) {
      await this.applyWindowSettings();
    }
    if (updates.sync?.enabled !== undefined) {
      if (updates.sync.enabled) {
        await this.startSync();
      } else {
        await this.stopSync();
      }
    }
  }

  /**
   * 保存设置
   */
  private async saveSettings(): Promise<void> {
    if (!isDesktop()) return;
    try {
      // @ts-ignore
      const { writeTextFile } = await import('@tauri-apps/api/fs');
      // @ts-ignore
      const { appDataDir } = await import('@tauri-apps/api/path');
      const dir = await appDataDir();
      await writeTextFile(`${dir}/settings.json`, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * 加载设置
   */
  private async loadSettings(): Promise<void> {
    if (!isDesktop()) return;
    try {
      // @ts-ignore
      const { readTextFile, exists } = await import('@tauri-apps/api/fs');
      // @ts-ignore
      const { appDataDir } = await import('@tauri-apps/api/path');
      const dir = await appDataDir();
      const filePath = `${dir}/settings.json`;

      if (await exists(filePath)) {
        const content = await readTextFile(filePath);
        this.settings = { ...DEFAULT_DESKTOP_SETTINGS, ...JSON.parse(content) };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // ==================== 窗口管理 ====================

  /**
   * 初始化窗口
   */
  private async initWindow(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');

      // 监听窗口状态变化
      appWindow.listen('tauri://resize', () => {
        this.updateWindowState();
      });

      appWindow.listen('tauri://move', () => {
        this.updateWindowState();
      });

      appWindow.listen('tauri://minimized', () => {
        this.windowState = 'minimized';
        this.windowStateListeners.forEach(listener => listener('minimized'));
      });

      appWindow.listen('tauri://maximized', () => {
        this.windowState = 'maximized';
        this.windowStateListeners.forEach(listener => listener('maximized'));
      });

      appWindow.listen('tauri://close-requested', (event: any) => {
        if (this.settings.closeToTray && this.settings.showTrayIcon) {
          event.preventDefault();
          this.hideWindow();
        }
      });

      // 应用窗口设置
      await this.applyWindowSettings();
    } catch (error) {
      console.error('Failed to initialize window:', error);
    }
  }

  /**
   * 应用窗口设置
   */
  private async applyWindowSettings(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');
      const config = this.settings.window;

      if (config.minWidth && config.minHeight) {
        await appWindow.setMinSize({ width: config.minWidth, height: config.minHeight });
      }
      if (config.maxWidth && config.maxHeight) {
        await appWindow.setMaxSize({ width: config.maxWidth, height: config.maxHeight });
      }
      await appWindow.setResizable(config.resizable);
      await appWindow.setAlwaysOnTop(config.alwaysOnTop);
    } catch (error) {
      console.error('Failed to apply window settings:', error);
    }
  }

  /**
   * 更新窗口状态
   */
  private async updateWindowState(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');
      const maximized = await appWindow.isMaximized();
      const minimized = await appWindow.isMinimized();
      const fullscreen = await appWindow.isFullscreen();

      let newState: WindowState = 'normal';
      if (fullscreen) newState = 'fullscreen';
      else if (maximized) newState = 'maximized';
      else if (minimized) newState = 'minimized';

      if (newState !== this.windowState) {
        this.windowState = newState;
        this.windowStateListeners.forEach(listener => listener(newState));
      }
    } catch (error) {
      console.error('Failed to update window state:', error);
    }
  }

  /**
   * 显示窗口
   */
  async showWindow(): Promise<void> {
    if (!isDesktop()) return;
    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.show();
      await appWindow.unminimize();
      await appWindow.setFocus();
    } catch (error) {
      console.error('Failed to show window:', error);
    }
  }

  /**
   * 隐藏窗口
   */
  async hideWindow(): Promise<void> {
    if (!isDesktop()) return;
    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');
      await appWindow.hide();
    } catch (error) {
      console.error('Failed to hide window:', error);
    }
  }

  /**
   * 切换窗口显示/隐藏
   */
  async toggleWindow(): Promise<void> {
    if (!isDesktop()) return;
    try {
      // @ts-ignore
      const { appWindow } = await import('@tauri-apps/api/window');
      const visible = await appWindow.isVisible();
      if (visible) {
        await this.hideWindow();
      } else {
        await this.showWindow();
      }
    } catch (error) {
      console.error('Failed to toggle window:', error);
    }
  }

  /**
   * 获取窗口状态
   */
  getWindowState(): WindowState {
    return this.windowState;
  }

  /**
   * 添加窗口状态监听器
   */
  onWindowStateChange(listener: (state: WindowState) => void): () => void {
    this.windowStateListeners.add(listener);
    return () => this.windowStateListeners.delete(listener);
  }

  // ==================== 系统托盘 ====================

  /**
   * 初始化系统托盘
   */
  private async initTray(): Promise<void> {
    if (!isDesktop() || !this.settings.showTrayIcon) return;

    try {
      // @ts-ignore
      const { Tray } = await import('@tauri-apps/api/tray');

      const menuItems: TrayMenuItem[] = [
        { id: 'show', label: '显示主窗口', action: () => this.showWindow() },
        { id: 'divider1', label: '', divider: true },
        { id: 'quick-upload', label: '快速上传', action: () => {} },
        { id: 'quick-search', label: '快速搜索', action: () => {} },
        { id: 'divider2', label: '', divider: true },
        { id: 'sync-now', label: '立即同步', action: () => this.startSync() },
        { id: 'divider3', label: '', divider: true },
        { id: 'settings', label: '设置', action: () => {} },
        { id: 'quit', label: '退出', action: () => this.quitApp() },
      ];

      const trayConfig: TrayConfig = {
        icon: this.settings.trayIcon,
        tooltip: 'laolin-brain',
        menu: menuItems,
        showOnLeftClick: true,
      };

      // 创建托盘（实际Tauri API调用）
      // const tray = await Tray.new('main-tray', {
      //   icon: trayConfig.icon,
      //   tooltip: trayConfig.tooltip,
      //   menu: buildTrayMenu(menuItems),
      // });

      // tray.onClick(() => {
      //   if (trayConfig.showOnLeftClick) {
      //     this.toggleWindow();
      //   }
      // });
    } catch (error) {
      console.error('Failed to initialize tray:', error);
    }
  }

  // ==================== 全局快捷键 ====================

  /**
   * 初始化全局快捷键
   */
  private async initShortcuts(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { register } = await import('@tauri-apps/api/globalShortcut');

      for (const shortcut of this.settings.shortcuts) {
        if (shortcut.enabled && shortcut.global) {
          try {
            await register(shortcut.accelerator, () => {
              shortcut.action();
            });
          } catch (error) {
            console.error(`Failed to register shortcut ${shortcut.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize shortcuts:', error);
    }
  }

  /**
   * 注册快捷键
   */
  async registerShortcut(shortcut: ShortcutConfig): Promise<boolean> {
    if (!isDesktop()) return false;

    try {
      // @ts-ignore
      const { register } = await import('@tauri-apps/api/globalShortcut');
      await register(shortcut.accelerator, shortcut.action);
      return true;
    } catch (error) {
      console.error('Failed to register shortcut:', error);
      return false;
    }
  }

  // ==================== 系统信息 ====================

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<SystemInfo | null> {
    if (!isDesktop()) return null;

    try {
      // @ts-ignore
      const { os, platform, arch, version } = await import('@tauri-apps/api/os');
      // @ts-ignore
      const { getVersion } = await import('@tauri-apps/api/app');
      // @ts-ignore
      const { primaryMonitor } = await import('@tauri-apps/api/window');

      const monitor = await primaryMonitor();

      return {
        os: getDesktopOS() || 'linux',
        osVersion: await version(),
        arch: await arch(),
        hostname: '', // 需要后端支持
        username: '', // 需要后端支持
        appVersion: await getVersion(),
        tauriVersion: '', // 需要后端支持
        totalMemory: 0, // 需要后端支持
        freeMemory: 0, // 需要后端支持
        cpuCount: navigator.hardwareConcurrency || 4,
        cpuUsage: 0, // 需要后端支持
        diskTotal: 0, // 需要后端支持
        diskFree: 0, // 需要后端支持
        screenWidth: monitor?.size.width || 1920,
        screenHeight: monitor?.size.height || 1080,
        scaleFactor: monitor?.scaleFactor || 1,
      };
    } catch (error) {
      console.error('Failed to get system info:', error);
      return null;
    }
  }

  // ==================== 自动更新 ====================

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!isDesktop()) return null;

    this.updateStatus = 'checking';
    this.updateStatusListeners.forEach(listener => listener('checking'));

    try {
      // @ts-ignore
      const { check } = await import('@tauri-apps/api/updater');
      const result = await check();

      if (result?.shouldUpdate) {
        this.updateStatus = 'available';
        this.updateInfo = {
          version: result.manifest.version,
          releaseDate: result.manifest.date || '',
          releaseNotes: result.manifest.body || '',
          downloadUrl: '',
          size: result.manifest.content?.length || 0,
        };
        this.updateStatusListeners.forEach(listener => listener('available'));
        return this.updateInfo;
      } else {
        this.updateStatus = 'not-available';
        this.updateStatusListeners.forEach(listener => listener('not-available'));
        return null;
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      this.updateStatus = 'error';
      this.updateStatusListeners.forEach(listener => listener('error'));
      return null;
    }
  }

  /**
   * 下载并安装更新
   */
  async downloadAndInstallUpdate(): Promise<boolean> {
    if (!isDesktop()) return false;

    this.updateStatus = 'downloading';
    this.updateStatusListeners.forEach(listener => listener('downloading'));

    try {
      // @ts-ignore
      const { install } = await import('@tauri-apps/api/updater');
      await install();

      this.updateStatus = 'downloaded';
      this.updateStatusListeners.forEach(listener => listener('downloaded'));
      return true;
    } catch (error) {
      console.error('Failed to download update:', error);
      this.updateStatus = 'error';
      this.updateStatusListeners.forEach(listener => listener('error'));
      return false;
    }
  }

  /**
   * 获取更新状态
   */
  getUpdateStatus(): UpdateStatus {
    return this.updateStatus;
  }

  /**
   * 获取更新信息
   */
  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }

  /**
   * 添加更新状态监听器
   */
  onUpdateStatusChange(listener: (status: UpdateStatus) => void): () => void {
    this.updateStatusListeners.add(listener);
    return () => this.updateStatusListeners.delete(listener);
  }

  // ==================== 文件系统 ====================

  /**
   * 选择文件
   */
  async selectFile(options?: {
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string[] | null> {
    if (!isDesktop()) return null;

    try {
      // @ts-ignore
      const { open } = await import('@tauri-apps/api/dialog');
      const result = await open({
        multiple: options?.multiple || false,
        filters: options?.filters,
      });

      if (Array.isArray(result)) return result;
      if (typeof result === 'string') return [result];
      return null;
    } catch (error) {
      console.error('Failed to select file:', error);
      return null;
    }
  }

  /**
   * 选择文件夹
   */
  async selectDirectory(): Promise<string | null> {
    if (!isDesktop()) return null;

    try {
      // @ts-ignore
      const { open } = await import('@tauri-apps/api/dialog');
      const result = await open({ directory: true });
      return typeof result === 'string' ? result : null;
    } catch (error) {
      console.error('Failed to select directory:', error);
      return null;
    }
  }

  /**
   * 保存文件
   */
  async saveFile(options?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null> {
    if (!isDesktop()) return null;

    try {
      // @ts-ignore
      const { save } = await import('@tauri-apps/api/dialog');
      const result = await save({
        defaultPath: options?.defaultPath,
        filters: options?.filters,
      });
      return typeof result === 'string' ? result : null;
    } catch (error) {
      console.error('Failed to save file:', error);
      return null;
    }
  }

  /**
   * 监听文件变化
   */
  async watchFile(
    path: string,
    callback: (event: FileSystemEvent) => void,
    config?: Partial<FileWatcherConfig>
  ): Promise<() => void> {
    if (!isDesktop()) return () => {};

    try {
      // @ts-ignore
      const { watch, unwatch } = await import('@tauri-apps/api/fs');

      const watcherConfig = {
        recursive: config?.recursive ?? true,
        delayMs: config?.debounce ?? 200,
      };

      const stop = await watch(
        path,
        (event: any) => {
          callback({
            type: event.type as any,
            path: event.paths?.[0] || '',
            isDirectory: false,
            timestamp: Date.now(),
          });
        },
        watcherConfig
      );

      const stopFn = () => {
        unwatch(stop);
        this.fileWatchers.delete(path);
      };

      this.fileWatchers.set(path, stopFn);
      return stopFn;
    } catch (error) {
      console.error('Failed to watch file:', error);
      return () => {};
    }
  }

  /**
   * 停止所有文件监听
   */
  stopAllFileWatchers(): void {
    this.fileWatchers.forEach(stop => stop());
    this.fileWatchers.clear();
  }

  // ==================== 本地搜索 ====================

  /**
   * 本地文件搜索
   */
  async searchLocal(options: LocalSearchOptions): Promise<LocalSearchResult[]> {
    if (!isDesktop()) return [];

    // 这里应该调用Rust后端的搜索功能
    // 暂时返回空数组
    return [];
  }

  // ==================== 本地通知 ====================

  /**
   * 发送本地通知
   */
  async sendNotification(options: LocalNotificationOptions): Promise<boolean> {
    if (!isDesktop() || !this.settings.notifications) return false;

    try {
      // @ts-ignore
      const { sendNotification } = await import('@tauri-apps/api/notification');
      await sendNotification({
        title: options.title,
        body: options.body,
        icon: options.icon,
      });
      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  // ==================== 同步功能 ====================

  /**
   * 开始同步
   */
  async startSync(): Promise<void> {
    if (!isDesktop() || this.syncStatus === 'syncing') return;

    this.syncStatus = 'syncing';
    this.syncStatusListeners.forEach(listener => listener('syncing'));

    try {
      // 这里应该调用实际的同步逻辑
      // 模拟同步过程
      this.syncProgress = {
        status: 'syncing',
        totalFiles: 100,
        processedFiles: 0,
        totalBytes: 1024 * 1024 * 100,
        processedBytes: 0,
        speed: 0,
        eta: 0,
        errors: 0,
        conflicts: 0,
      };

      // 模拟同步进度
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        this.syncProgress.processedFiles = i;
        this.syncProgress.processedBytes = (i / 100) * this.syncProgress.totalBytes;
        this.syncProgressListeners.forEach(listener => listener(this.syncProgress!));
      }

      this.syncStatus = 'idle';
      this.syncProgress.status = 'idle';
      this.syncStatusListeners.forEach(listener => listener('idle'));
      this.syncProgressListeners.forEach(listener => listener(this.syncProgress));

      // 发送通知
      if (this.settings.notificationOnSyncComplete) {
        await this.sendNotification({
          title: '同步完成',
          body: '所有文件已同步完成',
        });
      }
    } catch (error) {
      console.error('Sync failed:', error);
      this.syncStatus = 'error';
      this.syncStatusListeners.forEach(listener => listener('error'));

      if (this.settings.notificationOnError) {
        await this.sendNotification({
          title: '同步失败',
          body: error instanceof Error ? error.message : '未知错误',
        });
      }
    }
  }

  /**
   * 停止同步
   */
  async stopSync(): Promise<void> {
    if (this.syncStatus === 'syncing') {
      this.syncStatus = 'paused';
      this.syncStatusListeners.forEach(listener => listener('paused'));
    }
  }

  /**
   * 暂停同步
   */
  async pauseSync(): Promise<void> {
    await this.stopSync();
  }

  /**
   * 恢复同步
   */
  async resumeSync(): Promise<void> {
    if (this.syncStatus === 'paused') {
      await this.startSync();
    }
  }

  /**
   * 获取同步状态
   */
  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * 获取同步进度
   */
  getSyncProgress(): SyncProgress | null {
    return this.syncProgress;
  }

  /**
   * 添加同步状态监听器
   */
  onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.syncStatusListeners.add(listener);
    return () => this.syncStatusListeners.delete(listener);
  }

  /**
   * 添加同步进度监听器
   */
  onSyncProgressChange(listener: (progress: SyncProgress) => void): () => void {
    this.syncProgressListeners.add(listener);
    return () => this.syncProgressListeners.delete(listener);
  }

  // ==================== 主题 ====================

  /**
   * 监听系统主题变化
   */
  private listenThemeChange(): void {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { theme } = await import('@tauri-apps/api/window');
      // 可以监听系统主题变化
    } catch (error) {
      console.error('Failed to listen theme change:', error);
    }
  }

  /**
   * 获取系统主题
   */
  async getSystemTheme(): Promise<'light' | 'dark'> {
    if (!isDesktop()) return 'light';

    try {
      // @ts-ignore
      const { theme } = await import('@tauri-apps/api/window');
      return (await theme()) || 'light';
    } catch (error) {
      console.error('Failed to get system theme:', error);
      return 'light';
    }
  }

  // ==================== 应用控制 ====================

  /**
   * 退出应用
   */
  async quitApp(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { exit } = await import('@tauri-apps/api/process');
      await exit(0);
    } catch (error) {
      console.error('Failed to quit app:', error);
    }
  }

  /**
   * 重启应用
   */
  async restartApp(): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { relaunch } = await import('@tauri-apps/api/process');
      await relaunch();
    } catch (error) {
      console.error('Failed to restart app:', error);
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 是否为桌面端
   */
  isDesktop(): boolean {
    return isDesktop();
  }

  /**
   * 获取操作系统
   */
  getOS(): ReturnType<typeof getDesktopOS> {
    return getDesktopOS();
  }

  /**
   * 打开外部链接
   */
  async openExternal(url: string): Promise<void> {
    if (!isDesktop()) {
      window.open(url, '_blank');
      return;
    }

    try {
      // @ts-ignore
      const { open } = await import('@tauri-apps/api/shell');
      await open(url);
    } catch (error) {
      console.error('Failed to open external:', error);
      window.open(url, '_blank');
    }
  }

  /**
   * 打开文件管理器
   */
  async openPath(path: string): Promise<void> {
    if (!isDesktop()) return;

    try {
      // @ts-ignore
      const { open } = await import('@tauri-apps/api/shell');
      await open(path);
    } catch (error) {
      console.error('Failed to open path:', error);
    }
  }
}

// 导出单例
export const desktopManager = new DesktopManager();
