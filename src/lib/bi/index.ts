/**
 * 商业智能（BI）模块入口
 * 导出所有BI相关的类型和工具
 */

export * from './types';
export * from './bi-manager';

// 导出单例实例，方便使用
export { biManager } from './bi-manager';
export { BiManager } from './bi-manager';
