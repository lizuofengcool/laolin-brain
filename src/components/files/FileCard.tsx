"use client";

import React, { memo, useState, useRef, useCallback } from "react";
import type { FileData } from "@/lib/storage/base";
import {
  Star,
  MoreVertical,
  Trash2,
  Tag,
  FolderInput,
  Sparkles,
  Pencil,
  Check,
  Maximize2,
  History,
  Share2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useFileActions } from "./useFileActions";
import { useAppStore } from "@/stores/app-store";
import { getFileColor, formatSize, getFileTypeBadge, isDocumentType, FileIconDisplay } from "@/lib/file-utils";
import { ShareDialog } from "./ShareDialog";
import { motion } from "framer-motion";
import { useSwipeLeft, useLongPress, useSwipeRight, isTouchDevice } from "@/hooks/use-gestures";

export type CardSize = "small" | "medium" | "large";

interface FileCardProps {
  file: FileData;
  onPreview: (file: FileData) => void;
  cardSize?: CardSize;
  onShowVersions?: (file: FileData) => void;
}

const previewHeightMap: Record<CardSize, string> = {
  small: "h-28",
  medium: "h-36",
  large: "h-48",
};

const areFileCardPropsEqual = (prev: FileCardProps, next: FileCardProps) => {
  const f1 = prev.file, f2 = next.file;
  if (f1.id !== f2.id || f1.fileName !== f2.fileName || f1.fileType !== f2.fileType ||
      f1.fileSize !== f2.fileSize || f1.thumbnailUrl !== f2.thumbnailUrl ||
      f1.isFavorite !== f2.isFavorite || prev.onPreview !== next.onPreview ||
      prev.cardSize !== next.cardSize) return false;
  if (f1.tags.length !== f2.tags.length) return false;
  for (let i = 0; i < f1.tags.length; i++) {
    if (f1.tags[i] !== f2.tags[i]) return false;
  }
  if (f1.textContent !== f2.textContent) return false;
  return true;
};

export const FileCard = memo(function FileCard({ file, onPreview, cardSize = "medium", onShowVersions }: FileCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [longPressActive, setLongPressActive] = useState(false);
  const [imgError, setImgError] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const {
    tagDialogOpen, setTagDialogOpen, tagInput, setTagInput,
    folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
    renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput,
    handleFavorite, handleDelete, confirmDelete, handleAIChat,
    handleEditTags, handleSaveTags,
    handleMoveToFolder, handleSaveFolder,
    handleRename, handleSaveRename,
    handleOpenLightbox, handleCardClick,
    isSelected, hasAITags, hasAITextContent, isImage, folders, batchMode,
    deleteConfirmOpen, setDeleteConfirmOpen,
  } = useFileActions(file);

  const colorClass = getFileColor(file.fileType);
  const typeBadge = getFileTypeBadge(file.fileType);
  const isDoc = isDocumentType(file.fileType);
  const previewHeight = previewHeightMap[cardSize];

  // Long press on mobile enters batch selection mode
  const handleLongPress = useCallback(() => {
    const state = useAppStore.getState();
    if (!state.batchMode) {
      state.toggleBatchMode();
      state.toggleBatchSelect(file.id);
    } else {
      state.toggleBatchSelect(file.id);
    }
  }, [file.id]);

  useLongPress(cardRef, handleLongPress, { delay: 500 });

  // Content preview for documents
  const contentPreview = React.useMemo(() => {
    if (!isDoc || !file.textContent) return null;
    const lines = file.textContent.split("\n").filter((l) => l.trim().length > 0);
    const previewLines = cardSize === "large" ? lines.slice(0, 3) : lines.slice(0, 2);
    const previewText = previewLines.join("\n").slice(0, cardSize === "large" ? 120 : 80);
    return previewText;
  }, [isDoc, file.textContent, cardSize]);

  const onCardClick = () => {
    const result = handleCardClick();
    if (result === false) {
      onPreview(file);
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          ref={cardRef}
          className={cn(
            "group cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden relative",
            batchMode && isSelected && "ring-2 ring-primary ring-offset-2",
            longPressActive && "scale-95"
          )}
          onClick={onCardClick}
        >
          {/* Batch checkbox overlay */}
          {batchMode && (
            <div className="absolute top-2 left-2 z-10">
              <div
                className={cn(
                  "h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors",
                  isSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background/80 border-muted-foreground/40"
                )}
              >
                {isSelected && <Check className="h-4 w-4" />}
              </div>
            </div>
          )}

          {/* Preview area */}
          <div
            className={cn(
              previewHeight,
              "flex items-center justify-center relative",
              isImage
                ? "bg-muted/30"
                : "bg-muted/50"
            )}
          >
            {isImage ? (
              <>
                {imgError ? (
                  <div className={cn("h-14 w-14 rounded-xl flex items-center justify-center", colorClass)}>
                    <FileIconDisplay fileType={file.fileType} className="h-7 w-7" />
                  </div>
                ) : (
                  <img
                    src={file.thumbnailUrl || file.previewUrl}
                    alt={file.fileName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => setImgError(true)}
                  />
                )}
                {/* Tag overlay on images - bottom left */}
                {file.tags.length > 0 && (
                  <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 pointer-events-none">
                    {file.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white/90 backdrop-blur-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div
                className={cn(
                  "h-14 w-14 rounded-xl flex items-center justify-center",
                  colorClass
                )}
              >
                <FileIconDisplay fileType={file.fileType} className="h-7 w-7" />
              </div>
            )}

            {/* File type badge - top left */}
            <div className="absolute top-2 left-2 pointer-events-none">
              <span
                className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.5 rounded border",
                  typeBadge.color
                )}
              >
                {typeBadge.label}
              </span>
            </div>

            {/* AI badge */}
            {hasAITags && (
              <div className="absolute top-2 left-2" style={{ left: "auto", right: isImage ? "auto" : undefined }}>
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-primary/90 text-primary-foreground hover:bg-primary/90 gap-1"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  AI
                </Badge>
              </div>
            )}

            {/* Favorite button */}
            {!batchMode && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80",
                  file.isFavorite && "opacity-100"
                )}
                onClick={handleFavorite}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    file.isFavorite
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground"
                  )}
                />
              </Button>
            )}

            {/* More actions */}
            {!batchMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPreview(file); }}>
                    预览
                  </DropdownMenuItem>
                  {isImage && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenLightbox(e); }}>
                      <Maximize2 className="h-4 w-4 mr-2" />
                      放大查看
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleAIChat}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI 解读
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEditTags}>
                    <Tag className="h-4 w-4 mr-2" />
                    编辑标签
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRename}>
                    <Pencil className="h-4 w-4 mr-2" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleMoveToFolder}>
                    <FolderInput className="h-4 w-4 mr-2" />
                    移动到文件夹
                  </DropdownMenuItem>
                  {onShowVersions && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShowVersions(file); }}>
                      <History className="h-4 w-4 mr-2" />
                      版本历史
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}>
                    <Share2 className="h-4 w-4 mr-2" />
                    分享链接
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Info area */}
          <div className="p-3">
            <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground">
                {formatSize(file.fileSize)}
              </span>
              <div className="flex gap-1">
                {file.tags.slice(0, cardSize === "small" ? 1 : 2).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            {/* Content preview snippet for documents */}
            {contentPreview && (
              <p className={cn(
                "text-[10px] text-muted-foreground mt-1.5 leading-relaxed",
                cardSize === "large" ? "line-clamp-3" : "line-clamp-2"
              )}>
                {contentPreview}
              </p>
            )}
            {/* AI OCR text preview (for images only) */}
            {!contentPreview && hasAITextContent && (
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                {file.textContent!.slice(0, 50)}
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Dialogs */}
      <ShareDialog
        file={{ id: file.id, fileName: file.fileName }}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
      <FileActionDialogs
        tagDialogOpen={tagDialogOpen} setTagDialogOpen={setTagDialogOpen}
        tagInput={tagInput} setTagInput={setTagInput} handleSaveTags={handleSaveTags}
        renameDialogOpen={renameDialogOpen} setRenameDialogOpen={setRenameDialogOpen}
        renameInput={renameInput} setRenameInput={setRenameInput} handleSaveRename={handleSaveRename}
        folderDialogOpen={folderDialogOpen} setFolderDialogOpen={setFolderDialogOpen}
        selectedFolderId={selectedFolderId} setSelectedFolderId={setSelectedFolderId}
        handleSaveFolder={handleSaveFolder} folders={folders}
        deleteConfirmOpen={deleteConfirmOpen} setDeleteConfirmOpen={setDeleteConfirmOpen} confirmDelete={confirmDelete} fileName={file.fileName}
      />
    </>
  );
}, areFileCardPropsEqual);

// Shared dialog components
function FileActionDialogs({
  tagDialogOpen, setTagDialogOpen, tagInput, setTagInput, handleSaveTags,
  renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput, handleSaveRename,
  folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
  handleSaveFolder, folders,
  deleteConfirmOpen, setDeleteConfirmOpen, confirmDelete, fileName,
}: {
  tagDialogOpen: boolean; setTagDialogOpen: (v: boolean) => void;
  tagInput: string; setTagInput: (v: string) => void; handleSaveTags: () => void;
  renameDialogOpen: boolean; setRenameDialogOpen: (v: boolean) => void;
  renameInput: string; setRenameInput: (v: string) => void; handleSaveRename: () => void;
  folderDialogOpen: boolean; setFolderDialogOpen: (v: boolean) => void;
  selectedFolderId: string | null; setSelectedFolderId: (v: string | null) => void;
  handleSaveFolder: () => void; folders: { id: string; name: string }[];
  deleteConfirmOpen: boolean; setDeleteConfirmOpen: (v: boolean) => void; confirmDelete: () => void; fileName: string;
}) {
  return (
    <>
      {/* Edit Tags Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label>标签（用逗号分隔）</Label>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="风景, 旅行, 美食"
            />
            <div className="flex flex-wrap gap-1.5">
              {tagInput.split(/[,，]/).map((t, i) => {
                const trimmed = t.trim();
                if (!trimmed) return null;
                return (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {trimmed}
                  </Badge>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveTags}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名文件</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label>新文件名</Label>
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveRename(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveRename}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移动到文件夹</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-64 overflow-y-auto">
            <button
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                selectedFolderId === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
              onClick={() => setSelectedFolderId(null)}
            >
              📁 根目录（无文件夹）
            </button>
            {folders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无文件夹，请先创建</p>
            ) : (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedFolderId === folder.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  📁 {folder.name}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveFolder}>移动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(v) => { if (!v) setDeleteConfirmOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除文件</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">确定要删除「{fileName}」吗？文件将移入回收站。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// List item variant
export interface FileListItemProps {
  file: FileData;
  onPreview: (file: FileData) => void;
  onShowVersions?: (file: FileData) => void;
}

export const FileListItem = memo(function FileListItem({ file, onPreview, onShowVersions }: FileListItemProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [swiped, setSwiped] = useState(false);
  const [imgError, setImgError] = useState(false);
  const listItemRef = useRef<HTMLDivElement>(null);
  const {
    tagDialogOpen, setTagDialogOpen, tagInput, setTagInput,
    folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
    renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput,
    handleFavorite, handleDelete, confirmDelete, handleAIChat,
    handleEditTags, handleSaveTags,
    handleMoveToFolder, handleSaveFolder,
    handleRename, handleSaveRename,
    handleOpenLightbox, handleCardClick,
    isSelected, hasAITags, isImage, folders, batchMode,
    deleteConfirmOpen, setDeleteConfirmOpen,
  } = useFileActions(file);

  const colorClass = getFileColor(file.fileType);
  const typeBadge = getFileTypeBadge(file.fileType);
  const isDoc = isDocumentType(file.fileType);

  // Swipe left to reveal action buttons on mobile
  const showSwipeActions = useCallback(() => {
    setSwiped(true);
  }, []);

  const hideSwipeActions = useCallback(() => {
    setSwiped(false);
  }, []);

  useSwipeLeft(listItemRef, showSwipeActions, { threshold: 40 });
  useSwipeRight(listItemRef, hideSwipeActions, { threshold: 30 });

  // Content preview for documents (first line)
  const contentPreview = React.useMemo(() => {
    if (!isDoc || !file.textContent) return null;
    const firstLine = file.textContent.split("\n").find((l) => l.trim().length > 0);
    return firstLine ? firstLine.slice(0, 80) : null;
  }, [isDoc, file.textContent]);

  const onItemClick = () => {
    const result = handleCardClick();
    if (result === false) {
      onPreview(file);
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-lg" ref={listItemRef}>
        {/* Swipe action buttons overlay */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 flex items-center z-20 transition-transform duration-200 md:hidden",
            swiped ? "translate-x-0" : "translate-x-full"
          )}
        >
          <button
            className="h-full px-3 bg-yellow-500 text-white flex items-center justify-center min-w-[60px] active:bg-yellow-600"
            onClick={(e) => { e.stopPropagation(); handleFavorite(); hideSwipeActions(); }}
          >
            <Star className={cn("h-4 w-4", file.isFavorite ? "fill-current" : "")} />
          </button>
          <button
            className="h-full px-3 bg-destructive text-destructive-foreground flex items-center justify-center min-w-[60px] active:bg-destructive/90"
            onClick={(e) => { e.stopPropagation(); handleDelete(); hideSwipeActions(); }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            className="h-full px-3 bg-muted-foreground/60 text-white flex items-center justify-center min-w-[50px] active:bg-muted-foreground/80"
            onClick={(e) => { e.stopPropagation(); onPreview(file); hideSwipeActions(); }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>

      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-all duration-200 group",
          batchMode && isSelected && "bg-primary/5 ring-1 ring-primary",
          swiped && "-translate-x-[170px] md:translate-x-0"
        )}
        onClick={(e) => { onItemClick(); hideSwipeActions(); }}
      >
        {/* Batch checkbox */}
        {batchMode && (
          <div
            className={cn(
              "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
            )}
          >
            {isSelected && <Check className="h-3 w-3" />}
          </div>
        )}

        {isImage ? (
          <div className="relative shrink-0">
            {imgError ? (
              <div className={cn("h-10 w-10 rounded-md flex items-center justify-center shrink-0", colorClass)}>
                <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
              </div>
            ) : (
              <img src={file.thumbnailUrl || file.previewUrl} alt={file.fileName} className="h-10 w-10 rounded-md object-cover shrink-0" loading="lazy" onError={() => setImgError(true)} />
            )}
            {/* Tag overlay on image thumbnails */}
            {file.tags.length > 0 && (
              <div className="absolute -bottom-1 -right-1 flex -space-x-0.5">
                <span className="text-[8px] px-1 py-0 rounded bg-primary/90 text-primary-foreground leading-none">
                  {file.tags.length > 1 ? `${file.tags.length}` : file.tags[0]}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ position: "relative" }}>
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", colorClass)}>
              <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
            <span
              className={cn(
                "text-[8px] font-semibold px-1 py-0 rounded border shrink-0 leading-none",
                typeBadge.color
              )}
            >
              {typeBadge.label}
            </span>
            {hasAITags && <Sparkles className="h-3 w-3 text-primary shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatSize(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("zh-CN")}
          </p>
          {/* Content preview snippet */}
          {contentPreview && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-md">
              {contentPreview}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {file.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 hidden sm:inline-flex">
              {tag}
            </Badge>
          ))}
          {!batchMode && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFavorite}>
                <Star className={cn("h-3.5 w-3.5", file.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hidden sm:flex" onClick={handleAIChat}>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPreview(file); }}>预览</DropdownMenuItem>
                  {isImage && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenLightbox(); }}>放大查看</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAIChat(e); }}>
                    <Sparkles className="h-4 w-4 mr-2" />AI 解读
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditTags(); }}>
                    <Tag className="h-4 w-4 mr-2" />编辑标签
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(); }}>
                    <Pencil className="h-4 w-4 mr-2" />重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMoveToFolder(); }}>
                    <FolderInput className="h-4 w-4 mr-2" />移动到文件夹
                  </DropdownMenuItem>
                  {onShowVersions && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShowVersions(file); }}>
                      <History className="h-4 w-4 mr-2" />版本历史
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}>
                    <Share2 className="h-4 w-4 mr-2" />分享链接
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(); }}>
                    <Trash2 className="h-4 w-4 mr-2" />删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
      </div>

      {/* Dialogs */}
      <ShareDialog
        file={{ id: file.id, fileName: file.fileName }}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
      <FileActionDialogs
        tagDialogOpen={tagDialogOpen} setTagDialogOpen={setTagDialogOpen}
        tagInput={tagInput} setTagInput={setTagInput} handleSaveTags={handleSaveTags}
        renameDialogOpen={renameDialogOpen} setRenameDialogOpen={setRenameDialogOpen}
        renameInput={renameInput} setRenameInput={setRenameInput} handleSaveRename={handleSaveRename}
        folderDialogOpen={folderDialogOpen} setFolderDialogOpen={setFolderDialogOpen}
        selectedFolderId={selectedFolderId} setSelectedFolderId={setSelectedFolderId}
        handleSaveFolder={handleSaveFolder} folders={folders}
        deleteConfirmOpen={deleteConfirmOpen} setDeleteConfirmOpen={setDeleteConfirmOpen} confirmDelete={confirmDelete} fileName={file.fileName}
      />
    </>
  );
}, areFileCardPropsEqual);
