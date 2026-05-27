"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  History,
  RotateCcw,
  Trash2,
  Eye,
  Calendar,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  GitCompareArrows,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatSize } from "@/lib/file-utils";
import { useAppStore } from "@/stores/app-store";
import { getStorageAdapter } from "@/lib/storage/factory";
import { toast } from "@/hooks/use-toast";
import { DiffViewer } from "@/components/files/DiffViewer";
import { cn } from "@/lib/utils";

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

  // Checkbox selection for custom diff
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Diff view state: "none" | "quick" (current vs one) | "custom" (two selected)
  const [diffMode, setDiffMode] = useState<"none" | "quick" | "custom">("none");
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
      setDiffMode("none");
      setSelectedIds(new Set());
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

  // ── Checkbox logic ──────────────────────────────────────────────

  const toggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else if (next.size < 2) {
          next.add(id);
        }
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Diff actions ────────────────────────────────────────────────

  const handleQuickDiff = (version: FileVersionData) => {
    setDiffVersion(version);
    setDiffMode("quick");
  };

  const handleCustomDiff = () => {
    if (selectedIds.size === 2) {
      setDiffMode("custom");
      setDiffVersion(null);
    }
  };

  const handleBackToList = () => {
    setDiffMode("none");
    setDiffVersion(null);
  };

  // ── Derived data ───────────────────────────────────────────────

  const currentVersion: FileVersionData = useMemo(
    () => ({
      id: "current",
      fileId: file?.id ?? "",
      fileName: file?.fileName ?? "",
      fileSize: file?.fileSize ?? 0,
      filePath: file?.filePath,
      textContent: file?.textContent,
      thumbnailUrl: file?.thumbnailUrl,
      version:
        versions.length > 0
          ? Math.max(...versions.map((v) => v.version)) + 1
          : 1,
      createdAt:
        typeof file?.createdAt === "string"
          ? file.createdAt
          : file
            ? new Date(file.createdAt).toISOString()
            : new Date().toISOString(),
    }),
    [file, versions]
  );

  const allEntries = useMemo(
    () => [currentVersion, ...versions],
    [currentVersion, versions]
  );

  const isTextFile = Boolean(file?.textContent);

  // Selected entries for custom diff
  const selectedEntries = useMemo(() => {
    const arr: FileVersionData[] = [];
    for (const id of selectedIds) {
      const found = allEntries.find((e) => e.id === id);
      if (found) arr.push(found);
    }
    return arr;
  }, [selectedIds, allEntries]);

  // Sorted by version: lower version first (older → newer)
  const sortedSelected = useMemo(
    () => [...selectedEntries].sort((a, b) => a.version - b.version),
    [selectedEntries]
  );

  // Quick diff: older version vs newer version
  const quickDiffOld = useMemo(() => {
    if (diffMode !== "quick" || !diffVersion) return null;
    return currentVersion.version > diffVersion.version
      ? diffVersion
      : currentVersion;
  }, [diffMode, diffVersion, currentVersion]);

  const quickDiffNew = useMemo(() => {
    if (diffMode !== "quick" || !diffVersion) return null;
    return currentVersion.version > diffVersion.version
      ? currentVersion
      : diffVersion;
  }, [diffMode, diffVersion, currentVersion]);

  // Determine what to show in diff
  const showDiff =
    (diffMode === "quick" && diffVersion && isTextFile) ||
    (diffMode === "custom" && sortedSelected.length === 2);

  const diffOldText =
    diffMode === "quick"
      ? quickDiffOld?.textContent ?? ""
      : sortedSelected[0]?.textContent ?? "";
  const diffNewText =
    diffMode === "quick"
      ? quickDiffNew?.textContent ?? ""
      : sortedSelected[1]?.textContent ?? "";
  const diffOldLabel =
    diffMode === "quick"
      ? `v${quickDiffOld?.version ?? "?"}`
      : `v${sortedSelected[0]?.version ?? "?"}`;
  const diffNewLabel =
    diffMode === "quick"
      ? `v${quickDiffNew?.version ?? "?"} (当前)`
      : `v${sortedSelected[1]?.version ?? "?"}`;

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

  if (!file) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        setDiffMode("none");
        setDiffVersion(null);
        setSelectedIds(new Set());
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            版本历史
            {showDiff && (
              <Badge variant="secondary" className="text-xs ml-2">
                差异对比
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Diff View ──────────────────────────────────────────── */}
        {showDiff ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 min-h-0 flex-1"
          >
            {/* Back button + labels */}
            <div className="flex items-center justify-between shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToList}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                返回列表
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="font-mono text-xs">
                  {diffOldLabel}
                </Badge>
                <GitCompareArrows className="h-3.5 w-3.5" />
                <Badge variant="secondary" className="font-mono text-xs">
                  {diffNewLabel}
                </Badge>
              </div>
            </div>

            {/* DiffViewer */}
            <div className="min-h-0 flex-1">
              <DiffViewer
                oldText={diffOldText}
                newText={diffNewText}
                oldLabel={diffOldLabel}
                newLabel={diffNewLabel}
              />
            </div>
          </motion.div>
        ) : (
          /* ── Version List View ─────────────────────────────────── */
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  加载版本历史...
                </span>
              </div>
            ) : allEntries.length <= 1 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">暂无历史版本</p>
                <p className="text-xs mt-1">
                  重新上传同名文件时将自动创建版本
                </p>
              </div>
            ) : (
              <>
                {/* Selection hint */}
                <AnimatePresence>
                  {selectedIds.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                        <span className="text-xs text-muted-foreground">
                          已选择 {selectedIds.size}/2 个版本
                          {selectedIds.size === 1 &&
                            " — 再选一个即可对比"}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={clearSelection}
                          >
                            <X className="h-3 w-3" />
                            清除
                          </Button>
                          {selectedIds.size === 2 && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={handleCustomDiff}
                              disabled={!isTextFile}
                            >
                              <GitCompareArrows className="h-3 w-3" />
                              对比差异
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ScrollArea className="max-h-[400px] flex-1">
                  <div className="space-y-2 pr-4">
                    {allEntries.map((entry, index) => {
                      const isCurrent = index === 0;
                      const isSelected = selectedIds.has(entry.id);
                      const isFull = selectedIds.size >= 2 && !isSelected;

                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                            isCurrent
                              ? "bg-primary/5 border-primary/20"
                              : "hover:bg-muted/50",
                            isSelected &&
                              "ring-2 ring-primary/40 border-primary/40 bg-primary/5"
                          )}
                        >
                          {/* Checkbox */}
                          <div className="shrink-0">
                            <Checkbox
                              checked={isSelected}
                              disabled={isFull}
                              onCheckedChange={() => toggleSelect(entry.id)}
                              className="h-4 w-4"
                            />
                          </div>

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
                              <p
                                className="text-sm font-medium truncate"
                                title={entry.fileName}
                              >
                                {entry.fileName}
                              </p>
                              {isCurrent && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
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
                            {/* Quick compare with current (text files) */}
                            {!isCurrent &&
                              entry.textContent &&
                              currentVersion.textContent && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="与当前版本对比"
                                  onClick={() => handleQuickDiff(entry)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}

                            {isCurrent &&
                              entry.textContent &&
                              versions.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="对比最新历史版本"
                                  onClick={() => handleQuickDiff(versions[0])}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}

                            {/* Restore (historical only) */}
                            {!isCurrent && (
                              <>
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
                        </motion.div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}

            <div className="text-xs text-muted-foreground text-center pt-2 border-t shrink-0">
              共 {allEntries.length} 个版本（含当前版本）
              {isTextFile &&
                " · 勾选2个版本可对比文本差异"}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
