/**
 * 移动端类型定义
 * 支持响应式布局、手势操作、离线模式等
 */

// ==================== 设备相关类型 ====================

/**
 * 设备类型
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * 设备方向
 */
export type DeviceOrientation = 'portrait' | 'landscape';

/**
 * 操作系统类型
 */
export type OSType = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';

/**
 * 设备信息
 */
export interface DeviceInfo {
  type: DeviceType;
  orientation: DeviceOrientation;
  os: OSType;
  osVersion?: string;
  browser: string;
  browserVersion?: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  isTouchDevice: boolean;
  hasCamera: boolean;
  hasMicrophone: boolean;
  hasGPS: boolean;
  safeAreaInsets: SafeAreaInsets;
}

/**
 * 安全区域边距（用于刘海屏等）
 */
export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ==================== 断点和响应式 ====================

/**
 * 断点定义
 */
export interface Breakpoints {
  xs: number; // < 576px
  sm: number; // >= 576px
  md: number; // >= 768px
  lg: number; // >= 992px
  xl: number; // >= 1200px
  xxl: number; // >= 1400px
}

/**
 * 默认断点
 */
export const DEFAULT_BREAKPOINTS: Breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400,
};

/**
 * 当前断点
 */
export type CurrentBreakpoint = keyof Breakpoints;

// ==================== 手势相关类型 ====================

/**
 * 手势类型
 */
export type GestureType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipe'
  | 'pinch'
  | 'pan'
  | 'rotate'
  | 'drag';

/**
 * 滑动方向
 */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * 手势事件
 */
export interface GestureEvent {
  type: GestureType;
  target: HTMLElement;
  x: number;
  y: number;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  velocity: number;
  velocityX: number;
  velocityY: number;
  direction?: SwipeDirection;
  scale?: number;
  rotation?: number;
  pointerCount: number;
  timestamp: number;
}

/**
 * 手势配置
 */
export interface GestureConfig {
  enabled: boolean;
  tapThreshold: number; // 点击最大移动距离
  doubleTapDelay: number; // 双击最大间隔
  longPressDelay: number; // 长按触发时间
  swipeThreshold: number; // 滑动最小距离
  swipeVelocityThreshold: number; // 滑动最小速度
  pinchEnabled: boolean;
  rotateEnabled: boolean;
  panEnabled: boolean;
  dragEnabled: boolean;
}

/**
 * 默认手势配置
 */
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  enabled: true,
  tapThreshold: 10,
  doubleTapDelay: 300,
  longPressDelay: 500,
  swipeThreshold: 50,
  swipeVelocityThreshold: 0.3,
  pinchEnabled: true,
  rotateEnabled: true,
  panEnabled: true,
  dragEnabled: true,
};

// ==================== 移动端UI组件 ====================

/**
 * 底部导航项
 */
export interface BottomNavItem {
  id: string;
  label: string;
  icon: string;
  activeIcon?: string;
  path: string;
  badge?: number | string;
  badgeColor?: string;
  disabled?: boolean;
}

/**
 * 抽屉菜单项
 */
export interface DrawerMenuItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  onClick?: () => void;
  children?: DrawerMenuItem[];
  badge?: number | string;
  badgeColor?: string;
  disabled?: boolean;
  divider?: boolean;
  group?: string;
}

/**
 * 浮动操作按钮
 */
export interface FloatingActionButton {
  id: string;
  icon: string;
  label?: string;
  onClick: () => void;
  color?: string;
  position: 'bottom-right' | 'bottom-left' | 'bottom-center';
  expanded?: boolean;
  children?: FloatingActionButton[]; // 展开后的子按钮
}

/**
 * 下拉刷新状态
 */
export type PullToRefreshState = 'idle' | 'pulling' | 'refreshing' | 'complete' | 'error';

/**
 * 上拉加载状态
 */
export type LoadMoreState = 'idle' | 'loading' | 'complete' | 'error' | 'noMore';

/**
 * 滑动操作项
 */
export interface SwipeActionItem {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
  color: string;
  backgroundColor: string;
}

// ==================== 移动端功能 ====================

/**
 * 拍照/相册选项
 */
export interface MediaPickerOptions {
  sourceType: ('camera' | 'album')[]; // 来源类型
  mediaType: ('image' | 'video')[]; // 媒体类型
  maxCount: number; // 最大选择数量
  quality: number; // 图片质量 0-1
  maxSize?: number; // 最大文件大小（字节）
  allowEdit?: boolean; // 是否允许编辑
  cropAspectRatio?: number; // 裁剪比例
}

/**
 * 选中的媒体文件
 */
export interface PickedMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number; // 视频时长（秒）
  createdAt: Date;
  location?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * 推送通知
 */
export interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  sound?: string;
  data?: Record<string, any>;
  type: 'system' | 'message' | 'reminder' | 'update';
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
}

/**
 * 分享选项
 */
export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
  dialogTitle?: string;
}

/**
 * 分享结果
 */
export interface ShareResult {
  success: boolean;
  app?: string; // 分享到的应用
  error?: string;
}

// ==================== 离线模式 ====================

/**
 * 离线状态
 */
export type OfflineStatus = 'online' | 'offline' | 'reconnecting' | 'syncing';

/**
 * 离线队列项
 */
export interface OfflineQueueItem {
  id: string;
  type: 'upload' | 'download' | 'delete' | 'update' | 'create';
  targetId: string;
  targetType: string;
  data: any;
  status: 'pending' | 'processing' | 'success' | 'failed';
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  error?: string;
}

/**
 * 离线缓存配置
 */
export interface OfflineCacheConfig {
  enabled: boolean;
  maxSize: number; // 最大缓存大小（字节）
  maxAge: number; // 最大缓存时间（毫秒）
  autoSync: boolean; // 是否自动同步
  syncOnWifiOnly: boolean; // 是否仅在WiFi下同步
  syncInterval: number; // 同步间隔（毫秒）
  cacheTypes: string[]; // 缓存的文件类型
}

/**
 * 默认离线缓存配置
 */
export const DEFAULT_OFFLINE_CACHE_CONFIG: OfflineCacheConfig = {
  enabled: false,
  maxSize: 500 * 1024 * 1024, // 500MB
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  autoSync: true,
  syncOnWifiOnly: false,
  syncInterval: 5 * 60 * 1000, // 5分钟
  cacheTypes: ['image', 'document', 'audio', 'video'],
};

// ==================== 性能优化 ====================

/**
 * 图片懒加载配置
 */
export interface LazyLoadConfig {
  enabled: boolean;
  rootMargin: string; // 预加载距离
  threshold: number; // 触发阈值
  placeholder: string; // 占位图
  errorImage: string; // 加载失败图
}

/**
 * 默认懒加载配置
 */
export const DEFAULT_LAZY_LOAD_CONFIG: LazyLoadConfig = {
  enabled: true,
  rootMargin: '200px',
  threshold: 0.1,
  placeholder: '',
  errorImage: '',
};

/**
 * 虚拟滚动配置
 */
export interface VirtualScrollConfig {
  enabled: boolean;
  itemHeight: number; // 每项高度（固定高度模式）
  overscan: number; // 上下额外渲染的项数
  threshold: number; // 超过多少项启用虚拟滚动
}

/**
 * 默认虚拟滚动配置
 */
export const DEFAULT_VIRTUAL_SCROLL_CONFIG: VirtualScrollConfig = {
  enabled: true,
  itemHeight: 60,
  overscan: 5,
  threshold: 100,
};

// ==================== 移动端设置 ====================

/**
 * 移动端设置
 */
export interface MobileSettings {
  // 显示设置
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  showBottomNav: boolean;
  showDrawer: boolean;

  // 交互设置
  hapticFeedback: boolean; // 触感反馈
  gestureNavigation: boolean; // 手势导航
  pullToRefresh: boolean; // 下拉刷新
  infiniteScroll: boolean; // 无限滚动

  // 媒体设置
  imageQuality: 'low' | 'medium' | 'high' | 'original';
  autoPlayVideo: boolean; // 自动播放视频
  autoPlayOnWifi: boolean; // 仅WiFi自动播放
  compressUpload: boolean; // 上传前压缩

  // 离线设置
  offlineCache: OfflineCacheConfig;
  lazyLoad: LazyLoadConfig;
  virtualScroll: VirtualScrollConfig;

  // 通知设置
  pushNotifications: boolean;
  notificationSound: boolean;
  notificationVibration: boolean;

  // 隐私设置
  savePhotosToAlbum: boolean; // 保存图片到相册
  allowCamera: boolean;
  allowMicrophone: boolean;
  allowLocation: boolean;
}

/**
 * 默认移动端设置
 */
export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  theme: 'system',
  fontSize: 'medium',
  showBottomNav: true,
  showDrawer: true,
  hapticFeedback: true,
  gestureNavigation: true,
  pullToRefresh: true,
  infiniteScroll: true,
  imageQuality: 'medium',
  autoPlayVideo: false,
  autoPlayOnWifi: true,
  compressUpload: true,
  offlineCache: DEFAULT_OFFLINE_CACHE_CONFIG,
  lazyLoad: DEFAULT_LAZY_LOAD_CONFIG,
  virtualScroll: DEFAULT_VIRTUAL_SCROLL_CONFIG,
  pushNotifications: true,
  notificationSound: true,
  notificationVibration: true,
  savePhotosToAlbum: false,
  allowCamera: true,
  allowMicrophone: false,
  allowLocation: false,
};

// ==================== 工具函数 ====================

/**
 * 判断是否为移动端
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * 判断是否为平板
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
}

/**
 * 判断是否为触摸设备
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 获取设备类型
 */
export function getDeviceType(): DeviceType {
  if (isTablet()) return 'tablet';
  if (isMobile()) return 'mobile';
  return 'desktop';
}

/**
 * 获取操作系统
 */
export function getOS(): OSType {
  if (typeof navigator === 'undefined') return 'unknown';
  const userAgent = navigator.userAgent;

  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac/i.test(userAgent)) return 'macos';
  if (/Linux/i.test(userAgent)) return 'linux';
  return 'unknown';
}

/**
 * 获取当前断点
 */
export function getCurrentBreakpoint(
  width: number,
  breakpoints: Breakpoints = DEFAULT_BREAKPOINTS
): CurrentBreakpoint {
  if (width >= breakpoints.xxl) return 'xxl';
  if (width >= breakpoints.xl) return 'xl';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  if (width >= breakpoints.sm) return 'sm';
  return 'xs';
}

/**
 * 获取安全区域边距
 */
export function getSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = getComputedStyle(document.documentElement);

  return {
    top: parseInt(style.getPropertyValue('--safe-area-top') || '0', 10) || 0,
    right: parseInt(style.getPropertyValue('--safe-area-right') || '0', 10) || 0,
    bottom: parseInt(style.getPropertyValue('--safe-area-bottom') || '0', 10) || 0,
    left: parseInt(style.getPropertyValue('--safe-area-left') || '0', 10) || 0,
  };
}

/**
 * 格式化文件大小（移动端友好）
 */
export function formatFileSizeMobile(bytes: number, locale = 'zh-CN'): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const size = bytes / Math.pow(k, i);

  // 移动端显示更简洁
  const formatted = size < 10 ? size.toFixed(1) : Math.round(size);

  return `${formatted} ${units[i]}`;
}

/**
 * 格式化时间（移动端友好，相对时间）
 */
export function formatTimeMobile(date: Date, locale = 'zh-CN'): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  }
  if (diff < week) {
    return `${Math.floor(diff / day)}天前`;
  }

  // 超过一周显示日期
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}
