export interface StorageAdapter {
  uploadFile(
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
  }>;
  deleteFile(fileId: string, userId: string): Promise<void>;
  getFile(fileId: string, userId: string): Promise<FileData | null>;
  searchFiles(query: string, userId: string): Promise<FileData[]>;
  updateFile(
    fileId: string,
    data: Partial<FileData>,
    userId: string
  ): Promise<void>;
  getFiles(userId: string): Promise<FileData[]>;
  getVersions?(fileId: string, userId: string): Promise<FileVersionData[]>;
  createVersion?(fileId: string, data: Omit<FileVersionData, "id" | "version" | "createdAt">, userId: string): Promise<void>;
  restoreVersion?(versionId: string, fileId: string, userId: string): Promise<void>;
  deleteVersion?(versionId: string, fileId: string, userId: string): Promise<void>;
  createFolder?(folderName: string, userId: string): Promise<{ id: string; name: string; parentId: string | null; createdAt: string } | null>;
}

export interface FileData {
  id: string;
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
  createdAt: Date;
  fileHash?: string;
  summary?: string;
  keyPoints?: string[];
}

export interface FileVersionData {
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
