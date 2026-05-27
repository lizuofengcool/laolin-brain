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
   * Includes safety check for __TAURI__ being a string or number (common injection patterns)
   */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__;
  return !!tauri && typeof tauri === 'object';
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
 * 将 Tauri 文件夹对象映射为前端格式
 */
function mapFolder(f: TauriFolder): { id: string; name: string; parentId: string | null; createdAt: string } {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    createdAt: f.createdAt,
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
  // Cached fallback adapter to avoid creating a new instance on every method call
  private _fallbackAdapter: InstanceType<typeof import('./indexeddb').IndexedDBAdapter> | null = null;

  private async getFallbackAdapter() {
    if (!this._fallbackAdapter) {
      const { IndexedDBAdapter } = await import('./indexeddb');
      this._fallbackAdapter = new IndexedDBAdapter();
    }
    return this._fallbackAdapter;
  }
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
    return this.getFallbackAdapter().then(a => a.uploadFile(file, userId));
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

    return this.getFallbackAdapter().then(a => a.deleteFile(fileId, userId));
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

    return this.getFallbackAdapter().then(a => a.getFile(fileId, userId));
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

    return this.getFallbackAdapter().then(a => a.searchFiles(query, userId));
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

    return this.getFallbackAdapter().then(a => a.updateFile(fileId, data, userId));
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

    return this.getFallbackAdapter().then(a => a.getFiles(userId));
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

    return this.getFallbackAdapter().then(a => a.getVersions(fileId, userId));
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

    return this.getFallbackAdapter().then(a => a.createVersion(fileId, data, userId));
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

    return this.getFallbackAdapter().then(a => a.restoreVersion(versionId, fileId, userId));
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

    return this.getFallbackAdapter().then(a => a.deleteVersion(versionId, fileId, userId));
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
        return mapFolder(folder);
      } catch (error) {
        console.error(
          '[Tauri] create_folder 调用失败，降级到 IndexedDB:',
          error
        );
      }
    }

    return (await this.getFallbackAdapter() as unknown as StorageAdapter).createFolder?.(folderName, userId) ?? null;
  }

  /**
   * 获取用户的所有文件夹
   * 通过 Rust 后端 get_folders 命令读取 folders.json
   */
  async getFolders(
    userId: string
  ): Promise<{ id: string; name: string; parentId: string | null; createdAt: string }[]> {
    if (isTauriEnvironment()) {
      try {
        const folders = await tauriInvoke<TauriFolder[]>('get_folders', { userId });
        return folders.map(mapFolder);
      } catch (error) {
        console.error('[Tauri] get_folders 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB 直接读取
    const { openDB } = await import('idb');
    const db = await openDB('knowledge-base-db', 2);
    const allFolders = await db.getAll('folders');
    return allFolders
      .filter((f: { userId?: string }) => f.userId === userId)
      .map((f: { id: string; name: string; parentId?: string; createdAt: Date }) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId || null,
        createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date(f.createdAt).toISOString(),
      }));
  }

  /**
   * 删除文件夹
   * 通过 Rust 后端 delete_folder 命令删除，同时将该文件夹下的文件移出
   */
  async deleteFolder(folderId: string, userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('delete_folder', { folderId, userId });
        return;
      } catch (error) {
        console.error('[Tauri] delete_folder 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB
    const { openDB } = await import('idb');
    const db = await openDB('knowledge-base-db', 2);
    await db.delete('folders', folderId);
  }

  /**
   * 重命名文件夹
   * 通过 Rust 后端 rename_folder 命令更新文件夹名称
   */
  async renameFolder(folderId: string, newName: string, userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('rename_folder', { folderId, newName, userId });
        return;
      } catch (error) {
        console.error('[Tauri] rename_folder 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB
    const { openDB } = await import('idb');
    const db = await openDB('knowledge-base-db', 2);
    const folder = await db.get('folders', folderId);
    if (folder) {
      folder.name = newName;
      await db.put('folders', folder);
    }
  }

  // ─── 回收站与文件恢复 ─────────────────────────────────────

  /**
   * 永久删除文件（从数据库彻底移除 + 删除物理文件）
   */
  async permanentDeleteFile(fileId: string, userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('permanent_delete_file', { fileId, userId });
        return;
      } catch (error) {
        console.error('[Tauri] permanent_delete_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB 删除
    return this.getFallbackAdapter().then(a => a.deleteFile(fileId, userId));
  }

  /**
   * 清空回收站（删除所有 is_deleted=true 的文件）
   * 返回被删除的文件数量
   */
  async emptyRecycleBin(userId: string): Promise<number> {
    if (isTauriEnvironment()) {
      try {
        const count = await tauriInvoke<number>('empty_recycle_bin', { userId });
        return count;
      } catch (error) {
        console.error('[Tauri] empty_recycle_bin 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：逐个删除已删除的文件
    const adapter = await this.getFallbackAdapter();
    const files = await adapter.getFiles(userId);
    const deletedFiles = files.filter((f) => f.isDeleted);
    await Promise.all(deletedFiles.map((f) => adapter.deleteFile(f.id, userId)));
    return deletedFiles.length;
  }

  /**
   * 从回收站恢复文件（设置 is_deleted=false）
   */
  async restoreFile(fileId: string, userId: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        // 通过 update_file 命令恢复，传递 isDeleted: false
        await tauriInvoke('update_file', {
          fileId,
          userId,
          data: { isDeleted: false },
        });
        return;
      } catch (error) {
        console.error('[Tauri] restore_file 调用失败，降级到 IndexedDB:', error);
      }
    }

    // 降级：使用 IndexedDB
    return (await this.getFallbackAdapter()).updateFile(
      fileId,
      { isDeleted: false, deletedAt: undefined } as Partial<FileData>,
      userId
    );
  }

  // ─── 文件预览 ─────────────────────────────────────────────

  /**
   * 获取文件数据（base64 编码，用于文件预览）
   * 通过 Rust 后端读取物理文件并返回 base64 编码数据
   */
  async getFileData(fileId: string, userId: string): Promise<string> {
    if (isTauriEnvironment()) {
      try {
        const base64 = await tauriInvoke<string>('get_file_data', { fileId, userId });
        return base64;
      } catch (error) {
        console.error('[Tauri] get_file_data 调用失败:', error);
        throw error;
      }
    }

    // 非桌面端不支持直接读取文件数据
    throw new Error('get_file_data 仅在 Tauri 桌面端可用');
  }

  /**
   * 使用系统默认程序打开文件
   * 通过 Rust 后端 open_file_externally 命令调用系统命令打开
   */
  async openFileExternally(filePath: string): Promise<void> {
    if (isTauriEnvironment()) {
      try {
        await tauriInvoke('open_file_externally', { filePath });
        return;
      } catch (error) {
        console.error('[Tauri] open_file_externally 调用失败:', error);
        throw error;
      }
    }

    // 非桌面端不支持使用系统程序打开文件
    throw new Error('openFileExternally 仅在 Tauri 桌面端可用');
  }
}
