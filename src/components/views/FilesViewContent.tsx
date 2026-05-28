"use client";

import { useEffect, useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { useIsMobile } from "@/hooks/use-mobile";
import { useContextMenu } from "@/hooks/use-context-menu";
import { FileGrid } from "@/components/files/FileGrid";
import { FolderTree } from "@/components/files/FolderTree";
import { UploadZone } from "@/components/files/UploadZone";
import { FilePreview } from "@/components/files/FilePreview";
import { FileVersions } from "@/components/files/FileVersions";
import { BatchActions } from "@/components/files/BatchActions";
import { SortFilter } from "@/components/files/SortFilter";
import { VirtualFileGrid } from "@/components/files/VirtualFileGrid";
import { FileContextMenu } from "@/components/files/FileContextMenu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Star, Trash2, CheckSquare, Square, X,
  StarOff, FolderInput,
} from "lucide-react";

export function FilesViewContent() {
  const {
    files,
    selectedFolderId,
    setSelectedFolderId,
    storageMode,
    fileTypeFilter,
    setFileTypeFilter,
    batchMode,
    toggleBatchMode,
    batchSelectedIds,
    selectAllFiles,
    clearBatchSelection,
    batchToggleFavorite,
    batchDeleteFiles,
    sortBy,
    sortOrder,
    setSort,
    folders,
    updateFile,
    refreshFiles,
  } = useAppStore();
  const isMobile = useIsMobile();
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [batchActionsOpen, setBatchActionsOpen] = useState(false);
  const [versionFile, setVersionFile] = useState<FileData | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleShowVersions = (file: FileData) => {
    setVersionFile(file);
    setVersionsOpen(true);
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setVisibleCount(20);
  };

  // Filter active (non-deleted) files
  const filteredFiles = useMemo(() => {
    let result = files.filter((f) => !f.isDeleted);

    // Apply file type filter (from dashboard stats click)
    if (fileTypeFilter === "document") {
      result = result.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx");
    } else if (fileTypeFilter === "image") {
      result = result.filter((f) => f.fileType === "image");
    } else if (fileTypeFilter === "favorite") {
      result = result.filter((f) => f.isFavorite);
    }

    // Filter by folder
    if (selectedFolderId) {
      result = result.filter((f) => f.folderId === selectedFolderId);
    } else if (!fileTypeFilter) {
      result = result.filter((f) => !f.folderId);
    }

    // Filter by tag
    if (tagFilter) {
      result = result.filter((f) => f.tags.includes(tagFilter));
    }

    return result;
  }, [files, fileTypeFilter, selectedFolderId, tagFilter]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    const order = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => order * a.fileName.localeCompare(b.fileName, "zh-CN"));
        break;
      case "size":
        sorted.sort((a, b) => order * (a.fileSize - b.fileSize));
        break;
      case "type":
        sorted.sort((a, b) => order * a.fileType.localeCompare(b.fileType));
        break;
      case "date":
      default:
        sorted.sort((a, b) => order * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        break;
    }
    return sorted;
  }, [filteredFiles, sortBy, sortOrder]);

  // Pagination
  const visibleFiles = sortedFiles.slice(0, visibleCount);
  const hasMore = visibleCount < sortedFiles.length;

  // Collect all tags
  const allTags = useMemo(() => [...new Set(files.filter((f) => !f.isDeleted).flatMap((f) => f.tags))], [files]);

  // Clear file type filter when entering files view directly
  useEffect(() => {
    return () => {
      setFileTypeFilter(null);
    };
  }, [setFileTypeFilter]);

  const filterLabel = fileTypeFilter === "document"
    ? "📄 文档"
    : fileTypeFilter === "image"
    ? "🖼️ 图片"
    : fileTypeFilter === "favorite"
    ? "⭐ 收藏"
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文件管理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理、上传和浏览你的文件
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterLabel && (
            <Badge variant="secondary" className="text-xs gap-1">
              {filterLabel}
              <button onClick={() => setFileTypeFilter(null)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {storageMode === "cloud" ? "☁️ 云端模式" : "💾 本地模式"}
          </Badge>
        </div>
      </div>

      {/* Upload zone */}
      {!batchMode && <UploadZone />}

      {/* Batch operations toolbar */}
      {batchMode && (
        <Card className="shadow-sm border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllFiles}>
                <CheckSquare className="h-4 w-4 mr-1" />
                全选
              </Button>
              <Button variant="outline" size="sm" onClick={clearBatchSelection}>
                <Square className="h-4 w-4 mr-1" />
                取消全选
              </Button>
              <span className="text-sm text-muted-foreground">
                已选择 {batchSelectedIds.length} 个文件
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => batchToggleFavorite(batchSelectedIds, true)}
              >
                <Star className="h-4 w-4 mr-1" />
                收藏
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => batchToggleFavorite(batchSelectedIds, false)}
              >
                <StarOff className="h-4 w-4 mr-1" />
                取消收藏
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => setBatchDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                删除
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => setBatchActionsOpen(true)}
              >
                <FolderInput className="h-4 w-4 mr-1" />
                更多操作
              </Button>
              <Button variant="outline" size="sm" onClick={toggleBatchMode}>
                <X className="h-4 w-4 mr-1" />
                退出批量
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Folders & Tags */}
        <div className="lg:w-56 shrink-0 space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">文件夹</span>
                {!batchMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={toggleBatchMode}
                  >
                    批量管理
                  </Button>
                )}
              </div>
              <FolderTree
                onSelectFolder={handleFolderSelect}
                selectedFolderId={selectedFolderId}
              />
            </CardContent>
          </Card>

          {allTags.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  标签筛选
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge
                    role="button"
                    tabIndex={0}
                    variant={tagFilter === null ? "default" : "secondary"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTagFilter(null)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTagFilter(null); } }}
                  >
                    全部
                  </Badge>
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      role="button"
                      tabIndex={0}
                      variant={tagFilter === tag ? "default" : "secondary"}
                      className="cursor-pointer text-xs"
                      onClick={() =>
                        setTagFilter(tagFilter === tag ? null : tag)
                      }
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTagFilter(tagFilter === tag ? null : tag); } }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* File grid */}
        <div className="flex-1 min-w-0">
          <SortFilter
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={setSort}
            totalFiles={files.filter((f) => !f.isDeleted).length}
            filteredCount={sortedFiles.length}
          />
          <div className="mt-3">
            {sortedFiles.length > 50 ? (
              <VirtualFileGrid files={sortedFiles} onPreview={handlePreview} onShowVersions={handleShowVersions} onFileContextMenu={!isMobile ? showContextMenu : undefined} />
            ) : (
              <FileGrid files={visibleFiles} onPreview={handlePreview} onShowVersions={handleShowVersions} onFileContextMenu={!isMobile ? showContextMenu : undefined} />
            )}
          </div>

          {/* Only show "load more" when not using virtual grid */}
          {hasMore && sortedFiles.length <= 50 && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {sortedFiles.length - visibleCount} 个文件）
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* File preview dialog */}
      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* File versions dialog */}
      <FileVersions
        file={versionFile}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
      />

      <BatchActions
        open={batchActionsOpen}
        onClose={() => setBatchActionsOpen(false)}
      />

      <ConfirmDialog
        open={batchDeleteConfirm}
        title="批量删除文件"
        description={`确定要删除选中的 ${batchSelectedIds.length} 个文件吗？文件将移入回收站。`}
        onConfirm={() => { batchDeleteFiles(batchSelectedIds); setBatchDeleteConfirm(false); }}
        onCancel={() => setBatchDeleteConfirm(false)}
      />

      {/* Desktop right-click context menu */}
      <FileContextMenu
        file={contextMenu.file}
        position={contextMenu.position}
        onClose={hideContextMenu}
        onPreview={handlePreview}
      />
    </div>
  );
}
