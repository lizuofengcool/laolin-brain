"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileData, FileVersionData } from "@/lib/storage/base";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  RotateCcw,
  Download,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { formatSize } from "@/lib/file-utils";
import { useAppStore } from "@/stores/app-store";
import { getStorageAdapter } from "@/lib/storage/factory";
import { toast } from "@/hooks/use-toast";

interface FileVersionsProps {
  file: FileData | null;
  open: boolean;
  onClose: () => void;
}

export function FileVersions({ file, open, onClose }: FileVersionsProps) {
  const { storageMode, user, updateFile, refreshFiles } = useAppStore();
  const [versions, setVersions] = useState<FileVersionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [diffVersion, setDiffVersion] = useState<FileVersionData | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!file || !user) return;
    setLoading(true);
    try {
      const adapter = getStorageAdapter(storageMode);
      if (adapter.getVersions) {
        const v = await adapter.getVersions(file.id, user.id);
        setVersions(v);
      } else {
        // Fallback: fetch from API
        const res = await fetch(`/api/files/${file.id}/versions`);
        if (res.ok) {
          const data = await res.json();
          setVersions(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch versions:", err);
    } finally {
      setLoading(false);
    }
  }, [file, user, storageMode]);

  useEffect(() => {
    if (open && file) {
      fetchVersions();
    } else {
      setVersions([]);
      setDiffVersion(null);
    }
  }, [open, file, fetchVersions]);

  const handleRestore = async (version: FileVersionData) => {
    if (!file || !user) return;
    setRestoring(version.id);
    try {
      const adapter = getStorageAdapter(storageMode);
      if (adapter.restoreVersion) {
        await adapter.restoreVersion(version.id, file.id, user.id);
      } else {
        // Fallback: use API
        const res = await fetch(`/api/files/${version.id}/versions/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id }),
        });
        if (!res.ok) throw new Error("Restore failed");
      }

      // Update local state
      updateFile(file.id, {
        fileName: version.fileName,
        fileSize: version.fileSize,
        filePath: version.filePath,
        textContent: version.textContent,
        thumbnailUrl: version.thumbnailUrl,
      });

      await refreshFiles();
      toast({
        title: "版本已恢复",
        description: `已恢复到第 ${version.version} 版`,
      });
    } catch (err) {
      console.error("Restore failed:", err);
      toast({
        title: "恢复失败",
        description: "无法恢复此版本",
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (version: FileVersionData) => {
    if (!file || !user) return;
    setDeleting(version.id);
    try {
      const adapter = getStorageAdapter(storageMode);
      if (adapter.deleteVersion) {
        await adapter.deleteVersion(version.id, file.id, user.id);
      } else {
        // Fallback: use API
        const res = await fetch(
          `/api/files/${file.id}/versions?versionId=${version.id}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Delete failed");
      }
      setVersions((prev) => prev.filter((v) => v.id !== version.id));
      toast({ title: "版本已删除" });
    } catch (err) {
      console.error("Delete failed:", err);
      toast({
        title: "删除失败",
        description: "无法删除此版本",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeShort = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!file) return null;

  const currentVersion: FileVersionData = {
    id: "current",
    fileId: file.id,
    fileName: file.fileName,
    fileSize: file.fileSize,
    filePath: file.filePath,
    textContent: file.textContent,
    thumbnailUrl: file.thumbnailUrl,
    version: (versions.length > 0 ? Math.max(...versions.map((v) => v.version)) : 0) + 1,
    createdAt: typeof file.createdAt === "string" ? file.createdAt : new Date(file.createdAt).toISOString(),
  };

  const allEntries = [currentVersion, ...versions];

  // Diff view for text files
  const isTextDiff = diffVersion && currentVersion.textContent && diffVersion.textContent;

  return (
    <Dialog open={open} onOpenChange={() => { setDiffVersion(null); onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            版本历史
          </DialogTitle>
        </DialogHeader>

        {diffVersion && isTextDiff ? (
          /* Text Diff View */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setDiffVersion(null)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                返回版本列表
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="text-xs">v{currentVersion.version}</Badge>
                <span>vs</span>
                <Badge variant="outline" className="text-xs">v{diffVersion.version}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b">
                  <span className="text-xs font-medium">
                    当前版本 (v{currentVersion.version})
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatTimeShort(currentVersion.createdAt)}
                  </span>
                </div>
                <ScrollArea className="max-h-[400px]">
                  <pre className="p-3 text-xs whitespace-pre-wrap font-mono">
                    {currentVersion.textContent!.slice(0, 3000)}
                    {currentVersion.textContent!.length > 3000 && "\n...(内容已截断)"}
                  </pre>
                </ScrollArea>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b">
                  <span className="text-xs font-medium">
                    版本 v{diffVersion.version}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatTimeShort(diffVersion.createdAt)}
                  </span>
                </div>
                <ScrollArea className="max-h-[400px]">
                  <pre className="p-3 text-xs whitespace-pre-wrap font-mono">
                    {diffVersion.textContent!.slice(0, 3000)}
                    {diffVersion.textContent!.length > 3000 && "\n...(内容已截断)"}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : (
          /* Version List View */
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">加载版本历史...</span>
              </div>
            ) : allEntries.length <= 1 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">暂无历史版本</p>
                <p className="text-xs mt-1">重新上传同名文件时将自动创建版本</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2 pr-4">
                  {allEntries.map((entry, index) => {
                    const isCurrent = index === 0;
                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          isCurrent ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"
                        )}
                      >
                        {/* Version badge */}
                        <div className="shrink-0">
                          <Badge
                            variant={isCurrent ? "default" : "outline"}
                            className="font-mono text-xs"
                          >
                            v{entry.version}
                          </Badge>
                        </div>

                        {/* Version info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate" title={entry.fileName}>
                              {entry.fileName}
                            </p>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                当前
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(entry.createdAt)}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              {formatSize(entry.fileSize)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* View diff for text files */}
                          {isCurrent && entry.textContent && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="对比版本"
                              onClick={() => {
                                // Compare current with the next (latest historical) version
                                const latestHistorical = versions[0];
                                if (latestHistorical) {
                                  setDiffVersion(latestHistorical);
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}

                          {!isCurrent && (
                            <>
                              {/* Restore */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                disabled={restoring === entry.id}
                                onClick={() => handleRestore(entry)}
                              >
                                {restoring === entry.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                                恢复
                              </Button>

                              {/* Compare with current */}
                              {entry.textContent && currentVersion.textContent && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="与当前版本对比"
                                  onClick={() => setDiffVersion(entry)}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Delete */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={deleting === entry.id}
                                onClick={() => handleDelete(entry)}
                                title="删除此版本"
                              >
                                {deleting === entry.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              共 {allEntries.length} 个版本（含当前版本）
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
