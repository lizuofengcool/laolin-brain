import { create } from "zustand";
import type { FileData } from "@/lib/storage/base";
import { getStorageAdapter, resetAdapter } from "@/lib/storage/factory";
import { DB_VERSION } from "@/lib/storage/indexeddb";
import { useNotificationStore } from "@/stores/notification-store";
import { useActivityStore } from "@/stores/activity-store";

export type ViewType = "login" | "dashboard" | "files" | "search" | "settings" | "profile" | "timeline" | "favorites" | "recycleBin" | "albums" | "faceGroups" | "tags" | "analytics" | "knowledgeGraph";

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

  // Navigation (kept for backward compatibility — routes are now primary)
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
  toggleFavorite: (id: string) => Promise<void>;
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

  // Image Lightbox
  lightboxOpen: boolean;
  lightboxImages: FileData[];
  lightboxIndex: number;
  openLightbox: (images: FileData[], index: number) => void;
  closeLightbox: () => void;

  // Data export
  exportData: () => Promise<string>;

  // Data import
  importData: (jsonData: string) => Promise<number>;

  // Cross-tab auth sync
  _setupCrossTabSync: () => (() => void) | void;

  // Drag & drop
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  moveFileToFolder: (fileId: string, folderId: string | null) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  token: null,
  isAuthenticated: false,

  // Navigation (kept for backward compat — routes are now primary)
  currentView: "login",
  setCurrentView: (view) => {
    set({ currentView: view });
  },

  // Auth actions
  login: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("kb_token", token);
      localStorage.setItem("kb_user", JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true, currentView: "dashboard" });
    // Rehydrate user-specific stores
    useNotificationStore.getState().rehydrate();
    useActivityStore.getState().rehydrate();
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kb_token");
      localStorage.removeItem("kb_user");
    }
    // Clear service worker caches on logout
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
    }
    resetAdapter();
    useNotificationStore.getState().rehydrate();
    useActivityStore.getState().rehydrate();
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

        // Verify token is still valid (check expiry)
        // Simple client-side check: parse the base64 payload and check exp
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
            if (payload.exp && Date.now() > payload.exp) {
              // Token expired
              localStorage.removeItem("kb_token");
              localStorage.removeItem("kb_user");
              return;
            }
          }
        } catch {
          // Token format invalid, clear it
          localStorage.removeItem("kb_token");
          localStorage.removeItem("kb_user");
          return;
        }

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
  addFile: (file) => {
    set((s) => ({ files: [file, ...s.files] }));
    useActivityStore.getState().addActivity({
      type: "upload",
      fileName: file.fileName,
      fileId: file.id,
    });
  },
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
    const { user, storageMode, files } = get();
    if (!user) return;
    const file = files.find((f) => f.id === id);
    const now = new Date().toISOString();
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { isDeleted: true, deletedAt: now }, user.id);
      get().updateFile(id, { isDeleted: true, deletedAt: now });
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "文件已删除",
        message: file?.fileName,
        autoDismiss: true,
        duration: 3000,
      });
      useActivityStore.getState().addActivity({
        type: "delete",
        fileName: file?.fileName || "未知文件",
        fileId: id,
      });
    } catch (err) {
      console.error("Failed to soft delete file:", err);
      // Revert optimistic update on failure
      get().updateFile(id, { isDeleted: false, deletedAt: undefined });
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "删除失败",
        message: file?.fileName,
        autoDismiss: true,
        duration: 5000,
      });
    }
  },

  // Restore file from recycle bin
  restoreFile: async (id) => {
    const { user, storageMode, files } = get();
    if (!user) return;
    const file = files.find((f) => f.id === id);
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { isDeleted: false, deletedAt: undefined }, user.id);
      get().updateFile(id, { isDeleted: false, deletedAt: undefined });
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "文件已恢复",
        message: file?.fileName,
        autoDismiss: true,
        duration: 3000,
      });
      useActivityStore.getState().addActivity({
        type: "restore",
        fileName: file?.fileName || "未知文件",
        fileId: id,
      });
    } catch (err) {
      console.error("Failed to restore file:", err);
      // Revert optimistic update on failure
      get().updateFile(id, { isDeleted: true, deletedAt: file?.deletedAt });
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "恢复失败",
        message: file?.fileName,
        autoDismiss: true,
        duration: 5000,
      });
    }
  },

  // Permanent delete
  permanentDeleteFile: async (id) => {
    const { user, storageMode, files } = get();
    if (!user) return;
    const file = files.find((f) => f.id === id);
    const fileName = file?.fileName;
    try {
      const adapter = getStorageAdapter(storageMode);
      if (adapter.permanentDeleteFile) {
        await adapter.permanentDeleteFile(id, user.id);
      } else {
        await adapter.deleteFile(id, user.id);
      }
      get().removeFile(id);
      useActivityStore.getState().addActivity({
        type: "delete",
        fileName: fileName || "未知文件",
        fileId: id,
      });
    } catch (err) {
      console.error("Failed to permanently delete file:", err);
    }
  },

  // Empty recycle bin
  emptyRecycleBin: async () => {
    const deletedFiles = get().files.filter((f) => f.isDeleted);
    if (deletedFiles.length === 0) return;
    // Capture file names before concurrent deletion (avoids stale reads)
    const fileNames = new Map(deletedFiles.map((f) => [f.id, f.fileName]));
    try {
      const results = await Promise.allSettled(deletedFiles.map((file) => get().permanentDeleteFile(file.id)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      useNotificationStore.getState().addNotification({
        type: failed === 0 ? "success" : "info",
        title: failed === 0 ? "回收站已清空" : "部分文件删除失败",
        message: `成功删除 ${succeeded} 个文件` + (failed > 0 ? `，${failed} 个失败` : ""),
        autoDismiss: true,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to empty recycle bin:", err);
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "清空回收站失败",
        autoDismiss: true,
        duration: 5000,
      });
    }
  },

  // Rename file
  renameFile: async (id, newName) => {
    const { user, storageMode, files } = get();
    if (!user) return;
    const oldName = files.find((f) => f.id === id)?.fileName || newName;
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { fileName: newName }, user.id);
      get().updateFile(id, { fileName: newName });
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "重命名成功",
        message: newName,
        autoDismiss: true,
        duration: 3000,
      });
      useActivityStore.getState().addActivity({
        type: "rename",
        fileName: newName,
        fileId: id,
        details: `从「${oldName}」改为「${newName}」`,
      });
    } catch (err) {
      console.error("Failed to rename file:", err);
      // Revert optimistic update on failure
      get().updateFile(id, { fileName: oldName });
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "重命名失败",
        autoDismiss: true,
        duration: 5000,
      });
    }
  },

  toggleFavorite: async (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    const { user, storageMode } = get();
    const newVal = !file.isFavorite;
    if (!user) return;
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(id, { isFavorite: newVal }, user.id);
      get().updateFile(id, { isFavorite: newVal });

      if (newVal) {
        useNotificationStore.getState().addNotification({
          type: "success",
          title: "已收藏",
          message: file.fileName,
          autoDismiss: true,
          duration: 2500,
        });
        useActivityStore.getState().addActivity({
          type: "favorite",
          fileName: file.fileName,
          fileId: id,
        });
      } else {
        useNotificationStore.getState().addNotification({
          type: "info",
          title: "已取消收藏",
          message: file.fileName,
          autoDismiss: true,
          duration: 2500,
        });
        useActivityStore.getState().addActivity({
          type: "unfavorite",
          fileName: file.fileName,
          fileId: id,
        });
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      useNotificationStore.getState().addNotification({
        type: "error",
        title: newVal ? "收藏失败" : "取消收藏失败",
        message: file.fileName,
        autoDismiss: true,
        duration: 3000,
      });
    }
  },

  // Batch favorite toggle
  batchToggleFavorite: async (ids, value) => {
    const { user, storageMode } = get();
    if (!user) return;
    // Optimistic update
    for (const id of ids) {
      get().updateFile(id, { isFavorite: value });
    }
    try {
      const adapter = getStorageAdapter(storageMode);
      const results = await Promise.allSettled(ids.map((id) => adapter.updateFile(id, { isFavorite: value }, user.id)));
      // Revert individual failures
      const failedIds: string[] = [];
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          const failId = ids[idx];
          failedIds.push(failId);
          get().updateFile(failId, { isFavorite: !value });
        }
      });
      const succeeded = ids.length - failedIds.length;
      if (failedIds.length > 0) {
        useNotificationStore.getState().addNotification({
          type: "warning",
          title: "部分收藏操作失败",
          message: `成功 ${succeeded} 个，失败 ${failedIds.length} 个`,
          autoDismiss: true,
          duration: 5000,
        });
      }
      useActivityStore.getState().addActivity({
        type: value ? "favorite" : "unfavorite",
        fileName: value ? `批量收藏了${succeeded}个文件` : `批量取消收藏了${succeeded}个文件`,
      });
    } catch (err) {
      console.error("Batch favorite failed:", err);
      // Revert all on unexpected error
      for (const id of ids) {
        get().updateFile(id, { isFavorite: !value });
      }
    }
  },

  // Batch soft delete
  batchDeleteFiles: async (ids) => {
    const { user, storageMode } = get();
    if (!user) return;
    const now = new Date().toISOString();
    // Optimistic update
    for (const id of ids) {
      get().updateFile(id, { isDeleted: true, deletedAt: now });
    }
    try {
      const adapter = getStorageAdapter(storageMode);
      const results = await Promise.allSettled(ids.map((id) => adapter.updateFile(id, { isDeleted: true, deletedAt: now }, user.id)));
      // Revert individual failures
      const failedIds: string[] = [];
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          const failId = ids[idx];
          failedIds.push(failId);
          get().updateFile(failId, { isDeleted: false, deletedAt: undefined });
        }
      });
      const succeeded = ids.length - failedIds.length;
      if (failedIds.length === 0) {
        useNotificationStore.getState().addNotification({
          type: "success",
          title: "批量删除完成",
          message: `已删除 ${succeeded} 个文件`,
          autoDismiss: true,
          duration: 3000,
        });
      } else {
        useNotificationStore.getState().addNotification({
          type: "warning",
          title: "部分文件删除失败",
          message: `成功删除 ${succeeded} 个，失败 ${failedIds.length} 个`,
          autoDismiss: true,
          duration: 5000,
        });
      }
      useActivityStore.getState().addActivity({
        type: "delete",
        fileName: `批量删除了${succeeded}个文件` + (failedIds.length > 0 ? `，${failedIds.length}个失败` : ""),
      });
    } catch (err) {
      console.error("Batch delete failed:", err);
      // Revert all on unexpected error
      for (const id of ids) {
        get().updateFile(id, { isDeleted: false, deletedAt: undefined });
      }
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "批量删除失败",
        autoDismiss: true,
        duration: 5000,
      });
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
  setStorageMode: async (mode, skipWarning) => {
    const { user, storageMode } = get();
    if (!user) return;

    // Warn if switching between modes and files exist (files won't carry over)
    if (!skipWarning && storageMode !== mode && user) {
      const activeFiles = get().files.filter((f) => !f.isDeleted);
      if (activeFiles.length > 0) {
        console.warn(`[Storage] Switching from "${storageMode}" to "${mode}" — ${activeFiles.length} files may not carry over.`);
      }
    }

    resetAdapter();

    if (mode === "cloud" && user) {
      try {
        const token = get().token;
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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

  // Drag & drop: reorder files within a list
  reorderFiles: (fromIndex: number, toIndex: number) => {
    const currentFiles = get().files;
    if (!currentFiles.length || fromIndex >= currentFiles.length || toIndex >= currentFiles.length || fromIndex < 0 || toIndex < 0) return;
    set(() => {
      const newFiles = [...currentFiles];
      const [moved] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, moved);
      return { files: newFiles };
    });
  },

  // Drag & drop: move file to folder
  moveFileToFolder: async (fileId: string, folderId: string | null) => {
    const { user, storageMode, files, folders } = get();
    if (!user) return;
    const file = files.find((f) => f.id === fileId);
    const targetFolder = folderId ? folders.find((f) => f.id === folderId) : null;
    try {
      const adapter = getStorageAdapter(storageMode);
      await adapter.updateFile(fileId, { folderId: folderId || null } as Partial<import("@/lib/storage/base").FileData>, user.id);
      // Optimistic update only after API success
      get().updateFile(fileId, { folderId: folderId || undefined });
      useActivityStore.getState().addActivity({
        type: "tag",
        fileName: file?.fileName || "未知文件",
        fileId,
        details: targetFolder ? `移动到文件夹「${targetFolder.name}」` : "移出文件夹",
      });
    } catch (err) {
      console.error("Failed to move file to folder:", err);
      // No revert needed since we didn't optimistically update
      useNotificationStore.getState().addNotification({
        type: "error",
        title: "移动文件失败",
        message: file?.fileName || "未知文件",
        autoDismiss: true,
        duration: 5000,
      });
    }
  },

  refreshFolders: async () => {
    const { user, storageMode } = get();
    if (!user) return;

    if (storageMode === "local") {
      try {
        const { openDB } = await import("idb");
        const db = await openDB("knowledge-base-db", DB_VERSION);
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
        const token = get().token;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/folders?userId=${user.id}`, { headers });
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

  // Data import
  importData: async (jsonData: string) => {
    const { user, storageMode } = get();
    if (!user) return 0;

    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed.files || !Array.isArray(parsed.files)) {
        throw new Error("Invalid data format");
      }

      if (storageMode === "cloud" && user) {
        // Cloud mode: use API
        const token = get().token;
        const res = await fetch("/api/files/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            userId: user.id,
            files: parsed.files,
            folders: parsed.folders || [],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Refresh files to include imported ones
          get().refreshFiles();
          get().refreshFolders();
          return data.importedCount || 0;
        }
        return 0;
      } else {
        // Local mode: use IndexedDB directly
        const { openDB } = await import("idb");
        const db = await openDB("knowledge-base-db", DB_VERSION);
        let count = 0;

        for (const file of parsed.files) {
          if (!file.fileName) continue;

          // Check if already exists
          const existing = await db.get("files", file.id);
          if (existing) continue;

          const fileData = {
            id: file.id || `imported_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            fileName: file.fileName,
            fileType: file.fileType || "other",
            fileSize: file.fileSize || 0,
            textContent: file.textContent || undefined,
            tags: file.tags || [],
            isFavorite: file.isFavorite || false,
            storageMode: "local" as const,
            folderId: file.folderId || undefined,
            createdAt: file.createdAt ? new Date(file.createdAt) : new Date(),
            userId: user.id,
          };

          await db.put("files", fileData);
          count++;
        }

        // Refresh files
        get().refreshFiles();
        return count;
      }
    } catch (err) {
      console.error("Import failed:", err);
      throw err;
    }
  },

  // Cross-tab auth sync: listens for localStorage changes from other tabs
  _setupCrossTabSync: () => {
    if (typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (event.key === "kb_token") {
        if (event.newValue === null) {
          // Token was cleared by another tab → logout
          get().logout();
        } else if (event.newValue) {
          // Token was set by another tab → hydrate auth
          get().hydrateAuth();
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
}));
