/**
 * 多语言系统模块入口
 * 导出所有i18n相关的类型和工具
 */

export * from './types';
export * from './i18n-manager';

// 导出常用的常量和Hook，方便使用
export { I18nManager } from './i18n-manager';
export { useI18n } from './i18n-manager';
export { LOCALES } from './i18n-manager';
export { DEFAULT_LOCALE } from './i18n-manager';
export type { Locale } from './types';
