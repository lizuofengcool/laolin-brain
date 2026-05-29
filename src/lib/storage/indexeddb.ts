import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { StorageAdapter, FileData, FileVersionData } from "./base";

interface KBDBSchema extends DBSchema {
  files: {
    key: string;
    value: FileData & { data?: string; thumbnailData?: string; userId?: string };
    indexes: { "by-user": string; "by-folder": string };
  };
  versions: {
    key: string;
    value: FileVersionData & { userId?: string };
    indexes: { "by-file": string };
  };
  folders: {
    key: string;
    value: { id: string; name: string; userId?: string; parentId?: string; createdAt: Date | string };
    indexes: { "by-user": string; "by-parent": string };
  };
}

const DB_NAME = "knowledge-base-db";
export const DB_VERSION = 3;

async function getDB(): Promise<IDBPDatabase<KBDBSchema>> {
  return openDB<KBDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Create files store if not exists
      if (!db.objectStoreNames.contains("files")) {
        const fileStore = db.createObjectStore("files", { keyPath: "id" });
        fileStore.createIndex("by-user", "userId");
        fileStore.createIndex("by-folder", "folderId");
      }

      // Create versions store (new in v2)
      if (!db.objectStoreNames.contains("versions") && oldVersion < 2) {
        const versionStore = db.createObjectStore("versions", { keyPath: "id" });
        versionStore.createIndex("by-file", "fileId");
      }

      // Create folders store (new in v3)
      if (!db.objectStoreNames.contains("folders") && oldVersion < 3) {
        const folderStore = db.createObjectStore("folders", { keyPath: "id" });
        folderStore.createIndex("by-user", "userId");
        folderStore.createIndex("by-parent", "parentId");
      }
    },
  });
}

/**
 * Compress an image using Canvas API (no external dependencies)
 * Returns a data URL that survives page reloads
 */
async function compressImageViaCanvas(
  file: File,
  maxWidth: number = 300,
  maxHeight: number = 300,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Cannot get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Convert blob to data URL for persistence across reloads
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to convert blob to data URL"));
            reader.readAsDataURL(blob);
          } else {
            reject(new Error("Canvas toBlob failed"));
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * Read an entire file as a base64-encoded string using FileReader.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export class IndexedDBAdapter implements StorageAdapter {
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
    const db = await getDB();
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let fileType = "other";
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (file.type.includes("image") || ["jpg","jpeg","png","webp","gif","bmp","svg","tiff","tif","ico","avif"].includes(ext)) fileType = "image";
    else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    )
      fileType = "word";
    else if (file.type === "application/pdf" || ext === "pdf")
      fileType = "pdf";
    else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      ext === "pptx"
    )
      fileType = "pptx";
    else if (ext === "md" || ext === "markdown")
      fileType = "markdown";
    else if (ext === "txt")
      fileType = "txt";

    let textContent: string | undefined;
    let thumbnailUrl: string | undefined;

    if (fileType === "image") {
      thumbnailUrl = await this.generateThumbnail(file);
    }

    // Store file data as base64
    let data: string | undefined;
    try {
      data = await fileToBase64(file);
    } catch (e) {
      console.error("Failed to read file:", e);
      throw new Error("Failed to read file data");
    }

    const fileData: FileData & { data?: string; userId?: string } = {
      id,
      fileName: file.name,
      fileType,
      fileSize: file.size,
      textContent,
      thumbnailUrl,
      storageMode: "local",
      folderId: undefined,
      tags: [],
      isFavorite: false,
      createdAt: new Date(),
      userId,
      data,
    };

    await db.put("files", fileData);

    // Return without internal fields
    const { data: _, userId: __, ...result } = fileData;
    return result;
  }

  async deleteFile(fileId: string, _userId: string): Promise<void> {
    const db = await getDB();
    await db.delete("files", fileId);
  }

  async getFile(fileId: string, _userId: string): Promise<FileData | null> {
    const db = await getDB();
    const record = await db.get("files", fileId);
    if (!record) return null;
    const { userId: _, data, ...fileData } = record as (FileData & { data?: string; userId?: string });
    // If no thumbnailUrl but we have raw data, reconstruct a preview URL
    if (!fileData.thumbnailUrl && data) {
      if (data.startsWith('data:')) {
        fileData.thumbnailUrl = data;
      } else {
        // Reconstruct data URL from raw base64
        const mimeMap: Record<string, string> = {
          image: 'image/jpeg', pdf: 'application/pdf', word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
        const mime = mimeMap[fileData.fileType] || 'application/octet-stream';
        fileData.thumbnailUrl = `data:${mime};base64,${data}`;
      }
    }
    return fileData;
  }

  async searchFiles(query: string, userId: string): Promise<FileData[]> {
    const allFiles = await this.getFiles(userId);
    const q = query.toLowerCase();
    return allFiles.filter(
      (f) =>
        f.fileName.toLowerCase().includes(q) ||
        (f.textContent && f.textContent.toLowerCase().includes(q)) ||
        (Array.isArray(f.tags) && f.tags.some((t: string) => t.toLowerCase().includes(q)))
    );
  }

  async updateFile(
    fileId: string,
    data: Partial<FileData>,
    _userId: string
  ): Promise<void> {
    const db = await getDB();
    const existing = await db.get("files", fileId);
    if (existing) {
      const updated = { ...existing, ...data };
      await db.put("files", updated);
    }
  }

  async getFiles(userId: string): Promise<FileData[]> {
    try {
      const db = await getDB();
      const allFiles = await db.getAll("files");
      return allFiles
        .filter((f) => f.userId === userId)
        .map((record) => {
          const { data, userId: _, ...fileData } = record;
          // Ensure thumbnailUrl is populated from stored data if missing
          if (!fileData.thumbnailUrl && data) {
            if (data.startsWith('data:')) {
              fileData.thumbnailUrl = data;
            } else {
              const mimeMap: Record<string, string> = {
                image: 'image/jpeg', pdf: 'application/pdf',
              };
              const mime = mimeMap[fileData.fileType] || 'application/octet-stream';
              fileData.thumbnailUrl = `data:${mime};base64,${data}`;
            }
          }
          return {
            ...fileData,
            createdAt: new Date(fileData.createdAt),
          };
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (err) {
      console.error("Failed to get files from IndexedDB:", err);
      return [];
    }
  }

  // ─── Version Management ────────────────────────────────────

  async getVersions(fileId: string, _userId: string): Promise<FileVersionData[]> {
    const db = await getDB();
    const allVersions = await db.getAllFromIndex("versions", "by-file", fileId);
    return allVersions
      .sort((a, b) => b.version - a.version)
      .map(({ userId: _, ...v }) => ({
        ...v,
        createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date(v.createdAt).toISOString(),
      }));
  }

  async createVersion(
    fileId: string,
    data: Omit<FileVersionData, "id" | "version" | "createdAt">,
    userId: string
  ): Promise<void> {
    const db = await getDB();

    // Use a transaction to atomically read max version and write new version,
    // preventing duplicate version numbers from concurrent calls.
    const tx = db.transaction("versions", "readwrite");
    const store = tx.objectStore("versions");
    const index = store.index("by-file");
    const existingVersions = await index.getAll(fileId);
    const maxVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.version))
      : 0;

    const version: FileVersionData & { userId?: string } = {
      ...data,
      id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      fileId,
      version: maxVersion + 1,
      createdAt: new Date().toISOString(),
      userId,
    };

    await store.put(version);
    await tx.done;
  }

  async restoreVersion(versionId: string, fileId: string, userId: string): Promise<void> {
    const db = await getDB();
    const version = await db.get("versions", versionId);
    if (!version || version.fileId !== fileId) {
      throw new Error("Version not found");
    }

    // Update the file with version data
    const existingFile = await db.get("files", fileId);
    if (existingFile) {
      await db.put("files", {
        ...existingFile,
        fileName: version.fileName,
        fileSize: version.fileSize,
        filePath: version.filePath,
        textContent: version.textContent,
        thumbnailUrl: version.thumbnailUrl,
      });
    }
  }

  async deleteVersion(versionId: string, fileId: string, _userId: string): Promise<void> {
    const db = await getDB();
    const version = await db.get("versions", versionId);
    if (version && version.fileId === fileId) {
      await db.delete("versions", versionId);
    }
  }

  /**
   * Get raw file data as a data URL (for preview/download in local mode).
   * Returns the raw base64 data reconstructed as a data URL.
   */
  async getFileData(fileId: string, _userId: string): Promise<string> {
    const db = await getDB();
    const record = await db.get("files", fileId) as (FileData & { data?: string; userId?: string }) | undefined;
    if (!record) throw new Error("File not found");
    const rawData = record.data;
    if (!rawData) throw new Error("File data not found in IndexedDB");
    // If already a data URL, return as-is
    if (rawData.startsWith('data:')) return rawData;
    // Reconstruct data URL from raw base64
    const mimeMap: Record<string, string> = {
      image: 'image/jpeg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
      pdf: 'application/pdf',
      word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain', markdown: 'text/markdown', md: 'text/markdown',
    };
    const ext = record.fileName.split('.').pop()?.toLowerCase() || '';
    const mime = mimeMap[ext] || mimeMap[record.fileType] || 'application/octet-stream';
    return `data:${mime};base64,${rawData}`;
  }

  /**
   * Generate thumbnail using Canvas API (browser-native, no dependencies)
   * Falls back to original file blob URL if canvas fails
   */
  private async generateThumbnail(file: File): Promise<string> {
    try {
      return await compressImageViaCanvas(file, 300, 300, 0.7);
    } catch (err) {
      console.error("Thumbnail generation failed, falling back to original file:", err);
      // Fallback: convert original file to data URL (not ideal but works)
      try {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      } catch {
        return "";
      }
    }
  }
}
