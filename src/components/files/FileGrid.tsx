"use client";

import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { FileCard, FileListItem } from "./FileCard";
import { LayoutGrid, List, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileGridProps {
  files: FileData[];
  onPreview: (file: FileData) => void;
}

export function FileGrid({ files, onPreview }: FileGridProps) {
  const { fileViewMode, setFileViewMode } = useAppStore();

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center justify-end mb-4 gap-2">
        <Button
          variant={fileViewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setFileViewMode("grid")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={fileViewMode === "list" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setFileViewMode("list")}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">暂无文件</p>
          <p className="text-xs mt-1">拖拽文件到此处或点击上传按钮</p>
        </div>
      ) : fileViewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map((file) => (
            <FileCard key={file.id} file={file} onPreview={onPreview} />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {files.map((file) => (
            <FileListItem key={file.id} file={file} onPreview={onPreview} />
          ))}
        </div>
      )}
    </div>
  );
}
