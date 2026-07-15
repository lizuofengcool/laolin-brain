import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from '@/lib/csv-utils';

/**
 * csv-utils escapeCsvCell 直接单测
 *
 * 覆盖目标：src/lib/csv-utils.ts。该模块为纯函数，无外部依赖，是 reports/
 * report-manager.ts 与 visualization/utils.ts 此前各自重复实现的 CSV 单元格
 * 转义逻辑的统一来源（RFC 4180 合规）。
 *
 * 关键控制流：
 * - null / undefined → 空字符串
 * - 对象 / 数组 → JSON.stringify（避免 [object Object]）
 * - 其它 → String(value)
 * - 结果含 " , \r \n 时双引号包裹 + 内部 " 双写
 *
 * 行为契约对齐：
 * - visualization/utils.test.ts 的 toCSV 对象/数组用例（→ JSON 序列化）依赖此处行为
 * - reports/report-manager.test.ts 的行数据用例（字符串/数字）依赖此处行为
 */
describe('escapeCsvCell / src/lib/csv-utils.ts', () => {
  // ==================== 空值回退 ====================

  it('null → 空字符串', () => {
    expect(escapeCsvCell(null)).toBe('');
  });

  it('undefined → 空字符串', () => {
    expect(escapeCsvCell(undefined)).toBe('');
  });

  // ==================== 基本类型（无转义） ====================

  it('字符串不含特殊字符 → 原样返回', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
    expect(escapeCsvCell('中文内容')).toBe('中文内容');
  });

  it('数字 → String(value)', () => {
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(-3.14)).toBe('-3.14');
  });

  it('布尔 → String(value)', () => {
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(false)).toBe('false');
  });

  // ==================== 对象 / 数组 → JSON 序列化 ====================

  it('对象 → JSON.stringify（避免 [object Object]）', () => {
    // 对象 JSON 含逗号与引号 → 触发 RFC 4180 包裹与双写
    expect(escapeCsvCell({ x: 1 })).toBe('"{""x"":1}"');
  });

  it('数组 → JSON.stringify', () => {
    // [1,2] → JSON "[1,2]" 含逗号 → 触发 RFC 4180 包裹（无内部引号需双写）
    expect(escapeCsvCell([1, 2])).toBe('"[1,2]"');
    // 含字符串元素的数组 → JSON ["a","b"] 含引号与逗号 → 触发包裹与双写
    // JSON.stringify(['a','b']) = ["a","b"] → 内部 " 双写 → ["a","b"]→[""a"",""b""]
    // → 外层包裹 → "[""a"",""b""]"
    expect(escapeCsvCell(['a', 'b'])).toBe('"[""a"",""b""]"');
  });

  it('空对象 / 空数组 → "{}" / "[]"（JSON 无特殊字符，不包裹）', () => {
    expect(escapeCsvCell({})).toBe('{}');
    expect(escapeCsvCell([])).toBe('[]');
  });

  // ==================== RFC 4180 转义 ====================

  it('含逗号 → 双引号包裹', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
  });

  it('含双引号 → 双引号包裹并双写内部引号', () => {
    expect(escapeCsvCell('说"嗨"')).toBe('"说""嗨"""');
  });

  it('含换行 \\n → 双引号包裹（换行保留在引号内）', () => {
    expect(escapeCsvCell('行1\n行2')).toBe('"行1\n行2"');
  });

  it('含回车 \\r → 双引号包裹', () => {
    expect(escapeCsvCell('a\rb')).toBe('"a\rb"');
  });

  it('含 CRLF \\r\\n → 双引号包裹', () => {
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it('同时含逗号/引号/换行 → 全部转义', () => {
    expect(escapeCsvCell('a,b"c\nd')).toBe('"a,b""c\nd"');
  });

  it('JSON 不含特殊字符时不额外包裹（单元素数组 [1] → "[1]" 无逗号无引号）', () => {
    // JSON.stringify([1]) = "[1]" 不含 " , \r \n → 原样返回（无外层引号）
    expect(escapeCsvCell([1])).toBe('[1]');
  });

  // ==================== 消费方契约回归锚点 ====================

  it('消费方契约：visualization toCSV 对象/数组 JSON 序列化（回归锚点）', () => {
    // 对齐 src/__tests__/lib/visualization/utils.test.ts 第 706-716 行用例期望：
    //   对象 {x:1} → "{""x"":1}"；数组 [1,2] → "[1,2]"（逗号触发包裹）
    expect(escapeCsvCell({ x: 1 })).toBe('"{""x"":1}"');
    expect(escapeCsvCell([1, 2])).toBe('"[1,2]"');
  });

  it('消费方契约：report-manager 行数据缺失字段留空（回归锚点）', () => {
    // 对齐 src/__tests__/lib/reports/report-manager.test.ts 第 801 行注释契约
    expect(escapeCsvCell(undefined)).toBe('');
  });
});
