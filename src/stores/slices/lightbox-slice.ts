import type { FileData } from "@/lib/storage/base";
import type { StoreSet, StoreGet } from "./types";

export function createLightboxSlice(set: StoreSet, _get: StoreGet) {
  return {
    // ── Image Lightbox ───────────────────────────────────────────────────
    lightboxOpen: false,
    lightboxImages: [] as FileData[],
    lightboxIndex: 0,

    openLightbox: (images: FileData[], index: number) =>
      set({ lightboxOpen: true, lightboxImages: images, lightboxIndex: index }),

    closeLightbox: () =>
      set({ lightboxOpen: false, lightboxImages: [], lightboxIndex: 0 }),
  };
}
