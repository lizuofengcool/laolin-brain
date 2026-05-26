"use client";

import { useState, useMemo } from "react";
import { Calendar, Image as ImageIcon, Grid3X3, Rows3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { formatSize } from "@/lib/file-utils";
import type { FileData } from "@/lib/storage/base";

interface MonthGroup {
  label: string;
  sortKey: string;
  images: FileData[];
}

function formatMonthGroup(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}年${month}月`;
}

export default function AlbumView() {
  const files = useAppStore((s) => s.files);
  const openLightbox = useAppStore((s) => s.openLightbox);

  const [viewMode, setViewMode] = useState<"grid" | "mosaic">("grid");

  const allImages = useMemo(() => {
    return files
      .filter((file) => file.fileType === "image" && !file.isDeleted)
      .sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
  }, [files]);

  const groupedByMonth = useMemo(() => {
    const groups: Map<string, FileData[]> = new Map();

    for (const image of allImages) {
      const date = image.createdAt instanceof Date ? image.createdAt : new Date(image.createdAt);
      const label = formatMonthGroup(date);

      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(image);
    }

    const result: MonthGroup[] = [];
    for (const [label, images] of groups) {
      const date = images[0].createdAt instanceof Date ? images[0].createdAt : new Date(images[0].createdAt);
      const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      result.push({ label, sortKey, images });
    }

    result.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    return result;
  }, [allImages]);

  const handleImageClick = (image: FileData) => {
    openLightbox(allImages, allImages.findIndex((img) => img.id === image.id));
  };

  if (allImages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
          <ImageIcon className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">暂无图片</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          上传图片文件后，它们将自动在此处按时间分组展示，方便你浏览和管理。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">智能相册</h2>
            <p className="text-sm text-muted-foreground">
              共 {allImages.length} 张图片
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-md",
              viewMode === "grid" && "bg-background shadow-sm"
            )}
            onClick={() => setViewMode("grid")}
            title="网格视图"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-md",
              viewMode === "mosaic" && "bg-background shadow-sm"
            )}
            onClick={() => setViewMode("mosaic")}
            title="列表视图"
          >
            <Rows3 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Month Groups */}
      <div className="space-y-8">
        {groupedByMonth.map((group) => (
          <section key={group.sortKey}>
            {/* Group Header */}
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {group.label}
              </h3>
              <Badge variant="secondary" className="text-xs font-normal">
                {group.images.length} 张
              </Badge>
            </div>

            {/* Grid View */}
            {viewMode === "grid" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.images.map((image) => (
                  <div
                    key={image.id}
                    className="group relative rounded-lg overflow-hidden aspect-square cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => handleImageClick(image)}
                  >
                    <img
                      src={image.thumbnailUrl || image.previewUrl || image.filePath}
                      alt={image.fileName}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs text-white font-medium truncate">
                          {image.fileName}
                        </p>
                        <p className="text-[10px] text-white/60 mt-0.5">
                          {formatSize(image.fileSize)}
                        </p>
                      </div>
                    </div>
                    {/* Favorite indicator */}
                    {image.isFavorite && (
                      <div className="absolute top-1.5 right-1.5">
                        <svg
                          className="w-3.5 h-3.5 text-rose-500 drop-shadow"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Mosaic / List View */}
            {viewMode === "mosaic" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.images.map((image) => (
                  <Card
                    key={image.id}
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200 group"
                    onClick={() => handleImageClick(image)}
                  >
                    <CardContent className="p-0">
                      <div className="flex items-center gap-3 p-3">
                        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                          <img
                            src={image.thumbnailUrl || image.filePath}
                            alt={image.fileName}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">
                            {image.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatSize(image.fileSize)}
                          </p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {image.fileType.split("/")[1]?.toUpperCase() || image.fileType.toUpperCase()}
                            </Badge>
                            {image.tags.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {image.tags[0]}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {image.isFavorite && (
                          <svg
                            className="w-4 h-4 text-rose-500 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

    </div>
  );
}
