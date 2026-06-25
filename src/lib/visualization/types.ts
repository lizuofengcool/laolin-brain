/**
 * 数据可视化类型定义
 * 支持多种图表类型和配置
 */

// 图表类型枚举
export type ChartType =
  | 'line'        // 折线图
  | 'bar'         // 柱状图
  | 'pie'         // 饼图
  | 'area'        // 面积图
  | 'scatter'     // 散点图
  | 'radar'       // 雷达图
  | 'heatmap'     // 热力图
  | 'treemap'     // 树图
  | 'sankey'      // 桑基图
  | 'funnel'      // 漏斗图
  | 'composed';   // 组合图

// 图表模式
export type ChartMode = 'default' | 'stacked' | 'percent' | 'horizontal';

// 数据点基础类型
export interface DataPoint {
  name: string;
  value?: number;
  [key: string]: any;
}

// 系列数据
export interface ChartSeries {
  key: string;
  name: string;
  color?: string;
  type?: ChartType;
  dataKey?: string;
  stackId?: string;
}

// 图表配置
export interface ChartConfig {
  type: ChartType;
  title?: string;
  subtitle?: string;
  data: DataPoint[];
  series?: ChartSeries[];
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  legend?: LegendConfig;
  tooltip?: TooltipConfig;
  grid?: GridConfig;
  responsive?: boolean;
  height?: number;
  width?: number;
  mode?: ChartMode;
  theme?: ChartTheme;
  animation?: boolean;
}

// 坐标轴配置
export interface AxisConfig {
  key?: string;
  label?: string;
  visible?: boolean;
  tickCount?: number;
  format?: (value: any) => string;
  min?: number;
  max?: number;
}

// 图例配置
export interface LegendConfig {
  visible?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

// 提示框配置
export interface TooltipConfig {
  visible?: boolean;
  formatter?: (value: any, name: string, props: any) => string;
  shared?: boolean;
}

// 网格配置
export interface GridConfig {
  visible?: boolean;
  horizontal?: boolean;
  vertical?: boolean;
}

// 图表主题
export interface ChartTheme {
  colors?: string[];
  backgroundColor?: string;
  textColor?: string;
  gridColor?: string;
  tooltipBg?: string;
  tooltipBorder?: string;
}

// 图表导出选项
export interface ExportOptions {
  format: 'png' | 'jpg' | 'svg' | 'pdf' | 'csv' | 'json' | 'excel';
  quality?: number;
  width?: number;
  height?: number;
  filename?: string;
}

// 图表交互事件
export interface ChartEvents {
  onDataClick?: (data: DataPoint, series?: ChartSeries) => void;
  onLegendClick?: (seriesKey: string) => void;
  onTooltipShow?: (data: any) => void;
  onTooltipHide?: () => void;
}

// 预设配色方案
export const CHART_COLORS = {
  // 默认配色
  default: [
    '#3b82f6', // 蓝色
    '#22c55e', // 绿色
    '#f97316', // 橙色
    '#a855f7', // 紫色
    '#ef4444', // 红色
    '#06b6d4', // 青色
    '#eab308', // 黄色
    '#ec4899', // 粉色
  ],
  // 柔和配色
  soft: [
    '#93c5fd',
    '#86efac',
    '#fdba74',
    '#c4b5fd',
    '#fca5a5',
    '#67e8f9',
    '#fde047',
    '#f9a8d4',
  ],
  // 深色配色
  dark: [
    '#60a5fa',
    '#4ade80',
    '#fb923c',
    '#c084fc',
    '#f87171',
    '#22d3ee',
    '#facc15',
    '#f472b6',
  ],
  // 商务配色
  business: [
    '#1e40af',
    '#047857',
    '#c2410c',
    '#6b21a8',
    '#991b1b',
    '#0e7490',
    '#a16207',
    '#9d174d',
  ],
};

// 图表尺寸预设
export const CHART_SIZES = {
  small: { width: 300, height: 200 },
  medium: { width: 600, height: 400 },
  large: { width: 900, height: 600 },
  full: { width: '100%', height: '100%' },
};
