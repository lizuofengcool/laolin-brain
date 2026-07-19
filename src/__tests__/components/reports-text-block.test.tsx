import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { TextBlock } from '@/components/reports/TextBlock';
import type { TextConfig } from '@/lib/reports/types';

/**
 * TextBlock 渲染层单测
 *
 * 锁定 TextConfig → 视图映射：
 * - content 渲染为段落
 * - fontSize 映射到 tailwind 字号类
 * - align 映射到 tailwind 对齐类
 * - color 透传 inline style
 * - 默认 md / left（缺省值）
 */

function makeConfig(overrides: Partial<TextConfig> = {}): TextConfig {
  return {
    content: 'Hello, World!',
    ...overrides,
  };
}

describe('TextBlock 渲染层契约', () => {
  it('content 渲染为段落文本', () => {
    render(createElement(TextBlock, { config: makeConfig() }));
    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    expect(screen.getByText('Hello, World!').tagName).toBe('P');
  });

  it('fontSize=sm → text-sm', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ fontSize: 'sm' }) }),
    );
    expect(container.querySelector('p')?.className).toContain('text-sm');
  });

  it('fontSize=md（默认） → text-base', () => {
    const { container } = render(createElement(TextBlock, { config: makeConfig() }));
    expect(container.querySelector('p')?.className).toContain('text-base');
  });

  it('fontSize=lg → text-lg', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ fontSize: 'lg' }) }),
    );
    expect(container.querySelector('p')?.className).toContain('text-lg');
  });

  it('fontSize=xl → text-xl', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ fontSize: 'xl' }) }),
    );
    expect(container.querySelector('p')?.className).toContain('text-xl');
  });

  it('align=center → text-center', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ align: 'center' }) }),
    );
    expect(container.querySelector('p')?.className).toContain('text-center');
  });

  it('align=right → text-right', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ align: 'right' }) }),
    );
    expect(container.querySelector('p')?.className).toContain('text-right');
  });

  it('align 缺省 → text-left', () => {
    const { container } = render(createElement(TextBlock, { config: makeConfig() }));
    expect(container.querySelector('p')?.className).toContain('text-left');
  });
});

describe('TextBlock color 透传', () => {
  it('color 设置为 inline style（jsdom 标准化为 rgb）', () => {
    render(
      createElement(TextBlock, {
        config: makeConfig({ color: '#3b82f6' }),
      }),
    );
    const p = screen.getByText('Hello, World!');
    // jsdom 将 hex 标准化为 rgb()，断言用计算后的 rgb 形式
    expect(p.style.color).toBe('rgb(59, 130, 246)');
  });

  it('color 缺省不设置 inline style', () => {
    render(createElement(TextBlock, { config: makeConfig() }));
    const p = screen.getByText('Hello, World!');
    expect(p.style.color).toBe('');
  });
});

describe('TextBlock 边界', () => {
  it('空字符串 content 渲染空段落', () => {
    const { container } = render(
      createElement(TextBlock, { config: makeConfig({ content: '' }) }),
    );
    expect(container.querySelector('p')?.textContent).toBe('');
  });

  it('leading-relaxed 始终应用（保证可读性）', () => {
    const { container } = render(createElement(TextBlock, { config: makeConfig() }));
    expect(container.querySelector('p')?.className).toContain('leading-relaxed');
  });
});
