/**
 * CSV 单元格转义工具（RFC 4180 合规）
 *
 * 统一此前在 reports/report-manager.ts（escapeCsvCell 私有方法）与
 * visualization/utils.ts（toCSV 内联 escapeCell）中重复实现的单元格转义逻辑，
 * 作为单一来源。两处行为此前已对齐至「对象/数组 → JSON 序列化」，此处保留该契约。
 *
 * 行为：
 * - null / undefined → 空字符串（缺失字段留空，不输出 "null"/"undefined"）
 * - 对象 / 数组 → JSON.stringify（避免隐式 toString 落到 [object Object]）
 * - 其它（string/number/boolean/bigint） → String(value)
 * - 结果含 " , \r \n 任一字符时用双引号包裹，并将内部 " 双写（RFC 4180 §2.7）
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
