/**
 * sqlite-vec 向量语义搜索
 *
 * sqlite-vec 是 SQLite 的向量搜索扩展，支持在 SQLite 中进行
 * 高性能向量相似度搜索（余弦距离、欧氏距离等）。
 *
 * 与当前 FileEmbedding 表的 JS 端余弦计算相比：
 * - 当前：加载所有 embedding 到 JS 内存 → 逐个计算余弦 → O(n) 全表扫描
 * - sqlite-vec：在 SQLite 内部用 vec0 虚拟表做 ANN 搜索 → 毫秒级
 *
 * 架构：
 *   FileEmbedding 表（存储 JSON 向量）← vec0 虚拟表（向量索引）
 *   写入时同步到 vec0，查询时用 MATCH 做向量搜索
 */

import { db } from "@/lib/db";

const VEC_TABLE = "file_embeddings_vec";
const EMBEDDING_DIM = 64; // 与 embeddings.ts 保持一致

/**
 * 初始化 sqlite-vec 向量索引
 */
export async function initVecIndex(): Promise<boolean> {
  try {
    // 创建 vec0 虚拟表
    await db.$executeRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${VEC_TABLE} USING vec0(
        embedding float[${EMBEDDING_DIM}]
      )
    `);

    console.log("[sqlite-vec] 向量索引初始化完成");
    return true;
  } catch (error) {
    // sqlite-vec 扩展可能未安装
    console.warn("[sqlite-vec] 初始化失败（扩展可能未安装）:", error);
    return false;
  }
}

/**
 * 重建向量索引（全量同步）
 */
export async function rebuildVecIndex(): Promise<{
  success: boolean;
  indexedCount: number;
  error?: string;
}> {
  try {
    await initVecIndex();

    // 清空 vec 表
    await db.$executeRawUnsafe(`DELETE FROM ${VEC_TABLE}`);

    // 从 FileEmbedding 表全量同步
    const embeddings = await db.fileEmbedding.findMany({
      select: { id: true, fileId: true, embedding: true },
    });

    let count = 0;
    for (const emb of embeddings) {
      try {
        const vec = JSON.parse(emb.embedding);
        if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) continue;

        // 将 float 数组转为 BLOB
        const blob = floatArrayToBlob(vec);

        await db.$executeRawUnsafe(
          `INSERT INTO ${VEC_TABLE}(rowid, embedding) VALUES (?, ?)`,
          emb.id,
          blob
        );
        count++;
      } catch {
        // 跳过无法解析的向量
      }
    }

    return { success: true, indexedCount: count };
  } catch (error) {
    return {
      success: false,
      indexedCount: 0,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 向量搜索：查找与查询向量最相似的文件
 */
export async function vecSearch(
  queryEmbedding: number[],
  options?: {
    limit?: number;
    threshold?: number;
  }
): Promise<
  Array<{
    id: string;
    distance: number;
  }>
> {
  const limit = options?.limit || 30;
  const threshold = options?.threshold || 0.5;

  try {
    const blob = floatArrayToBlob(queryEmbedding);

    const results = await db.$queryRawUnsafe<
      Array<{ rowid: string; distance: number }>
    >(
      `SELECT rowid, distance
       FROM ${VEC_TABLE}
       WHERE embedding MATCH ?
       ORDER BY distance
       LIMIT ?`,
      blob,
      limit
    );

    // distance 越小越相似，转为相似度分数
    return results
      .map((r) => ({
        id: String(r.rowid),
        distance: r.distance,
      }))
      .filter((r) => r.distance < threshold);
  } catch (error) {
    console.warn("[sqlite-vec] 向量搜索失败:", error);
    return [];
  }
}

/**
 * 检查 sqlite-vec 是否可用
 */
export async function isVecAvailable(): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`SELECT 1 FROM ${VEC_TABLE} LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 将 float 数组转为 SQLite BLOB（Little-Endian float32）
 */
function floatArrayToBlob(arr: number[]): Buffer {
  const buffer = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buffer.writeFloatLE(arr[i], i * 4);
  }
  return buffer;
}
