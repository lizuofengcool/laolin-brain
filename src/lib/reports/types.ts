/**
 * 报表系统类型定义
 * 支持多种报表类型和配置
 */

import type { ChartConfig, ChartType } from '../visualization/types';

// 报表类型枚举
export type ReportType =
  | 'data'        // 数据报表
  | 'statistics'  // 统计报表
  | 'trend'       // 趋势报表
  | 'comparison'  // 对比报表
  | 'summary'     // 汇总报表
  | 'detail';     // 明细报表

// 报表状态
export type ReportStatus = 'draft' | 'published' | 'archived';

// 报表权限
export type ReportPermission = 'private' | 'team' | 'public';

// 报表数据配置
export interface ReportDataConfig {
  dataSource: string;
  fields: string[];
  filters?: ReportFilter[];
  sort?: ReportSort;
  groupBy?: string[];
  limit?: number;
}

// 报表筛选条件
export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between';
  value: any;
}

// 报表排序
export interface ReportSort {
  field: string;
  order: 'asc' | 'desc';
}

// 报表组件配置
export interface ReportWidget {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'text' | 'divider';
  title?: string;
  description?: string;
  width?: number; // 1-24 栅格系统
  height?: number;
  config?: ChartConfig | TableConfig | MetricConfig | TextConfig;
  dataConfig?: ReportDataConfig;
}

// 表格配置
export interface TableConfig {
  columns: TableColumn[];
  // 行数据：每行为「列 dataIndex → 单元格值」的映射，CSV 导出与表格渲染共用同一来源。
  // 可选以保持向后兼容——未提供时 CSV 仅导出列标题表头（历史行为）。
  rows?: Record<string, unknown>[];
  pagination?: boolean;
  pageSize?: number;
  sortable?: boolean;
  searchable?: boolean;
  exportable?: boolean;
}

// 表格列配置
export interface TableColumn {
  key: string;
  title: string;
  dataIndex: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  format?: (value: any) => string;
}

// 指标卡片配置
export interface MetricConfig {
  value: number | string;
  label: string;
  prefix?: string;
  suffix?: string;
  trend?: number; // 百分比变化
  trendDirection?: 'up' | 'down' | 'none';
  icon?: string;
  color?: string;
}

// 文本配置
export interface TextConfig {
  content: string;
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'left' | 'center' | 'right';
  color?: string;
}

// 报表布局
export interface ReportLayout {
  type: 'grid' | 'flex' | 'custom';
  columns?: number;
  gap?: number;
  widgets: ReportWidget[];
}

// 报表参数
export interface ReportParameter {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'daterange';
  required?: boolean;
  defaultValue?: any;
  options?: { label: string; value: any }[];
}

// 报表定义
export interface Report {
  id: string;
  name: string;
  description?: string;
  type: ReportType;
  status: ReportStatus;
  permission: ReportPermission;
  category?: string;
  tags?: string[];
  layout: ReportLayout;
  parameters?: ReportParameter[];
  dataConfig?: ReportDataConfig;
  coverImage?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  tenantId: string;
  isFavorite?: boolean;
  viewCount?: number;
  lastViewedAt?: Date;
}

// 报表模板
export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: ReportType;
  category: string;
  thumbnail?: string;
  layout: ReportLayout;
  parameters?: ReportParameter[];
  isBuiltIn: boolean;
  isRecommended?: boolean;
  sortOrder?: number;
}

// 报表订阅
export interface ReportSubscription {
  id: string;
  reportId: string;
  userId: string;
  tenantId: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'pdf' | 'excel' | 'image';
  channels: ('email' | 'in_app' | 'webhook')[];
  recipients?: string[];
  isEnabled: boolean;
  lastSentAt?: Date;
  nextSendAt?: Date;
  createdAt: Date;
}

// 报表导出选项
export interface ReportExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'png' | 'svg';
  includeData?: boolean;
  includeCharts?: boolean;
  quality?: 'low' | 'medium' | 'high';
  filename?: string;
}

// 报表查询参数
export interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: ReportType;
  category?: string;
  status?: ReportStatus;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  isFavorite?: boolean;
}

// 内置报表分类
export const REPORT_CATEGORIES = {
  overview: '概览',
  files: '文件分析',
  storage: '存储分析',
  users: '用户分析',
  activity: '活动分析',
  ai: 'AI分析',
  billing: '账单分析',
  custom: '自定义',
};

// 内置报表模板
//
// dataConfig 声明（本轮新增）：每个 widget 可选 dataConfig.dataSource 指向
// 后端可拉取的真实数据源。当前支持的 dataSource 取值见 src/lib/reports/data-fetcher.ts：
//   - 'stats:overview'  → lib/stats/stats-service.getOverviewStats（单对象，metric 取字段）
//   - 'stats:by-type'   → getStatsByType（types 数组，pie/bar 用 count/size 维度）
//   - 'stats:trend'     → getTrendStats（dailyStats 数组，line/bar/area 按字段取时间序列）
//   - 'stats:ai'        → getAiStats（metric 取单字段；pie 多字段聚合为分布）
//   - 'stats:activity'  → getActivityStats（含 userActivity top-N，可做 bar）
//
// 未声明 dataConfig 的 widget（如 user-activity 报表的 w1~w4，file-activity 的 w2 下载趋势，
// ai-usage 的 w6 调用趋势）暂无对应后端数据源，详情页继续走 mock 数据（下一轮替换）。
export const BUILTIN_REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'storage-overview',
    name: '存储概览',
    description: '存储使用情况总览，包含存储趋势、类型分布、大文件分析',
    type: 'summary',
    category: 'storage',
    isBuiltIn: true,
    isRecommended: true,
    layout: {
      type: 'grid',
      columns: 24,
      gap: 16,
      widgets: [
        { id: 'w1', type: 'metric', title: '总存储量', width: 6, config: { value: 0, label: '总存储量', suffix: ' GB' } as MetricConfig, dataConfig: { dataSource: 'stats:overview', fields: ['totalStorage'] } },
        { id: 'w2', type: 'metric', title: '文件总数', width: 6, config: { value: 0, label: '文件总数' } as MetricConfig, dataConfig: { dataSource: 'stats:overview', fields: ['totalFiles'] } },
        { id: 'w3', type: 'metric', title: '文件夹数', width: 6, config: { value: 0, label: '文件夹数' } as MetricConfig, dataConfig: { dataSource: 'stats:overview', fields: ['totalFolders'] } },
        { id: 'w4', type: 'metric', title: '存储使用率', width: 6, config: { value: 0, label: '存储使用率', suffix: '%' } as MetricConfig, dataConfig: { dataSource: 'stats:overview', fields: ['storageUsagePercent'] } },
        { id: 'w5', type: 'chart', title: '存储使用趋势', width: 12, config: { type: 'line' } as ChartConfig, dataConfig: { dataSource: 'stats:trend', fields: ['totalStorage'] } },
        { id: 'w6', type: 'chart', title: '文件类型分布', width: 12, config: { type: 'pie' } as ChartConfig, dataConfig: { dataSource: 'stats:by-type', fields: ['count'] } },
      ],
    },
  },
  {
    id: 'file-activity',
    name: '文件活跃度',
    description: '文件上传、下载、编辑等活动统计分析',
    type: 'trend',
    category: 'files',
    isBuiltIn: true,
    layout: {
      type: 'grid',
      columns: 24,
      gap: 16,
      widgets: [
        { id: 'w1', type: 'chart', title: '上传趋势', width: 12, config: { type: 'bar' } as ChartConfig, dataConfig: { dataSource: 'stats:trend', fields: ['newFiles'] } },
        { id: 'w2', type: 'chart', title: '下载趋势', width: 12, config: { type: 'line' } as ChartConfig },
        { id: 'w3', type: 'table', title: '热门文件', width: 24, config: { columns: [] } as TableConfig },
      ],
    },
  },
  {
    id: 'user-activity',
    name: '用户活跃度',
    description: '用户登录、使用时长、功能使用等统计',
    type: 'statistics',
    category: 'users',
    isBuiltIn: true,
    layout: {
      type: 'grid',
      columns: 24,
      gap: 16,
      widgets: [
        { id: 'w1', type: 'metric', title: '活跃用户', width: 8, config: { value: 0, label: '日活跃用户' } as MetricConfig },
        { id: 'w2', type: 'metric', title: '新增用户', width: 8, config: { value: 0, label: '新增用户' } as MetricConfig },
        { id: 'w3', type: 'metric', title: '留存率', width: 8, config: { value: 0, label: '7日留存率', suffix: '%' } as MetricConfig },
        { id: 'w4', type: 'chart', title: '用户增长趋势', width: 24, config: { type: 'area' } as ChartConfig },
      ],
    },
  },
  {
    id: 'ai-usage',
    name: 'AI使用分析',
    description: 'AI功能使用情况统计和分析',
    type: 'statistics',
    category: 'ai',
    isBuiltIn: true,
    layout: {
      type: 'grid',
      columns: 24,
      gap: 16,
      widgets: [
        { id: 'w1', type: 'metric', title: '总调用次数', width: 6, config: { value: 0, label: '总调用次数' } as MetricConfig, dataConfig: { dataSource: 'stats:ai', fields: ['totalCalls'] } },
        { id: 'w2', type: 'metric', title: '摘要生成', width: 6, config: { value: 0, label: '摘要生成' } as MetricConfig, dataConfig: { dataSource: 'stats:ai', fields: ['summaryCalls'] } },
        { id: 'w3', type: 'metric', title: 'OCR识别', width: 6, config: { value: 0, label: 'OCR识别' } as MetricConfig, dataConfig: { dataSource: 'stats:ai', fields: ['ocrCalls'] } },
        { id: 'w4', type: 'metric', title: '配额使用', width: 6, config: { value: 0, label: '配额使用', suffix: '%' } as MetricConfig, dataConfig: { dataSource: 'stats:ai', fields: ['quotaPercent'] } },
        { id: 'w5', type: 'chart', title: '功能使用分布', width: 12, config: { type: 'pie' } as ChartConfig, dataConfig: { dataSource: 'stats:ai', fields: ['summaryCalls', 'ocrCalls', 'describeCalls', 'tagCalls', 'qnaCalls'] } },
        { id: 'w6', type: 'chart', title: '调用趋势', width: 12, config: { type: 'line' } as ChartConfig },
      ],
    },
  },
];
