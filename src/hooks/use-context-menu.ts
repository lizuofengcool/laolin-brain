"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FileData } from "@/lib/storage/base";

interface ContextMenuState {
  file: FileData | null;
  position: { x: number; y: number } | null;
}

/**
 * Custom hook for managing a desktop right-click context menu on files.
 * Only intended for non-mobile usage — the caller should gate on `useIsMobile()`.
 */
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    file: null,
    position: null,
  });

  // Keep a stable ref so we can read current state inside callbacks without stale closure
  const stateRef = useRef(contextMenu);
  useEffect(() => {
    stateRef.current = contextMenu;
  }, [contextMenu]);

  const showContextMenu = useCallback((e: React.MouseEvent, file: FileData) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      file,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu((prev) => {
      if (!prev.position && !prev.file) return prev;
      return { file: null, position: null };
    });
  }, []);

  return {
    contextMenu: {
      file: contextMenu.file,
      position: contextMenu.position,
    },
    showContextMenu,
    hideContextMenu,
  };
}
