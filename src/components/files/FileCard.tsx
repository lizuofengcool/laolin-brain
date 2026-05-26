"use client";

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
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";
import { motion } from "framer-motion";

interface FileCardProps {
  file: FileData;
  onPreview: (file: FileData) => void;
}

export function FileCard({ file, onPreview }: FileCardProps) {
  const {
    tagDialogOpen, setTagDialogOpen, tagInput, setTagInput,
    folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
    renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput,
    handleFavorite, handleDelete, handleAIChat,
    handleEditTags, handleSaveTags,
    handleMoveToFolder, handleSaveFolder,
    handleRename, handleSaveRename,
    handleOpenLightbox, handleCardClick,
    isSelected, hasAITags, hasAITextContent, isImage, folders, batchMode,
  } = useFileActions(file);

  const colorClass = getFileColor(file.fileType);

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
          className={cn(
            "group cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden relative",
            batchMode && isSelected && "ring-2 ring-primary ring-offset-2"
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
                    : "bg-white/80 border-muted-foreground/40"
                )}
              >
                {isSelected && <Check className="h-4 w-4" />}
              </div>
            </div>
          )}

          {/* Preview area */}
          <div
            className={cn(
              "h-36 flex items-center justify-center relative",
              isImage
                ? "bg-muted/30"
                : "bg-muted/50"
            )}
          >
            {isImage ? (
              <img
                src={file.thumbnailUrl || file.previewUrl}
                alt={file.fileName}
                className="w-full h-full object-cover"
              />
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

            {/* AI badge */}
            {hasAITags && (
              <div className="absolute top-2 left-2">
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
            <p className="text-sm font-medium truncate">{file.fileName}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-muted-foreground">
                {formatSize(file.fileSize)}
              </span>
              <div className="flex gap-1">
                {file.tags.slice(0, 2).map((tag) => (
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
            {/* AI OCR text preview */}
            {hasAITextContent && (
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                {file.textContent!.slice(0, 50)}
              </p>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Dialogs */}
      <FileActionDialogs
        tagDialogOpen={tagDialogOpen} setTagDialogOpen={setTagDialogOpen}
        tagInput={tagInput} setTagInput={setTagInput} handleSaveTags={handleSaveTags}
        renameDialogOpen={renameDialogOpen} setRenameDialogOpen={setRenameDialogOpen}
        renameInput={renameInput} setRenameInput={setRenameInput} handleSaveRename={handleSaveRename}
        folderDialogOpen={folderDialogOpen} setFolderDialogOpen={setFolderDialogOpen}
        selectedFolderId={selectedFolderId} setSelectedFolderId={setSelectedFolderId}
        handleSaveFolder={handleSaveFolder} folders={folders}
      />
    </>
  );
}

// Shared dialog components
function FileActionDialogs({
  tagDialogOpen, setTagDialogOpen, tagInput, setTagInput, handleSaveTags,
  renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput, handleSaveRename,
  folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
  handleSaveFolder, folders,
}: {
  tagDialogOpen: boolean; setTagDialogOpen: (v: boolean) => void;
  tagInput: string; setTagInput: (v: string) => void; handleSaveTags: () => void;
  renameDialogOpen: boolean; setRenameDialogOpen: (v: boolean) => void;
  renameInput: string; setRenameInput: (v: string) => void; handleSaveRename: () => void;
  folderDialogOpen: boolean; setFolderDialogOpen: (v: boolean) => void;
  selectedFolderId: string | null; setSelectedFolderId: (v: string | null) => void;
  handleSaveFolder: () => void; folders: { id: string; name: string }[];
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
    </>
  );
}

// List item variant
export function FileListItem({ file, onPreview }: FileCardProps) {
  const {
    tagDialogOpen, setTagDialogOpen, tagInput, setTagInput,
    folderDialogOpen, setFolderDialogOpen, selectedFolderId, setSelectedFolderId,
    renameDialogOpen, setRenameDialogOpen, renameInput, setRenameInput,
    handleFavorite, handleDelete, handleAIChat,
    handleEditTags, handleSaveTags,
    handleMoveToFolder, handleSaveFolder,
    handleRename, handleSaveRename,
    handleOpenLightbox, handleCardClick,
    isSelected, hasAITags, isImage, folders, batchMode,
  } = useFileActions(file);

  const colorClass = getFileColor(file.fileType);

  const onItemClick = () => {
    const result = handleCardClick();
    if (result === false) {
      onPreview(file);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group",
          batchMode && isSelected && "bg-primary/5 ring-1 ring-primary"
        )}
        onClick={onItemClick}
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
          <img src={file.thumbnailUrl || file.previewUrl} alt={file.fileName} className="h-10 w-10 rounded-md object-cover shrink-0" />
        ) : (
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", colorClass)}>
            <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{file.fileName}</p>
            {hasAITags && <Sparkles className="h-3 w-3 text-primary shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatSize(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString("zh-CN")}
          </p>
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
                  <DropdownMenuItem onClick={() => onPreview(file)}>预览</DropdownMenuItem>
                  {isImage && (
                    <DropdownMenuItem onClick={handleOpenLightbox}>放大查看</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleAIChat}>
                    <Sparkles className="h-4 w-4 mr-2" />AI 解读
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleEditTags}>
                    <Tag className="h-4 w-4 mr-2" />编辑标签
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRename}>
                    <Pencil className="h-4 w-4 mr-2" />重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleMoveToFolder}>
                    <FolderInput className="h-4 w-4 mr-2" />移动到文件夹
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-2" />删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <FileActionDialogs
        tagDialogOpen={tagDialogOpen} setTagDialogOpen={setTagDialogOpen}
        tagInput={tagInput} setTagInput={setTagInput} handleSaveTags={handleSaveTags}
        renameDialogOpen={renameDialogOpen} setRenameDialogOpen={setRenameDialogOpen}
        renameInput={renameInput} setRenameInput={setRenameInput} handleSaveRename={handleSaveRename}
        folderDialogOpen={folderDialogOpen} setFolderDialogOpen={setFolderDialogOpen}
        selectedFolderId={selectedFolderId} setSelectedFolderId={setSelectedFolderId}
        handleSaveFolder={handleSaveFolder} folders={folders}
      />
    </>
  );
}
