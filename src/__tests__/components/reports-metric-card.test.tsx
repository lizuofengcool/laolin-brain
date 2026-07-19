import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MetricCard } from '@/components/reports/MetricCard';
import type { MetricConfig } from '@/lib/reports/types';

/**
 * MetricCard 渲染层单测
 *
 * 锁定 MetricConfig → 视图映射：
 * - value（数字 / 字符串）+ prefix/suffix 组合展示
 * - label 作为副标题
 * - trendDirection 优先；缺失时从 trend 符号推断
 * - trend === undefined 时不渲染趋势行
 * - color 透传 inline style
 * - title/description 透传到 CardHeader
 */

function makeConfig(overrides: Partial<MetricConfig> = {}): MetricConfig {
  return {
    value: 1024,
    label: '总存储量',
    ...overrides,
  };
}

describe('MetricCard 渲染层契约', () => {
  it('数值走 toLocaleString 千分位', () => {
    render(createElement(MetricCard, { config: makeConfig({ value: 1234567 }) }));
    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('字符串 value 原样输出', () => {
    render(createElement(MetricCard, { config: makeConfig({ value: 'N/A' }) }));
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('label 副标题渲染', () => {
    render(createElement(MetricCard, { config: makeConfig({ label: '活跃用户' }) }));
    expect(screen.getByText('活跃用户')).toBeInTheDocument();
  });

  it('prefix / suffix 围绕 value 渲染', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig({ value: 80, prefix: '≈', suffix: '%' }),
      }),
    );
    expect(screen.getByText('≈')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('title / description 透传到 CardHeader', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig(),
        title: '存储概览',
        description: '过去 30 天',
      }),
    );
    expect(screen.getByText('存储概览')).toBeInTheDocument();
    expect(screen.getByText('过去 30 天')).toBeInTheDocument();
  });

  it('无 title/description 时不渲染 CardHeader（仍渲染 value/label）', () => {
    const { container } = render(createElement(MetricCard, { config: makeConfig() }));
    // shadcn CardHeader 用 data-slot="card-header"
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
    expect(screen.getByText('1,024')).toBeInTheDocument();
    expect(screen.getByText('总存储量')).toBeInTheDocument();
  });
});

describe('MetricCard trend 渲染', () => {
  it('trendDirection=up 渲染向上箭头 + 绿色', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig({ trend: 12.5, trendDirection: 'up' }),
      }),
    );
    const trend = screen.getByLabelText('趋势 up 12.5%');
    expect(trend).toBeInTheDocument();
    expect(trend.className).toContain('text-green-600');
    expect(trend.textContent).toContain('12.5%');
  });

  it('trendDirection=down 渲染向下箭头 + 红色', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig({ trend: -8.3, trendDirection: 'down' }),
      }),
    );
    const trend = screen.getByLabelText('趋势 down 8.3%');
    expect(trend).toBeInTheDocument();
    expect(trend.className).toContain('text-red-600');
    // Math.abs(-8.3) → 8.3
    expect(trend.textContent).toContain('8.3%');
  });

  it('trendDirection 缺失时从 trend>0 推断为 up', () => {
    render(createElement(MetricCard, { config: makeConfig({ trend: 5 }) }));
    expect(screen.getByLabelText('趋势 up 5%')).toBeInTheDocument();
  });

  it('trendDirection 缺失时从 trend<0 推断为 down', () => {
    render(createElement(MetricCard, { config: makeConfig({ trend: -3.2 }) }));
    expect(screen.getByLabelText('趋势 down 3.2%')).toBeInTheDocument();
  });

  it('trend===0 推断为 none（仍渲染趋势行，灰色）', () => {
    render(createElement(MetricCard, { config: makeConfig({ trend: 0 }) }));
    const trend = screen.getByLabelText(/趋势 none/);
    expect(trend).toBeInTheDocument();
    expect(trend.className).toContain('text-muted-foreground');
  });

  it('trend undefined 时不渲染趋势行', () => {
    render(createElement(MetricCard, { config: makeConfig() }));
    expect(screen.queryByLabelText(/趋势/)).toBeNull();
  });

  it('trend 保留 1 位小数（toFixed(1)）', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig({ trend: 12.345, trendDirection: 'up' }),
      }),
    );
    // 12.345 → toFixed(1) → "12.3"
    expect(screen.getByText('12.3%')).toBeInTheDocument();
  });
});

describe('MetricCard 边界', () => {
  it('color 透传到 value 行 inline style（jsdom 标准化为 rgb）', () => {
    render(
      createElement(MetricCard, {
        config: makeConfig({ value: 50, color: '#ff0000' }),
      }),
    );
    const valueRow = screen.getByText('50').parentElement;
    // jsdom 将 hex 标准化为 rgb()
    expect(valueRow?.style.color).toBe('rgb(255, 0, 0)');
  });

  it('无 color 时不设置 inline style', () => {
    render(createElement(MetricCard, { config: makeConfig({ value: 50 }) }));
    const valueRow = screen.getByText('50').parentElement;
    expect(valueRow?.style.color).toBe('');
  });

  it('label 缺失时不渲染副标题', () => {
    render(
      createElement(MetricCard, {
        config: { value: 1, label: undefined } as MetricConfig,
      }),
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    // 无 label 副标题节点
    expect(screen.queryByText('总存储量')).toBeNull();
  });
});
