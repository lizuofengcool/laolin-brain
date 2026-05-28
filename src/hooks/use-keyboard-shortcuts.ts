"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { viewToPath } from "@/lib/view-routes";

/**
 * Global keyboard shortcuts hook
 * - Ctrl+K / Cmd+K: Focus search / go to search view
 * - Ctrl+N / Cmd+N: Go to files view (upload)
 * - Escape: Close lightbox / go back
 * - 1-9: Quick navigate to views (when not in input)
 */
export function useKeyboardShortcuts() {
  const closeLightbox = useAppStore((s) => s.closeLightbox);
  const lightboxOpen = useAppStore((s) => s.lightboxOpen);
  const router = useRouter();

  // Helper not needed — router.push used directly in handlers

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      // Ctrl+K / Cmd+K → Search (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        router.push("/search");
        // Focus the search input after a tick
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="搜索"]'
          );
          if (searchInput) searchInput.focus();
        }, 100);
        return;
      }

      // Skip remaining shortcuts when in input
      if (isEditable) return;

      // Escape → Close lightbox or go to dashboard
      if (e.key === "Escape") {
        if (lightboxOpen) {
          closeLightbox();
          return;
        }
        e.preventDefault();
        router.push("/dashboard");
        return;
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "n":
            e.preventDefault();
            router.push("/files");
            return;
          case "d":
            e.preventDefault();
            router.push("/dashboard");
            return;
          case "f":
            e.preventDefault();
            router.push("/favorites");
            return;
          case "t":
            e.preventDefault();
            router.push("/timeline");
            return;
        }
      }

      // Quick nav with number keys
      switch (e.key) {
        case "1":
          router.push("/dashboard");
          break;
        case "2":
          router.push("/files");
          break;
        case "3":
          router.push("/favorites");
          break;
        case "4":
          router.push("/timeline");
          break;
        case "5":
          router.push("/search");
          break;
        case "6":
          router.push("/trash");
          break;
        case "7":
          router.push("/settings");
          break;
      }
    },
    [router, closeLightbox, lightboxOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
