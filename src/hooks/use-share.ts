"use client";

import { useState, useCallback } from "react";

interface ShareFile {
  id: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
}

interface UseShareReturn {
  shareDialogOpen: boolean;
  shareFile: ShareFile | null;
  openShareDialog: (file: ShareFile) => void;
  closeShareDialog: () => void;
}

/**
 * Hook to manage the share dialog state.
 * Stores which file to share and controls dialog open/close.
 *
 * Uses React useState for simplicity. If you need cross-component
 * sharing (e.g., from a toolbar outside the file card), you can
 * lift this state to a Zustand store or React Context.
 */
export function useShare(): UseShareReturn {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFile, setShareFile] = useState<ShareFile | null>(null);

  const openShareDialog = useCallback((file: ShareFile) => {
    setShareFile(file);
    setShareDialogOpen(true);
  }, []);

  const closeShareDialog = useCallback(() => {
    setShareDialogOpen(false);
    // Keep file reference briefly for animation, then clear
    setTimeout(() => setShareFile(null), 300);
  }, []);

  return {
    shareDialogOpen,
    shareFile,
    openShareDialog,
    closeShareDialog,
  };
}
