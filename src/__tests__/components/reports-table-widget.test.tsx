import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { TableWidget } from '@/components/reports/TableWidget';
import type { TableConfig } from '@/lib/reports/types';

/**
 * TableWidget 渲染层单测
 *
 * 锁定与 src/lib/reports/report-manager.ts buildTableCsv 一致的数据消费契约：
 * - 行数据按列 dataIndex 取值
 * - 列 format 优先于原始值
 * - 列 title 作为表头
 * - 空 rows / 空 columns 的边界空态
 *
 * 同时覆盖排序、搜索、分页三个交互功能。
 */

function makeConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    columns: [
      { key: 'name', title: '名称', dataIndex: 'name' },
      { key: 'size', title: '大小', dataIndex: 'size', align: 'right' },
    ],
    rows: [
      { name: 'a.txt', size: 100 },
      { name: 'b.txt', size: 50 },
      { name: 'c.txt', size: 200 },
    ],
    ...overrides,
  };
}

describe('TableWidget 渲染层契约', () => {
  it('渲染列标题与行数据（rows 按 dataIndex 取值）', () => {
    render(createElement(TableWidget, { config: makeConfig() }));

    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('大小')).toBeInTheDocument();
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('列 format 优先于原始值（与 buildTableCsv 一致）', () => {
    const config = makeConfig({
      columns: [
        {
          key: 'size',
          title: '大小',
          dataIndex: 'size',
          format: (v: unknown) => `${v} 字节`,
        },
      ],
    });
    render(createElement(TableWidget, { config }));

    expect(screen.getByText('100 字节')).toBeInTheDocument();
    expect(screen.getByText('50 字节')).toBeInTheDocument();
    expect(screen.getByText('200 字节')).toBeInTheDocument();
    // 原始值不再单独显示
    expect(screen.queryByText('100')).not.toBeInTheDocument();
  });

  it('rows 缺失字段时单元格留空（与 CSV 一致）', () => {
    const config = makeConfig({
      rows: [{ name: 'no-size.txt' }],
    });
    render(createElement(TableWidget, { config }));

    expect(screen.getByText('no-size.txt')).toBeInTheDocument();
    // 大小列的单元格为空字符串，不应渲染 'undefined' / 'null'
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('rows 为 undefined 时显示"暂无数据"空态', () => {
    const config: TableConfig = {
      columns: [{ key: 'name', title: '名称', dataIndex: 'name' }],
      // 不传 rows
    };
    render(createElement(TableWidget, { config }));

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('columns 为空时显示"无列定义"空态', () => {
    const config: TableConfig = { columns: [], rows: [{ x: 1 }] };
    render(createElement(TableWidget, { config }));

    expect(screen.getByText('无列定义')).toBeInTheDocument();
  });

  it('渲染标题与描述（如提供）', () => {
    render(
      createElement(
        TableWidget,
        {
          config: makeConfig(),
          title: '热门文件',
          description: '近期访问量前 10',
        },
      ),
    );

    expect(screen.getByText('热门文件')).toBeInTheDocument();
    expect(screen.getByText('近期访问量前 10')).toBeInTheDocument();
  });

  it('对齐类按列 align 配置应用到表头与单元格', () => {
    const { container } = render(createElement(TableWidget, { config: makeConfig() }));
    // 大小列 align=right，应出现在表头与单元格上
    const alignedCells = container.querySelectorAll('.text-right');
    // 1 表头 + 3 行 = 4 个
    expect(alignedCells.length).toBe(4);
  });
});

describe('TableWidget 排序', () => {
  it('config.sortable 时点击表头按升序排序', () => {
    const config = makeConfig({ sortable: true });
    const { container } = render(createElement(TableWidget, { config }));

    // 默认按 rows 顺序：a(100), b(50), c(200)
    const cells = () => container.querySelectorAll('tbody tr td:nth-child(2)');
    expect(cells()[0]?.textContent).toBe('100');

    // 点击"大小"表头 → 升序：50, 100, 200
    fireEvent.click(screen.getByText('大小'));
    expect(cells()[0]?.textContent).toBe('50');
    expect(cells()[1]?.textContent).toBe('100');
    expect(cells()[2]?.textContent).toBe('200');
  });

  it('再次点击切换为降序', () => {
    const config = makeConfig({ sortable: true });
    const { container } = render(createElement(TableWidget, { config }));

    const cells = () => container.querySelectorAll('tbody tr td:nth-child(2)');
    fireEvent.click(screen.getByText('大小'));
    expect(cells()[0]?.textContent).toBe('50'); // asc

    fireEvent.click(screen.getByText('大小'));
    expect(cells()[0]?.textContent).toBe('200'); // desc
  });

  it('第三次点击取消排序，回到原始顺序', () => {
    const config = makeConfig({ sortable: true });
    const { container } = render(createElement(TableWidget, { config }));

    const cells = () => container.querySelectorAll('tbody tr td:nth-child(2)');
    fireEvent.click(screen.getByText('大小'));
    fireEvent.click(screen.getByText('大小'));
    fireEvent.click(screen.getByText('大小'));

    expect(cells()[0]?.textContent).toBe('100'); // 原始顺序
  });

  it('列级 sortable 覆盖 config.sortable=false', () => {
    const config = makeConfig({
      sortable: false,
      columns: [
        { key: 'name', title: '名称', dataIndex: 'name' },
        { key: 'size', title: '大小', dataIndex: 'size', sortable: true },
      ],
    });
    const { container } = render(createElement(TableWidget, { config }));

    // 名称列表头不应可排序（cursor-pointer 类位于 <th> 上，文本在子 <span>）
    const nameHeader = screen.getByText('名称').closest('th');
    expect(nameHeader?.className).not.toContain('cursor-pointer');
    // 大小表头可排序
    const sizeHeader = screen.getByText('大小').closest('th');
    expect(sizeHeader?.className).toContain('cursor-pointer');

    const cells = () => container.querySelectorAll('tbody tr td:nth-child(2)');
    fireEvent.click(sizeHeader!);
    expect(cells()[0]?.textContent).toBe('50'); // asc
  });

  it('未启用 sortable 时点击表头不改变顺序', () => {
    const config = makeConfig({ sortable: false });
    const { container } = render(createElement(TableWidget, { config }));

    const cells = () => container.querySelectorAll('tbody tr td:nth-child(2)');
    fireEvent.click(screen.getByText('大小'));
    // 顺序不变
    expect(cells()[0]?.textContent).toBe('100');
  });
});

describe('TableWidget 搜索', () => {
  it('config.searchable 时渲染搜索框', () => {
    const config = makeConfig({ searchable: true });
    render(createElement(TableWidget, { config }));

    expect(screen.getByLabelText('表格搜索')).toBeInTheDocument();
  });

  it('搜索框输入后按所有列 dataIndex 模糊匹配过滤', () => {
    const config = makeConfig({ searchable: true });
    render(createElement(TableWidget, { config }));

    const input = screen.getByLabelText('表格搜索');
    fireEvent.change(input, { target: { value: 'a.txt' } });

    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.queryByText('b.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('c.txt')).not.toBeInTheDocument();
  });

  it('搜索无匹配时显示"暂无数据"', () => {
    const config = makeConfig({ searchable: true });
    render(createElement(TableWidget, { config }));

    const input = screen.getByLabelText('表格搜索');
    fireEvent.change(input, { target: { value: '不存在的文件' } });

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('搜索匹配列 format 后的文本', () => {
    const config = makeConfig({
      searchable: true,
      columns: [
        {
          key: 'size',
          title: '大小',
          dataIndex: 'size',
          format: (v: unknown) => `${v} 字节`,
        },
      ],
    });
    render(createElement(TableWidget, { config }));

    const input = screen.getByLabelText('表格搜索');
    fireEvent.change(input, { target: { value: '100 字节' } });

    expect(screen.getByText('100 字节')).toBeInTheDocument();
    expect(screen.queryByText('50 字节')).not.toBeInTheDocument();
  });
});

describe('TableWidget 分页', () => {
  it('config.pagination 启用时切片展示，并提供翻页按钮', () => {
    const config = makeConfig({ pagination: true, pageSize: 2 });
    render(createElement(TableWidget, { config }));

    // 第一页：a.txt, b.txt
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
    expect(screen.queryByText('c.txt')).not.toBeInTheDocument();

    expect(screen.getByText(/第 1 \/ 2 页/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('下一页'));

    // 第二页：c.txt
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
    expect(screen.getByText('c.txt')).toBeInTheDocument();
  });

  it('首页时"上一页"禁用，末页时"下一页"禁用', () => {
    const config = makeConfig({ pagination: true, pageSize: 2 });
    render(createElement(TableWidget, { config }));

    const prev = screen.getByText('上一页') as HTMLButtonElement;
    const next = screen.getByText('下一页') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('行数不超过 pageSize 时不渲染分页控件', () => {
    const config = makeConfig({ pagination: true, pageSize: 100 });
    render(createElement(TableWidget, { config }));

    expect(screen.queryByText('上一页')).not.toBeInTheDocument();
    expect(screen.queryByText('下一页')).not.toBeInTheDocument();
  });
});

describe('TableWidget 边界数据', () => {
  it('对象类型单元格值 JSON 序列化展示（避免 [object Object]）', () => {
    const config: TableConfig = {
      columns: [
        { key: 'meta', title: '元数据', dataIndex: 'meta' },
      ],
      rows: [{ meta: { k: 'v', n: 1 } }],
    };
    render(createElement(TableWidget, { config }));

    expect(screen.getByText('{"k":"v","n":1}')).toBeInTheDocument();
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('null 值单元格渲染为空字符串（非 "null"）', () => {
    const config: TableConfig = {
      columns: [
        { key: 'note', title: '备注', dataIndex: 'note' },
      ],
      rows: [{ note: null }],
    };
    render(createElement(TableWidget, { config }));

    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('数字类型列排序按数值而非字符串比较', () => {
    const config: TableConfig = {
      columns: [
        { key: 'n', title: '数值', dataIndex: 'n', sortable: true },
      ],
      rows: [
        { n: 9 },
        { n: 10 },
        { n: 100 },
      ],
      sortable: true,
    };
    const { container } = render(createElement(TableWidget, { config }));

    const cells = () => container.querySelectorAll('tbody tr td');
    fireEvent.click(screen.getByText('数值'));
    // 数值升序：9, 10, 100（而非字符串 10, 100, 9）
    expect(cells()[0]?.textContent).toBe('9');
    expect(cells()[1]?.textContent).toBe('10');
    expect(cells()[2]?.textContent).toBe('100');
  });
});
