/**
 * 分片上传工具
 * 支持大文件分片上传和断点续传
 * 基于 IndexedDB 记录上传进度，支持中断恢复
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB 每片
const UPLOAD_DB_NAME = 'chunk-upload-progress';
const UPLOAD_STORE = 'uploads';

interface UploadProgress {
  fileId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  lastModified: number;
}

/**
 * 计算文件分片数量
 */
export function getTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

/**
 * 将文件切割为指定分片
 */
export function sliceFile(file: File, chunkIndex: number): Blob {
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  return file.slice(start, end);
}

/**
 * 保存上传进度到 IndexedDB（用于断点续传）
 */
export async function saveUploadProgress(progress: UploadProgress): Promise<void> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(UPLOAD_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(UPLOAD_STORE)) {
          db.createObjectStore(UPLOAD_STORE, { keyPath: 'fileId' });
        }
      },
    });
    // Use transaction for atomic read-modify-write
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    const store = tx.objectStore(UPLOAD_STORE);
    const existing = await store.get(progress.fileId);
    const merged: UploadProgress = {
      ...progress,
      uploadedChunks: existing
        ? [...new Set([...existing.uploadedChunks, ...progress.uploadedChunks])]
        : progress.uploadedChunks,
    };
    await store.put(merged);
    await tx.done;
  } catch {
    // IndexedDB 不可用，忽略
  }
}

/**
 * 获取上传进度（用于断点续传恢复）
 */
export async function getUploadProgress(fileId: string): Promise<UploadProgress | null> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(UPLOAD_DB_NAME, 1);
    return (await db.get(UPLOAD_STORE, fileId)) || null;
  } catch {
    return null;
  }
}

/**
 * 删除上传进度记录
 */
export async function removeUploadProgress(fileId: string): Promise<void> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(UPLOAD_DB_NAME, 1);
    await db.delete(UPLOAD_STORE, fileId);
  } catch {
    // ignore
  }
}

/**
 * 清理所有过期的上传进度记录（超过24小时）
 */
export async function cleanupExpiredProgress(): Promise<void> {
  try {
    const { openDB } = await import('idb');
    const db = await openDB(UPLOAD_DB_NAME, 1);
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    const store = tx.objectStore(UPLOAD_STORE);
    const all = await store.getAll();
    const now = Date.now();
    const EXPIRE_MS = 24 * 60 * 60 * 1000;

    for (const progress of all) {
      if (now - progress.lastModified > EXPIRE_MS) {
        await store.delete(progress.fileId);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 生成分片上传的唯一 ID（基于文件名+大小+修改时间）
 */
export function generateUploadFileId(file: File): string {
  const key = `${file.name}-${file.size}-${file.lastModified}`;
  // Simple hash
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `upload_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
