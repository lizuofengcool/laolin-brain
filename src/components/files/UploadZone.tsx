"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Cloud, HardDrive, Sparkles, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface UploadZoneProps {
  className?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadZone({ className }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [aiStatus, setAiStatus] = useState("");
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
          toast({
            title: "文件过大",
            description: `${file.name} 超过 50MB 限制，已跳过`,
            variant: "destructive",
          });
          completed++;
          continue;
        }

        try {
          if (storageMode === "cloud") {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userId", user.id);

            const res = await fetch("/api/files", {
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
                tags: data.tags || [],
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

            // AI processing for images in local mode
            let aiTags: string[] = [];
            let aiTextContent = result.textContent;

            if (result.fileType === "image") {
              try {
                setAiStatus("AI 正在分析图片...");
                const base64 = await fileToBase64(file);
                const aiRes = await fetch("/api/ai/process-image", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64: base64 }),
                });

                if (aiRes.ok) {
                  const aiData = await aiRes.json();
                  if (aiData.ocrText) {
                    aiTextContent = aiData.ocrText;
                  }
                  if (aiData.tags && aiData.tags.length > 0) {
                    aiTags = aiData.tags;
                  }
                }
              } catch {
                // AI processing failed, continue without AI data
              }
              setAiStatus("");
            }

            const fileData = {
              id: result.id,
              fileName: result.fileName,
              fileType: result.fileType,
              fileSize: result.fileSize,
              filePath: result.filePath,
              textContent: aiTextContent,
              thumbnailUrl: result.thumbnailUrl,
              storageMode: "local",
              folderId: undefined,
              tags: aiTags,
              isFavorite: false,
              createdAt: new Date() as Date,
            };

            addFile(fileData);

            // Persist AI results to IndexedDB
            if (aiTags.length > 0 || aiTextContent) {
              try {
                await adapter.updateFile(result.id, { tags: aiTags, textContent: aiTextContent }, user.id);
              } catch {
                // ignore
              }
            }
          }
        } catch (err) {
          console.error("Upload failed:", err);
        }

        completed++;
        setProgress(Math.round((completed / total) * 100));
      }

      setUploading(false);
      setProgress(0);
      setAiStatus("");
      refreshFiles();
    },
    [user, storageMode, addFile, refreshFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    multiple: true,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/pdf": [".pdf"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
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
          {aiStatus && (
            <div className="flex items-center justify-center gap-2 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              <Sparkles className="h-3 w-3" />
              {aiStatus}
            </div>
          )}
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
              支持 Word、PDF、PPT、图片，单文件最大 50MB
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
