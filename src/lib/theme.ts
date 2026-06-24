/**
 * 主题系统工具
 * 支持浅色、深色、跟随系统三种模式
 */

export type ThemeMode = 'light' | 'dark' | 'system';

// 默认主题
export const DEFAULT_THEME: ThemeMode = 'system';

// localStorage key
const THEME_STORAGE_KEY = 'theme';

/**
 * 获取当前主题模式
 */
export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }

  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode;
  if (saved && ['light', 'dark', 'system'].includes(saved)) {
    return saved;
  }

  return DEFAULT_THEME;
}

/**
 * 设置主题模式
 * @param mode 主题模式
 */
export function setThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!['light', 'dark', 'system'].includes(mode)) {
    console.warn(`Unsupported theme mode: ${mode}`);
    return;
  }

  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyTheme(mode);

  // 触发自定义事件
  window.dispatchEvent(new CustomEvent('themechange', { detail: { mode } }));
}

/**
 * 应用主题
 * @param mode 主题模式
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDarkMode());

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 设置color-scheme
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

/**
 * 检测系统是否偏好深色模式
 */
export function prefersDarkMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 获取实际应用的主题（解析system模式）
 */
export function getResolvedTheme(): 'light' | 'dark' {
  const mode = getThemeMode();
  if (mode === 'system') {
    return prefersDarkMode() ? 'dark' : 'light';
  }
  return mode;
}

/**
 * 监听主题变化
 * @param callback 变化回调
 * @returns 取消监听函数
 */
export function onThemeChange(callback: (mode: ThemeMode) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent;
    callback(customEvent.detail.mode);
  };

  window.addEventListener('themechange', handler);
  return () => window.removeEventListener('themechange', handler);
}

/**
 * 监听系统主题变化
 * @param callback 变化回调
 * @returns 取消监听函数
 */
export function onSystemThemeChange(callback: (isDark: boolean) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches);
  };

  // 现代浏览器
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }

  // 兼容旧浏览器
  mediaQuery.addListener(handler);
  return () => mediaQuery.removeListener(handler);
}

/**
 * 初始化主题（在页面加载时调用）
 * 用于防止首屏闪烁（FOUC）
 */
export function initTheme(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const mode = getThemeMode();
  applyTheme(mode);
}

/**
 * 切换主题（在light和dark之间切换）
 */
export function toggleTheme(): void {
  const current = getResolvedTheme();
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
  setThemeMode(next);
}

/**
 * 获取主题模式名称
 */
export function getThemeModeName(mode: ThemeMode): string {
  const names: Record<ThemeMode, string> = {
    light: '浅色模式',
    dark: '深色模式',
    system: '跟随系统',
  };
  return names[mode];
}
