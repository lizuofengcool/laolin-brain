import { create } from "zustand";
import type { FileData } from "@/lib/storage/base";
import { getStorageAdapter, resetAdapter } from "@/lib/storage/factory";

export type ViewType = "login" | "dashboard" | "files" | "search" | "settings" | "timeline" | "favorites" | "recycleBin" | "albums" | "tags";

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

interface AppState {
  // Auth
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;

  // Navigation
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;

  // Auth actions
  login: (user: UserInfo, token: string) => void;
  logout: () => void;
  hydrateAuth: () => void;

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
  toggleFavorite: (id: string) => void;
  batchToggleFavorite: (ids: string[], value: boolean) => Promise<void>;
  batchDeleteFiles: (ids: string[]) => Promise<void>;

  // File type filter (for dashboard stat click navigation)
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
  setStorageMode: (mode: string) => Promise<void>;

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

  // Image Lightbox
  lightboxOpen: boolean;
  lightboxImages: FileData[];
  lightboxIndex: number;
  openLightbox: (images: FileData[], index: number) => void;
  closeLightbox: () => void;

  // Data export
  exportData: () => Promise<string>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  token: null,
  isAuthenticated: false,

  // Navigation
  currentView: "login",
  setCurrentView: (view) => set({ currentView: view }),

  // Auth actions
  login: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("kb_token", token);
      localStorage.setItem("kb_user", JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true, currentView: "dashboard" });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kb_token");
      localStorage.removeItem("kb_user");
    }
    resetAdapter();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      currentView: "login",
      files: [],
      folders: [],
    });
  },

  hydrateAuth: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("kb_token");
    const userStr = localStorage.getItem("kb_user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({
          user,
          token,
          isAuthenticated: true,
          currentView: "dashboard",
          storageMode: user.storageMode || "local",
        });
        get().refreshFiles();
        get().refreshFolders();
      } catch {
        localStorage.removeItem("kb_token");
        localStorage.removeItem("kb_user");
      }
    }
  },

  // Files
  files: [],
  setFiles: (files) => set({ files }),
  addFile: (file) => set((s) => ({ files: [file, ...s.files] })),
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  updateFile: (id, data) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...data } : f)),
    })),

  refreshFiles: async () => {
    const { user, storageMode } = get();
    if (!user) return;
    try {
      const adapter = getStorageAdapter(storageMode);
      const files = await adapter.getFiles(user.id);
      set({ files });
    } catch (err) {
      console.error("Failed to refresh files:", err);
    }
  },

  deleteFile: async (id) => {
    const { user, storageMode } = get();
    if (!user) return;
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.deleteFile(id, user.id);
      get().removeFile(id);
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  },

  // Soft delete - move to recycle bin
  softDeleteFile: async (id) => {
    const { user, storageMode } = get();
    if (!user) return;
    const now = new Date().toISOString();
    get().updateFile(id, { isDeleted: true, deletedAt: now });
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { isDeleted: true, deletedAt: now }, user.id);
    } catch (err) {
      console.error("Failed to soft delete file:", err);
    }
  },

  // Restore file from recycle bin
  restoreFile: async (id) => {
    const { user, storageMode } = get();
    if (!user) return;
    get().updateFile(id, { isDeleted: false, deletedAt: undefined });
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { isDeleted: false, deletedAt: undefined }, user.id);
    } catch (err) {
      console.error("Failed to restore file:", err);
    }
  },

  // Permanent delete
  permanentDeleteFile: async (id) => {
    const { user, storageMode } = get();
    if (!user) return;
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.deleteFile(id, user.id);
      get().removeFile(id);
    } catch (err) {
      console.error("Failed to permanently delete file:", err);
    }
  },

  // Empty recycle bin
  emptyRecycleBin: async () => {
    const deletedFiles = get().files.filter((f) => f.isDeleted);
    await Promise.all(deletedFiles.map((file) => get().permanentDeleteFile(file.id)));
  },

  // Rename file
  renameFile: async (id, newName) => {
    const { user, storageMode } = get();
    if (!user) return;
    get().updateFile(id, { fileName: newName });
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { fileName: newName }, user.id);
    } catch (err) {
      console.error("Failed to rename file:", err);
    }
  },

  toggleFavorite: (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    const newVal = !file.isFavorite;
    get().updateFile(id, { isFavorite: newVal });

    const { user, storageMode } = get();
    if (!user) return;
    const adapter = getStorageAdapter(storageMode);
    adapter.updateFile(id, { isFavorite: newVal }, user.id).catch(console.error);
  },

  // Batch favorite toggle
  batchToggleFavorite: async (ids, value) => {
    const { user, storageMode } = get();
    if (!user) return;
    for (const id of ids) {
      get().updateFile(id, { isFavorite: value });
    }
    try {
      const adapter = getStorageAdapter(storageMode);
      await Promise.all(ids.map((id) => adapter.updateFile(id, { isFavorite: value }, user.id)));
    } catch (err) {
      console.error("Batch favorite failed:", err);
    }
  },

  // Batch soft delete
  batchDeleteFiles: async (ids) => {
    const { user, storageMode } = get();
    if (!user) return;
    const now = new Date().toISOString();
    for (const id of ids) {
      get().updateFile(id, { isDeleted: true, deletedAt: now });
    }
    try {
      const adapter = getStorageAdapter(storageMode);
      await Promise.all(ids.map((id) => adapter.updateFile(id, { isDeleted: true, deletedAt: now }, user.id)));
    } catch (err) {
      console.error("Batch delete failed:", err);
    }
    get().toggleBatchMode();
  },

  // File type filter
  fileTypeFilter: null,
  setFileTypeFilter: (filter) => set({ fileTypeFilter: filter }),

  // Sort
  sortBy: "date",
  sortOrder: "desc" as const,
  setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder }),

  // Batch operations
  batchMode: false,
  toggleBatchMode: () => set((s) => ({ batchMode: !s.batchMode, batchSelectedIds: [] })),
  batchSelectedIds: [],
  toggleBatchSelect: (id) =>
    set((s) => ({
      batchSelectedIds: s.batchSelectedIds.includes(id)
        ? s.batchSelectedIds.filter((i) => i !== id)
        : [...s.batchSelectedIds, id],
    })),
  selectAllFiles: () => {
    const { files, fileTypeFilter, selectedFolderId } = get();
    let activeFiles = files.filter((f) => !f.isDeleted);
    // Apply same filters as FilesView
    if (fileTypeFilter === "document") {
      activeFiles = activeFiles.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx");
    } else if (fileTypeFilter === "image") {
      activeFiles = activeFiles.filter((f) => f.fileType === "image");
    } else if (fileTypeFilter === "favorite") {
      activeFiles = activeFiles.filter((f) => f.isFavorite);
    }
    if (selectedFolderId) {
      activeFiles = activeFiles.filter((f) => f.folderId === selectedFolderId);
    }
    set({ batchSelectedIds: activeFiles.map((f) => f.id) });
  },
  clearBatchSelection: () => set({ batchSelectedIds: [] }),

  // AI
  aiProcessing: false,
  setAiProcessing: (v) => set({ aiProcessing: v }),
  aiChatFile: null,
  setAiChatFile: (file) => set({ aiChatFile: file }),

  // Image Lightbox
  lightboxOpen: false,
  lightboxImages: [],
  lightboxIndex: 0,
  openLightbox: (images, index) => set({ lightboxOpen: true, lightboxImages: images, lightboxIndex: index }),
  closeLightbox: () => set({ lightboxOpen: false, lightboxImages: [], lightboxIndex: 0 }),

  // UI
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectedFolderId: null,
  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  fileViewMode: "grid",
  setFileViewMode: (mode) => set({ fileViewMode: mode }),

  // Storage
  storageMode: "local",
  setStorageMode: async (mode) => {
    const { user } = get();
    if (!user) return;
    resetAdapter();

    if (mode === "cloud" && user) {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, storageMode: mode }),
        });
        if (res.ok) {
          const newUserInfo = { ...user, storageMode: mode };
          set({ storageMode: mode, user: newUserInfo });
          if (typeof window !== "undefined") {
            localStorage.setItem("kb_user", JSON.stringify(newUserInfo));
          }
          get().refreshFiles();
          get().refreshFolders();
          return;
        }
      } catch {
        // fall through
      }
    }

    const newUserInfo = { ...user, storageMode: mode };
    set({ storageMode: mode, user: newUserInfo });
    if (typeof window !== "undefined") {
      localStorage.setItem("kb_user", JSON.stringify(newUserInfo));
    }
    get().refreshFiles();
    get().refreshFolders();
  },

  // Folders
  folders: [],
  setFolders: (folders) => set({ folders }),
  addFolder: (folder) => set((s) => ({ folders: [...s.folders, folder] })),
  removeFolder: (id) => set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),

  refreshFolders: async () => {
    const { user, storageMode } = get();
    if (!user) return;

    if (storageMode === "local") {
      try {
        const { openDB } = await import("idb");
        const db = await openDB("knowledge-base-db", 1);
        const allFolders = await db.getAll("folders");
        const userFolders = allFolders
          .filter((f: { userId?: string }) => f.userId === user.id)
          .map((f: { id: string; name: string; parentId?: string; createdAt: Date }) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId || null,
            createdAt: typeof f.createdAt === "string" ? f.createdAt : new Date(f.createdAt).toISOString(),
          }));
        set({ folders: userFolders });
      } catch {
        set({ folders: [] });
      }
    } else {
      try {
        const res = await fetch(`/api/folders?userId=${user.id}`);
        if (res.ok) {
          const folders = await res.json();
          set({ folders });
        }
      } catch {
        // ignore
      }
    }
  },

  // Data export
  exportData: async () => {
    const { files, folders, user } = get();
    const exportObj = {
      exportDate: new Date().toISOString(),
      version: "2.0",
      user: user ? { name: user.name, email: user.email } : null,
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        textContent: f.textContent,
        folderId: f.folderId,
        tags: f.tags,
        isFavorite: f.isFavorite,
        createdAt: typeof f.createdAt === "string" ? f.createdAt : new Date(f.createdAt).toISOString(),
      })),
      folders,
    };
    return JSON.stringify(exportObj, null, 2);
  },
}));
