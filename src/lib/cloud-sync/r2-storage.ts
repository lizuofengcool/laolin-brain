// Cloudflare R2 存储配置态（按租户落库）
//
// 实际对象读写由 R2Storage 类（per-call 实例，配置取自 DB）承担，
// 见 r2-storage-class.ts 与 sync-engine.ts 的 getStorageProvider。
//
// 本模块仅负责两件事：
//   1. 查询某租户是否已在数据库中配置 R2（isR2Configured）
//   2. 用给定配置测试 R2 连通性（testR2Connection，不写入任何全局状态）
//
// 历史问题：此前使用进程级单例 s3Client/currentConfig，
// 租户 A 配置后 isR2Configured() 对所有租户返回 true，
// 且 POST /api/cloud-sync/config 不落库，导致标志位与实际同步数据源脱节。
// 现以 DB（sync-engine 实际读取的唯一真相源）为查询依据，彻底消除跨租户泄露。

import { db } from "@/lib/db";
import { R2Storage, type R2Config, type StorageObject } from "./r2-storage-class";

// 重新导出类型，保持现有导入兼容
export type { R2Config, StorageObject };

/**
 * 检查指定租户是否已在数据库中配置 R2 存储配置。
 *
 * 以 DB（sync-engine.getStorageProvider 实际读取的数据源）为唯一真相源，
 * 避免此前进程级单例导致的跨租户"已配置"误报：租户 A 配置后租户 B 不再被误判为已配置。
 */
export async function isR2Configured(tenantId: string): Promise<boolean> {
  const config = await db.storageConfig.findUnique({
    where: { tenantId_provider: { tenantId, provider: "r2" } },
    select: { id: true },
  });
  return config !== null;
}

/**
 * 使用给定配置测试 R2 连接是否正常。
 *
 * 仅构造临时 R2Storage 实例发起一次 ListObjects（MaxKeys:1），
 * 不写入任何进程级全局状态，避免与其它租户的配置互相污染。
 */
export async function testR2Connection(config: R2Config): Promise<boolean> {
  try {
    return await new R2Storage(config).testConnection();
  } catch (error) {
    console.error("R2 连接测试失败:", error);
    return false;
  }
}
