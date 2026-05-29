"use client";

import { useState, useCallback } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { getStorageAdapter } from "@/lib/storage/factory";
import { toast } from "@/hooks/use-toast";

/**
 * Shared hook for file card actions (rename, tags, folder, delete, lightbox)
 * Used by both FileCard (grid) and FileListItem (list) to eliminate code duplication.
 */
export function useFileActions(file: FileData) {
  const {
    toggleFavorite,
    softDeleteFile,
    setAiChatFile,
    updateFile,
    folders,
    refreshFolders,
    renameFile,
    batchMode,
    batchSelectedIds,
    toggleBatchSelect,
    openLightbox,
    files,
  } = useAppStore();

  // Dialog states
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagInput, setTagInput] = useState(file.tags.join(", "));
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(file.folderId || null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameInput, setRenameInput] = useState(file.fileName);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleFavorite = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    toggleFavorite(file.id);
  }, [toggleFavorite, file.id]);

  const handleDelete = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    await softDeleteFile(file.id);
    setDeleteConfirmOpen(false);
  }, [softDeleteFile, file.id]);

  const handleAIChat = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAiChatFile(file);
  }, [setAiChatFile, file]);

  const handleEditTags = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTagInput(file.tags.join(", "));
    setTagDialogOpen(true);
  }, [file.tags]);

  const handleSaveTags = useCallback(() => {
    const newTags = tagInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const oldTags = file.tags;
    updateFile(file.id, { tags: newTags });
    const { user, storageMode } = useAppStore.getState();
    if (user) {
      const adapter = getStorageAdapter(storageMode);
      adapter.updateFile(file.id, { tags: newTags }, user.id).catch((err) => {
        console.error("Failed to save tags:", err);
        // Revert optimistic update on failure
        updateFile(file.id, { tags: oldTags });
        toast({ title: "标签更新失败", variant: "destructive" });
      });
    }
    toast({ title: "标签已更新", description: `已为 ${file.fileName} 更新标签` });
    setTagDialogOpen(false);
  }, [file.id, file.fileName, file.tags, tagInput, updateFile]);

  const handleMoveToFolder = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFolderId(file.folderId || null);
    refreshFolders();
    setFolderDialogOpen(true);
  }, [file.folderId, refreshFolders]);

  const handleSaveFolder = useCallback(() => {
    const oldFolderId = file.folderId;
    updateFile(file.id, { folderId: selectedFolderId || undefined });
    const { user, storageMode } = useAppStore.getState();
    if (user) {
      const adapter = getStorageAdapter(storageMode);
      adapter.updateFile(file.id, { folderId: selectedFolderId || null } as Partial<FileData>, user.id).catch((err) => {
        console.error("Failed to move file:", err);
        // Revert optimistic update on failure
        updateFile(file.id, { folderId: oldFolderId });
        toast({ title: "移动失败", variant: "destructive" });
      });
    }
    toast({ title: "已移动", description: `文件已移至${selectedFolderId ? "文件夹" : "根目录"}` });
    setFolderDialogOpen(false);
  }, [file.id, file.folderId, selectedFolderId, updateFile]);

  const handleRename = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRenameInput(file.fileName);
    setRenameDialogOpen(true);
  }, [file.fileName]);

  const handleSaveRename = useCallback(async () => {
    if (!renameInput.trim()) return;
    const ext = file.fileName.includes(".") ? "." + file.fileName.split(".").pop() : "";
    const nameWithoutExt = renameInput.trim().replace(/\.[^.]+$/, "");
    const newName = nameWithoutExt + ext;
    await renameFile(file.id, newName);
    toast({ title: "重命名成功", description: `${file.fileName} → ${newName}` });
    setRenameDialogOpen(false);
  }, [file.id, file.fileName, renameInput, renameFile]);

  const handleOpenLightbox = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const allImages = files.filter((f) => f.fileType === "image" && !f.isDeleted && (f.thumbnailUrl || f.previewUrl));
    const currentIndex = allImages.findIndex((f) => f.id === file.id);
    openLightbox(allImages, currentIndex >= 0 ? currentIndex : 0);
  }, [files, file.id, openLightbox]);

  const handleCardClick = useCallback(() => {
    if (batchMode) {
      toggleBatchSelect(file.id);
    } else if (file.fileType === "image" && (file.thumbnailUrl || file.previewUrl)) {
      handleOpenLightbox();
    } else {
      // Return false to let parent handle preview
      return false;
    }
  }, [batchMode, file, toggleBatchSelect, handleOpenLightbox]);

  const isSelected = batchSelectedIds.includes(file.id);
  const hasAITags = file.tags && file.tags.length > 0;
  const hasAITextContent =
    file.textContent && file.fileType === "image" && file.textContent.trim().length > 0;
  const isImage = file.fileType === "image" && !!(file.thumbnailUrl || file.previewUrl);

  return {
    // Dialog states
    tagDialogOpen, setTagDialogOpen, tagInput, setTagInput,
    folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
    renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput,
    deleteConfirmOpen, setDeleteConfirmOpen,
    // Handlers
    handleFavorite, handleDelete, confirmDelete, handleAIChat,
    handleEditTags, handleSaveTags,
    handleMoveToFolder, handleSaveFolder,
    handleRename, handleSaveRename,
    handleOpenLightbox, handleCardClick,
    // Derived state
    isSelected, hasAITags, hasAITextContent, isImage, folders, batchMode,
  };
}
