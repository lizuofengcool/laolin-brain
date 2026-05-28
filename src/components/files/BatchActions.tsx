"use client";

import { useState } from "react";
import { Tag, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";

/**
 * 批量操作增强组件
 * 支持批量添加标签、批量移动到文件夹
 */

interface BatchActionsProps {
  open: boolean;
  onClose: () => void;
}

export function BatchActions({ open, onClose }: BatchActionsProps) {
  const {
    files,
    batchSelectedIds,
    clearBatchSelection,
    folders,
    toggleBatchMode,
    refreshFiles,
    storageMode,
    user,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<"tag" | "move">("tag");
  const [tagInput, setTagInput] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  const selectedFiles = files.filter((f) => batchSelectedIds.includes(f.id) && !f.isDeleted);
  const count = selectedFiles.length;

  // 批量添加标签
  const handleBatchTag = async () => {
    if (!tagInput.trim() || count === 0) return;

    const newTag = tagInput.trim();
    let successCount = 0;

    for (const file of selectedFiles) {
      const currentTags = Array.isArray(file.tags) ? file.tags : [];
      if (currentTags.includes(newTag)) continue;

      const updatedTags = [...currentTags, newTag];
      useAppStore.getState().updateFile(file.id, { tags: updatedTags });

      if (user) {
        try {
          const adapter = (await import("@/lib/storage/factory")).getStorageAdapter(storageMode);
          await adapter.updateFile(file.id, { tags: updatedTags } as Partial<import("@/lib/storage/base").FileData>, user.id);
          successCount++;
        } catch {
          // ignore
        }
      }
    }

    toast({
      title: "批量标签完成",
      description: `已为 ${successCount} 个文件添加标签「${newTag}」`,
    });

    setTagInput("");
    refreshFiles();
  };

  // 批量移动到文件夹
  const handleBatchMove = async () => {
    if (!selectedFolderId || count === 0) return;

    let successCount = 0;
    const targetFolder = folders.find((f) => f.id === selectedFolderId);

    for (const file of selectedFiles) {
      useAppStore.getState().updateFile(file.id, { folderId: selectedFolderId });

      if (user) {
        try {
          const adapter = (await import("@/lib/storage/factory")).getStorageAdapter(storageMode);
          await adapter.updateFile(file.id, { folderId: selectedFolderId } as Partial<import("@/lib/storage/base").FileData>, user.id);
          successCount++;
        } catch {
          // ignore
        }
      }
    }

    toast({
      title: "批量移动完成",
      description: `已将 ${successCount} 个文件移动到「${targetFolder?.name || "文件夹"}」`,
    });

    setSelectedFolderId("");
    refreshFiles();
  };

  const handleClose = () => {
    clearBatchSelection();
    toggleBatchMode();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            批量操作
            <span className="text-sm font-normal text-muted-foreground">
              已选择 {count} 个文件
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab 切换 */}
        <div className="flex border-b mb-4">
          <button
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "tag"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("tag")}
          >
            <Tag className="h-4 w-4 inline mr-1.5" />
            批量标签
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "move"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("move")}
          >
            <FolderInput className="h-4 w-4 inline mr-1.5" />
            移动到文件夹
          </button>
        </div>

        {/* 标签面板 */}
        {activeTab === "tag" && (
          <div className="space-y-3">
            <Input
              placeholder="输入标签名称，如：工作、重要"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBatchTag()}
            />
            <Button onClick={handleBatchTag} disabled={!tagInput.trim() || count === 0} className="w-full">
              添加标签到 {count} 个文件
            </Button>
            {selectedFiles.length > 0 && (
              <div className="text-xs text-muted-foreground">
                当前文件已有标签：
                {[...new Set(selectedFiles.flatMap((f) => Array.isArray(f.tags) ? f.tags : []))]
                  .slice(0, 10)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-xs mr-1 mb-1"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* 移动面板 */}
        {activeTab === "move" && (
          <div className="space-y-3">
            {folders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无文件夹，请先在文件管理中创建文件夹
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {folders.map((folder) => (
                  <label
                    key={folder.id}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                      selectedFolderId === folder.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="folder"
                      value={folder.id}
                      checked={selectedFolderId === folder.id}
                      onChange={() => setSelectedFolderId(folder.id)}
                      className="accent-primary"
                    />
                    <FolderInput className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{folder.name}</span>
                  </label>
                ))}
              </div>
            )}
            <Button
              onClick={handleBatchMove}
              disabled={!selectedFolderId || count === 0}
              className="w-full"
            >
              移动 {count} 个文件
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
