import { describe, it, expect } from "vitest";
import { generateCsv } from "@/lib/import-export";

/**
 * import-export generateCsv CSV 转义单测
 *
 * 覆盖目标：src/lib/import-export/index.ts 的 generateCsv。
 *
 * 历史：该函数为纯函数（无 db 依赖），此前内联转义存在未转义 bug（tags 含引号未双写、
 * fileType/createdAt 等字段裸输出、Date 对象 JSON.stringify 双包）。185-189 轮已陆续
 * 接入共享 escapeCsvCell（RFC 4180）+ Date 预 coercion 修复。
 *
 * 2026-07-20：190 轮去重合并——route.ts 本地 generateCsv 已移除，改从此处 import。
 * 规范列集统一为 route.ts 的 7 列（文件名/文件类型/文件大小/标签/是否收藏/创建时间/更新时间，
 * 含 updatedAt 无 folderId）。本测试同步更新：
 * - 表头期望：旧「文件名,类型,大小,文件夹,标签,收藏,创建时间」→ 新「文件名,文件类型,文件大小,标签,是否收藏,创建时间,更新时间」
 * - 测试入参：旧含 folderId 无 updatedAt → 新含 updatedAt 无 folderId
 * - 空入参：旧返回尾随换行 `headers\n` → 新无尾随换行 `headers`（与 route.ts 非空路径一致）
 * - 「缺失字段留空」用例：旧测 createdAt 缺失（末列空）→ 新测 updatedAt 缺失（末列空）
 * - 新增 updatedAt Date coercion 用例（镜像 createdAt，覆盖末列 Date 双包防御）
 */
describe("generateCsv / src/lib/import-export/index.ts", () => {
  // 规范表头（2026-07-20 去重后统一为 route.ts 列集）
  const HEADERS = "文件名,文件类型,文件大小,标签,是否收藏,创建时间,更新时间";

  // ==================== 空入参 ====================

  it("空数组返回表头行（无尾随换行，2026-07-20 行为变更：与 route.ts 非空路径一致）", () => {
    expect(generateCsv([])).toBe(HEADERS);
  });

  it("null/undefined 入参同样返回表头行（库函数对外暴露需自守）", () => {
    expect(generateCsv(null as any)).toBe(HEADERS);
    expect(generateCsv(undefined as any)).toBe(HEADERS);
  });

  // ==================== 普通字段 ====================

  it("普通字段值正确输出到对应列", () => {
    const out = generateCsv([
      {
        fileName: "报告.pdf",
        fileType: "pdf",
        fileSize: 1024,
        tags: ["工作", "月报"],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-16T08:00:00.000Z",
      },
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toBe(HEADERS);
    expect(lines[1]).toContain("报告.pdf");
    expect(lines[1]).toContain("pdf");
    expect(lines[1]).toContain("1024");
    expect(lines[1]).toContain("2026-01-15T10:30:00.000Z"); // createdAt
    expect(lines[1]).toContain("2026-01-16T08:00:00.000Z"); // updatedAt
    expect(lines[1]).toContain("否");
    // tags 逗号连接后含 , → 应被引号包裹
    expect(lines[1]).toContain('"工作, 月报"');
    // 单行记录（无换行字段）
    expect(lines).toHaveLength(2);
  });

  it("isFavorite=true 输出「是」", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: [],
        isFavorite: true,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    expect(out).toContain("是");
  });

  // ==================== 核心修复：tags 含引号 ====================

  it("tags 含引号时内部引号双写（修复核心 bug）", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: ['tag"with"quote'],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    // tags join → `tag"with"quote` → escapeCsvCell → `"tag""with""quote"`
    expect(out).toContain('"tag""with""quote"');
    // 不应出现未双写的裸形态（即 bug 行为）
    expect(out).not.toContain('tag"with"quote');
  });

  it("tags 多个含特殊字符均正确转义", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: ["a,b", 'c"d'],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    // join → `a,b, c"d` → escapeCsvCell → `"a,b, c""d"`
    expect(out).toContain('"a,b, c""d"');
  });

  // ==================== 其它字段转义 ====================

  it("fileName 含逗号/引号/换行时被引号包裹形成跨行记录（RFC 4180）", () => {
    const out = generateCsv([
      {
        fileName: 'a,b"c\nd',
        fileType: "txt",
        fileSize: 0,
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    const lines = out.split("\n");
    // header + 跨两行记录 = 3 行
    expect(lines).toHaveLength(3);
    // 第一段：逗号在引号内、内部 " 双写
    expect(lines[1]).toContain('"a,b""c');
    // 第二段以 `d"` 开头（closing quote + 后续字段）
    expect(lines[2]).toMatch(/^d"/);
  });

  it("fileType 含逗号时被引号包裹", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "a,b",
        fileSize: 0,
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    expect(out).toContain('"a,b"');
  });

  // ==================== Date 预 coercion ====================

  it("createdAt 为 Date 对象时输出裸 ISO 串（不被 JSON.stringify 双包）", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: [],
        isFavorite: false,
        createdAt: new Date("2026-01-15T10:30:00.000Z"),
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
    ]);
    expect(out).toContain("2026-01-15T10:30:00.000Z");
    // 不应出现 JSON.stringify(date) 的双引号双包
    expect(out).not.toContain('""2026-01-15T10:30:00.000Z""');
  });

  it("updatedAt 为 Date 对象时输出裸 ISO 串（不被 JSON.stringify 双包）", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: new Date("2026-01-16T08:00:00.000Z"),
      },
    ]);
    expect(out).toContain("2026-01-16T08:00:00.000Z");
    // 不应出现 JSON.stringify(date) 的双引号双包
    expect(out).not.toContain('""2026-01-16T08:00:00.000Z""');
  });

  it("updatedAt 缺失时末列单元格留空（行末以逗号结尾）", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        // updatedAt 缺失（现为末列）
      },
    ]);
    // 末列应为空（行末是空串，即行以逗号结尾）
    const lines = out.split("\n");
    expect(lines[1]).toMatch(/,$/);
  });

  // ==================== 多行记录 ====================

  it("多条文件各占一行（无换行字段时）", () => {
    const out = generateCsv([
      {
        fileName: "a",
        fileType: "t",
        fileSize: 1,
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
        updatedAt: "2026-01-15T11:00:00.000Z",
      },
      {
        fileName: "b",
        fileType: "t",
        fileSize: 2,
        tags: [],
        isFavorite: true,
        createdAt: "2026-01-15T11:30:00.000Z",
        updatedAt: "2026-01-15T12:00:00.000Z",
      },
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});
