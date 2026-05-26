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
}
