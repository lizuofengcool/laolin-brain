"use client";

import { useMemo } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Image as ImageIcon, FileText, File, Presentation, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSize, getFileColor, FileIconDisplay } from "@/lib/file-utils";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Download, X, Loader2, HardDrive, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimelineGroup {
  yearMonth: string;
  label: string;
  files: FileData[];
}

export function TimelineView() {
  const { files } = useAppStore();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { storageMode } = useAppStore();

  const groups = useMemo(() => {
    const map = new Map<string, FileData[]>();

    const sorted = [...files].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const file of sorted) {
      const d = new Date(file.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(file);
    }

    const result: TimelineGroup[] = [];
    for (const [yearMonth, groupFiles] of map) {
      const d = new Date(groupFiles[0].createdAt);
      result.push({
        yearMonth,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
        files: groupFiles,
      });
    }

    return result;
  }, [files]);

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleDownload = async () => {
    if (!previewFile) return;
    setDownloading(true);
    try {
      if (storageMode === "cloud") {
        const res = await fetch(`/api/files/${previewFile.id}/download`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = previewFile.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else {
        const { openDB } = await import("idb");
        const db = await openDB("knowledge-base-db", 1);
        const record = await db.get("files", previewFile.id);
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
          a.download = previewFile.fileName;
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

  if (files.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">时间线</h1>
          <p className="text-muted-foreground text-sm mt-1">
            按时间浏览你的文件
          </p>
        </div>
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays className="h-16 w-16 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">暂无文件</p>
          <p className="text-xs mt-1">上传文件后，这里会按时间线展示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">时间线</h1>
        <p className="text-muted-foreground text-sm mt-1">
          按时间浏览你的所有文件
        </p>
      </div>

      <div className="relative space-y-8">
        {/* Vertical timeline line */}
        <div className="absolute left-4 md:left-6 top-0 bottom-0 w-px bg-border hidden sm:block" />

        {groups.map((group) => (
          <motion.div
            key={group.yearMonth}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Month header */}
            <div className="flex items-center gap-3 mb-4 relative">
              <div className="relative z-10 h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm hidden sm:flex">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{group.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {group.files.length} 个文件
                </p>
              </div>
            </div>

            {/* Files grid */}
            <div className="ml-0 sm:ml-16 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {group.files.map((file) => {
                const colorClass = getFileColor(file.fileType);
                const hasAITags = file.tags && file.tags.length > 0;

                return (
                  <motion.div
                    key={file.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card
                      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handlePreview(file)}
                    >
                      <div
                        className={cn(
                          "h-24 flex items-center justify-center bg-muted/50 relative",
                          file.fileType === "image" && file.thumbnailUrl && "bg-muted/30"
                        )}
                      >
                        {file.fileType === "image" && file.thumbnailUrl ? (
                          <img
                            src={file.thumbnailUrl}
                            alt={file.fileName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className={cn(
                              "h-10 w-10 rounded-lg flex items-center justify-center",
                              colorClass
                            )}
                          >
                            <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
                          </div>
                        )}
                        {hasAITags && (
                          <Badge
                            variant="secondary"
                            className="absolute top-1 left-1 text-[9px] bg-primary/90 text-primary-foreground hover:bg-primary/90 px-1"
                          >
                            AI
                          </Badge>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{file.fileName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatSize(file.fileSize)} · {new Date(file.createdAt).getDate()}日
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* File Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={() => setPreviewOpen(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileIconDisplay fileType={previewFile?.fileType || "other"} className="h-5 w-5" />
              {previewFile?.fileName}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 border flex items-center justify-center min-h-[200px] overflow-hidden">
                {previewFile.fileType === "image" && previewFile.thumbnailUrl ? (
                  <img
                    src={previewFile.thumbnailUrl}
                    alt={previewFile.fileName}
                    className="max-w-full max-h-[400px] object-contain"
                  />
                ) : previewFile.textContent ? (
                  <div className="p-4 w-full max-h-[400px] overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {previewFile.textContent.slice(0, 5000)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileIconDisplay fileType={previewFile.fileType} className="h-16 w-16 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">无法预览此文件</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  {formatSize(previewFile.fileSize)}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {new Date(previewFile.createdAt).toLocaleDateString("zh-CN")}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className={cn("h-4 w-4", previewFile.isFavorite && "fill-yellow-400 text-yellow-400")} />
                  {previewFile.isFavorite ? "已收藏" : "未收藏"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  {previewFile.fileType.toUpperCase()}
                </div>
              </div>
              {previewFile.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">标签：</span>
                  {previewFile.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" disabled={downloading} onClick={handleDownload}>
                  {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  下载
                </Button>
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  <X className="h-4 w-4 mr-2" />
                  关闭
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
