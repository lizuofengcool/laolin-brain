/**
 * 商业智能（BI）类型定义
 * 支持仪表盘、KPI管理、业务分析等
 */

// 仪表盘类型
export type DashboardType = 'business' | 'data' | 'custom';

// 仪表盘状态
export type DashboardStatus = 'draft' | 'published' | 'archived';

// KPI状态
export type KpiStatus = 'normal' | 'warning' | 'critical' | 'improving' | 'declining';

// 业务分析类型
export type AnalysisCategory =
  | 'user'      // 用户分析
  | 'behavior'  // 行为分析
  | 'conversion' // 转化分析
  | 'retention'  // 留存分析
  | 'revenue'    // 收入分析
  | 'growth';    // 增长分析

// 仪表盘组件类型
export type DashboardWidgetType =
  | 'kpi'           // KPI卡片
  | 'chart'         // 图表
  | 'table'         // 表格
  | 'metric'        // 指标
  | 'trend'         // 趋势
  | 'comparison'    // 对比
  | 'funnel'        // 漏斗
  | 'gauge'         // 仪表盘
  | 'scorecard'     // 记分卡
  | 'text'          // 文本
  | 'divider';      // 分隔线

// KPI定义
export interface KpiDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  unit?: string;
  formula?: string;
  dataSource?: string;
  targetValue?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral';
  displayFormat?: 'number' | 'currency' | 'percentage' | 'time';
  isActive: boolean;
  sortOrder?: number;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

// KPI当前值
export interface KpiValue {
  kpiId: string;
  currentValue: number;
  previousValue?: number;
  targetValue?: number;
  change?: number;
  changePercent?: number;
  status: KpiStatus;
  trend: 'up' | 'down' | 'stable';
  period: string;
  asOfDate: Date;
}

// 仪表盘组件
export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title?: string;
  description?: string;
  width: number; // 1-24 栅格
  height?: number;
  x?: number;
  y?: number;
  config: Record<string, any>;
  dataSource?: string;
  filters?: Record<string, any>;
  refreshInterval?: number; // 秒
}

// 仪表盘定义
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  type: DashboardType;
  status: DashboardStatus;
  category?: string;
  tags?: string[];
  coverImage?: string;
  widgets: DashboardWidget[];
  layout: 'grid' | 'free';
  filters?: Record<string, any>;
  defaultTimeRange?: string;
  isFavorite?: boolean;
  viewCount?: number;
  lastViewedAt?: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  tenantId: string;
}

// 业务分析报告
export interface BusinessAnalysis {
  id: string;
  name: string;
  description?: string;
  category: AnalysisCategory;
  type: string;
  metrics: string[];
  dimensions: string[];
  filters?: Record<string, any>;
  timeRange?: {
    start: Date;
    end: Date;
    granularity: string;
  };
  results: Record<string, any>;
  insights: string[];
  recommendations?: string[];
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  createdBy: string;
}

// 数据看板
export interface DataBoard {
  id: string;
  name: string;
  description?: string;
  category: string;
  widgets: Array<{
    id: string;
    type: string;
    title: string;
    data: any;
  }>;
  layout: 'grid' | 'list';
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  createdBy: string;
}

// 数据预警
export interface DataAlert {
  id: string;
  name: string;
  description?: string;
  metric: string;
  condition: 'above' | 'below' | 'equals' | 'changes_by';
  threshold: number;
  unit?: string;
  frequency: 'realtime' | 'daily' | 'weekly';
  channels: Array<'email' | 'in_app' | 'webhook'>;
  recipients?: string[];
  isEnabled: boolean;
  lastTriggeredAt?: Date;
  triggerCount: number;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  createdBy: string;
}

// 数据推荐
export interface DataRecommendation {
  id: string;
  type: 'insight' | 'action' | 'optimization';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  category: string;
  relatedMetrics?: string[];
  suggestedActions?: string[];
  impact?: {
    area: string;
    expectedImprovement: string;
  };
  createdAt: Date;
  tenantId: string;
}

// 数据洞察
export interface DataInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'pattern' | 'correlation' | 'outlier';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  confidence: number;
  data: Record<string, any>;
  metric?: string;
  dimension?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  suggestions?: string[];
  createdAt: Date;
  tenantId: string;
}

// 增长分析
export interface GrowthAnalysis {
  period: string;
  newUsers: number;
  activeUsers: number;
  retentionRate: number;
  churnRate: number;
  revenue: number;
  arpu: number; // 每用户平均收入
  ltv: number; // 用户生命周期价值
  growthRate: {
    users: number;
    revenue: number;
    engagement: number;
  };
  breakdown?: Record<string, any>;
}

// 留存分析
export interface RetentionAnalysis {
  cohort: string;
  cohortSize: number;
  periods: Array<{
    period: number;
    label: string;
    retained: number;
    retentionRate: number;
  }>;
  overallRetention: number;
  benchmark?: number;
}

// 转化漏斗
export interface ConversionFunnel {
  name: string;
  steps: Array<{
    name: string;
    count: number;
    percentage: number;
    conversionRate: number;
    dropOff: number;
  }>;
  totalConversions: number;
  overallConversionRate: number;
  bottlenecks: string[];
  suggestions?: string[];
}

// 预设KPI
export const DEFAULT_KPIS: Omit<KpiDefinition, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '总用户数',
    description: '系统中的总用户数量',
    category: 'user',
    unit: '人',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 1,
  },
  {
    name: '日活跃用户',
    description: '每日活跃用户数量',
    category: 'user',
    unit: '人',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 2,
  },
  {
    name: '月活跃用户',
    description: '每月活跃用户数量',
    category: 'user',
    unit: '人',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 3,
  },
  {
    name: '用户留存率',
    description: '7日用户留存率',
    category: 'user',
    unit: '%',
    direction: 'higher_is_better',
    displayFormat: 'percentage',
    isActive: true,
    sortOrder: 4,
  },
  {
    name: '总存储量',
    description: '已使用的存储空间',
    category: 'storage',
    unit: 'GB',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 5,
  },
  {
    name: '文件总数',
    description: '系统中的文件总数',
    category: 'files',
    unit: '个',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 6,
  },
  {
    name: 'AI调用次数',
    description: 'AI功能总调用次数',
    category: 'ai',
    unit: '次',
    direction: 'higher_is_better',
    displayFormat: 'number',
    isActive: true,
    sortOrder: 7,
  },
  {
    name: '收入',
    description: '总收入金额',
    category: 'revenue',
    unit: '元',
    direction: 'higher_is_better',
    displayFormat: 'currency',
    isActive: true,
    sortOrder: 8,
  },
];

// 预设仪表盘模板
export const DASHBOARD_TEMPLATES = [
  {
    id: 'overview',
    name: '业务概览',
    description: '核心业务指标总览',
    type: 'business' as DashboardType,
    category: 'overview',
    widgets: [
      { type: 'kpi', title: '总用户数', width: 6 },
      { type: 'kpi', title: '日活跃', width: 6 },
      { type: 'kpi', title: '收入', width: 6 },
      { type: 'kpi', title: '留存率', width: 6 },
      { type: 'chart', title: '用户增长趋势', width: 12 },
      { type: 'chart', title: '收入趋势', width: 12 },
    ],
  },
  {
    id: 'user-analytics',
    name: '用户分析',
    description: '用户行为和留存分析',
    type: 'business' as DashboardType,
    category: 'user',
    widgets: [
      { type: 'kpi', title: '新增用户', width: 6 },
      { type: 'kpi', title: '活跃用户', width: 6 },
      { type: 'kpi', title: '留存率', width: 6 },
      { type: 'kpi', title: '流失率', width: 6 },
      { type: 'chart', title: '用户增长', width: 12 },
      { type: 'funnel', title: '转化漏斗', width: 12 },
    ],
  },
  {
    id: 'storage-analytics',
    name: '存储分析',
    description: '存储使用情况分析',
    type: 'data' as DashboardType,
    category: 'storage',
    widgets: [
      { type: 'kpi', title: '总存储量', width: 6 },
      { type: 'kpi', title: '文件总数', width: 6 },
      { type: 'kpi', title: '存储使用率', width: 6 },
      { type: 'kpi', title: '大文件数', width: 6 },
      { type: 'chart', title: '存储趋势', width: 12 },
      { type: 'chart', title: '类型分布', width: 12 },
    ],
  },
];
