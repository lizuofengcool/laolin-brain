import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { StorageAdapter, FileData } from "./base";

interface KBDBSchema extends DBSchema {
  files: {
    key: string;
    value: FileData & { data?: string };
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
    if (file.type.includes("image")) fileType = "image";
    else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    )
      fileType = "word";
    else if (file.type === "application/pdf" || file.name.endsWith(".pdf"))
      fileType = "pdf";

    let textContent: string | undefined;
    let thumbnailUrl: string | undefined;

    if (fileType === "image") {
      thumbnailUrl = await this.generateThumbnail(file);
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
    };

    // Store file data as base64
    const arrayBuffer = await file.arrayBuffer();
    fileData.data = this.arrayBufferToBase64(arrayBuffer);

    await db.put("files", fileData);

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

  private async generateThumbnail(file: File): Promise<string> {
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.05,
        maxWidthOrHeight: 200,
        useWebWorker: true,
      });
      return URL.createObjectURL(compressed);
    } catch {
      return URL.createObjectURL(file);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
