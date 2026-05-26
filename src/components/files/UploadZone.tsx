"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Cloud, HardDrive } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  className?: string;
}

export function UploadZone({ className }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { user, storageMode, addFile, refreshFiles } = useAppStore();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!user || acceptedFiles.length === 0) return;
      setUploading(true);
      setProgress(0);

      const total = acceptedFiles.length;
      let completed = 0;

      for (const file of acceptedFiles) {
        if (file.size > 50 * 1024 * 1024) {
          completed++;
          continue;
        }

        try {
          if (storageMode === "cloud") {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userId", user.id);

            const res = await fetch("/api/files/upload", {
              method: "POST",
              body: formData,
            });

            if (res.ok) {
              const data = await res.json();
              addFile({
                id: data.id,
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize,
                filePath: data.filePath,
                textContent: data.textContent,
                thumbnailUrl: data.thumbnailUrl,
                storageMode: "cloud",
                folderId: undefined,
                tags: [],
                isFavorite: false,
                createdAt: new Date(),
              });
            }
          } else {
            // Local mode - use IndexedDB adapter directly
            const { getStorageAdapter, resetAdapter } = await import(
              "@/lib/storage/factory"
            );
            resetAdapter();
            const adapter = getStorageAdapter("local");
            const result = await adapter.uploadFile(file, user.id);
            addFile({
              id: result.id,
              fileName: result.fileName,
              fileType: result.fileType,
              fileSize: result.fileSize,
              filePath: result.filePath,
              textContent: result.textContent,
              thumbnailUrl: result.thumbnailUrl,
              storageMode: "local",
              folderId: undefined,
              tags: [],
              isFavorite: false,
              createdAt: new Date(),
            });
          }
        } catch (err) {
          console.error("Upload failed:", err);
        }

        completed++;
        setProgress(Math.round((completed / total) * 100));
      }

      setUploading(false);
      setProgress(0);
      refreshFiles();
    },
    [user, storageMode, addFile, refreshFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
        isDragActive
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        uploading && "pointer-events-none opacity-60",
        className
      )}
    >
      <input {...getInputProps()} />

      {uploading ? (
        <div className="space-y-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload className="h-5 w-5 text-primary animate-bounce" />
          </div>
          <div>
            <p className="text-sm font-medium">上传中... {progress}%</p>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden max-w-xs mx-auto">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
            {storageMode === "cloud" ? (
              <Cloud className="h-6 w-6 text-muted-foreground" />
            ) : (
              <HardDrive className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragActive ? "松开以上传文件" : "拖拽文件到此处，或点击上传"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              支持 Word、PDF、图片，单文件最大 50MB
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {storageMode === "cloud" ? "☁️ 云端存储" : "💾 本地存储"}
          </p>
        </div>
      )}
    </div>
  );
}
