import type { StoreSet, StoreGet } from "./types";
import { resetAdapter } from "@/lib/storage/factory";

export function createUISlice(set: StoreSet, get: StoreGet) {
  return {
    // ── UI State ─────────────────────────────────────────────────────────
    sidebarOpen: true,
    setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

    searchQuery: "",
    setSearchQuery: (q: string) => set({ searchQuery: q }),

    selectedFolderId: null as string | null,
    setSelectedFolderId: (id: string | null) => set({ selectedFolderId: id }),

    fileViewMode: "grid" as "grid" | "list",
    setFileViewMode: (mode: "grid" | "list") => set({ fileViewMode: mode }),

    // ── Storage mode ─────────────────────────────────────────────────────
    storageMode: "local",
    setStorageMode: async (mode: string, skipWarning?: boolean) => {
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

    // ── Batch operations ─────────────────────────────────────────────────
    batchMode: false,
    toggleBatchMode: () =>
      set((s) => ({ batchMode: !s.batchMode, batchSelectedIds: [] })),

    batchSelectedIds: [] as string[],
    toggleBatchSelect: (id: string) =>
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
  };
}
