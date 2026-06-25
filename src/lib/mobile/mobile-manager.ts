/**
 * 移动端管理器
 * 负责设备检测、响应式布局、手势操作、离线模式等
 */

import {
  DeviceInfo,
  DeviceType,
  DeviceOrientation,
  OSType,
  Breakpoints,
  DEFAULT_BREAKPOINTS,
  CurrentBreakpoint,
  GestureConfig,
  DEFAULT_GESTURE_CONFIG,
  GestureEvent,
  GestureType,
  SwipeDirection,
  MobileSettings,
  DEFAULT_MOBILE_SETTINGS,
  OfflineStatus,
  OfflineQueueItem,
  OfflineCacheConfig,
  getDeviceType,
  getOS,
  getCurrentBreakpoint,
  getSafeAreaInsets,
  isTouchDevice,
} from './types';

/**
 * 移动端管理器
 */
export class MobileManager {
  private deviceInfo: DeviceInfo | null = null;
  private currentBreakpoint: CurrentBreakpoint = 'md';
  private settings: MobileSettings = { ...DEFAULT_MOBILE_SETTINGS };
  private offlineStatus: OfflineStatus = 'online';
  private offlineQueue: OfflineQueueItem[] = [];
  private gestureConfig: GestureConfig = { ...DEFAULT_GESTURE_CONFIG };
  private breakpoints: Breakpoints = { ...DEFAULT_BREAKPOINTS };

  // 事件监听器
  private resizeListeners: Set<(info: DeviceInfo) => void> = new Set();
  private orientationListeners: Set<(orientation: DeviceOrientation) => void> = new Set();
  private offlineStatusListeners: Set<(status: OfflineStatus) => void> = new Set();
  private breakpointListeners: Set<(breakpoint: CurrentBreakpoint) => void> = new Set();

  // 手势状态
  private gestureState = {
    isTracking: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startTime: 0,
    lastTapTime: 0,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    pointers: Map<number, { x: number; y: number }> = new Map(),
  };

  constructor() {
    // 初始化
  }

  // ==================== 初始化 ====================

  /**
   * 初始化移动端管理器
   */
  init(): void {
    if (typeof window === 'undefined') return;

    // 初始化设备信息
    this.updateDeviceInfo();

    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize.bind(this));

    // 监听方向变化
    window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));

    // 监听在线/离线状态
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // 初始化离线状态
    this.offlineStatus = navigator.onLine ? 'online' : 'offline';

    // 加载设置
    this.loadSettings();
  }

  /**
   * 销毁移动端管理器
   */
  destroy(): void {
    if (typeof window === 'undefined') return;

    window.removeEventListener('resize', this.handleResize.bind(this));
    window.removeEventListener('orientationchange', this.handleOrientationChange.bind(this));
    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    this.resizeListeners.clear();
    this.orientationListeners.clear();
    this.offlineStatusListeners.clear();
    this.breakpointListeners.clear();
  }

  // ==================== 设备信息 ====================

  /**
   * 更新设备信息
   */
  private updateDeviceInfo(): void {
    if (typeof window === 'undefined') return;

    const type = getDeviceType();
    const os = getOS();
    const orientation = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';

    this.deviceInfo = {
      type,
      orientation,
      os,
      browser: this.getBrowser(),
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      isTouchDevice: isTouchDevice(),
      hasCamera: 'mediaDevices' in navigator,
      hasMicrophone: 'mediaDevices' in navigator,
      hasGPS: 'geolocation' in navigator,
      safeAreaInsets: getSafeAreaInsets(),
    };

    // 更新断点
    const newBreakpoint = getCurrentBreakpoint(window.innerWidth, this.breakpoints);
    if (newBreakpoint !== this.currentBreakpoint) {
      this.currentBreakpoint = newBreakpoint;
      this.breakpointListeners.forEach(listener => listener(newBreakpoint));
    }
  }

  /**
   * 获取浏览器名称
   */
  private getBrowser(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    const userAgent = navigator.userAgent;

    if (/Chrome/i.test(userAgent)) return 'chrome';
    if (/Firefox/i.test(userAgent)) return 'firefox';
    if (/Safari/i.test(userAgent)) return 'safari';
    if (/Edge/i.test(userAgent)) return 'edge';
    if (/Opera/i.test(userAgent)) return 'opera';
    return 'unknown';
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * 获取设备类型
   */
  getDeviceType(): DeviceType | null {
    return this.deviceInfo?.type || null;
  }

  /**
   * 获取设备方向
   */
  getOrientation(): DeviceOrientation | null {
    return this.deviceInfo?.orientation || null;
  }

  /**
   * 获取操作系统
   */
  getOS(): OSType | null {
    return this.deviceInfo?.os || null;
  }

  /**
   * 获取当前断点
   */
  getCurrentBreakpoint(): CurrentBreakpoint {
    return this.currentBreakpoint;
  }

  /**
   * 是否为移动端
   */
  isMobile(): boolean {
    return this.deviceInfo?.type === 'mobile';
  }

  /**
   * 是否为平板
   */
  isTablet(): boolean {
    return this.deviceInfo?.type === 'tablet';
  }

  /**
   * 是否为桌面端
   */
  isDesktop(): boolean {
    return this.deviceInfo?.type === 'desktop';
  }

  /**
   * 是否为触摸设备
   */
  isTouchDevice(): boolean {
    return this.deviceInfo?.isTouchDevice || false;
  }

  // ==================== 事件监听 ====================

  /**
   * 监听窗口大小变化
   */
  private handleResize(): void {
    this.updateDeviceInfo();
    if (this.deviceInfo) {
      this.resizeListeners.forEach(listener => listener(this.deviceInfo!));
    }
  }

  /**
   * 监听方向变化
   */
  private handleOrientationChange(): void {
    this.updateDeviceInfo();
    if (this.deviceInfo) {
      this.orientationListeners.forEach(listener => listener(this.deviceInfo!.orientation));
    }
  }

  /**
   * 添加窗口大小变化监听器
   */
  onResize(listener: (info: DeviceInfo) => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  /**
   * 添加方向变化监听器
   */
  onOrientationChange(listener: (orientation: DeviceOrientation) => void): () => void {
    this.orientationListeners.add(listener);
    return () => this.orientationListeners.delete(listener);
  }

  /**
   * 添加断点变化监听器
   */
  onBreakpointChange(listener: (breakpoint: CurrentBreakpoint) => void): () => void {
    this.breakpointListeners.add(listener);
    return () => this.breakpointListeners.delete(listener);
  }

  // ==================== 手势操作 ====================

  /**
   * 绑定手势事件
   */
  bindGesture(
    element: HTMLElement,
    onGesture: (event: GestureEvent) => void,
    config?: Partial<GestureConfig>
  ): () => void {
    const gestureConfig = { ...this.gestureConfig, ...config };

    const handleTouchStart = (e: TouchEvent) => {
      if (!gestureConfig.enabled) return;

      const touch = e.touches[0];
      this.gestureState.isTracking = true;
      this.gestureState.startX = touch.clientX;
      this.gestureState.startY = touch.clientY;
      this.gestureState.lastX = touch.clientX;
      this.gestureState.lastY = touch.clientY;
      this.gestureState.startTime = Date.now();

      // 记录所有触摸点
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        this.gestureState.pointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      // 长按定时器
      if (gestureConfig.longPressDelay > 0) {
        this.gestureState.longPressTimer = setTimeout(() => {
          onGesture({
            type: 'longPress',
            target: element,
            x: touch.clientX,
            y: touch.clientY,
            startX: this.gestureState.startX,
            startY: this.gestureState.startY,
            deltaX: 0,
            deltaY: 0,
            velocity: 0,
            velocityX: 0,
            velocityY: 0,
            pointerCount: e.touches.length,
            timestamp: Date.now(),
          });
        }, gestureConfig.longPressDelay);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!this.gestureState.isTracking || !gestureConfig.enabled) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - this.gestureState.lastX;
      const deltaY = touch.clientY - this.gestureState.lastY;
      const totalDeltaX = touch.clientX - this.gestureState.startX;
      const totalDeltaY = touch.clientY - this.gestureState.startY;
      const elapsed = Date.now() - this.gestureState.startTime;

      // 如果移动超过阈值，取消长按
      if (
        this.gestureState.longPressTimer &&
        Math.abs(totalDeltaX) > gestureConfig.tapThreshold
      ) {
        clearTimeout(this.gestureState.longPressTimer);
        this.gestureState.longPressTimer = null;
      }

      // 更新最后位置
      this.gestureState.lastX = touch.clientX;
      this.gestureState.lastY = touch.clientY;

      // Pan手势
      if (gestureConfig.panEnabled && Math.abs(totalDeltaX) > gestureConfig.tapThreshold) {
        onGesture({
          type: 'pan',
          target: element,
          x: touch.clientX,
          y: touch.clientY,
          startX: this.gestureState.startX,
          startY: this.gestureState.startY,
          deltaX: totalDeltaX,
          deltaY: totalDeltaY,
          velocity: Math.sqrt(deltaX * deltaX + deltaY * deltaY) / (elapsed || 1),
          velocityX: deltaX / (elapsed || 1),
          velocityY: deltaY / (elapsed || 1),
          pointerCount: e.touches.length,
          timestamp: Date.now(),
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!this.gestureState.isTracking || !gestureConfig.enabled) return;

      const endX = this.gestureState.lastX;
      const endY = this.gestureState.lastY;
      const deltaX = endX - this.gestureState.startX;
      const deltaY = endY - this.gestureState.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const elapsed = Date.now() - this.gestureState.startTime;
      const velocity = distance / (elapsed || 1);

      // 清除长按定时器
      if (this.gestureState.longPressTimer) {
        clearTimeout(this.gestureState.longPressTimer);
        this.gestureState.longPressTimer = null;
      }

      // 判断手势类型
      if (distance < gestureConfig.tapThreshold && elapsed < 300) {
        // 点击
        const now = Date.now();
        if (now - this.gestureState.lastTapTime < gestureConfig.doubleTapDelay) {
          // 双击
          onGesture({
            type: 'doubleTap',
            target: element,
            x: endX,
            y: endY,
            startX: this.gestureState.startX,
            startY: this.gestureState.startY,
            deltaX: 0,
            deltaY: 0,
            velocity: 0,
            velocityX: 0,
            velocityY: 0,
            pointerCount: 1,
            timestamp: now,
          });
        } else {
          // 单击
          onGesture({
            type: 'tap',
            target: element,
            x: endX,
            y: endY,
            startX: this.gestureState.startX,
            startY: this.gestureState.startY,
            deltaX: 0,
            deltaY: 0,
            velocity: 0,
            velocityX: 0,
            velocityY: 0,
            pointerCount: 1,
            timestamp: now,
          });
        }
        this.gestureState.lastTapTime = now;
      } else if (
        distance > gestureConfig.swipeThreshold &&
        velocity > gestureConfig.swipeVelocityThreshold
      ) {
        // 滑动
        let direction: SwipeDirection;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          direction = deltaX > 0 ? 'right' : 'left';
        } else {
          direction = deltaY > 0 ? 'down' : 'up';
        }

        onGesture({
          type: 'swipe',
          target: element,
          x: endX,
          y: endY,
          startX: this.gestureState.startX,
          startY: this.gestureState.startY,
          deltaX,
          deltaY,
          velocity,
          velocityX: deltaX / (elapsed || 1),
          velocityY: deltaY / (elapsed || 1),
          direction,
          pointerCount: 1,
          timestamp: Date.now(),
        });
      }

      // 重置状态
      this.gestureState.isTracking = false;
      this.gestureState.pointers.clear();
    };

    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);

    // 返回解绑函数
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }

  // ==================== 离线模式 ====================

  /**
   * 处理在线事件
   */
  private handleOnline(): void {
    this.offlineStatus = 'online';
    this.offlineStatusListeners.forEach(listener => listener('online'));

    // 自动同步离线队列
    if (this.settings.offlineCache.autoSync) {
      this.processOfflineQueue();
    }
  }

  /**
   * 处理离线事件
   */
  private handleOffline(): void {
    this.offlineStatus = 'offline';
    this.offlineStatusListeners.forEach(listener => listener('offline'));
  }

  /**
   * 获取离线状态
   */
  getOfflineStatus(): OfflineStatus {
    return this.offlineStatus;
  }

  /**
   * 是否在线
   */
  isOnline(): boolean {
    return this.offlineStatus === 'online';
  }

  /**
   * 添加离线状态监听器
   */
  onOfflineStatusChange(listener: (status: OfflineStatus) => void): () => void {
    this.offlineStatusListeners.add(listener);
    return () => this.offlineStatusListeners.delete(listener);
  }

  /**
   * 添加到离线队列
   */
  addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'status' | 'retryCount' | 'createdAt'>): OfflineQueueItem {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    };

    this.offlineQueue.push(queueItem);

    // 如果在线，立即处理
    if (this.isOnline()) {
      this.processOfflineQueue();
    }

    return queueItem;
  }

  /**
   * 处理离线队列
   */
  async processOfflineQueue(): Promise<void> {
    if (!this.isOnline() || this.offlineStatus === 'syncing') return;

    this.offlineStatus = 'syncing';
    this.offlineStatusListeners.forEach(listener => listener('syncing'));

    try {
      // 按优先级排序
      const sortedQueue = [...this.offlineQueue]
        .filter(item => item.status === 'pending' || item.status === 'failed')
        .sort((a, b) => b.priority - a.priority);

      for (const item of sortedQueue) {
        try {
          item.status = 'processing';
          // 这里应该执行实际的同步操作
          // 模拟处理
          await new Promise(resolve => setTimeout(resolve, 100));
          item.status = 'success';
        } catch (error) {
          item.retryCount++;
          if (item.retryCount >= item.maxRetries) {
            item.status = 'failed';
            item.error = error instanceof Error ? error.message : 'Unknown error';
          } else {
            item.status = 'pending';
          }
          item.lastAttemptAt = new Date();
        }
      }
    } finally {
      this.offlineStatus = 'online';
      this.offlineStatusListeners.forEach(listener => listener('online'));
    }
  }

  /**
   * 获取离线队列
   */
  getOfflineQueue(): OfflineQueueItem[] {
    return [...this.offlineQueue];
  }

  /**
   * 清除离线队列
   */
  clearOfflineQueue(): void {
    this.offlineQueue = [];
  }

  // ==================== 设置管理 ====================

  /**
   * 获取移动端设置
   */
  getSettings(): MobileSettings {
    return { ...this.settings };
  }

  /**
   * 更新移动端设置
   */
  updateSettings(updates: Partial<MobileSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  /**
   * 保存设置到localStorage
   */
  private saveSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('mobile_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save mobile settings:', e);
    }
  }

  /**
   * 从localStorage加载设置
   */
  private loadSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('mobile_settings');
      if (saved) {
        this.settings = { ...DEFAULT_MOBILE_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to load mobile settings:', e);
    }
  }

  // ==================== 断点配置 ====================

  /**
   * 设置断点
   */
  setBreakpoints(breakpoints: Breakpoints): void {
    this.breakpoints = { ...breakpoints };
    this.updateDeviceInfo();
  }

  /**
   * 获取断点配置
   */
  getBreakpoints(): Breakpoints {
    return { ...this.breakpoints };
  }

  // ==================== 工具方法 ====================

  /**
   * 触感反馈（如果支持）
   */
  hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'medium'): void {
    if (!this.settings.hapticFeedback) return;
    if (typeof navigator === 'undefined') return;

    // @ts-ignore
    if (navigator.vibrate) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30],
      };
      // @ts-ignore
      navigator.vibrate(patterns[type]);
    }
  }

  /**
   * 检查是否为WiFi网络（仅作粗略判断）
   */
  isWifiNetwork(): boolean {
    if (typeof navigator === 'undefined') return true;
    // @ts-ignore
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true; // 无法判断时默认是
    return connection.effectiveType === '4g' || connection.effectiveType === 'wifi';
  }

  /**
   * 检查是否支持分享API
   */
  canShare(): boolean {
    if (typeof navigator === 'undefined') return false;
    // @ts-ignore
    return typeof navigator.share === 'function';
  }

  /**
   * 调用系统分享
   */
  async share(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
    if (!this.canShare()) return false;
    try {
      // @ts-ignore
      await navigator.share(data);
      return true;
    } catch (e) {
      return false;
    }
  }
}

// 导出单例
export const mobileManager = new MobileManager();
