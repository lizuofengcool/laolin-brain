import type { StorageAdapter, FileData } from "./base";

export class ServerStorageAdapter implements StorageAdapter {
  private baseUrl: string;

  constructor() {
    this.baseUrl = "/api/files";
  }

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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);

    const res = await fetch(this.baseUrl, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  }

  async deleteFile(fileId: string, _userId: string): Promise<void> {
    await fetch(`${this.baseUrl}/${fileId}`, { method: "DELETE" });
  }

  async getFile(fileId: string, _userId: string): Promise<FileData | null> {
    const res = await fetch(`${this.baseUrl}/${fileId}`);
    if (!res.ok) return null;
    return res.json();
  }

  async searchFiles(query: string, userId: string): Promise<FileData[]> {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&userId=${encodeURIComponent(userId)}`
    );
    if (!res.ok) return [];
    return res.json();
  }

  async updateFile(
    fileId: string,
    data: Partial<FileData>,
    _userId: string
  ): Promise<void> {
    await fetch(`${this.baseUrl}/${fileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async getFiles(userId: string): Promise<FileData[]> {
    const res = await fetch(`${this.baseUrl}?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return res.json();
  }
}
