/**
 * i18n管理器
 * 负责语言切换、翻译、日期/数字格式化等
 */

import {
  LanguageCode,
  TranslationObject,
  TranslationValue,
  I18nSettings,
  DEFAULT_I18N_SETTINGS,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  formatDate,
  formatRelativeTime,
  formatNumber,
  formatFileSize,
  formatDuration,
  pluralize,
  isRTLLanguage,
} from './types';

// 导入翻译文件
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

/**
 * 翻译文件映射
 */
const TRANSLATIONS: Record<string, TranslationObject> = {
  'zh-CN': zhCN as TranslationObject,
  'en-US': enUS as TranslationObject,
};

/**
 * i18n管理器
 */
export class I18nManager {
  private settings: I18nSettings = { ...DEFAULT_I18N_SETTINGS };
  private currentLanguage: LanguageCode = DEFAULT_LANGUAGE;
  private translations: TranslationObject = {};
  private fallbackTranslations: TranslationObject = {};
  private missingKeys: Set<string> = new Set();

  // 事件监听器
  private languageChangeListeners: Set<(lang: LanguageCode) => void> = new Set();
  private settingsChangeListeners: Set<(settings: I18nSettings) => void> = new Set();

  constructor() {
    // 初始化
  }

  // ==================== 初始化 ====================

  /**
   * 初始化i18n管理器
   */
  init(): void {
    if (typeof window === 'undefined') return;

    // 加载设置
    this.loadSettings();

    // 自动检测语言
    if (this.settings.autoDetect) {
      const detected = detectBrowserLanguage();
      if (detected !== this.currentLanguage) {
        this.currentLanguage = detected;
      }
    }

    // 加载翻译
    this.loadTranslations();

    // 应用语言
    this.applyLanguage();
  }

  /**
   * 销毁i18n管理器
   */
  destroy(): void {
    this.languageChangeListeners.clear();
    this.settingsChangeListeners.clear();
    this.missingKeys.clear();
  }

  // ==================== 设置管理 ====================

  /**
   * 获取i18n设置
   */
  getSettings(): I18nSettings {
    return { ...this.settings };
  }

  /**
   * 更新i18n设置
   */
  updateSettings(updates: Partial<I18nSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();

    if (updates.language !== undefined) {
      this.setLanguage(updates.language);
    }

    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 保存设置到localStorage
   */
  private saveSettings(): void {
    if (typeof localStorage === 'undefined') return;
    if (!this.settings.persist) return;

    try {
      localStorage.setItem('i18n_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save i18n settings:', e);
    }
  }

  /**
   * 从localStorage加载设置
   */
  private loadSettings(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const saved = localStorage.getItem('i18n_settings');
      if (saved) {
        this.settings = { ...DEFAULT_I18N_SETTINGS, ...JSON.parse(saved) };
        this.currentLanguage = this.settings.language;
      }
    } catch (e) {
      console.error('Failed to load i18n settings:', e);
    }
  }

  // ==================== 语言管理 ====================

  /**
   * 设置语言
   */
  setLanguage(lang: LanguageCode): void {
    if (lang === this.currentLanguage) return;

    this.currentLanguage = lang;
    this.settings.language = lang;
    this.loadTranslations();
    this.applyLanguage();
    this.saveSettings();

    this.languageChangeListeners.forEach(listener => listener(lang));
  }

  /**
   * 获取当前语言
   */
  getLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * 是否支持该语言
   */
  isLanguageSupported(lang: string): boolean {
    return SUPPORTED_LANGUAGES.some(l => l.code === lang);
  }

  /**
   * 应用语言到HTML
   */
  private applyLanguage(): void {
    if (typeof document === 'undefined') return;

    // 设置lang属性
    document.documentElement.setAttribute('lang', this.currentLanguage);

    // 设置RTL
    if (isRTLLanguage(this.currentLanguage)) {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
  }

  // ==================== 翻译管理 ====================

  /**
   * 加载翻译
   */
  private loadTranslations(): void {
    // 加载当前语言翻译
    this.translations = TRANSLATIONS[this.currentLanguage] || {};

    // 加载回退语言翻译
    this.fallbackTranslations = TRANSLATIONS[this.settings.fallbackLanguage] || {};
  }

  /**
   * 添加翻译
   */
  addTranslations(lang: LanguageCode, translations: TranslationObject): void {
    if (!TRANSLATIONS[lang]) {
      TRANSLATIONS[lang] = {};
    }
    TRANSLATIONS[lang] = this.deepMerge(TRANSLATIONS[lang], translations);

    // 如果是当前语言，重新加载
    if (lang === this.currentLanguage) {
      this.loadTranslations();
    }
  }

  /**
   * 获取翻译
   */
  t(key: string, params?: Record<string, string | number>): string {
    // 从当前语言查找
    let value = this.getNestedValue(this.translations, key);

    // 如果没找到，从回退语言查找
    if (value === undefined || value === null) {
      value = this.getNestedValue(this.fallbackTranslations, key);

      // 记录缺失的key
      if (this.settings.missingKeyWarning && !this.missingKeys.has(key)) {
        this.missingKeys.add(key);
        console.warn(`[i18n] Missing translation key: ${key}`);
      }
    }

    // 如果还是没找到，返回key
    if (value === undefined || value === null) {
      return key;
    }

    // 如果是字符串，进行参数替换
    if (typeof value === 'string') {
      return this.interpolate(value, params);
    }

    // 如果是数组，返回第一个或拼接
    if (Array.isArray(value)) {
      return value.join(', ');
    }

    // 其他类型转字符串
    return String(value);
  }

  /**
   * 获取嵌套值
   */
  private getNestedValue(obj: TranslationObject, path: string): TranslationValue | undefined {
    const keys = path.split('.');
    let current: any = obj;

    for (const key of keys) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * 插值替换
   */
  private interpolate(str: string, params?: Record<string, string | number>): string {
    if (!params) return str;

    return str.replace(/\{(\w+)\}/g, (match, key) => {
      if (params[key] !== undefined) {
        return String(params[key]);
      }
      return match;
    });
  }

  /**
   * 深度合并
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 获取缺失的key列表
   */
  getMissingKeys(): string[] {
    return Array.from(this.missingKeys);
  }

  /**
   * 清除缺失的key记录
   */
  clearMissingKeys(): void {
    this.missingKeys.clear();
  }

  // ==================== 格式化 ====================

  /**
   * 格式化日期
   */
  formatDate(date: Date | number | string, options?: any): string {
    return formatDate(date, this.currentLanguage, options);
  }

  /**
   * 格式化相对时间
   */
  formatRelativeTime(date: Date | number | string, options?: any): string {
    return formatRelativeTime(date, this.currentLanguage, options);
  }

  /**
   * 格式化数字
   */
  formatNumber(num: number, options?: any): string {
    return formatNumber(num, this.currentLanguage, options);
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes: number, decimals?: number): string {
    return formatFileSize(bytes, this.currentLanguage, decimals);
  }

  /**
   * 格式化时长
   */
  formatDuration(seconds: number): string {
    return formatDuration(seconds, this.currentLanguage);
  }

  /**
   * 复数形式
   */
  pluralize(count: number, singular: string, plural: string): string {
    return pluralize(count, singular, plural, this.currentLanguage);
  }

  // ==================== 事件监听 ====================

  /**
   * 添加语言变化监听器
   */
  onLanguageChange(listener: (lang: LanguageCode) => void): () => void {
    this.languageChangeListeners.add(listener);
    return () => this.languageChangeListeners.delete(listener);
  }

  /**
   * 添加设置变化监听器
   */
  onSettingsChange(listener: (settings: I18nSettings) => void): () => void {
    this.settingsChangeListeners.add(listener);
    return () => this.settingsChangeListeners.delete(listener);
  }

  // ==================== 工具方法 ====================

  /**
   * 重置为默认设置
   */
  resetToDefault(): void {
    this.settings = { ...DEFAULT_I18N_SETTINGS };
    this.currentLanguage = DEFAULT_LANGUAGE;
    this.loadTranslations();
    this.applyLanguage();
    this.saveSettings();

    this.languageChangeListeners.forEach(listener => listener(this.currentLanguage));
    this.settingsChangeListeners.forEach(listener => listener(this.settings));
  }

  /**
   * 导出设置
   */
  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * 导入设置
   */
  importSettings(json: string): boolean {
    try {
      const settings = JSON.parse(json);
      this.settings = { ...DEFAULT_I18N_SETTINGS, ...settings };
      this.currentLanguage = this.settings.language;
      this.loadTranslations();
      this.applyLanguage();
      this.saveSettings();

      this.languageChangeListeners.forEach(listener => listener(this.currentLanguage));
      this.settingsChangeListeners.forEach(listener => listener(this.settings));

      return true;
    } catch (e) {
      console.error('Failed to import i18n settings:', e);
      return false;
    }
  }

  /**
   * 获取翻译对象
   */
  getTranslations(): TranslationObject {
    return { ...this.translations };
  }

  /**
   * 检查key是否存在
   */
  has(key: string): boolean {
    return (
      this.getNestedValue(this.translations, key) !== undefined ||
      this.getNestedValue(this.fallbackTranslations, key) !== undefined
    );
  }
}

// 导出单例
export const i18n = new I18nManager();
export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params);
