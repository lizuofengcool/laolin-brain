import type { FileData } from "@/lib/storage/base";
import type { StoreSet, StoreGet } from "./types";

let _embeddingTimer: ReturnType<typeof setTimeout> | null = null;

export function createAISlice(set: StoreSet, get: StoreGet) {
  return {
    // ── AI State ─────────────────────────────────────────────────────────
    aiProcessing: false,
    setAiProcessing: (v: boolean) => set({ aiProcessing: v }),

    aiChatFile: null as FileData | null,
    setAiChatFile: (file: FileData | null) => set({ aiChatFile: file }),

    // ── AI Settings ──────────────────────────────────────────────────────
    autoAiProcessing: true, // enabled by default
    setAutoAiProcessing: (v: boolean) => {
      set({ autoAiProcessing: v });
      if (typeof window !== "undefined") {
        localStorage.setItem("kb_auto_ai", JSON.stringify(v));
      }
    },

    // ── Embedding generation ─────────────────────────────────────────────
    embeddingQueue: [] as string[],

    queueEmbedding: (fileId: string) => {
      const { embeddingQueue } = get();
      if (!embeddingQueue.includes(fileId)) {
        set({ embeddingQueue: [...embeddingQueue, fileId] });
      }
      // Debounce: process after 30 seconds of no new additions
      if (_embeddingTimer) clearTimeout(_embeddingTimer);
      _embeddingTimer = setTimeout(() => {
        get().processEmbeddingQueue();
      }, 30000);
    },

    processEmbeddingQueue: async () => {
      if (_embeddingTimer) { clearTimeout(_embeddingTimer); _embeddingTimer = null; }
      const { embeddingQueue, storageMode, autoAiProcessing, user } = get();
      if (embeddingQueue.length === 0 || !autoAiProcessing || storageMode !== 'cloud' || !user) {
        set({ embeddingQueue: [] });
        return;
      }
      const queue = [...embeddingQueue];
      set({ embeddingQueue: [] });
      try {
        const token = get().token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/embeddings/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({ fileIds: queue }),
        });
        if (!res.ok) console.error('Embedding generation failed:', await res.text());
      } catch (err) {
        console.error('Embedding generation failed:', err);
      }
    },
  };
}
