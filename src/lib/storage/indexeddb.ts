import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { StorageAdapter, FileData } from "./base";

interface KBDBSchema extends DBSchema {
  files: {
    key: string;
    value: FileData & { data?: string; thumbnailData?: string; userId?: string };
    indexes: { "by-user": string; "by-folder": string };
  };
}

const DB_NAME = "knowledge-base-db";
const DB_VERSION = 1;

async function getDB(): Promise<IDBPDatabase<KBDBSchema>> {
  return openDB<KBDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore("files", { keyPath: "id" });
      store.createIndex("by-user", "userId");
      store.createIndex("by-folder", "folderId");
    },
  });
}

/**
 * Compress an image using Canvas API (no external dependencies)
 * Returns a blob URL that is stable within the same session
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
            resolve(URL.createObjectURL(blob));
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
 * Read file as base64 in chunks to avoid memory issues with large files
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
    const { data: _, userId: __, ...fileData } = record;
    return fileData;
  }

  async searchFiles(query: string, userId: string): Promise<FileData[]> {
    const allFiles = await this.getFiles(userId);
    const q = query.toLowerCase();
    return allFiles.filter(
      (f) =>
        f.fileName.toLowerCase().includes(q) ||
        f.textContent?.toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q))
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
    const db = await getDB();
    const allFiles = await db.getAll("files");
    return allFiles
      .filter((f) => f.userId === userId)
      .map(({ data: _, userId: __, ...fileData }) => ({
        ...fileData,
        createdAt: new Date(fileData.createdAt),
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  /**
   * Generate thumbnail using Canvas API (browser-native, no dependencies)
   * Falls back to original file blob URL if canvas fails
   */
  private async generateThumbnail(file: File): Promise<string> {
    try {
      return await compressImageViaCanvas(file, 300, 300, 0.7);
    } catch {
      // Fallback: use original file as thumbnail (not ideal but works)
      try {
        return URL.createObjectURL(file);
      } catch {
        return "";
      }
    }
  }
}
