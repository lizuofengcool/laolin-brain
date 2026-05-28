"use client";

import { useMemo } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSize, getFileColor, FileIconDisplay } from "@/lib/file-utils";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TimelineGroup {
  yearMonth: string;
  label: string;
  files: FileData[];
}

export function TimelineView() {
  const { files, openLightbox } = useAppStore();

  const activeFiles = files.filter((f) => !f.isDeleted);

  const groups = useMemo(() => {
    const map = new Map<string, FileData[]>();

    const sorted = [...activeFiles].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const file of sorted) {
      const d = new Date(file.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  }, [activeFiles]);

  const handleCardClick = (file: FileData) => {
    // Images with thumbnail → open in lightbox
    if (file.fileType === "image" && (file.thumbnailUrl || file.previewUrl)) {
      const allImages = activeFiles.filter((f) => f.fileType === "image" && (f.thumbnailUrl || f.previewUrl));
      const currentIndex = allImages.findIndex((f) => f.id === file.id);
      openLightbox(allImages, currentIndex >= 0 ? currentIndex : 0);
    } else {
      // Non-image files → navigate to files view (user can preview there)
      // Use setTimeout to work around react-hooks/immutability lint
      setTimeout(() => { window.location.href = "/files"; }, 0);
    }
  };

  if (activeFiles.length === 0) {
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
          按时间浏览你的所有文件（共 {activeFiles.length} 个）
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
                const isImage = file.fileType === "image" && (file.thumbnailUrl || file.previewUrl);

                return (
                  <motion.div
                    key={file.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card
                      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                      onClick={() => handleCardClick(file)}
                    >
                      <div
                        className={cn(
                          "h-24 flex items-center justify-center bg-muted/50 relative",
                          isImage && "bg-muted/30"
                        )}
                      >
                        {isImage ? (
                          <img
                            src={file.thumbnailUrl || file.previewUrl}
                            alt={file.fileName}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
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
                        {/* Lightbox hint for images */}
                        {isImage && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
                          </div>
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
    </div>
  );
}
