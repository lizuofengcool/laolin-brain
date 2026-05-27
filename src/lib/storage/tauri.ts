/**
 * Tauri 桌面版存储适配器
 * 当运行在 Tauri 桌面环境中时，使用此适配器通过 Tauri 的全局 __TAURI__ 对象
 * 调用 Rust 后端进行本地文件系统操作。不在 Tauri 环境中时，自动降级到 IndexedDB 适配器。
 * 
 * 注意：此文件不依赖 @tauri-apps/api npm 包，直接使用 Tauri 注入到 window 上的全局对象。
 * 当 Tauri npm 包安装后，可改用 import('@tauri-apps/api/core') 的方式。
 */

import type {
  StorageAdapter,
  FileData,
  FileVersionData,
} from './base';

// ─── 类型声明（Rust 后端返回的数据结构）────────────────────────

/** Rust 端文件数据结构（JSON 序列化，camelCase 由 serde rename_all 生成） */
interface TauriFile {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath?: string;
  textContent?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  storageMode: string;
  folderId?: string;
  tags: string[];
  isFavorite: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt: string;
  fileHash?: string;
  summary?: string;
  keyPoints?: string[];
}

/** Rust 端上传返回结构 */
interface TauriUploadResult {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  textContent?: string;
  thumbnailUrl?: string;
}

/** Rust 端文件夹结构 */
interface TauriFolder {
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
  createdAt: string;
}

/** Rust 端版本结构 */
interface TauriFileVersion {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  filePath?: string;
  textContent?: string;
  thumbnailUrl?: string;
  version: number;
  createdAt: string;
}

// ─── 工具函数 ─────────────────────────────────────────────────

/**
 * 检测是否在 Tauri 桌面环境中运行
 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as Record<string, unknown>).__TAURI__
  );
}

/**
 * 通过 Tauri 全局对象调用 Rust 后端命令
 * 使用 window.__TAURI__.core.invoke() 而非 npm 包导入
 */
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__ as {
    core: { invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R> };
  } | undefined;
  if (!tauri?.core?.invoke) {
    throw new Error('Tauri invoke 不可用');
  }
  return tauri.core.invoke<T>(cmd, args);
}

/**
 * 根据文件名检测文件类型
 */
function detectFileType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['docx', 'doc'].includes(ext)) return 'word';
  if (ext === 'pdf') return 'pdf';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'tiff', 'tif', 'ico', 'avif'].includes(ext)
  )
    return 'image';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'txt';
  return 'other';
}

/**
 * 将 Tauri 文件对象映射为前端 FileData 格式
 */
function mapFile(f: TauriFile): FileData {
  return {
    id: f.id,
    fileName: f.fileName,
    fileType: f.fileType,
    fileSize: f.fileSize,
    filePath: f.filePath,
    textContent: f.textContent,
    thumbnailUrl: f.thumbnailUrl,
    previewUrl: f.previewUrl,
    storageMode: f.storageMode,
    folderId: f.folderId,
    tags: Array.isArray(f.tags) ? f.tags : [],
    isFavorite: f.isFavorite,
    isDeleted: f.isDeleted,
    deletedAt: f.deletedAt,
    createdAt: new Date(f.createdAt),
    fileHash: f.fileHash,
    summary: f.summary,
    keyPoints: f.keyPoints,
  };
}

/**
 * 将文件转换为 base64 字符串
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data URL 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// ─── Tauri 存储适配器 ─────────────────────────────────────────

/**
 * Tauri 桌面版存储适配器
 * 
 * 实现策略：
 * - 优先使用 window.__TAURI__.core.invoke() 调用 Rust 后端进行文件系统操作
 * - 如果不在 Tauri 环境中，动态导入 IndexedDB 适配器作为降级方案
 */
export class TauriStorageAdapter implements StorageAdapter {
  // ─── 文件操作 ─────────────────────────────────────────────

  async uploadFile(
    file: File,
    userId: string
  ): Promise<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath?: string;
    textContent?: string;
    thumbnailUrl?: string;
  }> {
    if (isTauriEnvironment()) {
      try {
        const base64 = await fileToBase64(file);
        const fileType = detectFileType(file.name);

        const result = await tauriInvoke<TauriUploadResult>('upload_file', {
          userId,
          fileName: file.name,
          fileSize: file.size,
          fileType,
          fileData: base64,
        });

        return {
          id: result.id,
          fileName: result.fileName,
          fileType: result.fileType,
          fileSize: result.fileSize,
          textContent: result.textContent,
          thumbnailUrl: result.thumbnailUrl,
        };
      } catch (error) {
        console.error('[Tauri] upload_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB
    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().uploadFile(file, userId);
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('delete_file', { fileId, userId });
        return;
      } catch (error) {
        console.error('[Tauri] delete_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().deleteFile(fileId, userId);
  }

  async getFile(fileId: string, userId: string): Promise<FileData | null> {
    if (isTauriEnvironment()) {
      try {
        const file = await tauriInvoke<TauriFile | null>('get_file', {
          fileId,
          userId,
        });
        return file ? mapFile(file) : null;
      } catch (error) {
        console.error('[Tauri] get_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().getFile(fileId, userId);
  }

  async searchFiles(query: string, userId: string): Promise<FileData[]> {
    if (isTauriEnvironment()) {
      try {
        const files = await tauriInvoke<TauriFile[]>('search_files', {
          query,
          userId,
        });
        return files.map(mapFile);
      } catch (error) {
        console.error('[Tauri] search_files 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().searchFiles(query, userId);
  }

  async updateFile(
    fileId: string,
    data: Partial<FileData>,
    userId: string
  ): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('update_file', { fileId, userId, data });
        return;
      } catch (error) {
        console.error('[Tauri] update_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().updateFile(fileId, data, userId);
  }

  async getFiles(userId: string): Promise<FileData[]> {
    if (isTauriEnvironment()) {
      try {
        const files = await tauriInvoke<TauriFile[]>('get_files', { userId });
        return files.map(mapFile);
      } catch (error) {
        console.error('[Tauri] get_files 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().getFiles(userId);
  }

  // ─── 版本管理 ─────────────────────────────────────────────

  async getVersions(
    fileId: string,
    userId: string
  ): Promise<FileVersionData[]> {
    if (isTauriEnvironment()) {
      try {
        const versions = await tauriInvoke<TauriFileVersion[]>('get_versions', {
          fileId,
          userId,
        });
        return versions.map(
          (v): FileVersionData => ({
            id: v.id,
            fileId: v.fileId,
            fileName: v.fileName,
            fileSize: v.fileSize,
            filePath: v.filePath,
            textContent: v.textContent,
            thumbnailUrl: v.thumbnailUrl,
            version: v.version,
            createdAt: v.createdAt,
          })
        );
      } catch (error) {
        console.error('[Tauri] get_versions 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().getVersions(fileId, userId);
  }

  async createVersion(
    fileId: string,
    data: Omit<FileVersionData, 'id' | 'version' | 'createdAt'>,
    userId: string
  ): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('create_version', {
          fileId,
          userId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          textContent: data.textContent ?? null,
          thumbnailUrl: data.thumbnailUrl ?? null,
        });
        return;
      } catch (error) {
        console.error('[Tauri] create_version 调用失败，降级到 IndexedDB:', error);
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().createVersion(fileId, data, userId);
  }

  async restoreVersion(
    versionId: string,
    fileId: string,
    userId: string
  ): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('restore_version', {
          versionId,
          fileId,
          userId,
        });
        return;
      } catch (error) {
        console.error(
          '[Tauri] restore_version 调用失败，降级到 IndexedDB:',
          error
        );
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().restoreVersion(versionId, fileId, userId);
  }

  async deleteVersion(
    versionId: string,
    fileId: string,
    userId: string
  ): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('delete_version', { versionId, fileId, userId });
        return;
      } catch (error) {
        console.error(
          '[Tauri] delete_version 调用失败，降级到 IndexedDB:',
          error
        );
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return new IndexedDBAdapter().deleteVersion(versionId, fileId, userId);
  }

  // ─── 文件夹管理 ───────────────────────────────────────────

  async createFolder(
    folderName: string,
    userId: string
  ): Promise<
    { id: string; name: string; parentId: string | null; createdAt: string } | null
  > {
    if (isTauriEnvironment()) {
      try {
        const folder = await tauriInvoke<TauriFolder>('create_folder', {
          folderName,
          userId,
        });
        return {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          createdAt: folder.createdAt,
        };
      } catch (error) {
        console.error(
          '[Tauri] create_folder 调用失败，降级到 IndexedDB:',
          error
        );
      }
    }

    const { IndexedDBAdapter } = await import('./indexeddb');
    return (new IndexedDBAdapter() as StorageAdapter).createFolder?.(folderName, userId) ?? null;
  }
}
