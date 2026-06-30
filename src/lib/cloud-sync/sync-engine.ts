/**
 * 云端同步引擎（Phase 2 - 完整版）
 * 支持多租户、增量同步、冲突处理、离线队列、同步状态管理
 * 离线优先：本地数据为主，云端为备份
 * 数据安全：所有云端数据保持端到端加密
 */
import { db } from "@/lib/db";
import { encrypt, decrypt, hashFileContent } from "./crypto";
import { decryptConfig } from "./config-crypto";
import { R2Storage, R2Config } from "./r2-storage-class";
import { AliyunOSSStorage, AliyunOSSConfig } from "./aliyun-oss";

// ==================== 类型定义 ====================

export interface SyncStatus {
  lastSyncTime: string | null;
  totalFiles: number;
  syncedFiles: number;
  pendingFiles: number;
  conflictFiles: number;
  isSyncing: boolean;
  lastError: string | null;
  overallStatus: 'idle' | 'syncing' | 'error' | 'offline';
  queueSize: number;
}

export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number; // 分钟
  encryptionPassword: string;
  storageProvider: 'aliyun' | 'r2' | 'local';
}

export interface SyncProgress {
  current: number;
  total: number;
  percentage: number;
  currentFile: string | null;
  bytesPerSecond: number;
  estimatedTimeRemaining: number;
}

export interface ConflictInfo {
  fileId: string;
  fileName: string;
  localUpdatedAt: Date;
  cloudUpdatedAt: Date;
  localHash: string | null;
  cloudHash: string | null;
  resolution: 'pending' | 'local_wins' | 'cloud_wins' | 'keep_both';
}

export interface QueueItem {
  id: string;
  operation: 'upload' | 'update' | 'delete';
  fileId: string | null;
  fileName: string | null;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  priority: number;
  createdAt: Date;
}

interface CloudBackupMeta {
  version: string;
  backupTime: string;
  fileCount: number;
  folderCount: number;
  totalSize: number;
  checksum: string;
  tenantId: string;
}

interface CloudFileMeta {
  fileId: string;
  fileName: string;
  fileHash: string | null;
  fileSize: number;
  updatedAt: string;
  syncStatus: string;
}

interface StorageProvider {
  uploadObject(key: string, data: Buffer, contentType?: string): Promise<void>;
  downloadObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
  headObject(key: string): Promise<{ size: number; lastModified: Date } | null>;
}

const BACKUP_PREFIX = "backups/";
const FILES_PREFIX = "files/";
const META_SUFFIX = ".meta.json";
const DATA_SUFFIX = ".data.enc";
const FILE_META_SUFFIX = ".filemeta.json";

// 同步状态常量
export const SYNC_STATUS = {
  LOCAL: 'local',
  SYNCED: 'synced',
  PENDING: 'pending',
  CONFLICT: 'conflict',
} as const;

// 队列状态常量
export const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  FAILED: 'failed',
  COMPLETED: 'completed',
} as const;

// 操作类型常量
export const OPERATION_TYPE = {
  UPLOAD: 'upload',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

// ==================== 存储提供者工厂 ====================

/**
 * 获取租户的存储提供者
 */
async function getStorageProvider(tenantId: string): Promise<StorageProvider> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { storageConfigs: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const provider = tenant.storageProvider || 'aliyun';
  const storageConfig = tenant.storageConfigs.find(c => c.provider === provider);

  if (!storageConfig) {
    throw new Error(`Storage config not found for provider: ${provider}`);
  }

  // config 字段自第二十八轮起以 AES-256-GCM 加密落库；decryptConfig 对历史明文 JSON
  // 行自动回退 JSON.parse（向后兼容），新写入均带 "v1:" 前缀。
  const config = decryptConfig(storageConfig.config);

  switch (provider) {
    case 'aliyun':
      return createAliyunProvider(config as AliyunOSSConfig);
    case 'r2':
      return createR2Provider(config as R2Config);
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

/**
 * 创建阿里云 OSS 提供者
 */
function createAliyunProvider(config: AliyunOSSConfig): StorageProvider {
  const oss = new AliyunOSSStorage(config);
  return {
    uploadObject: async (key: string, data: Buffer, contentType?: string) => {
      await oss.uploadObject(key, data, { contentType });
    },
    downloadObject: async (key: string) => {
      return oss.downloadObject(key);
    },
    deleteObject: async (key: string) => {
      await oss.deleteObject(key);
    },
    listObjects: async (prefix: string) => {
      const result = await oss.listObjects(prefix);
      return result.objects;
    },
    headObject: async (key: string) => {
      const result = await oss.headObject(key);
      return result ? { size: result.size, lastModified: result.lastModified } : null;
    },
  };
}

/**
 * 创建 R2 存储提供者
 */
function createR2Provider(config: R2Config): StorageProvider {
  const r2 = new R2Storage(config);
  return {
    uploadObject: async (key: string, data: Buffer, contentType?: string) => {
      await r2.uploadObject(key, data, contentType);
    },
    downloadObject: async (key: string) => {
      return r2.downloadObject(key);
    },
    deleteObject: async (key: string) => {
      await r2.deleteObject(key);
    },
    listObjects: async (prefix: string) => {
      return r2.listObjects(prefix);
    },
    headObject: async (key: string) => {
      return r2.headObject(key);
    },
  };
}

// ==================== 离线队列管理 ====================

/**
 * 添加操作到同步队列
 */
export async function addToSyncQueue(
  tenantId: string,
  userId: string,
  operation: 'upload' | 'update' | 'delete',
  fileData: {
    fileId?: string;
    fileName?: string;
    fileHash?: string;
    filePath?: string;
    folderId?: string;
  },
  priority: number = 0
): Promise<string> {
  const queueItem = await db.syncQueue.create({
    data: {
      tenantId,
      userId,
      operation,
      fileId: fileData.fileId || null,
      fileName: fileData.fileName || null,
      fileHash: fileData.fileHash || null,
      filePath: fileData.filePath || null,
      folderId: fileData.folderId || null,
      status: QUEUE_STATUS.PENDING,
      priority,
    },
  });

  // 更新文件同步状态为pending
  if (fileData.fileId) {
    await db.file.update({
      where: { id: fileData.fileId },
      data: { syncStatus: SYNC_STATUS.PENDING },
    });
  }

  return queueItem.id;
}

/**
 * 获取同步队列
 */
export async function getSyncQueue(
  tenantId: string,
  status?: string,
  limit: number = 50
): Promise<QueueItem[]> {
  const items = await db.syncQueue.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: limit,
  });

  return items.map(item => ({
    id: item.id,
    operation: item.operation as 'upload' | 'update' | 'delete',
    fileId: item.fileId,
    fileName: item.fileName,
    status: item.status as 'pending' | 'processing' | 'failed' | 'completed',
    retryCount: item.retryCount,
    maxRetries: item.maxRetries,
    errorMessage: item.errorMessage,
    priority: item.priority,
    createdAt: item.createdAt,
  }));
}

/**
 * 处理同步队列
 */
export async function processSyncQueue(
  tenantId: string,
  userId: string,
  password: string
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const storage = await getStorageProvider(tenantId);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // 获取待处理的队列项
  const queueItems = await db.syncQueue.findMany({
    where: {
      tenantId,
      status: { in: [QUEUE_STATUS.PENDING, QUEUE_STATUS.FAILED] },
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: 20, // 每次最多处理20个
  });

  for (const item of queueItems) {
    processed++;

    try {
      // 标记为处理中
      await db.syncQueue.update({
        where: { id: item.id },
        data: {
          status: QUEUE_STATUS.PROCESSING,
          retryCount: { increment: 1 },
        },
      });

      // 根据操作类型执行
      switch (item.operation) {
        case OPERATION_TYPE.UPLOAD:
        case OPERATION_TYPE.UPDATE:
          if (item.fileId) {
            await uploadFileToCloud(storage, tenantId, item.fileId, password);
          }
          break;
        case OPERATION_TYPE.DELETE:
          if (item.fileId) {
            await deleteFileFromCloud(storage, tenantId, item.fileId);
          }
          break;
      }

      // 标记为完成
      await db.syncQueue.update({
        where: { id: item.id },
        data: {
          status: QUEUE_STATUS.COMPLETED,
          processedAt: new Date(),
        },
      });

      succeeded++;
    } catch (error) {
      console.error(`处理队列项失败: ${item.id}`, error);
      failed++;

      // 检查是否超过最大重试次数
      if (item.retryCount + 1 >= item.maxRetries) {
        // 超过最大重试次数，标记为失败
        await db.syncQueue.update({
          where: { id: item.id },
          data: {
            status: QUEUE_STATUS.FAILED,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });

        // 更新文件状态为冲突或错误
        if (item.fileId) {
          await db.file.update({
            where: { id: item.fileId },
            data: { syncStatus: SYNC_STATUS.CONFLICT },
          });
        }
      } else {
        // 可以重试，保持pending状态
        await db.syncQueue.update({
          where: { id: item.id },
          data: {
            status: QUEUE_STATUS.PENDING,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  }

  return { processed, succeeded, failed };
}

/**
 * 清理已完成的队列项
 */
export async function cleanupCompletedQueue(tenantId: string, olderThanDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await db.syncQueue.deleteMany({
    where: {
      tenantId,
      status: QUEUE_STATUS.COMPLETED,
      processedAt: { lt: cutoffDate },
    },
  });

  return result.count;
}

// ==================== 文件云端操作 ====================

/**
 * 上传单个文件到云端
 */
async function uploadFileToCloud(
  storage: StorageProvider,
  tenantId: string,
  fileId: string,
  password: string
): Promise<void> {
  const file = await db.file.findUnique({
    where: { id: fileId, tenantId },
  });

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  // 构建文件元数据
  const fileMeta: CloudFileMeta = {
    fileId: file.id,
    fileName: file.fileName,
    fileHash: file.fileHash,
    fileSize: file.fileSize,
    updatedAt: file.updatedAt.toISOString(),
    syncStatus: SYNC_STATUS.SYNCED,
  };

  // 加密文件内容（如果有textContent）
  const fileData = {
    ...file,
    textContent: file.textContent,
  };

  const dataJson = JSON.stringify(fileData);
  const encryptedData = encrypt(Buffer.from(dataJson), password);

  // 上传到云端
  const dataKey = `${FILES_PREFIX}${tenantId}/${fileId}${DATA_SUFFIX}`;
  const metaKey = `${FILES_PREFIX}${tenantId}/${fileId}${FILE_META_SUFFIX}`;

  await storage.uploadObject(dataKey, Buffer.from(encryptedData), 'application/octet-stream');
  await storage.uploadObject(metaKey, Buffer.from(JSON.stringify(fileMeta)), 'application/json');

  // 更新本地同步状态
  await db.file.update({
    where: { id: fileId },
    data: {
      syncStatus: SYNC_STATUS.SYNCED,
      lastSyncAt: new Date(),
    },
  });
}

/**
 * 从云端获取并解密文件数据（不写本地库）
 * 供 downloadFileFromCloud 和 keep_both 冲突解决复用
 */
async function fetchCloudFileData(
  storage: StorageProvider,
  tenantId: string,
  fileId: string,
  password: string
): Promise<any> {
  const dataKey = `${FILES_PREFIX}${tenantId}/${fileId}${DATA_SUFFIX}`;
  const encryptedData = await storage.downloadObject(dataKey);
  const decryptedData = decrypt(encryptedData, password);
  return JSON.parse(decryptedData.toString('utf8'));
}

/**
 * 从云端下载单个文件
 */
async function downloadFileFromCloud(
  storage: StorageProvider,
  tenantId: string,
  fileId: string,
  password: string
): Promise<void> {
  const fileData = await fetchCloudFileData(storage, tenantId, fileId, password);

  // 更新或创建本地文件
  // 含 tenantId 守卫：与 uploadFileToCloud（line 423）一致，防止跨租户 fileId
  // 命中他租户同 id 文件后被 update 覆盖。fileId 不属当前租户时返回 null → 走 create 分支。
  const existingFile = await db.file.findUnique({
    where: { id: fileId, tenantId },
  });

  if (existingFile) {
    await db.file.update({
      where: { id: fileId },
      data: {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        textContent: fileData.textContent,
        thumbnailUrl: fileData.thumbnailUrl,
        tags: fileData.tags,
        isFavorite: fileData.isFavorite,
        syncStatus: SYNC_STATUS.SYNCED,
        lastSyncAt: new Date(),
      },
    });
  } else {
    await db.file.create({
      data: {
        id: fileId,
        tenantId,
        userId: fileData.userId,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        filePath: fileData.filePath,
        textContent: fileData.textContent,
        thumbnailUrl: fileData.thumbnailUrl,
        folderId: fileData.folderId,
        tags: fileData.tags,
        isFavorite: fileData.isFavorite,
        fileHash: fileData.fileHash,
        summary: fileData.summary,
        keyPoints: fileData.keyPoints,
        syncStatus: SYNC_STATUS.SYNCED,
        lastSyncAt: new Date(),
        createdAt: new Date(fileData.createdAt),
        updatedAt: new Date(fileData.updatedAt),
      },
    });
  }
}

/**
 * 从云端删除文件
 */
async function deleteFileFromCloud(
  storage: StorageProvider,
  tenantId: string,
  fileId: string
): Promise<void> {
  const dataKey = `${FILES_PREFIX}${tenantId}/${fileId}${DATA_SUFFIX}`;
  const metaKey = `${FILES_PREFIX}${tenantId}/${fileId}${FILE_META_SUFFIX}`;

  try {
    await storage.deleteObject(dataKey);
    await storage.deleteObject(metaKey);
  } catch (error) {
    console.error(`删除云端文件失败: ${fileId}`, error);
    throw error;
  }
}

/**
 * 获取云端文件列表
 */
async function listCloudFiles(
  storage: StorageProvider,
  tenantId: string
): Promise<CloudFileMeta[]> {
  const prefix = `${FILES_PREFIX}${tenantId}/`;
  const objects = await storage.listObjects(prefix);

  // 只保留元数据文件
  const metaFiles = objects.filter(obj => obj.key.endsWith(FILE_META_SUFFIX));
  const files: CloudFileMeta[] = [];

  for (const metaFile of metaFiles) {
    try {
      const data = await storage.downloadObject(metaFile.key);
      const meta = JSON.parse(data.toString('utf8')) as CloudFileMeta;
      files.push(meta);
    } catch (error) {
      console.error('读取云端文件元数据失败:', error);
    }
  }

  return files;
}

// ==================== 冲突检测与处理 ====================

/**
 * 检测文件冲突
 * 当本地和云端都修改了同一文件时，标记为冲突
 */
export async function detectConflicts(
  tenantId: string
): Promise<ConflictInfo[]> {
  const storage = await getStorageProvider(tenantId);
  const conflicts: ConflictInfo[] = [];

  // 获取本地文件
  const localFiles = await db.file.findMany({
    where: { tenantId, isDeleted: false },
    select: {
      id: true,
      fileName: true,
      fileHash: true,
      updatedAt: true,
      syncStatus: true,
    },
  });

  // 获取云端文件
  const cloudFiles = await listCloudFiles(storage, tenantId);
  const cloudFileMap = new Map(cloudFiles.map(f => [f.fileId, f]));

  // 对比检测冲突
  for (const localFile of localFiles) {
    const cloudFile = cloudFileMap.get(localFile.id);

    if (cloudFile && localFile.fileHash && cloudFile.fileHash) {
      // 两边都有文件，检查哈希是否一致
      if (localFile.fileHash !== cloudFile.fileHash) {
        // 哈希不一致，检查更新时间
        const localUpdatedAt = new Date(localFile.updatedAt);
        const cloudUpdatedAt = new Date(cloudFile.updatedAt);

        // 如果两边都在最后同步后有修改，就是冲突
        conflicts.push({
          fileId: localFile.id,
          fileName: localFile.fileName,
          localUpdatedAt,
          cloudUpdatedAt,
          localHash: localFile.fileHash,
          cloudHash: cloudFile.fileHash,
          resolution: 'pending',
        });

        // 标记文件为冲突状态
        if (localFile.syncStatus !== SYNC_STATUS.CONFLICT) {
          await db.file.update({
            where: { id: localFile.id },
            data: { syncStatus: SYNC_STATUS.CONFLICT },
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * 解决冲突
 * @param resolution - 解决策略：local_wins（本地胜出）、cloud_wins（云端胜出）、keep_both（保留两者）
 */
export async function resolveConflict(
  tenantId: string,
  userId: string,
  fileId: string,
  resolution: 'local_wins' | 'cloud_wins' | 'keep_both',
  password: string
): Promise<void> {
  // 前置归属校验：conflicts 路由透传 body.fileId 不可信，需防止跨租户操作。
  // uploadFileToCloud 已自带 tenantId 守卫（findUnique where 含 tenantId），
  // 但 keep_both 分支与函数末尾的 syncStatus 更新均按裸 id 操作，cloud_wins 经
  // downloadFileFromCloud 亦按裸 id findUnique → 跨租户 fileId 会 rename/overwrite
  // 他租户文件。此处统一拦截，fileId 不属当前租户时立即失败，不触达任何写操作。
  const owned = await db.file.findUnique({ where: { id: fileId, tenantId } });
  if (!owned) {
    throw new Error(`File not found in tenant: ${fileId}`);
  }

  const storage = await getStorageProvider(tenantId);

  switch (resolution) {
    case 'local_wins':
      // 本地胜出：强制上传本地文件到云端
      await uploadFileToCloud(storage, tenantId, fileId, password);
      break;

    case 'cloud_wins':
      // 云端胜出：强制下载云端文件到本地
      await downloadFileFromCloud(storage, tenantId, fileId, password);
      break;

    case 'keep_both': {
      // 保留两者：本地文件重命名为冲突副本，云端版本作为新文件落地（新 id）
      const file = await db.file.findUnique({ where: { id: fileId } });
      if (file) {
        // 先取云端数据（在写库之前，避免与重命名耦合）
        const cloudData = await fetchCloudFileData(storage, tenantId, fileId, password);

        // 重命名本地文件为冲突副本，保留本地版本（之前直接覆盖会丢失本地版本）
        await db.file.update({
          where: { id: fileId },
          data: {
            fileName: `[冲突副本] ${file.fileName}`,
            syncStatus: SYNC_STATUS.SYNCED,
            lastSyncAt: new Date(),
          },
        });

        // 将云端版本创建为新文件（新 id 由 cuid 生成），与本地版本并存
        // 使用本地 file 的 userId / folderId 以保证外键有效
        await db.file.create({
          data: {
            tenantId,
            userId: file.userId,
            fileName: cloudData.fileName ?? file.fileName,
            fileType: cloudData.fileType ?? file.fileType,
            fileSize: cloudData.fileSize ?? file.fileSize,
            filePath: cloudData.filePath ?? file.filePath ?? null,
            textContent: cloudData.textContent ?? null,
            thumbnailUrl: cloudData.thumbnailUrl ?? null,
            folderId: file.folderId,
            tags: cloudData.tags ?? '',
            isFavorite: cloudData.isFavorite ?? false,
            fileHash: cloudData.fileHash ?? null,
            summary: cloudData.summary ?? null,
            keyPoints: cloudData.keyPoints ?? '',
            syncStatus: SYNC_STATUS.SYNCED,
            lastSyncAt: new Date(),
          },
        });
      }
      break;
    }
  }

  // 更新文件同步状态
  await db.file.update({
    where: { id: fileId },
    data: { syncStatus: SYNC_STATUS.SYNCED },
  });
}

/**
 * 批量解决冲突（最后写入胜出策略）
 */
export async function resolveConflictsAuto(
  tenantId: string,
  userId: string,
  password: string,
  strategy: 'last_write_wins' = 'last_write_wins'
): Promise<number> {
  const conflicts = await detectConflicts(tenantId);
  let resolved = 0;

  for (const conflict of conflicts) {
    try {
      if (strategy === 'last_write_wins') {
        // 最后写入胜出：比较更新时间
        if (conflict.localUpdatedAt > conflict.cloudUpdatedAt) {
          // 本地更新，本地胜出
          await resolveConflict(tenantId, userId, conflict.fileId, 'local_wins', password);
        } else {
          // 云端更新，云端胜出
          await resolveConflict(tenantId, userId, conflict.fileId, 'cloud_wins', password);
        }
      }
      resolved++;
    } catch (error) {
      console.error(`解决冲突失败: ${conflict.fileId}`, error);
    }
  }

  return resolved;
}

// ==================== 增量同步 ====================

/**
 * 执行增量同步
 * 只同步有变更的文件，支持冲突检测和处理
 */
export async function incrementalSync(
  tenantId: string,
  userId: string,
  password: string
): Promise<{
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: number;
  total: number;
}> {
  const storage = await getStorageProvider(tenantId);
  let uploaded = 0;
  let downloaded = 0;
  let conflicts = 0;
  let errors = 0;

  // 创建同步日志
  const syncLog = await db.syncLog.create({
    data: {
      tenantId,
      userId,
      syncType: 'incremental',
      status: 'in_progress',
      startedAt: new Date(),
    },
  });

  try {
    // 1. 先处理离线队列
    const queueResult = await processSyncQueue(tenantId, userId, password);
    uploaded += queueResult.succeeded;
    errors += queueResult.failed;

    // 2. 获取本地所有文件
    const localFiles = await db.file.findMany({
      where: { tenantId, isDeleted: false },
    });

    // 3. 获取云端文件列表
    const cloudFiles = await listCloudFiles(storage, tenantId);
    const cloudFileMap = new Map(cloudFiles.map(f => [f.fileId, f]));

    // 4. 对比并同步
    for (const localFile of localFiles) {
      try {
        const cloudFile = cloudFileMap.get(localFile.id);

        if (!cloudFile) {
          // 云端没有，需要上传
          if (localFile.syncStatus !== SYNC_STATUS.SYNCED) {
            await uploadFileToCloud(storage, tenantId, localFile.id, password);
            uploaded++;
          }
        } else {
          // 云端有，检查是否需要同步
          const localHash = localFile.fileHash;
          const cloudHash = cloudFile.fileHash;

          if (localHash && cloudHash && localHash !== cloudHash) {
            // 哈希不一致，检测冲突
            const localUpdatedAt = new Date(localFile.updatedAt);
            const cloudUpdatedAt = new Date(cloudFile.updatedAt);

            // 检查是否在最后同步后两边都有修改
            if (localFile.lastSyncAt) {
              const lastSyncAt = new Date(localFile.lastSyncAt);
              const localModifiedAfterSync = localUpdatedAt > lastSyncAt;
              const cloudModifiedAfterSync = cloudUpdatedAt > lastSyncAt;

              if (localModifiedAfterSync && cloudModifiedAfterSync) {
                // 两边都修改了，标记为冲突
                conflicts++;
                await db.file.update({
                  where: { id: localFile.id },
                  data: { syncStatus: SYNC_STATUS.CONFLICT },
                });
              } else if (localModifiedAfterSync) {
                // 只有本地修改，上传
                await uploadFileToCloud(storage, tenantId, localFile.id, password);
                uploaded++;
              } else if (cloudModifiedAfterSync) {
                // 只有云端修改，下载
                await downloadFileFromCloud(storage, tenantId, localFile.id, password);
                downloaded++;
              }
            } else {
              // 没有同步记录，使用最后写入胜出
              if (localUpdatedAt > cloudUpdatedAt) {
                await uploadFileToCloud(storage, tenantId, localFile.id, password);
                uploaded++;
              } else {
                await downloadFileFromCloud(storage, tenantId, localFile.id, password);
                downloaded++;
              }
            }
          } else if (localFile.syncStatus !== SYNC_STATUS.SYNCED) {
            // 哈希一致，但状态不是synced，更新状态
            await db.file.update({
              where: { id: localFile.id },
              data: {
                syncStatus: SYNC_STATUS.SYNCED,
                lastSyncAt: new Date(),
              },
            });
          }
        }
      } catch (error) {
        console.error(`同步文件失败: ${localFile.fileName}`, error);
        errors++;

        // 标记为pending，下次重试
        await db.file.update({
          where: { id: localFile.id },
          data: { syncStatus: SYNC_STATUS.PENDING },
        });
      }
    }

    // 5. 检查云端有但本地没有的文件（已删除的）
    // 这里简化处理，不自动删除本地文件，需要用户手动处理

    // 更新同步日志
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: errors > 0 ? 'failed' : 'success',
        filesSynced: uploaded + downloaded,
        filesTotal: localFiles.length,
        bytesSynced: BigInt(0), // 简化，实际应该计算
        endedAt: new Date(),
        errorMessage: errors > 0 ? `${errors} 个文件同步失败` : null,
      },
    });

    return { uploaded, downloaded, conflicts, errors, total: localFiles.length };
  } catch (error) {
    // 同步失败
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        endedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

// ==================== 同步状态管理 ====================

/**
 * 获取同步状态
 */
export async function getSyncStatus(tenantId: string): Promise<SyncStatus> {
  // 获取最新的同步日志
  const lastSync = await db.syncLog.findFirst({
    where: { tenantId },
    orderBy: { startedAt: 'desc' },
  });

  // 获取文件统计
  const totalFiles = await db.file.count({
    where: { tenantId, isDeleted: false },
  });

  const syncedFiles = await db.file.count({
    where: { tenantId, isDeleted: false, syncStatus: SYNC_STATUS.SYNCED },
  });

  const pendingFiles = await db.file.count({
    where: { tenantId, isDeleted: false, syncStatus: SYNC_STATUS.PENDING },
  });

  const conflictFiles = await db.file.count({
    where: { tenantId, isDeleted: false, syncStatus: SYNC_STATUS.CONFLICT },
  });

  // 获取队列大小
  const queueSize = await db.syncQueue.count({
    where: {
      tenantId,
      status: { in: [QUEUE_STATUS.PENDING, QUEUE_STATUS.FAILED] },
    },
  });

  // 判断是否正在同步
  const isSyncing = lastSync?.status === 'in_progress';

  // 判断整体状态
  let overallStatus: SyncStatus['overallStatus'] = 'idle';
  if (isSyncing) {
    overallStatus = 'syncing';
  } else if (lastSync?.status === 'failed') {
    overallStatus = 'error';
  } else if (conflictFiles > 0) {
    overallStatus = 'error';
  }

  return {
    lastSyncTime: lastSync?.endedAt?.toISOString() || null,
    totalFiles,
    syncedFiles,
    pendingFiles,
    conflictFiles,
    isSyncing,
    lastError: lastSync?.errorMessage || null,
    overallStatus,
    queueSize,
  };
}

/**
 * 获取最近的同步日志
 */
export async function getRecentSyncLogs(
  tenantId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  syncType: string;
  status: string;
  filesSynced: number;
  filesTotal: number;
  startedAt: Date;
  endedAt: Date | null;
  errorMessage: string | null;
}>> {
  const logs = await db.syncLog.findMany({
    where: { tenantId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });

  return logs;
}

// ==================== 完整备份/恢复（保留兼容） ====================

/**
 * 上传完整备份到云端
 */
export async function uploadBackup(
  tenantId: string,
  userId: string,
  password: string
): Promise<CloudBackupMeta> {
  const storage = await getStorageProvider(tenantId);

  // 1. 获取所有数据
  const files = await db.file.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  const folders = await db.folder.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  // 2. 构建备份数据
  const backupData = {
    version: "2.0",
    backupTime: new Date().toISOString(),
    tenantId,
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      filePath: f.filePath,
      textContent: f.textContent,
      thumbnailUrl: f.thumbnailUrl,
      folderId: f.folderId,
      tags: f.tags,
      isFavorite: f.isFavorite,
      isDeleted: f.isDeleted,
      deletedAt: f.deletedAt,
      fileHash: f.fileHash,
      summary: f.summary,
      keyPoints: f.keyPoints,
      syncStatus: f.syncStatus,
      lastSyncAt: f.lastSyncAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  };

  // 3. 计算校验和
  const dataJson = JSON.stringify(backupData);
  const checksum = hashFileContent(Buffer.from(dataJson));

  // 4. 加密数据
  const encryptedData = encrypt(Buffer.from(dataJson), password);

  // 5. 生成备份 ID
  const backupId = new Date().toISOString().replace(/[:.]/g, "-");
  const dataKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${DATA_SUFFIX}`;
  const metaKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${META_SUFFIX}`;

  // 6. 上传加密数据
  await storage.uploadObject(dataKey, Buffer.from(encryptedData), "application/octet-stream");

  // 7. 上传元数据
  const meta: CloudBackupMeta = {
    version: "2.0",
    backupTime: backupData.backupTime,
    fileCount: files.length,
    folderCount: folders.length,
    totalSize: files.reduce((sum, f) => sum + f.fileSize, 0),
    checksum,
    tenantId,
  };

  await storage.uploadObject(
    metaKey,
    Buffer.from(JSON.stringify(meta)),
    "application/json"
  );

  // 8. 记录同步日志
  await db.syncLog.create({
    data: {
      tenantId,
      userId,
      syncType: 'full',
      status: 'success',
      filesSynced: files.length,
      filesTotal: files.length,
      bytesSynced: BigInt(files.reduce((sum, f) => sum + f.fileSize, 0)),
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });

  return meta;
}

/**
 * 从云端下载并恢复备份
 */
export async function downloadAndRestoreBackup(
  tenantId: string,
  userId: string,
  backupId: string,
  password: string
): Promise<{ restored: number; skipped: number }> {
  const storage = await getStorageProvider(tenantId);

  // 1. 下载加密数据
  const dataKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${DATA_SUFFIX}`;
  const encryptedData = await storage.downloadObject(dataKey);

  // 2. 解密数据
  const decryptedData = decrypt(encryptedData, password);
  const backupData = JSON.parse(decryptedData.toString("utf8"));

  // 3. 验证校验和
  const dataJson = JSON.stringify({
    version: backupData.version,
    backupTime: backupData.backupTime,
    tenantId: backupData.tenantId,
    files: backupData.files,
    folders: backupData.folders,
  });

  const expectedChecksum = hashFileContent(Buffer.from(dataJson));

  // 下载元数据获取校验和
  const metaKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${META_SUFFIX}`;
  const metaData = await storage.downloadObject(metaKey);
  const meta = JSON.parse(metaData.toString("utf8")) as CloudBackupMeta;

  if (expectedChecksum !== meta.checksum) {
    throw new Error("备份数据校验失败，数据可能已损坏或密码错误");
  }

  // 4. 恢复数据（使用事务）
  const result = await db.$transaction(async (tx) => {
    let restored = 0;
    let skipped = 0;

    // 恢复文件夹
    const folderIdMap = new Map<string, string>();

    for (const folder of backupData.folders) {
      const existing = await tx.folder.findFirst({
        where: {
          tenantId,
          name: folder.name,
          parentId: folder.parentId
            ? folderIdMap.get(folder.parentId) || null
            : null,
        },
      });

      if (existing) {
        folderIdMap.set(folder.id, existing.id);
        skipped++;
        continue;
      }

      const newFolder = await tx.folder.create({
        data: {
          id: folder.id,
          tenantId,
          userId,
          name: folder.name,
          parentId: folder.parentId
            ? folderIdMap.get(folder.parentId) || folder.parentId
            : null,
          createdAt: new Date(folder.createdAt),
          updatedAt: new Date(folder.updatedAt),
        },
      });

      folderIdMap.set(folder.id, newFolder.id);
      restored++;
    }

    // 恢复文件
    for (const file of backupData.files) {
      if (file.fileHash) {
        const existing = await tx.file.findFirst({
          where: { tenantId, fileHash: file.fileHash },
        });

        if (existing) {
          skipped++;
          continue;
        }
      }

      await tx.file.create({
        data: {
          id: file.id,
          tenantId,
          userId,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          filePath: file.filePath,
          textContent: file.textContent,
          thumbnailUrl: file.thumbnailUrl,
          folderId: file.folderId
            ? folderIdMap.get(file.folderId) || file.folderId
            : null,
          tags: file.tags,
          isFavorite: file.isFavorite,
          isDeleted: file.isDeleted,
          deletedAt: file.deletedAt ? new Date(file.deletedAt) : null,
          fileHash: file.fileHash,
          summary: file.summary,
          keyPoints: file.keyPoints,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
          createdAt: new Date(file.createdAt),
          updatedAt: new Date(file.updatedAt),
        },
      });

      restored++;
    }

    return { restored, skipped };
  });

  // 记录同步日志
  await db.syncLog.create({
    data: {
      tenantId,
      userId,
      syncType: 'full',
      status: 'success',
      filesSynced: result.restored,
      filesTotal: result.restored + result.skipped,
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });

  return result;
}

/**
 * 列出云端的所有备份
 */
export async function listBackups(tenantId: string): Promise<CloudBackupMeta[]> {
  const storage = await getStorageProvider(tenantId);
  const prefix = `${BACKUP_PREFIX}${tenantId}/`;
  const objects = await storage.listObjects(prefix);

  // 只保留元数据文件
  const metaFiles = objects.filter((obj) => obj.key.endsWith(META_SUFFIX));
  const backups: CloudBackupMeta[] = [];

  for (const metaFile of metaFiles) {
    try {
      const data = await storage.downloadObject(metaFile.key);
      const meta = JSON.parse(data.toString("utf8")) as CloudBackupMeta;
      backups.push(meta);
    } catch (error) {
      console.error("读取备份元数据失败:", error);
    }
  }

  // 按时间倒序排列
  backups.sort((a, b) => new Date(b.backupTime).getTime() - new Date(a.backupTime).getTime());

  return backups;
}

/**
 * 删除云端备份
 */
export async function deleteBackup(tenantId: string, backupId: string): Promise<void> {
  const storage = await getStorageProvider(tenantId);
  const dataKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${DATA_SUFFIX}`;
  const metaKey = `${BACKUP_PREFIX}${tenantId}/${backupId}${META_SUFFIX}`;

  await storage.deleteObject(dataKey);
  await storage.deleteObject(metaKey);
}

// ==================== 便捷方法 ====================

/**
 * 触发手动同步
 */
export async function triggerSync(
  tenantId: string,
  userId: string,
  password: string
): Promise<{
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: number;
  total: number;
}> {
  return incrementalSync(tenantId, userId, password);
}

/**
 * 获取冲突文件列表
 */
export async function getConflictFiles(
  tenantId: string
): Promise<Array<{
  id: string;
  fileName: string;
  fileSize: number;
  updatedAt: Date;
  fileHash: string | null;
}>> {
  const files = await db.file.findMany({
    where: {
      tenantId,
      isDeleted: false,
      syncStatus: SYNC_STATUS.CONFLICT,
    },
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      updatedAt: true,
      fileHash: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return files;
}
