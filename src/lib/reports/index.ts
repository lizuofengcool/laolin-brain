/**
 * 报表系统模块入口
 * 导出所有报表相关的类型和工具
 */

export * from './types';
export * from './report-manager';

// 导出单例实例，方便使用
export { reportManager } from './report-manager';
export { ReportManager } from './report-manager';
