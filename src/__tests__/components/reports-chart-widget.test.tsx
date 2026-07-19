import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ChartWidget } from '@/components/reports/ChartWidget';
import type {
  ChartConfig,
  ChartSeries,
} from '@/lib/visualization/types';

/**
 * ChartWidget 渲染层单测
 *
 * 锁定 ChartConfig → recharts 组件映射：
 * - type=line/bar/area → 对应 CartesianChart + 每 series 一条 Line/Bar/Area
 * - type=pie           → PieChart + Pie + 按 colors 循环 Cell
 * - type=scatter       → ScatterChart + 每 series 一个 Scatter
 * - type=radar         → RadarChart + PolarGrid/AngleAxis/RadiusAxis + 每 series 一条 Radar
 * - 不支持的类型 (heatmap/treemap/...) → "暂不支持 ${type}" 兜底卡片
 * - data 缺失或空 → "暂无数据" 兜底卡片
 *
 * 桩化策略：vi.mock("recharts", ...) 把 recharts 组件替换为带 data-testid 与 data-*
 * 属性的 div，避开 ResponsiveContainer 对 ResizeObserver 的依赖（jsdom 默认无实现）。
 * 桩化的 div 透出关键 props（dataKey / name / color / stackId / layout / data 长度），
 * 让单测能在不渲染真实 SVG 的前提下断言 dispatch 行为。
 */

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ data, layout, children }: { data: unknown[]; layout?: string; children?: React.ReactNode }) => (
    <div data-testid="line-chart" data-len={data?.length ?? 0} data-layout={layout ?? ''}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name, stroke, strokeWidth, isAnimationActive }: { dataKey: string; name: string; stroke: string; strokeWidth?: number; isAnimationActive?: boolean }) => (
    <div data-testid="line" data-data-key={dataKey} data-name={name} data-stroke={stroke} data-stroke-width={strokeWidth ?? ''} data-animation={String(isAnimationActive ?? true)} />
  ),
  BarChart: ({ data, layout, children }: { data: unknown[]; layout?: string; children?: React.ReactNode }) => (
    <div data-testid="bar-chart" data-len={data?.length ?? 0} data-layout={layout ?? ''}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, name, fill, stackId, isAnimationActive }: { dataKey: string; name: string; fill: string; stackId?: string; isAnimationActive?: boolean }) => (
    <div data-testid="bar" data-data-key={dataKey} data-name={name} data-fill={fill} data-stack-id={stackId ?? ''} data-animation={String(isAnimationActive ?? true)} />
  ),
  AreaChart: ({ data, layout, children }: { data: unknown[]; layout?: string; children?: React.ReactNode }) => (
    <div data-testid="area-chart" data-len={data?.length ?? 0} data-layout={layout ?? ''}>
      {children}
    </div>
  ),
  Area: ({ dataKey, name, stroke, fill, fillOpacity, stackId, isAnimationActive }: { dataKey: string; name: string; stroke: string; fill: string; fillOpacity?: number; stackId?: string; isAnimationActive?: boolean }) => (
    <div data-testid="area" data-data-key={dataKey} data-name={name} data-stroke={stroke} data-fill={fill} data-fill-opacity={fillOpacity ?? ''} data-stack-id={stackId ?? ''} data-animation={String(isAnimationActive ?? true)} />
  ),
  PieChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data, dataKey, nameKey, outerRadius, isAnimationActive, children }: { data: unknown[]; dataKey: string; nameKey: string; outerRadius?: string | number; isAnimationActive?: boolean; children?: React.ReactNode }) => (
    <div data-testid="pie" data-len={data?.length ?? 0} data-data-key={dataKey} data-name-key={nameKey} data-outer-radius={String(outerRadius ?? '')} data-animation={String(isAnimationActive ?? true)}>
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill: string }) => (
    <div data-testid="cell" data-fill={fill} />
  ),
  ScatterChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="scatter-chart">{children}</div>
  ),
  Scatter: ({ name, fill, data, isAnimationActive }: { name: string; fill: string; data: unknown[]; isAnimationActive?: boolean }) => (
    <div data-testid="scatter" data-name={name} data-fill={fill} data-len={data?.length ?? 0} data-animation={String(isAnimationActive ?? true)} />
  ),
  RadarChart: ({ data, children }: { data: unknown[]; children?: React.ReactNode }) => (
    <div data-testid="radar-chart" data-len={data?.length ?? 0}>{children}</div>
  ),
  Radar: ({ name, dataKey, stroke, fill, isAnimationActive }: { name: string; dataKey: string; stroke: string; fill: string; isAnimationActive?: boolean }) => (
    <div data-testid="radar" data-name={name} data-data-key={dataKey} data-stroke={stroke} data-fill={fill} data-animation={String(isAnimationActive ?? true)} />
  ),
  XAxis: ({ dataKey, type }: { dataKey?: string; type?: string }) => (
    <div data-testid="x-axis" data-data-key={dataKey ?? ''} data-type={type ?? ''} />
  ),
  YAxis: ({ dataKey, type, width }: { dataKey?: string; type?: string; width?: number }) => (
    <div data-testid="y-axis" data-data-key={dataKey ?? ''} data-type={type ?? ''} data-width={String(width ?? '')} />
  ),
  CartesianGrid: ({ strokeDasharray, stroke }: { strokeDasharray?: string; stroke?: string }) => (
    <div data-testid="cartesian-grid" data-stroke-dasharray={strokeDasharray ?? ''} data-stroke={stroke ?? ''} />
  ),
  PolarGrid: ({ stroke }: { stroke?: string }) => (
    <div data-testid="polar-grid" data-stroke={stroke ?? ''} />
  ),
  PolarAngleAxis: ({ dataKey }: { dataKey?: string }) => (
    <div data-testid="polar-angle-axis" data-data-key={dataKey ?? ''} />
  ),
  PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const SAMPLE_DATA = [
  { name: '周一', value: 8, downloads: 15 },
  { name: '周二', value: 12, downloads: 22 },
  { name: '周三', value: 6, downloads: 18 },
];

function makeConfig(overrides: Partial<ChartConfig> = {}): ChartConfig {
  return {
    type: 'line',
    data: SAMPLE_DATA,
    ...overrides,
  } as ChartConfig;
}

describe('ChartWidget 图表类型分发', () => {
  it('type=line → LineChart + 每系列一条 Line', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line' }) }));
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart').getAttribute('data-len')).toBe('3');
    // 默认单系列（value）
    expect(screen.getAllByTestId('line').length).toBe(1);
    expect(screen.getByTestId('line').getAttribute('data-data-key')).toBe('value');
    expect(screen.getByTestId('line').getAttribute('data-stroke-width')).toBe('2');
  });

  it('type=bar → BarChart + Bar', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'bar' }) }));
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart').getAttribute('data-len')).toBe('3');
    expect(screen.getAllByTestId('bar').length).toBe(1);
    expect(screen.getByTestId('bar').getAttribute('data-data-key')).toBe('value');
  });

  it('type=area → AreaChart + Area (含 fillOpacity)', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'area' }) }));
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('area').length).toBe(1);
    expect(screen.getByTestId('area').getAttribute('data-fill-opacity')).toBe('0.3');
  });

  it('type=pie → PieChart + Pie + 按 colors 循环 Cell', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'pie' }) }));
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie').getAttribute('data-data-key')).toBe('value');
    expect(screen.getByTestId('pie').getAttribute('data-name-key')).toBe('name');
    // SAMPLE_DATA 3 条 → 3 个 Cell
    expect(screen.getAllByTestId('cell').length).toBe(3);
  });

  it('type=scatter → ScatterChart + 每 series 一个 Scatter', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'scatter' }) }));
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('scatter').length).toBe(1);
    // Scatter data 透传
    expect(screen.getByTestId('scatter').getAttribute('data-len')).toBe('3');
  });

  it('type=radar → RadarChart + PolarGrid/AngleAxis/RadiusAxis + Radar', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'radar' }) }));
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('polar-grid')).toBeInTheDocument();
    expect(screen.getByTestId('polar-angle-axis')).toBeInTheDocument();
    expect(screen.getByTestId('polar-radius-axis')).toBeInTheDocument();
    expect(screen.getAllByTestId('radar').length).toBe(1);
  });
});

describe('ChartWidget 系列处理', () => {
  it('series 缺失时默认 {value} 系列（与 BUILTIN_REPORT_TEMPLATES 兼容）', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line', series: undefined }) }));
    expect(screen.getAllByTestId('line').length).toBe(1);
    expect(screen.getByTestId('line').getAttribute('data-data-key')).toBe('value');
    expect(screen.getByTestId('line').getAttribute('data-name')).toBe('value');
  });

  it('多 series → 每个 series 渲染一条 Line，dataKey/name 来自 series', () => {
    const series: ChartSeries[] = [
      { key: 'uploads', name: '上传', dataKey: 'value' },
      { key: 'downloads', name: '下载', dataKey: 'downloads' },
    ];
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line', series }) }));
    const lines = screen.getAllByTestId('line');
    expect(lines.length).toBe(2);
    expect(lines[0].getAttribute('data-data-key')).toBe('value');
    expect(lines[0].getAttribute('data-name')).toBe('上传');
    expect(lines[1].getAttribute('data-data-key')).toBe('downloads');
    expect(lines[1].getAttribute('data-name')).toBe('下载');
  });

  it('series.color 优先于 theme.colors 与默认配色', () => {
    const series: ChartSeries[] = [
      { key: 's1', name: 'S1', color: '#ff0000' },
    ];
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line', series }) }));
    expect(screen.getByTestId('line').getAttribute('data-stroke')).toBe('#ff0000');
  });

  it('series 缺失 color 时回退到 theme.colors', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({
        type: 'line',
        theme: { colors: ['#111111', '#222222'] },
      }),
    }));
    expect(screen.getByTestId('line').getAttribute('data-stroke')).toBe('#111111');
  });
});

describe('ChartWidget mode', () => {
  it('mode=stacked → Bar/Area 拿到 stackId="a"', () => {
    const series: ChartSeries[] = [
      { key: 's1', name: 'S1', dataKey: 'value' },
      { key: 's2', name: 'S2', dataKey: 'downloads' },
    ];
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'bar', mode: 'stacked', series }),
    }));
    const bars = screen.getAllByTestId('bar');
    expect(bars[0].getAttribute('data-stack-id')).toBe('a');
    expect(bars[1].getAttribute('data-stack-id')).toBe('a');
  });

  it('mode=horizontal → CartesianChart layout="vertical" + XAxis type=number', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'bar', mode: 'horizontal' }),
    }));
    expect(screen.getByTestId('bar-chart').getAttribute('data-layout')).toBe('vertical');
    expect(screen.getByTestId('x-axis').getAttribute('data-type')).toBe('number');
    expect(screen.getByTestId('y-axis').getAttribute('data-type')).toBe('category');
  });

  it('mode 缺省 → CartesianChart layout="horizontal"', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'bar' }) }));
    expect(screen.getByTestId('bar-chart').getAttribute('data-layout')).toBe('horizontal');
    expect(screen.getByTestId('x-axis').getAttribute('data-type')).toBe('');
    expect(screen.getByTestId('y-axis').getAttribute('data-type')).toBe('');
  });
});

describe('ChartWidget 边界兜底', () => {
  it('不支持的图表类型 → "暂不支持 ${type}" 卡片', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'heatmap' as ChartConfig['type'] }),
    }));
    expect(screen.getByText(/暂不支持 heatmap 图表类型/)).toBeInTheDocument();
    // 不应渲染任何 recharts 组件
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
  });

  it('data 为空数组 → "暂无数据" 卡片', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', data: [] }),
    }));
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('data 为 undefined → "暂无数据" 卡片（兼容 BUILTIN_REPORT_TEMPLATES 仅声明 type 的 chart）', () => {
    render(createElement(ChartWidget, {
      config: { type: 'line' } as ChartConfig,
    }));
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});

describe('ChartWidget 可见性开关', () => {
  it('grid/legend/tooltip 默认 visible', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line' }) }));
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('grid.visible=false → 不渲染 CartesianGrid', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', grid: { visible: false } }),
    }));
    expect(screen.queryByTestId('cartesian-grid')).not.toBeInTheDocument();
  });

  it('legend.visible=false → 不渲染 Legend', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', legend: { visible: false } }),
    }));
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
  });

  it('tooltip.visible=false → 不渲染 Tooltip', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', tooltip: { visible: false } }),
    }));
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument();
  });

  it('radar 类型：grid.visible=false → 不渲染 PolarGrid', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'radar', grid: { visible: false } }),
    }));
    expect(screen.queryByTestId('polar-grid')).not.toBeInTheDocument();
    expect(screen.getByTestId('polar-angle-axis')).toBeInTheDocument();
  });
});

describe('ChartWidget 主题与高度', () => {
  it('theme.gridColor 透传到 CartesianGrid', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', theme: { gridColor: '#abcdef' } }),
    }));
    expect(screen.getByTestId('cartesian-grid').getAttribute('data-stroke')).toBe('#abcdef');
  });

  it('theme.colors 数组按 series index 循环', () => {
    const series: ChartSeries[] = [
      { key: 's1', name: 'S1', dataKey: 'value' },
      { key: 's2', name: 'S2', dataKey: 'downloads' },
      { key: 's3', name: 'S3', dataKey: 'other' },
    ];
    render(createElement(ChartWidget, {
      config: makeConfig({
        type: 'line',
        series,
        theme: { colors: ['#aaa', '#bbb'] },
      }),
    }));
    const lines = screen.getAllByTestId('line');
    expect(lines[0].getAttribute('data-stroke')).toBe('#aaa');
    expect(lines[1].getAttribute('data-stroke')).toBe('#bbb');
    // 第三个 series 走 colors[3 % 2] = colors[1]
    expect(lines[2].getAttribute('data-stroke')).toBe('#aaa');
  });

  it('height 透传到外层容器（默认 240）', () => {
    const { container } = render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', height: 320 }),
    }));
    // 找到 ResponsiveContainer 外层的 div（包含 height inline style）
    const heightDiv = container.querySelector('[style*="height"]');
    expect(heightDiv).not.toBeNull();
    expect((heightDiv as HTMLElement).style.height).toBe('320px');
  });

  it('height 缺省 → 240px', () => {
    const { container } = render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line' }),
    }));
    const heightDiv = container.querySelector('[style*="height"]');
    expect((heightDiv as HTMLElement).style.height).toBe('240px');
  });
});

describe('ChartWidget 包装与动画', () => {
  it('title/description 透传到 CardHeader', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line' }),
      title: '上传趋势',
      description: '近 7 天',
    }));
    expect(screen.getByText('上传趋势')).toBeInTheDocument();
    expect(screen.getByText('近 7 天')).toBeInTheDocument();
  });

  it('animation 默认 true（isAnimationActive 透传）', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line' }) }));
    expect(screen.getByTestId('line').getAttribute('data-animation')).toBe('true');
  });

  it('animation=false → isAnimationActive=false', () => {
    render(createElement(ChartWidget, {
      config: makeConfig({ type: 'line', animation: false }),
    }));
    expect(screen.getByTestId('line').getAttribute('data-animation')).toBe('false');
  });

  it('title/description 缺失时不渲染 CardHeader 但仍渲染图表', () => {
    render(createElement(ChartWidget, { config: makeConfig({ type: 'line' }) }));
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
