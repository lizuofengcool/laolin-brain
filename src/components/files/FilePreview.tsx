"use client";

import { useState } from "react";
import type { FileData } from "@/lib/storage/base";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Star,
  Calendar,
  HardDrive,
  X,
  Sparkles,
  Loader2,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { formatSize, FileIconDisplay } from "@/lib/file-utils";

interface FilePreviewProps {
  file: FileData | null;
  open: boolean;
  onClose: () => void;
}

export function FilePreview({ file, open, onClose }: FilePreviewProps) {
  const { setAiChatFile, storageMode, openLightbox, files } = useAppStore();
  const [downloading, setDownloading] = useState(false);

  if (!file) return null;

  const handleDownload = async () => {
    if (!file) return;
    setDownloading(true);

    try {
      if (storageMode === "cloud") {
        const res = await fetch(`/api/files/${file.id}/download`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else {
        const { openDB } = await import("idb");
        const db = await openDB("knowledge-base-db", 1);
        const record = await db.get("files", file.id);
        if (record && record.data) {
          const binaryStr = atob(record.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenLightbox = () => {
    // Get all images from current files list
    const allImages = files.filter((f) => f.fileType === "image" && !f.isDeleted && f.thumbnailUrl);
    const currentIndex = allImages.findIndex((f) => f.id === file.id);
    openLightbox(allImages, currentIndex >= 0 ? currentIndex : 0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
            {file.fileName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview area */}
          <div className="rounded-lg bg-muted/50 border flex items-center justify-center min-h-[200px] overflow-hidden relative group">
            {file.fileType === "image" && file.thumbnailUrl ? (
              <>
                <img
                  src={file.thumbnailUrl}
                  alt={file.fileName}
                  className="max-w-full max-h-[400px] object-contain cursor-zoom-in"
                  onClick={handleOpenLightbox}
                />
                {/* Enlarge overlay button */}
                <button
                  className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                  onClick={handleOpenLightbox}
                  title="放大查看"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </>
            ) : file.textContent ? (
              <div className="p-4 w-full max-h-[400px] overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {file.textContent.slice(0, 5000)}
                  {file.textContent.length > 5000 && (
                    <span className="text-muted-foreground">
                      {"\n\n"}... (内容过长，仅显示前 5000 字)
                    </span>
                  )}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileIconDisplay fileType={file.fileType} className="h-16 w-16 mx-auto mb-3 opacity-30" />
                <p className="text-sm">无法预览此文件</p>
              </div>
            )}
          </div>

          {/* File info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              {formatSize(file.fileSize)}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(file.createdAt).toLocaleDateString("zh-CN")}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star
                className={cn(
                  "h-4 w-4",
                  file.isFavorite
                    ? "fill-yellow-400 text-yellow-400"
                    : ""
                )}
              />
              {file.isFavorite ? "已收藏" : "未收藏"}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              {file.fileType.toUpperCase()}
            </div>
          </div>

          {/* Tags */}
          {file.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">标签：</span>
              {file.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {file.fileType === "image" && file.thumbnailUrl && (
              <Button
                variant="default"
                className="flex-1"
                onClick={handleOpenLightbox}
              >
                <Maximize2 className="h-4 w-4 mr-2" />
                放大查看
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setAiChatFile(file);
              }}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              AI 解读
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              下载
            </Button>
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
