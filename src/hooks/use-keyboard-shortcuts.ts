"use client";

import { useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";

/**
 * Global keyboard shortcuts hook
 * - Ctrl+K / Cmd+K: Focus search / go to search view
 * - Ctrl+N / Cmd+N: Go to files view (upload)
 * - Escape: Close lightbox / go back
 * - 1-9: Quick navigate to views (when not in input)
 */
export function useKeyboardShortcuts() {
  const { setCurrentView, closeLightbox, lightboxOpen } = useAppStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when typing in input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      // Ctrl+K / Cmd+K → Search (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCurrentView("search");
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
        setCurrentView("dashboard");
        return;
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "n":
            e.preventDefault();
            setCurrentView("files");
            return;
          case "d":
            e.preventDefault();
            setCurrentView("dashboard");
            return;
          case "f":
            e.preventDefault();
            setCurrentView("favorites");
            return;
          case "t":
            e.preventDefault();
            setCurrentView("timeline");
            return;
        }
      }

      // Quick nav with number keys
      switch (e.key) {
        case "1":
          setCurrentView("dashboard");
          break;
        case "2":
          setCurrentView("files");
          break;
        case "3":
          setCurrentView("favorites");
          break;
        case "4":
          setCurrentView("timeline");
          break;
        case "5":
          setCurrentView("search");
          break;
        case "6":
          setCurrentView("recycleBin");
          break;
        case "7":
          setCurrentView("settings");
          break;
      }
    },
    [setCurrentView, closeLightbox, lightboxOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
