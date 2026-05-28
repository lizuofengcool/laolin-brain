"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { FilePreview } from "@/components/files/FilePreview";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";

export function RecycleBinViewContent() {
  const { files, restoreFile, permanentDeleteFile, emptyRecycleBin } = useAppStore();
  const [visibleCount, setVisibleCount] = useState(20);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"deletedAt" | "name">("deletedAt");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [emptyConfirm, setEmptyConfirm] = useState(false);

  const deletedFiles = useMemo(() => {
    const sorted = files.filter((f) => f.isDeleted);
    if (sortBy === "name") {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    } else {
      sorted.sort((a, b) => {
        const dateA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
        const dateB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    return sorted;
  }, [files, sortBy]);

  const visibleFiles = deletedFiles.slice(0, visibleCount);
  const hasMore = visibleCount < deletedFiles.length;

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleRestore = async (id: string) => {
    await restoreFile(id);
  };

  const handlePermanentDelete = async (id: string) => {
    await permanentDeleteFile(id);
    setDeleteConfirmId(null);
  };

  const handleEmptyRecycleBin = async () => {
    await emptyRecycleBin();
    setEmptyConfirm(false);
  };

  const formatDeletedAt = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">回收站</h1>
          <p className="text-muted-foreground text-sm mt-1">
            已删除的文件可以恢复或永久删除
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deletedFiles.length > 0 && (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <select
                aria-label="排序方式"
                className="text-sm border rounded-md px-2 py-1 bg-background"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "deletedAt" | "name")}
              >
                <option value="deletedAt">按删除时间</option>
                <option value="name">按名称</option>
              </select>
            </div>
          )}
          {deletedFiles.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setEmptyConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              清空回收站
            </Button>
          )}
        </div>
      </div>

      {deletedFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">回收站为空</p>
          <p className="text-xs mt-1">删除的文件会出现在这里</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {visibleFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
            >
              {/* Thumbnail / Icon */}
              {file.fileType === "image" && (file.thumbnailUrl || file.previewUrl) ? (
                <img
                  src={file.thumbnailUrl || file.previewUrl}
                  alt={file.fileName}
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", getFileColor(file.fileType))}>
                  <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.fileSize)} · {file.deletedAt ? formatDeletedAt(file.deletedAt) : "已删除"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreview(file)}
                >
                  预览
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(file.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  恢复
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirmId(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {deletedFiles.length - visibleFiles.length} 个文件）
              </Button>
            </div>
          )}
        </div>
      )}

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="永久删除文件"
        description="确定要永久删除此文件吗？此操作不可恢复。"
        onConfirm={() => deleteConfirmId && handlePermanentDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <ConfirmDialog
        open={emptyConfirm}
        title="清空回收站"
        description={`确定要永久删除回收站中的 ${deletedFiles.length} 个文件吗？此操作不可恢复。`}
        onConfirm={handleEmptyRecycleBin}
        onCancel={() => setEmptyConfirm(false)}
      />
    </div>
  );
}
