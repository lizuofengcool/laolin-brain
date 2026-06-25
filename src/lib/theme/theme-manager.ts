/**
 * 主题管理器
 * 负责主题切换、主题管理、CSS变量应用等
 */

import {
  ThemeConfig,
  ThemeMode,
  ThemeSettings,
  DEFAULT_THEME_SETTINGS,
  DEFAULT_THEME,
  BUILTIN_THEMES,
  ColorPalette,
  CSS_VARIABLE_MAP,
  isDarkMode,
  getColorPalette,
  createCustomTheme,
} from './types';

/**
 * 主题管理器
 */
export class ThemeManager {
  private settings: ThemeSettings = { ...DEFAULT_THEME_SETTINGS };
  private currentTheme: ThemeConfig = DEFAULT_THEME;
  private effectiveMode: ThemeMode = 'light';
  private autoSwitchTimer: ReturnType<typeof setInterval> | null = null;

  // 事件监听器
  private themeChangeListeners: Set<(theme: ThemeConfig) => void> = new Set();
  private modeChangeListeners: Set<(mode: ThemeMode) => void> = new Set();
  private settingsChangeListeners: Set<(settings: ThemeSettings) => void> = new Set();

  constructor() {
    // 初始化
  }

  // ==================== 初始化 ====================

  /**
   * 初始化主题管理器
   */
  init(): void {
    if (typeof window === 'undefined') return;

    // 加载设置
    this.loadSettings();

    // 应用主题
    this.applyTheme();

    // 监听系统主题变化
    this.listenSystemTheme();

    // 启动自动切换
    if (this.settings.autoSwitch) {
      this.startAutoSwitch();
    }
  }

  /**
   * 销毁主题管理器
   */
  destroy(): void {
    if (this.autoSwitchTimer) {
      clearInterval(this.autoSwitchTimer);
      this.autoSwitchTimer = null;
    }

    this.themeChangeListeners.clear();
    this.modeChangeListeners.clear();
    this.settingsChangeListeners.clear();
  }

  // ==================== 设置管理 ====================

  /**
   * 获取主题设置
   */
  getSettings(): ThemeSettings {
    return { ...this.settings };
  }

  /**
   * 更新主题设置
   */
  updateSettings(updates: Partial<ThemeSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();

    // 应用变化
    if (updates.mode !== undefined || updates.followSystem !== undefined) {
      this.applyTheme();
    }

    if (updates.currentTheme !== undefined) {
      this.setTheme(updates.currentTheme);
    }

    if (updates.autoSwitch !== undefined) {
      if (updates.autoSwitch) {
        this.startAutoSwitch();
      } else {
        this.stopAutoSwitch();
      }
    }

    if (updates.reducedMotion !== undefined) {
      this.applyReducedMotion();
    }

    if (updates.highContrast !== undefined) {
      this.applyHighContrast();
    }

    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 保存设置到localStorage
   */
  private saveSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('theme_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save theme settings:', e);
    }
  }

  /**
   * 从localStorage加载设置
   */
  private loadSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('theme_settings');
      if (saved) {
        this.settings = { ...DEFAULT_THEME_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to load theme settings:', e);
    }
  }

  // ==================== 主题管理 ====================

  /**
   * 设置主题
   */
  setTheme(themeId: string): void {
    const theme = this.getThemeById(themeId);
    if (!theme) {
      console.warn(`Theme not found: ${themeId}`);
      return;
    }

    this.currentTheme = theme;
    this.settings.currentTheme = themeId;
    this.applyTheme();

    this.themeChangeListeners.forEach(listener => listener(theme));
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): ThemeConfig {
    return this.currentTheme;
  }

  /**
   * 获取所有主题
   */
  getAllThemes(): ThemeConfig[] {
    return [...BUILTIN_THEMES, ...this.settings.customThemes];
  }

  /**
   * 根据ID获取主题
   */
  getThemeById(id: string): ThemeConfig | undefined {
    return this.getAllThemes().find(t => t.id === id);
  }

  /**
   * 获取内置主题
   */
  getBuiltinThemes(): ThemeConfig[] {
    return [...BUILTIN_THEMES];
  }

  /**
   * 获取自定义主题
   */
  getCustomThemes(): ThemeConfig[] {
    return [...this.settings.customThemes];
  }

  /**
   * 添加自定义主题
   */
  addCustomTheme(theme: ThemeConfig): void {
    if (this.settings.customThemes.some(t => t.id === theme.id)) {
      console.warn(`Theme already exists: ${theme.id}`);
      return;
    }

    this.settings.customThemes.push(theme);
    this.saveSettings();
    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 更新自定义主题
   */
  updateCustomTheme(id: string, updates: Partial<ThemeConfig>): void {
    const index = this.settings.customThemes.findIndex(t => t.id === id);
    if (index === -1) return;

    this.settings.customThemes[index] = {
      ...this.settings.customThemes[index],
      ...updates,
    };

    this.saveSettings();

    // 如果当前主题被更新，重新应用
    if (this.settings.currentTheme === id) {
      this.currentTheme = this.settings.customThemes[index];
      this.applyTheme();
    }

    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 删除自定义主题
   */
  deleteCustomTheme(id: string): void {
    const index = this.settings.customThemes.findIndex(t => t.id === id);
    if (index === -1) return;

    this.settings.customThemes.splice(index, 1);

    // 如果删除的是当前主题，切换到默认主题
    if (this.settings.currentTheme === id) {
      this.setTheme('default');
    }

    this.saveSettings();
    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 创建并添加自定义主题
   */
  createAndAddCustomTheme(id: string, name: string, primaryColor: string): ThemeConfig {
    const theme = createCustomTheme(id, name, primaryColor);
    this.addCustomTheme(theme);
    return theme;
  }

  // ==================== 模式管理 ====================

  /**
   * 设置主题模式
   */
  setMode(mode: ThemeMode): void {
    this.settings.mode = mode;
    this.applyTheme();
    this.saveSettings();

    this.modeChangeListeners.forEach(listener => listener(mode));
  }

  /**
   * 获取当前模式
   */
  getMode(): ThemeMode {
    return this.settings.mode;
  }

  /**
   * 获取实际生效的模式
   */
  getEffectiveMode(): ThemeMode {
    return this.effectiveMode;
  }

  /**
   * 切换浅色/深色模式
   */
  toggleMode(): void {
    const current = this.effectiveMode;
    const newMode: ThemeMode = current === 'dark' ? 'light' : 'dark';
    this.setMode(newMode);
  }

  /**
   * 是否为深色模式
   */
  isDark(): boolean {
    return isDarkMode(this.settings.mode);
  }

  // ==================== 主题应用 ====================

  /**
   * 应用主题
   */
  private applyTheme(): void {
    if (typeof document === 'undefined') return;

    const isDark = isDarkMode(this.settings.mode);
    this.effectiveMode = isDark ? 'dark' : 'light';

    // 设置data-theme属性
    document.documentElement.setAttribute('data-theme', this.currentTheme.id);

    // 设置dark class（Tailwind CSS）
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // 应用CSS变量
    this.applyCSSVariables();

    // 应用动画设置
    this.applyAnimations();
  }

  /**
   * 应用CSS变量
   */
  private applyCSSVariables(): void {
    if (typeof document === 'undefined') return;

    const palette = getColorPalette(this.currentTheme, this.settings.mode);
    const root = document.documentElement;

    // 应用颜色变量
    Object.entries(CSS_VARIABLE_MAP).forEach(([cssVar, paletteKey]) => {
      const value = palette[paletteKey];
      if (value) {
        root.style.setProperty(cssVar, value);
      }
    });

    // 应用其他变量
    const { borderRadius, boxShadow, fontFamily, fontSize, spacing, transition } = this.currentTheme;

    // 圆角
    Object.entries(borderRadius).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value);
    });

    // 阴影
    Object.entries(boxShadow).forEach(([key, value]) => {
      root.style.setProperty(`--shadow-${key}`, value);
    });

    // 字体
    Object.entries(fontFamily).forEach(([key, value]) => {
      root.style.setProperty(`--font-${key}`, value);
    });

    // 字号
    Object.entries(fontSize).forEach(([key, value]) => {
      root.style.setProperty(`--font-size-${key}`, value);
    });

    // 间距
    Object.entries(spacing).forEach(([key, value]) => {
      root.style.setProperty(`--spacing-${key}`, value);
    });

    // 过渡
    Object.entries(transition).forEach(([key, value]) => {
      root.style.setProperty(`--transition-${key}`, value);
    });
  }

  /**
   * 应用动画设置
   */
  private applyAnimations(): void {
    if (typeof document === 'undefined') return;

    if (this.settings.animations) {
      document.documentElement.classList.remove('no-animations');
    } else {
      document.documentElement.classList.add('no-animations');
    }
  }

  /**
   * 应用减少动画
   */
  private applyReducedMotion(): void {
    if (typeof document === 'undefined') return;

    if (this.settings.reducedMotion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
  }

  /**
   * 应用高对比度
   */
  private applyHighContrast(): void {
    if (typeof document === 'undefined') return;

    if (this.settings.highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }

  // ==================== 系统主题监听 ====================

  /**
   * 监听系统主题变化
   */
  private listenSystemTheme(): void {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (this.settings.mode === 'system' && this.settings.followSystem) {
        this.applyTheme();
        this.modeChangeListeners.forEach(listener => listener(this.effectiveMode));
      }
    };

    // 兼容旧版浏览器
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
    }
  }

  // ==================== 自动切换 ====================

  /**
   * 启动自动切换
   */
  private startAutoSwitch(): void {
    if (this.autoSwitchTimer) return;

    // 每分钟检查一次
    this.autoSwitchTimer = setInterval(() => {
      this.checkAutoSwitch();
    }, 60 * 1000);

    // 立即检查一次
    this.checkAutoSwitch();
  }

  /**
   * 停止自动切换
   */
  private stopAutoSwitch(): void {
    if (this.autoSwitchTimer) {
      clearInterval(this.autoSwitchTimer);
      this.autoSwitchTimer = null;
    }
  }

  /**
   * 检查是否需要自动切换
   */
  private checkAutoSwitch(): void {
    if (!this.settings.autoSwitch || !this.settings.autoSwitchTime) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const { lightStart, darkStart } = this.settings.autoSwitchTime;
    const lightMinutes = this.parseTime(lightStart);
    const darkMinutes = this.parseTime(darkStart);

    let shouldBeDark: boolean;

    if (lightMinutes < darkMinutes) {
      // 白天在中间
      shouldBeDark = currentMinutes < lightMinutes || currentMinutes >= darkMinutes;
    } else {
      // 黑夜在中间
      shouldBeDark = currentMinutes >= darkMinutes && currentMinutes < lightMinutes;
    }

    const isDark = this.effectiveMode === 'dark';
    if (shouldBeDark !== isDark) {
      this.setMode(shouldBeDark ? 'dark' : 'light');
    }
  }

  /**
   * 解析时间字符串为分钟数
   */
  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // ==================== 事件监听 ====================

  /**
   * 添加主题变化监听器
   */
  onThemeChange(listener: (theme: ThemeConfig) => void): () => void {
    this.themeChangeListeners.add(listener);
    return () => this.themeChangeListeners.delete(listener);
  }

  /**
   * 添加模式变化监听器
   */
  onModeChange(listener: (mode: ThemeMode) => void): () => void {
    this.modeChangeListeners.add(listener);
    return () => this.modeChangeListeners.delete(listener);
  }

  /**
   * 添加设置变化监听器
   */
  onSettingsChange(listener: (settings: ThemeSettings) => void): () => void {
    this.settingsChangeListeners.add(listener);
    return () => this.settingsChangeListeners.delete(listener);
  }

  // ==================== 工具方法 ====================

  /**
   * 获取当前颜色调色板
   */
  getCurrentPalette(): ColorPalette {
    return getColorPalette(this.currentTheme, this.settings.mode);
  }

  /**
   * 获取主色调
   */
  getPrimaryColor(): string {
    return this.getCurrentPalette().primary;
  }

  /**
   * 获取背景色
   */
  getBackgroundColor(): string {
    return this.getCurrentPalette().background;
  }

  /**
   * 获取前景色
   */
  getForegroundColor(): string {
    return this.getCurrentPalette().foreground;
  }

  /**
   * 重置为默认设置
   */
  resetToDefault(): void {
    this.settings = { ...DEFAULT_THEME_SETTINGS };
    this.currentTheme = DEFAULT_THEME;
    this.applyTheme();
    this.saveSettings();

    this.themeChangeListeners.forEach(listener => listener(this.currentTheme));
    this.modeChangeListeners.forEach(listener => listener(this.settings.mode));
    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 导出主题设置
   */
  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * 导入主题设置
   */
  importSettings(json: string): boolean {
    try {
      const settings = JSON.parse(json);
      this.settings = { ...DEFAULT_THEME_SETTINGS, ...settings };
      this.applyTheme();
      this.saveSettings();

      this.themeChangeListeners.forEach(listener => listener(this.currentTheme));
      this.modeChangeListeners.forEach(listener => listener(this.settings.mode));
      this.settingsChangeListeners.forEach(listener => listener(this.settings));

      return true;
    } catch (e) {
      console.error('Failed to import theme settings:', e);
      return false;
    }
  }
}

// 导出单例
export const themeManager = new ThemeManager();
