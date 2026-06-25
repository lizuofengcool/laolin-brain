/**
 * FTS5 全文搜索索引管理
 *
 * SQLite FTS5 提供毫秒级全文搜索，比 LIKE contains 快 100 倍以上。
 * 使用 content-sync 模式（外部内容表），避免数据重复存储。
 *
 * 架构：
 *   File 表（原表）← FTS5 虚拟表（仅存倒排索引）
 *   写入时同步到 FTS5，查询时用 MATCH 代替 LIKE
 */

import { db } from "@/lib/db";

/** FTS5 虚拟表名 */
const FTS_TABLE = "files_fts";

/**
 * 初始化 FTS5 虚拟表
 * 应在应用启动时调用（或通过 migration 执行）
 *
 * 使用 content= 参数指向原表，避免数据重复
 * 使用 tokenize='unicode61' 支持多语言分词
 */
export async function initFTS5Index(): Promise<void> {
  try {
    // 创建 FTS5 虚拟表（外部内容模式）
    await db.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
        fileName,
        textContent,
        tags,
        summary,
        content='File',
        content_rowid='id',
        tokenize='unicode61'
      )
    `);

    // 创建触发器：插入时自动同步 FTS5
    await db.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON File BEGIN
        INSERT INTO ${FTS_TABLE}(rowid, fileName, textContent, tags, summary)
        VALUES (CAST(new.id AS INTEGER), new.fileName, new.textContent, new.tags, new.summary);
      END
    `);

    // 创建触发器：更新时自动同步 FTS5
    await db.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS files_fts_update AFTER UPDATE ON File BEGIN
        INSERT INTO ${FTS_TABLE}(${FTS_TABLE}, rowid, fileName, textContent, tags, summary)
        VALUES ('delete', CAST(old.id AS INTEGER), old.fileName, old.textContent, old.tags, old.summary);
        INSERT INTO ${FTS_TABLE}(rowid, fileName, textContent, tags, summary)
        VALUES (CAST(new.id AS INTEGER), new.fileName, new.textContent, new.tags, new.summary);
      END
    `);

    // 创建触发器：删除时自动同步 FTS5
    await db.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON File BEGIN
        INSERT INTO ${FTS_TABLE}(${FTS_TABLE}, rowid, fileName, textContent, tags, summary)
        VALUES ('delete', CAST(old.id AS INTEGER), old.fileName, old.textContent, old.tags, old.summary);
      END
    `);

    console.log("[FTS5] 全文搜索索引初始化完成");
  } catch (error) {
    // FTS5 可能不可用（旧版 SQLite），降级到 LIKE 搜索
    console.warn("[FTS5] 初始化失败，将降级到 LIKE 搜索:", error);
  }
}

/**
 * 重建 FTS5 索引（全量同步）
 * 适用于首次启用或索引损坏时
 */
export async function rebuildFTS5Index(): Promise<{
  success: boolean;
  indexedCount: number;
  error?: string;
}> {
  try {
    // 先确保 FTS5 表存在
    await initFTS5Index();

    // 清空 FTS5 表
    await db.$executeRawUnsafe(`DELETE FROM ${FTS_TABLE}`);

    // 从 File 表全量同步（仅未删除的文件）
    const result = await db.$executeRawUnsafe(`
      INSERT INTO ${FTS_TABLE}(rowid, fileName, textContent, tags, summary)
      SELECT CAST(id AS INTEGER), fileName, textContent, tags, summary
      FROM File
      WHERE isDeleted = 0 AND storageMode = 'cloud'
    `);

    return { success: true, indexedCount: result };
  } catch (error) {
    console.error("[FTS5] 重建索引失败:", error);
    return {
      success: false,
      indexedCount: 0,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * FTS5 全文搜索
 * 返回匹配的文件 ID 列表和 BM25 相关性分数
 */
export async function fts5Search(
  query: string,
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<
  Array<{
    fileId: string;
    score: number;
    snippet?: string;
  }>
> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  try {
    // 对查询进行安全转义（FTS5 特殊字符）
    const safeQuery = escapeFTS5Query(query);

    // 使用 FTS5 MATCH 搜索，BM25 排序
    const results = await db.$queryRawUnsafe<
      Array<{ rowid: number; score: number; snippet: string }>
    >(
      `SELECT
        rowid,
        bm25(${FTS_TABLE}) as score,
        snippet(${FTS_TABLE}, 1, '⟨', '⟩', '...', 20) as snippet
      FROM ${FTS_TABLE}
      WHERE ${FTS_TABLE} MATCH ?
      ORDER BY score
      LIMIT ? OFFSET ?`,
      safeQuery,
      limit,
      offset
    );

    // BM25 返回负分数（越负越相关），取反转为正分数
    // 需要通过 File 表过滤 userId
    if (results.length === 0) return [];

    const rowIds = results.map((r) => r.rowid);

    // 查询匹配文件的 userId
    const files = await db.file.findMany({
      where: {
        id: { in: rowIds.map(String) },
        userId,
        isDeleted: false,
      },
      select: { id: true },
    });

    const validIds = new Set(files.map((f) => f.id));

    return results
      .filter((r) => validIds.has(String(r.rowid)))
      .map((r) => ({
        fileId: String(r.rowid),
        score: -r.score, // 取反为正分数
        snippet: r.snippet,
      }));
  } catch (error) {
    // FTS5 搜索失败，返回空结果（调用方应降级到 LIKE）
    console.warn("[FTS5] 搜索失败，降级到 LIKE:", error);
    return [];
  }
}

/**
 * 转义 FTS5 查询中的特殊字符
 * FTS5 的 MATCH 语法支持: AND, OR, NOT, "phrase", column:term 等
 */
function escapeFTS5Query(query: string): string {
  // 移除可能导致语法错误的字符
  let safe = query
    .replace(/"/g, '""') // 转义引号
    .replace(/[{}()\[\]\\]/g, " ") // 移除特殊字符
    .trim();

  if (!safe) return '""';

  // 如果包含多个词，用 OR 连接（任一匹配即可）
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    // 同时支持整体短语匹配和单词匹配
    return `"${safe}" OR ${words.join(" OR ")}`;
  }

  return safe;
}

/**
 * 检查 FTS5 是否可用
 */
export async function isFTS5Available(): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`SELECT 1 FROM ${FTS_TABLE} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 FTS5 索引统计信息
 */
export async function getFTS5Stats(): Promise<{
  available: boolean;
  indexedCount: number;
}> {
  const available = await isFTS5Available();
  if (!available) return { available: false, indexedCount: 0 };

  try {
    const result = await db.$queryRawUnsafe<
      Array<{ count: number }>
    >(`SELECT count(*) as count FROM ${FTS_TABLE}`);
    return { available: true, indexedCount: result[0]?.count || 0 };
  } catch {
    return { available: false, indexedCount: 0 };
  }
}
