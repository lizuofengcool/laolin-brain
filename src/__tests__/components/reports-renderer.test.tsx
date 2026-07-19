import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ReportRenderer } from '@/components/reports/ReportRenderer';
import type {
  ReportWidget,
  MetricConfig,
  TextConfig,
  TableConfig,
} from '@/lib/reports/types';
import type { ChartConfig } from '@/lib/visualization/types';

/**
 * ReportRenderer 分发器单测
 *
 * 锁定 widget.type → 渲染组件 路由：
 * - metric → MetricCard（带 Card 包装 + value/label）
 * - table  → TableWidget（带 columns/rows 渲染）
 * - text   → TextBlock（无 Card，仅段落）
 * - divider → Separator（有/无 title 两种形态）
 * - chart  → ChartWidget（含 config 时）/ 兜底卡片（无 config 时）
 *
 * 兜底：metric/table/text/chart 缺 config → "组件缺少配置" 卡片
 *      未知 type → 同兜底卡片
 *
 * ChartWidget 真实渲染（recharts 接入）由 reports-chart-widget.test.tsx 覆盖；
 * 此处桩化 ChartWidget 仅验证 dispatch 是否正确透传 props。
 */

// 桩化 ChartWidget：仅验证 dispatch 透传，避免在 jsdom 中渲染真实 recharts
// （recharts 的 ResponsiveContainer 依赖 ResizeObserver，jsdom 默认无实现）
vi.mock('@/components/reports/ChartWidget', () => ({
  ChartWidget: (props: {
    config: ChartConfig;
    title?: string;
    description?: string;
    className?: string;
  }) => (
    <div
      data-testid="chart-widget"
      data-chart-type={props.config.type}
      data-has-data={Array.isArray(props.config.data) && props.config.data.length > 0 ? 'true' : 'false'}
      data-title={props.title ?? ''}
      data-description={props.description ?? ''}
      data-classname={props.className ?? ''}
    >
      {props.title ? <span>{props.title}</span> : null}
      {props.description ? <span>{props.description}</span> : null}
    </div>
  ),
}));

describe('ReportRenderer 类型分发', () => {
  it('type=metric → MetricCard 渲染 value/label', () => {
    const widget: ReportWidget = {
      id: 'w1',
      type: 'metric',
      title: '总存储量',
      config: { value: 1024, label: 'GB' } as MetricConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('1,024')).toBeInTheDocument();
    expect(screen.getByText('GB')).toBeInTheDocument();
    expect(screen.getByText('总存储量')).toBeInTheDocument();
  });

  it('type=table → TableWidget 渲染列标题与行数据', () => {
    const widget: ReportWidget = {
      id: 'w2',
      type: 'table',
      title: '热门文件',
      config: {
        columns: [
          { key: 'name', title: '名称', dataIndex: 'name' },
          { key: 'size', title: '大小', dataIndex: 'size' },
        ],
        rows: [{ name: 'a.txt', size: 100 }],
      } as TableConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('热门文件')).toBeInTheDocument();
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('大小')).toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('type=text → TextBlock 无 Card 包装（段落标签）', () => {
    const widget: ReportWidget = {
      id: 'w3',
      type: 'text',
      config: { content: '说明文本' } as TextConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('说明文本').tagName).toBe('P');
  });

  it('type=divider 无 title → 仅渲染 Separator', () => {
    const widget: ReportWidget = { id: 'w4', type: 'divider' };
    const { container } = render(createElement(ReportRenderer, { widget }));
    // 无 title 时不渲染文本节点
    expect(container.querySelector('[role="separator"]')).not.toBeNull();
    // shadcn Separator 渲染 [data-slot="separator"]
    expect(container.querySelector('[data-slot="separator"]')).not.toBeNull();
  });

  it('type=divider 含 title → 渲染居中标题 + 两侧 Separator', () => {
    const widget: ReportWidget = {
      id: 'w5',
      type: 'divider',
      title: '分组一',
    };
    const { container } = render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('分组一')).toBeInTheDocument();
    // 两侧各一条 Separator
    const separators = container.querySelectorAll('[data-slot="separator"]');
    expect(separators.length).toBe(2);
  });

  it('type=chart 含 config → 渲染 ChartWidget（透传 config/title/description）', () => {
    const widget: ReportWidget = {
      id: 'w6',
      type: 'chart',
      title: '上传趋势',
      description: '近 7 天',
      config: {
        type: 'line',
        data: [{ name: '周一', value: 8 }, { name: '周二', value: 12 }],
      } as ChartConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    const chartWidget = screen.getByTestId('chart-widget');
    expect(chartWidget).toBeInTheDocument();
    expect(chartWidget.getAttribute('data-chart-type')).toBe('line');
    expect(chartWidget.getAttribute('data-has-data')).toBe('true');
    expect(chartWidget.getAttribute('data-title')).toBe('上传趋势');
    expect(chartWidget.getAttribute('data-description')).toBe('近 7 天');
    expect(screen.getByText('上传趋势')).toBeInTheDocument();
    expect(screen.getByText('近 7 天')).toBeInTheDocument();
  });
});

describe('ReportRenderer 兜底', () => {
  it('type=metric 缺 config → 渲染"组件缺少配置"卡片', () => {
    const widget: ReportWidget = {
      id: 'w1',
      type: 'metric',
      title: '总存储量',
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('总存储量')).toBeInTheDocument();
    expect(screen.getByText('组件缺少配置')).toBeInTheDocument();
    expect(screen.getByText(/widget\.type = metric/)).toBeInTheDocument();
  });

  it('type=table 缺 config → 兜底卡片', () => {
    const widget: ReportWidget = { id: 'w2', type: 'table', title: '表格' };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('表格')).toBeInTheDocument();
    expect(screen.getByText('组件缺少配置')).toBeInTheDocument();
  });

  it('type=text 缺 config → 兜底卡片', () => {
    const widget: ReportWidget = { id: 'w3', type: 'text' };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('组件缺少配置')).toBeInTheDocument();
  });

  it('type=chart 缺 config → 兜底卡片（与 metric/table/text 一致）', () => {
    const widget: ReportWidget = {
      id: 'w6',
      type: 'chart',
      title: '上传趋势',
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('上传趋势')).toBeInTheDocument();
    expect(screen.getByText('组件缺少配置')).toBeInTheDocument();
    expect(screen.getByText(/widget\.type = chart/)).toBeInTheDocument();
    // 不应调用 ChartWidget
    expect(screen.queryByTestId('chart-widget')).not.toBeInTheDocument();
  });

  it('未知 type → 兜底卡片', () => {
    const widget = {
      id: 'w9',
      type: 'unknown-type' as ReportWidget['type'],
      title: '未知',
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('未知')).toBeInTheDocument();
    expect(screen.getByText('组件缺少配置')).toBeInTheDocument();
    expect(screen.getByText(/widget\.type = unknown-type/)).toBeInTheDocument();
  });
});

describe('ReportRenderer 透传', () => {
  it('title/description 透传给 MetricCard', () => {
    const widget: ReportWidget = {
      id: 'w1',
      type: 'metric',
      title: 'KPI 标题',
      description: 'KPI 描述',
      config: { value: 1, label: 'lbl' } as MetricConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('KPI 标题')).toBeInTheDocument();
    expect(screen.getByText('KPI 描述')).toBeInTheDocument();
  });

  it('title/description 透传给 TableWidget', () => {
    const widget: ReportWidget = {
      id: 'w2',
      type: 'table',
      title: '表格标题',
      description: '表格描述',
      config: {
        columns: [{ key: 'c', title: '列', dataIndex: 'c' }],
        rows: [{ c: 'v' }],
      } as TableConfig,
    };
    render(createElement(ReportRenderer, { widget }));
    expect(screen.getByText('表格标题')).toBeInTheDocument();
    expect(screen.getByText('表格描述')).toBeInTheDocument();
  });
});
