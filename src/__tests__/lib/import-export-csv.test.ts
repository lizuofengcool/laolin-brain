import { describe, it, expect } from "vitest";
import { generateCsv } from "@/lib/import-export";

/**
 * import-export generateCsv CSV 转义单测
 *
 * 覆盖目标：src/lib/import-export/index.ts 的 generateCsv。
 * 该函数为纯函数（无 db 依赖），此前内联转义存在未转义 bug：
 * - tags 含引号未双写（`"${tags.join(", ")}"` 仅包裹未双写内部 "）→ 标签含 "
 *   会破坏 CSV（如 ["a\"b"] 输出 "a"b" 导致引号提前闭合）
 * - fileType / folderId / createdAt 等字段裸输出（含逗号/引号/换行会破坏 CSV）
 * - createdAt 为 Date 对象时模板字符串隐式 toString 产生 locale 依赖串
 *
 * 修复后统一走 escapeCsvCell（RFC 4180）+ createdAt Date 预 coercion。
 */
describe("generateCsv / src/lib/import-export/index.ts", () => {
  // ==================== 空入参 ====================

  it("空数组返回表头行（含尾随换行，保留既有行为）", () => {
    expect(generateCsv([])).toBe("文件名,类型,大小,文件夹,标签,收藏,创建时间\n");
  });

  it("null/undefined 入参同样返回表头行", () => {
    expect(generateCsv(null as any)).toBe(
      "文件名,类型,大小,文件夹,标签,收藏,创建时间\n"
    );
    expect(generateCsv(undefined as any)).toBe(
      "文件名,类型,大小,文件夹,标签,收藏,创建时间\n"
    );
  });

  // ==================== 普通字段 ====================

  it("普通字段值正确输出到对应列", () => {
    const out = generateCsv([
      {
        fileName: "报告.pdf",
        fileType: "pdf",
        fileSize: 1024,
        folderId: "f1",
        tags: ["工作", "月报"],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
      },
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("文件名,类型,大小,文件夹,标签,收藏,创建时间");
    expect(lines[1]).toContain("报告.pdf");
    expect(lines[1]).toContain("pdf");
    expect(lines[1]).toContain("1024");
    expect(lines[1]).toContain("f1");
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
        folderId: "",
        tags: [],
        isFavorite: true,
        createdAt: "2026-01-15T10:30:00.000Z",
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
        folderId: "",
        tags: ['tag"with"quote'],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
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
        folderId: "",
        tags: ["a,b", 'c"d'],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
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
        folderId: "",
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
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
        folderId: "",
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
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
        folderId: "",
        tags: [],
        isFavorite: false,
        createdAt: new Date("2026-01-15T10:30:00.000Z"),
      },
    ]);
    expect(out).toContain("2026-01-15T10:30:00.000Z");
    // 不应出现 JSON.stringify(date) 的双引号双包
    expect(out).not.toContain('""2026-01-15T10:30:00.000Z""');
  });

  it("createdAt 缺失时单元格留空", () => {
    const out = generateCsv([
      {
        fileName: "x",
        fileType: "t",
        fileSize: 0,
        folderId: "",
        tags: [],
        isFavorite: false,
        // createdAt 缺失
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
        folderId: "",
        tags: [],
        isFavorite: false,
        createdAt: "2026-01-15T10:30:00.000Z",
      },
      {
        fileName: "b",
        fileType: "t",
        fileSize: 2,
        folderId: "",
        tags: [],
        isFavorite: true,
        createdAt: "2026-01-15T11:30:00.000Z",
      },
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});
