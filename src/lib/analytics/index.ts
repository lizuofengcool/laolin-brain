/**
 * 数据分析模块入口
 * 导出所有数据分析相关的类型和工具
 */

export * from './types';
export * from './analytics-manager';

// 导出单例实例，方便使用
export { analyticsManager } from './analytics-manager';
export { AnalyticsManager } from './analytics-manager';
