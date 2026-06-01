import type { FileData } from "@/lib/storage/base";

// ── Shared Types ──────────────────────────────────────────────────────────────

export type ViewType =
  | "login"
  | "dashboard"
  | "files"
  | "search"
  | "settings"
  | "profile"
  | "timeline"
  | "favorites"
  | "recycleBin"
  | "albums"
  | "faceGroups"
  | "tags"
  | "analytics"
  | "knowledgeGraph";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  storageMode: string;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

// ── Store helper types ───────────────────────────────────────────────────────

export interface AppState {
  // Auth
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  login: (user: UserInfo, token: string) => void;
  logout: () => void;
  hydrateAuth: () => void;
  _setupCrossTabSync: () => (() => void) | void;

  // Files
  files: FileData[];
  setFiles: (files: FileData[]) => void;
  addFile: (file: FileData) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, data: Partial<FileData>) => void;
  refreshFiles: () => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  softDeleteFile: (id: string) => Promise<void>;
  restoreFile: (id: string) => Promise<void>;
  permanentDeleteFile: (id: string) => Promise<void>;
  emptyRecycleBin: () => Promise<void>;
  renameFile: (id: string, newName: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  batchToggleFavorite: (ids: string[], value: boolean) => Promise<void>;
  batchDeleteFiles: (ids: string[]) => Promise<void>;

  // File type filter
  fileTypeFilter: string | null;
  setFileTypeFilter: (filter: string | null) => void;

  // Sort state
  sortBy: string;
  sortOrder: "asc" | "desc";
  setSort: (sortBy: string, sortOrder: "asc" | "desc") => void;

  // Batch operations
  batchMode: boolean;
  toggleBatchMode: () => void;
  batchSelectedIds: string[];
  toggleBatchSelect: (id: string) => void;
  selectAllFiles: () => void;
  clearBatchSelection: () => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
  fileViewMode: "grid" | "list";
  setFileViewMode: (mode: "grid" | "list") => void;

  // Storage mode
  storageMode: string;
  setStorageMode: (mode: string, skipWarning?: boolean) => Promise<void>;

  // Folders
  folders: FolderItem[];
  setFolders: (folders: FolderItem[]) => void;
  addFolder: (folder: FolderItem) => void;
  removeFolder: (id: string) => void;
  refreshFolders: () => Promise<void>;

  // AI
  aiProcessing: boolean;
  setAiProcessing: (v: boolean) => void;
  aiChatFile: FileData | null;
  setAiChatFile: (file: FileData | null) => void;
  autoAiProcessing: boolean;
  setAutoAiProcessing: (v: boolean) => void;

  // Image Lightbox
  lightboxOpen: boolean;
  lightboxImages: FileData[];
  lightboxIndex: number;
  openLightbox: (images: FileData[], index: number) => void;
  closeLightbox: () => void;

  // Data export/import
  exportData: () => Promise<string>;
  importData: (jsonData: string) => Promise<number>;

  // Drag & drop
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  moveFileToFolder: (fileId: string, folderId: string | null) => Promise<void>;

  // Embedding generation
  embeddingQueue: string[];
  queueEmbedding: (fileId: string) => void;
  processEmbeddingQueue: () => Promise<void>;
}

export type StoreSet = (...args: any[]) => any;
export type StoreGet = () => any;
