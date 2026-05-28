"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { FileGrid } from "@/components/files/FileGrid";
import { FilePreview } from "@/components/files/FilePreview";
import { FileVersions } from "@/components/files/FileVersions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowUpDown } from "lucide-react";

const TYPE_GROUP_LABELS: Record<string, string> = {
  image: "图片",
  document: "文档",
  note: "笔记",
  other: "其他",
};

export function FavoritesViewContent() {
  const { files, refreshFiles } = useAppStore();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [versionFile, setVersionFile] = useState<FileData | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const favFiles = useMemo(() => {
    const sorted = files.filter((f) => f.isFavorite && !f.isDeleted);
    if (sortBy === "name") {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [files, sortBy]);

  // Group favorites by file type
  const groupedFavs = useMemo(() => {
    const groups: Record<string, typeof favFiles> = {};
    const visible = favFiles.slice(0, visibleCount);
    for (const f of visible) {
      const type = f.fileType === "image" ? "image" :
                   f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx" ? "document" :
                   f.fileType === "markdown" || f.fileType === "txt" ? "note" : "other";
      if (!groups[type]) groups[type] = [];
      groups[type].push(f);
    }
    return groups;
  }, [favFiles, visibleCount]);

  const visibleFiles = favFiles.slice(0, visibleCount);
  const hasMore = visibleCount < favFiles.length;

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleShowVersions = (file: FileData) => {
    setVersionFile(file);
    setVersionsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">收藏夹</h1>
          <p className="text-muted-foreground text-sm mt-1">
            你标记为重要和收藏的文件
          </p>
        </div>
        {favFiles.length > 0 && (
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label="排序方式"
              className="text-sm border rounded-md px-2 py-1 bg-background"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "name")}
            >
              <option value="date">按日期</option>
              <option value="name">按名称</option>
            </select>
          </div>
        )}
      </div>

      {favFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">暂无收藏</p>
          <p className="text-xs mt-1">点击文件卡片上的星标来收藏文件</p>
        </div>
      ) : (
        <>
          {/* Grouped favorites */}
          {Object.entries(groupedFavs).map(([groupType, groupFiles]) => (
            <div key={groupType} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{TYPE_GROUP_LABELS[groupType] || groupType}</h3>
                <Badge variant="secondary" className="text-xs">{groupFiles.length}</Badge>
              </div>
              <FileGrid files={groupFiles} onPreview={handlePreview} onShowVersions={handleShowVersions} />
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {favFiles.length - visibleFiles.length} 个文件）
              </Button>
            </div>
          )}
        </>
      )}

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <FileVersions
        file={versionFile}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
      />
    </div>
  );
}
