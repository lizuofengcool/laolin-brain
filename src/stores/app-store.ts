import { create } from "zustand";
import type { FileData } from "@/lib/storage/base";
import { getStorageAdapter, resetAdapter } from "@/lib/storage/factory";

export type ViewType = "login" | "dashboard" | "files" | "search" | "settings";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  storageMode: string;
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
  toggleFavorite: (id: string) => void;

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
  refreshFolders: () => Promise<void>;

  // AI
  aiProcessing: boolean;
  setAiProcessing: (v: boolean) => void;
  aiChatFile: FileData | null;
  setAiChatFile: (file: FileData | null) => void;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
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
        // Refresh data in background
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

  toggleFavorite: (id) => {
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    const newVal = !file.isFavorite;
    get().updateFile(id, { isFavorite: newVal });

    // Persist to server/local
    const { user, storageMode } = get();
    if (!user) return;
    const adapter = getStorageAdapter(storageMode);
    adapter.updateFile(id, { isFavorite: newVal }, user.id).catch(console.error);
  },

  // AI
  aiProcessing: false,
  setAiProcessing: (v) => set({ aiProcessing: v }),
  aiChatFile: null,
  setAiChatFile: (file) => set({ aiChatFile: file }),

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

    // Update server if cloud mode
    if (mode === "cloud" && user) {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, storageMode: mode }),
        });
        if (res.ok) {
          const updatedUser = await res.json();
          const newUserInfo = { ...user, storageMode: mode };
          set({ storageMode: mode, user: newUserInfo });
          if (typeof window !== "undefined") {
            localStorage.setItem("kb_user", JSON.stringify(newUserInfo));
          }
          get().refreshFiles();
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
  },

  // Folders
  folders: [],
  setFolders: (folders) => set({ folders }),
  refreshFolders: async () => {
    const { user, storageMode } = get();
    if (!user || storageMode === "local") return;
    try {
      const res = await fetch(`/api/folders?userId=${user.id}`);
      if (res.ok) {
        const folders = await res.json();
        set({ folders });
      }
    } catch {
      // ignore
    }
  },
}));
