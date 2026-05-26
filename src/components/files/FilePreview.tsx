"use client";

import type { FileData } from "@/lib/storage/base";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Image as ImageIcon,
  File,
  Download,
  Star,
  Calendar,
  HardDrive,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface FilePreviewProps {
  file: FileData | null;
  open: boolean;
  onClose: () => void;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

function FileIconDisplay({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType === "word") return <FileText className={className} />;
  if (fileType === "image") return <ImageIcon className={className} />;
  if (fileType === "pdf") return <File className={className} />;
  return <File className={className} />;
}

export function FilePreview({ file, open, onClose }: FilePreviewProps) {
  const { setAiChatFile } = useAppStore();

  if (!file) return null;

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
          <div className="rounded-lg bg-muted/50 border flex items-center justify-center min-h-[200px] overflow-hidden">
            {file.fileType === "image" && file.thumbnailUrl ? (
              <img
                src={file.thumbnailUrl}
                alt={file.fileName}
                className="max-w-full max-h-[400px] object-contain"
              />
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
              <FileText className="h-4 w-4" />
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
            <Button variant="outline" className="flex-1" disabled>
              <Download className="h-4 w-4 mr-2" />
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
