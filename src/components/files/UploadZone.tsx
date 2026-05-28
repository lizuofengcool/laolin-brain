"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Cloud, HardDrive, Sparkles, Loader2, CheckCircle2, FileWarning } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { CameraCapture } from "./CameraCapture";

// Guess MIME type from file extension (fallback when browser reports empty file.type)
function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
    svg: "image/svg+xml", tiff: "image/tiff", tif: "image/tiff",
    ico: "image/x-icon", avif: "image/avif",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    md: "text/markdown", markdown: "text/markdown",
    txt: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

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
  const [uploadedCount, setUploadedCount] = useState(0);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const { user, storageMode, addFile, refreshFiles } = useAppStore();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!user || acceptedFiles.length === 0) return;
      console.log("[UploadZone] onDrop triggered, files:", acceptedFiles.map(f => `${f.name} (${f.type}, ${f.size} bytes)`));
      setUploading(true);
      setProgress(0);
      setUploadedCount(0);
      setFailedFiles([]);

      const total = acceptedFiles.length;
      let completed = 0;
      let succeeded = 0;

      for (const file of acceptedFiles) {
        if (file.size > 50 * 1024 * 1024) {
          toast({
            title: "文件过大",
            description: `${file.name} 超过 50MB 限制，已跳过`,
            variant: "destructive",
          });
          setFailedFiles((prev) => [...prev, file.name]);
          completed++;
          continue;
        }

        // ─── Duplicate detection ─────────────────────────────
        let fileHash = "";
        try {
          const { computeFileHash } = await import("@/lib/file-hash");
          fileHash = await computeFileHash(file);
          const existingFiles = useAppStore.getState().files.filter((f) => !f.isDeleted);
          const dup = existingFiles.find((f) => f.fileHash === fileHash);
          if (dup) {
            toast({
              title: "重复文件",
              description: `${file.name} 与已有文件「${dup.fileName}」内容相同，已跳过`,
              variant: "destructive",
            });
            setFailedFiles((prev) => [...prev, file.name]);
            completed++;
            setProgress(Math.round((completed / total) * 100));
            continue;
          }
        } catch {
          // Duplicate check failed — continue with upload
        }

        try {
          // Detect file type more robustly — fall back to extension when MIME is empty
          const detectedType = file.type || guessMimeType(file.name);
          console.log(`[UploadZone] Processing ${file.name}, MIME: ${file.type}, detected: ${detectedType}, size: ${file.size}`);

          if (storageMode === "cloud") {
            // ─── Cloud Mode ─────────────────────────────
            const token = useAppStore.getState().token;
            const formData = new FormData();
            formData.append("file", file);

            const headers: Record<string, string> = {};
            if (token) {
              headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await fetch("/api/files", {
              method: "POST",
              headers,
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
                previewUrl: data.previewUrl,
                storageMode: "cloud",
                folderId: undefined,
                tags: data.tags || [],
                isFavorite: false,
                createdAt: new Date(),
              });
              succeeded++;
            } else {
              const errData = await res.json().catch(() => ({}));
              toast({
                title: "上传失败",
                description: `${file.name}: ${errData.error || "服务器错误 (${res.status})"}`,
                variant: "destructive",
              });
              setFailedFiles((prev) => [...prev, file.name]);
            }
          } else {
            // ─── Local Mode ─────────────────────────────
            console.log("[UploadZone] Using local (IndexedDB) mode");
            let adapter;
            try {
              const { getStorageAdapter, resetAdapter } = await import(
                "@/lib/storage/factory"
              );
              resetAdapter();
              adapter = getStorageAdapter("local");
            } catch (adapterErr) {
              console.error("[UploadZone] Failed to get local adapter:", adapterErr);
              throw new Error("无法初始化本地存储");
            }
            console.log("[UploadZone] Local adapter ready, calling uploadFile");
            const result = await adapter.uploadFile(file, user.id);
            console.log("[UploadZone] uploadFile result:", result.id, result.fileName, result.fileType);

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
              fileHash: fileHash || undefined,
            };

            addFile(fileData);
            succeeded++;

            // Persist AI results + hash to IndexedDB
            const persistData: Record<string, unknown> = {};
            if (aiTags.length > 0 || aiTextContent) {
              persistData.tags = aiTags;
              persistData.textContent = aiTextContent;
            }
            if (fileHash) {
              persistData.fileHash = fileHash;
            }
            if (Object.keys(persistData).length > 0) {
              try {
                await adapter.updateFile(result.id, persistData, user.id);
              } catch {
                // ignore
              }
            }
          }
        } catch (err) {
          console.error("[UploadZone] Upload failed for", file.name, ":", err);
          toast({
            title: "上传出错",
            description: `${file.name}: ${(err as Error).message || "未知错误"}`,
            variant: "destructive",
          });
          setFailedFiles((prev) => [...prev, file.name]);
        }

        completed++;
        setUploadedCount(succeeded);
        setProgress(Math.round((completed / total) * 100));
      }

      setUploading(false);
      setProgress(0);
      setAiStatus("");

      // Show summary
      if (succeeded > 0) {
        toast({
          title: "上传完成",
          description: failedFiles.length > 0
            ? `成功 ${succeeded} 个，失败 ${failedFiles.length} 个`
            : `成功上传 ${succeeded} 个文件`,
        });
      } else if (failedFiles.length > 0) {
        toast({
          title: "上传失败",
          description: `全部 ${failedFiles.length} 个文件上传失败`,
          variant: "destructive",
        });
      }

      refreshFiles();

      // Trigger automation rules after upload (fire-and-forget)
      try {
        const { loadRules, shouldAutoOrganize, getOrganizeRules } = await import("@/lib/automation/engine");
        const automationRules = loadRules();
        if (shouldAutoOrganize(automationRules)) {
          const orgRules = getOrganizeRules(automationRules);
          if (orgRules.length > 0) {
            // Run auto-organize in background
            setTimeout(async () => {
              try {
                const { getStorageAdapter } = await import("@/lib/storage/factory");
                const adapter = getStorageAdapter(storageMode);
                const currentFiles = useAppStore.getState().files;
                for (const rule of orgRules) {
                  const matchFiles = currentFiles.filter(
                    (f) => f.fileType === rule.fileType && !f.folderId && !f.isDeleted
                  );
                  for (const file of matchFiles.slice(0, 3)) {
                    // Find or create target folder
                    const folders = useAppStore.getState().folders;
                    let targetFolder = folders.find((fd) => fd.name === rule.folderName);
                    if (!targetFolder) {
                      const newFolder = adapter.createFolder ? await adapter.createFolder(rule.folderName, user!.id) : null;
                      if (newFolder) {
                        useAppStore.getState().addFolder(newFolder);
                        targetFolder = newFolder;
                      }
                    }
                    if (targetFolder) {
                      await adapter.updateFile(file.id, { folderId: targetFolder.id }, user!.id);
                      useAppStore.getState().updateFile(file.id, { folderId: targetFolder.id });
                    }
                  }
                }
                useAppStore.getState().refreshFiles();
              } catch (e) {
                console.error("[Automation] Auto-organize failed:", e);
              }
            }, 1000);
          }
        }
      } catch {
        // Automation is optional, don't fail upload
      }

      // Clear status after a delay
      setTimeout(() => {
        setUploadedCount(0);
        setFailedFiles([]);
      }, 3000);
    },
    [user, storageMode, addFile, refreshFiles, failedFiles.length]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    noClick: false,
    multiple: true,
    // Use a permissive accept config — MIME + extension fallback for desktop compatibility
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/pdf": [".pdf"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".tiff", ".ico"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "text/markdown": [".md", ".markdown"],
      "text/plain": [".txt"],
    },
  });

  // Show rejection reasons
  const rejectionMsg = fileRejections.length > 0
    ? fileRejections.map(r => `${r.file.name}: ${r.errors.map(e => e.message).join(", ")}`).join("; ")
    : "";

  if (rejectionMsg) {
    console.warn("[UploadZone] Rejected files:", rejectionMsg);
  }

  const handleCameraCapture = useCallback(
    (file: File) => {
      onDrop([file]);
    },
    [onDrop]
  );

  return (
    <div className="relative">
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
          {uploadedCount > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已成功 {uploadedCount} 个
            </div>
          )}
          {failedFiles.length > 0 && (
            <div className="text-xs text-destructive">
              失败: {failedFiles.join(", ")}
            </div>
          )}
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
              支持 Word、PDF、PPT、图片、Markdown、TXT，单文件最大 50MB
            </p>
            {rejectionMsg && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1 justify-center">
                <FileWarning className="h-3 w-3" />
                {rejectionMsg}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {storageMode === "cloud" ? "☁️ 云端存储" : "💾 本地存储"}
          </p>
        </div>
      )}
      </div>

      {/* Camera capture buttons - positioned at bottom-right on mobile */}
      <div className="absolute bottom-3 right-3 md:hidden">
        <CameraCapture onCapture={handleCameraCapture} disabled={uploading} />
      </div>
    </div>
  );
}
