/**
 * 数据可视化工具函数
 * 包含数据处理、格式化、导出等工具
 */

import type { DataPoint, ChartSeries, ChartConfig, ExportOptions } from './types';
import { CHART_COLORS } from './types';
import { escapeCsvCell } from '../csv-utils';

/**
 * 数据格式化工具
 */
export const formatUtils = {
  // 格式化数字
  formatNumber: (value: number, decimals = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  },

  // 格式化百分比
  formatPercent: (value: number, decimals = 1): string => {
    return (value * 100).toFixed(decimals) + '%';
  },

  // 格式化货币
  formatCurrency: (value: number, currency = '¥', decimals = 2): string => {
    return currency + value.toFixed(decimals);
  },

  // 格式化文件大小
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // 格式化日期
  formatDate: (date: Date | string, format = 'YYYY-MM-DD'): string => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes);
  },

  // 格式化时间
  formatTime: (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  },
};

/**
 * 数据处理工具
 */
export const dataUtils = {
  // 按字段分组
  groupBy: <T extends Record<string, any>>(data: T[], key: string): Record<string, T[]> => {
    return data.reduce((acc, item) => {
      const groupKey = item[key];
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  },

  // 数据求和
  sum: (data: DataPoint[], key = 'value'): number => {
    return data.reduce((acc, item) => acc + (item[key] || 0), 0);
  },

  // 数据平均值
  average: (data: DataPoint[], key = 'value'): number => {
    if (data.length === 0) return 0;
    return dataUtils.sum(data, key) / data.length;
  },

  // 数据最大值
  max: (data: DataPoint[], key = 'value'): number => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(item => item[key] || 0));
  },

  // 数据最小值
  min: (data: DataPoint[], key = 'value'): number => {
    if (data.length === 0) return 0;
    return Math.min(...data.map(item => item[key] || 0));
  },

  // 数据排序
  sort: (data: DataPoint[], key = 'value', order: 'asc' | 'desc' = 'desc'): DataPoint[] => {
    return [...data].sort((a, b) => {
      const aVal = a[key] || 0;
      const bVal = b[key] || 0;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  },

  // 取前N条数据
  topN: (data: DataPoint[], n: number, key = 'value'): DataPoint[] => {
    return dataUtils.sort(data, key, 'desc').slice(0, n);
  },

  // 计算百分比
  calculatePercentages: (data: DataPoint[], key = 'value'): DataPoint[] => {
    const total = dataUtils.sum(data, key);
    return data.map(item => ({
      ...item,
      percentage: total > 0 ? (item[key] || 0) / total : 0,
    }));
  },

  // 数据归一化
  normalize: (data: DataPoint[], key = 'value'): DataPoint[] => {
    const max = dataUtils.max(data, key);
    const min = dataUtils.min(data, key);
    const range = max - min;
    return data.map(item => ({
      ...item,
      normalized: range > 0 ? ((item[key] || 0) - min) / range : 0,
    }));
  },

  // 生成时间序列数据
  generateTimeSeries: (startDate: Date, endDate: Date, interval: 'day' | 'week' | 'month'): DataPoint[] => {
    const result: DataPoint[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      result.push({
        name: formatUtils.formatDate(current),
        value: 0,
        date: new Date(current),
      });
      
      if (interval === 'day') {
        current.setDate(current.getDate() + 1);
      } else if (interval === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setMonth(current.getMonth() + 1);
      }
    }
    
    return result;
  },

  // 数据去重
  unique: <T>(data: T[], key?: string): T[] => {
    if (key) {
      const seen = new Set();
      return data.filter(item => {
        const val = (item as any)[key];
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
    }
    return [...new Set(data)];
  },
};

/**
 * 图表工具函数
 */
export const chartUtils = {
  // 获取配色方案
  getColors: (scheme: keyof typeof CHART_COLORS = 'default'): string[] => {
    return CHART_COLORS[scheme] || CHART_COLORS.default;
  },

  // 获取单个颜色
  getColor: (index: number, scheme: keyof typeof CHART_COLORS = 'default'): string => {
    const colors = chartUtils.getColors(scheme);
    return colors[index % colors.length];
  },

  // 生成渐变色
  generateGradient: (color: string, opacity = 0.3): string => {
    return `linear-gradient(to bottom, ${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}, transparent)`;
  },

  // 计算图表尺寸
  calculateSize: (containerWidth: number, containerHeight: number, aspectRatio = 16 / 9) => {
    let width = containerWidth;
    let height = width / aspectRatio;
    
    if (height > containerHeight) {
      height = containerHeight;
      width = height * aspectRatio;
    }
    
    return { width, height };
  },

  // 适配响应式图表
  getResponsiveConfig: (config: ChartConfig, containerWidth: number): ChartConfig => {
    return {
      ...config,
      width: containerWidth,
    };
  },
};

/**
 * 数据导出工具
 */
export const exportUtils = {
  // 导出为CSV
  // RFC 4180 合规：单元格转义统一走 escapeCsvCell（src/lib/csv-utils.ts）；
  // 行分隔符使用 \r\n；前置 BOM(\uFEFF) 以兼容 Excel UTF-8 自动识别。
  toCSV: (data: DataPoint[], columns?: string[]): string => {
    if (data.length === 0) return '';

    const keys = columns || Object.keys(data[0]);

    const header = keys.map(k => escapeCsvCell(k)).join(',');
    const rows = data.map(item =>
      keys.map(key => escapeCsvCell(item[key])).join(',')
    );

    return '\uFEFF' + [header, ...rows].join('\r\n');
  },

  // 导出为JSON
  toJSON: (data: any, pretty = true): string => {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  },

  // 下载文件
  downloadFile: (content: string, filename: string, mimeType = 'text/plain'): void => {
    if (typeof document === 'undefined') return;
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // 导出图表数据
  exportChartData: (data: DataPoint[], options: ExportOptions): void => {
    const { format, filename = 'chart-data' } = options;
    
    switch (format) {
      case 'csv':
        exportUtils.downloadFile(exportUtils.toCSV(data), `${filename}.csv`, 'text/csv');
        break;
      case 'json':
        exportUtils.downloadFile(exportUtils.toJSON(data), `${filename}.json`, 'application/json');
        break;
      default:
        console.warn(`Unsupported export format: ${format}`);
    }
  },
};

/**
 * 统计分析工具
 */
export const statsUtils = {
  // 计算标准差
  standardDeviation: (data: number[]): number => {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const squaredDiffs = data.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(variance);
  },

  // 计算中位数
  median: (data: number[]): number => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },

  // 计算众数
  mode: (data: number[]): number | null => {
    if (data.length === 0) return null;
    const frequency: Record<number, number> = {};
    let maxFreq = 0;
    let mode: number | null = null;
    
    for (const value of data) {
      frequency[value] = (frequency[value] || 0) + 1;
      if (frequency[value] > maxFreq) {
        maxFreq = frequency[value];
        mode = value;
      }
    }
    
    return mode;
  },

  // 计算分位数
  quantile: (data: number[], q: number): number => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  },

  // 计算相关系数
  correlation: (x: number[], y: number[]): number => {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const sumX2 = x.reduce((acc, val) => acc + val * val, 0);
    const sumY2 = y.reduce((acc, val) => acc + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  },

  // 检测异常值（基于Z-score）
  detectOutliers: (data: number[], threshold = 3): number[] => {
    if (data.length === 0) return [];
    
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = statsUtils.standardDeviation(data);
    
    if (std === 0) return [];
    
    return data.filter(value => {
      const zScore = Math.abs((value - mean) / std);
      return zScore > threshold;
    });
  },
};
