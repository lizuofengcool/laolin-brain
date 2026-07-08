/**
 * 多语言系统类型定义
 * 支持多种语言、语言切换、翻译等
 */

// ==================== 语言类型 ====================

/**
 * 语言代码
 */
export type LanguageCode =
  | 'zh-CN' // 简体中文
  | 'zh-TW' // 繁体中文
  | 'en-US' // 英语（美国）
  | 'ja-JP' // 日语
  | 'ko-KR' // 韩语
  | 'fr-FR' // 法语
  | 'de-DE' // 德语
  | 'es-ES' // 西班牙语
  | 'ru-RU' // 俄语
  | 'pt-BR'; // 葡萄牙语（巴西）

/**
 * 语言信息
 */
export interface LanguageInfo {
  code: LanguageCode;
  name: string; // 语言名称（原生语言）
  nativeName: string; // 语言名称（本语言）
  flag?: string; // 国旗emoji
  direction: 'ltr' | 'rtl'; // 文字方向
  isRTL: boolean; // 是否从右到左
}

/**
 * 支持的语言列表
 */
export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  {
    code: 'zh-CN',
    name: '简体中文',
    nativeName: '简体中文',
    flag: '🇨🇳',
    direction: 'ltr',
    isRTL: false,
  },
  {
    code: 'zh-TW',
    name: '繁体中文',
    nativeName: '繁體中文',
    flag: '🇹🇼',
    direction: 'ltr',
    isRTL: false,
  },
  {
    code: 'en-US',
    name: '英语',
    nativeName: 'English',
    flag: '🇺🇸',
    direction: 'ltr',
    isRTL: false,
  },
  {
    code: 'ja-JP',
    name: '日语',
    nativeName: '日本語',
    flag: '🇯🇵',
    direction: 'ltr',
    isRTL: false,
  },
  {
    code: 'ko-KR',
    name: '韩语',
    nativeName: '한국어',
    flag: '🇰🇷',
    direction: 'ltr',
    isRTL: false,
  },
];

/**
 * 默认语言
 */
export const DEFAULT_LANGUAGE: LanguageCode = 'zh-CN';

/**
 * 语言名称映射
 */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'fr-FR': 'Français',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'ru-RU': 'Русский',
  'pt-BR': 'Português',
};

// ==================== 翻译类型 ====================

/**
 * 翻译值类型
 */
export type TranslationValue = string | string[] | TranslationObject;

/**
 * 翻译对象
 */
export interface TranslationObject {
  [key: string]: TranslationValue;
}

/**
 * 翻译字典
 */
export type TranslationDictionary = TranslationObject;

/**
 * 翻译模块
 */
export interface TranslationModule {
  common: TranslationObject;
  nav: TranslationObject;
  files: TranslationObject;
  folders: TranslationObject;
  search: TranslationObject;
  settings: TranslationObject;
  notifications: TranslationObject;
  share: TranslationObject;
  trash: TranslationObject;
  ai: TranslationObject;
  storage: TranslationObject;
  auth: TranslationObject;
  errors: TranslationObject;
  [key: string]: TranslationObject;
}

// ==================== 日期/数字格式 ====================

/**
 * 日期格式选项
 */
export interface DateFormatOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  year?: 'numeric' | '2-digit';
  month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow';
  day?: 'numeric' | '2-digit';
  hour?: 'numeric' | '2-digit';
  minute?: 'numeric' | '2-digit';
  second?: 'numeric' | '2-digit';
  weekday?: 'long' | 'short' | 'narrow';
}

/**
 * 数字格式选项
 */
export interface NumberFormatOptions {
  style?: 'decimal' | 'currency' | 'percent';
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
}

/**
 * 相对时间格式选项
 */
export interface RelativeTimeFormatOptions {
  numeric?: 'always' | 'auto';
  style?: 'long' | 'short' | 'narrow';
}

// ==================== i18n设置 ====================

/**
 * i18n设置
 */
export interface I18nSettings {
  language: LanguageCode;
  fallbackLanguage: LanguageCode;
  autoDetect: boolean;
  persist: boolean;
  dateFormat: DateFormatOptions;
  numberFormat: NumberFormatOptions;
  showOriginal: boolean; // 显示原文（用于翻译调试）
  missingKeyWarning: boolean; // 缺失key警告
}

/**
 * 默认i18n设置
 */
export const DEFAULT_I18N_SETTINGS: I18nSettings = {
  language: DEFAULT_LANGUAGE,
  fallbackLanguage: 'en-US',
  autoDetect: true,
  persist: true,
  dateFormat: {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
  numberFormat: {
    style: 'decimal',
    useGrouping: true,
  },
  showOriginal: false,
  missingKeyWarning: true,
};

// ==================== 工具函数 ====================

/**
 * 检测浏览器语言
 */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const browserLang = navigator.language || (navigator as any).userLanguage;

  // navigator.language 可能为空字符串，且 (navigator as any).userLanguage 可能 undefined，
  // 此时 browserLang 为 undefined/'' —— 直接回退默认语言，避免对 undefined 调用 .split 抛
  // TypeError，也避免空字符串前缀 '' 误命中（所有 code 均 startsWith('')）。
  if (!browserLang || typeof browserLang !== 'string') {
    return DEFAULT_LANGUAGE;
  }

  // 精确匹配
  if (SUPPORTED_LANGUAGES.some(l => l.code === browserLang)) {
    return browserLang as LanguageCode;
  }

  // 前缀匹配（如 zh -> zh-CN）
  const prefix = browserLang.split('-')[0];
  const matched = SUPPORTED_LANGUAGES.find(l => l.code.startsWith(prefix));
  if (matched) {
    return matched.code;
  }

  return DEFAULT_LANGUAGE;
}

/**
 * 获取语言信息
 */
export function getLanguageInfo(code: LanguageCode): LanguageInfo | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
}

/**
 * 获取语言名称
 */
export function getLanguageName(code: LanguageCode): string {
  return LANGUAGE_NAMES[code] || code;
}

/**
 * 判断是否为RTL语言
 */
export function isRTLLanguage(code: LanguageCode): boolean {
  const info = getLanguageInfo(code);
  return info?.isRTL || false;
}

/**
 * 获取支持的语言列表
 */
export function getSupportedLanguages(): LanguageInfo[] {
  return [...SUPPORTED_LANGUAGES];
}

/**
 * 格式化日期
 */
export function formatDate(
  date: Date | number | string,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  options?: DateFormatOptions
): string {
  const d = new Date(date);
  try {
    return new Intl.DateTimeFormat(locale, options as Intl.DateTimeFormatOptions).format(d);
  } catch (e) {
    return d.toLocaleString();
  }
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(
  date: Date | number | string,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  options?: RelativeTimeFormatOptions
): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = d.getTime() - now;

  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30);
  const years = Math.round(days / 365);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, options as Intl.RelativeTimeFormatOptions);

    if (Math.abs(seconds) < 60) {
      return rtf.format(seconds, 'second');
    } else if (Math.abs(minutes) < 60) {
      return rtf.format(minutes, 'minute');
    } else if (Math.abs(hours) < 24) {
      return rtf.format(hours, 'hour');
    } else if (Math.abs(days) < 7) {
      return rtf.format(days, 'day');
    } else if (Math.abs(weeks) < 4) {
      return rtf.format(weeks, 'week');
    } else if (Math.abs(months) < 12) {
      return rtf.format(months, 'month');
    } else {
      return rtf.format(years, 'year');
    }
  } catch (e) {
    return formatDate(date, locale);
  }
}

/**
 * 格式化数字
 */
export function formatNumber(
  num: number,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  options?: NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale, options as Intl.NumberFormatOptions).format(num);
  } catch (e) {
    return num.toString();
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(
  bytes: number,
  locale: LanguageCode = DEFAULT_LANGUAGE,
  decimals = 2
): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${formatNumber(value, locale)} ${sizes[i]}`;
}

/**
 * 格式化时间（秒）
 */
export function formatDuration(
  seconds: number,
  locale: LanguageCode = DEFAULT_LANGUAGE
): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

/**
 * 复数形式
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string,
  locale: LanguageCode = DEFAULT_LANGUAGE
): string {
  // 简单实现，实际可以使用Intl.PluralRules
  return count === 1 ? singular : plural;
}
