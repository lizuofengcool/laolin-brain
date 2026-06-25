/**
 * 数据分析类型定义
 * 支持基础统计、趋势分析、异常检测等
 */

// 分析类型
export type AnalysisType =
  | 'statistics'    // 基础统计
  | 'trend'         // 趋势分析
  | 'comparison'    // 对比分析
  | 'correlation'   // 相关性分析
  | 'anomaly'       // 异常检测
  | 'forecast'      // 预测分析
  | 'clustering'    // 聚类分析
  | 'classification'; // 分类分析

// 数据维度
export interface DataDimension {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description?: string;
}

// 数据指标
export interface DataMetric {
  name: string;
  type: 'count' | 'sum' | 'avg' | 'max' | 'min' | 'median' | 'std' | 'ratio';
  description?: string;
  unit?: string;
}

// 基础统计结果
export interface BasicStatistics {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number | null;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  q1: number; // 第一四分位数
  q3: number; // 第三四分位数
  iqr: number; // 四分位距
}

// 趋势分析结果
export interface TrendAnalysis {
  trend: 'up' | 'down' | 'stable';
  slope: number;
  intercept: number;
  rSquared: number; // 拟合优度
  growthRate: number; // 增长率
  confidence: number; // 置信度
  points: Array<{ x: number; y: number; predicted: number }>;
}

// 对比分析结果
export interface ComparisonResult {
  groups: string[];
  metrics: Record<string, {
    values: number[];
    differences: number[];
    percentages: number[];
    isSignificant: boolean;
  }>;
  summary: {
    biggestChange: string;
    changeDirection: 'up' | 'down';
    changeAmount: number;
    changePercent: number;
  };
}

// 相关性分析结果
export interface CorrelationResult {
  variables: [string, string];
  correlation: number; // 相关系数 -1 到 1
  pValue: number; // P值
  isSignificant: boolean;
  strength: 'none' | 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative' | 'none';
}

// 异常检测结果
export interface AnomalyResult {
  totalCount: number;
  anomalyCount: number;
  anomalies: Array<{
    index: number;
    value: number;
    expected: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
    zScore?: number;
  }>;
  threshold: number;
  method: 'zscore' | 'iqr' | 'isolation_forest';
}

// 预测分析结果
export interface ForecastResult {
  method: string;
  periods: number;
  predictions: Array<{
    period: number;
    value: number;
    lower: number;
    upper: number;
    confidence: number;
  }>;
  accuracy: {
    mae: number; // 平均绝对误差
    mse: number; // 均方误差
    rmse: number; // 均方根误差
    mape: number; // 平均绝对百分比误差
  };
}

// 聚类分析结果
export interface ClusteringResult {
  method: string;
  clusterCount: number;
  clusters: Array<{
    id: number;
    name: string;
    size: number;
    center: number[];
    members: number[];
    characteristics: Record<string, any>;
  }>;
  silhouetteScore: number; // 轮廓系数
}

// 数据洞察
export interface DataInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'correlation' | 'pattern' | 'outlier' | 'summary';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  confidence: number;
  data: Record<string, any>;
  suggestions?: string[];
  timestamp: Date;
}

// 分析报告
export interface AnalysisReport {
  id: string;
  title: string;
  description?: string;
  type: AnalysisType;
  dataSource: string;
  dimensions: DataDimension[];
  metrics: DataMetric[];
  parameters: Record<string, any>;
  results: Record<string, any>;
  insights: DataInsight[];
  createdAt: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  tenantId: string;
  createdBy: string;
}

// 分析任务
export interface AnalysisTask {
  id: string;
  type: AnalysisType;
  name: string;
  dataSource: string;
  parameters: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: AnalysisReport;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  tenantId: string;
  createdBy: string;
}

// 时间粒度
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

// 时间范围
export interface TimeRange {
  start: Date;
  end: Date;
  granularity: TimeGranularity;
}

// 数据筛选条件
export interface DataFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'contains';
  value: any;
}

// 分析配置
export interface AnalysisConfig {
  type: AnalysisType;
  dataSource: string;
  dimensions?: string[];
  metrics?: string[];
  filters?: DataFilter[];
  timeRange?: TimeRange;
  parameters?: Record<string, any>;
}

// 预设分析模板
export const ANALYSIS_TEMPLATES = [
  {
    id: 'storage-trend',
    name: '存储趋势分析',
    type: 'trend' as AnalysisType,
    description: '分析存储使用量的变化趋势',
    category: 'storage',
  },
  {
    id: 'file-growth',
    name: '文件增长分析',
    type: 'trend' as AnalysisType,
    description: '分析文件数量的增长趋势',
    category: 'files',
  },
  {
    id: 'user-activity',
    name: '用户活跃度分析',
    type: 'statistics' as AnalysisType,
    description: '分析用户活跃度统计',
    category: 'users',
  },
  {
    id: 'ai-usage',
    name: 'AI使用分析',
    type: 'statistics' as AnalysisType,
    description: '分析AI功能使用情况',
    category: 'ai',
  },
  {
    id: 'upload-pattern',
    name: '上传模式分析',
    type: 'clustering' as AnalysisType,
    description: '分析用户上传行为模式',
    category: 'files',
  },
  {
    id: 'anomaly-detection',
    name: '异常检测',
    type: 'anomaly' as AnalysisType,
    description: '检测数据中的异常值',
    category: 'general',
  },
];
