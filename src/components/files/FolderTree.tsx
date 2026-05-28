"use client";

import { useState } from "react";
import { useAppStore, type FolderItem } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";

// Droppable folder item wrapper
function DroppableFolderItem({
  folder,
  depth,
  isSelected,
  isExpanded,
  hasChildren,
  onSelect,
  onToggleExpand,
  onDelete,
}: {
  folder: FolderItem;
  depth: number;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

  return (
    <div ref={setNodeRef}>
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-sm group",
          isSelected && "bg-primary/10 text-primary font-medium",
          isOver && "bg-primary/20 ring-2 ring-primary ring-offset-1 ring-offset-background"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelect(folder.id);
          if (hasChildren) onToggleExpand(folder.id);
        }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Folder
          className={cn(
            "h-4 w-4 shrink-0",
            isSelected ? "text-primary" : isOver ? "text-primary" : "text-muted-foreground"
          )}
        />
        <span className="truncate flex-1">{folder.name}</span>
        {isOver && (
          <span className="text-xs text-primary font-medium animate-pulse">放置</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(folder.id);
          }}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

// Droppable "all files" (root) item
function DroppableAllFiles({
  isSelected,
  onSelect,
}: {
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "folder-root",
    data: { type: "folder-root" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-sm",
        !isSelected && "bg-primary/10 text-primary font-medium",
        isOver && "bg-primary/20 ring-2 ring-primary ring-offset-1 ring-offset-background"
      )}
      onClick={onSelect}
    >
      <Folder className="h-4 w-4" />
      <span className="flex-1">全部文件</span>
      {isOver && (
        <span className="text-xs text-primary font-medium animate-pulse">移动到根目录</span>
      )}
    </div>
  );
}

interface FolderTreeProps {
  onSelectFolder: (folderId: string | null) => void;
  selectedFolderId: string | null;
}

export function FolderTree({ onSelectFolder, selectedFolderId }: FolderTreeProps) {
  const { folders, setFolders, user, refreshFiles } = useAppStore();
  const [newFolderName, setNewFolderName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildFolders = (parentId: string) =>
    folders.filter((f) => f.parentId === parentId);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !user || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          name: newFolderName.trim(),
          parentId: selectedFolderId,
        }),
      });
      if (res.ok) {
        const folder = await res.json();
        setFolders([...folders, folder]);
        setNewFolderName("");
        setDialogOpen(false);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFolders(folders.filter((f) => f.id !== id));
        if (selectedFolderId === id) {
          onSelectFolder(null);
          refreshFiles();
        }
      }
    } catch {
      // ignore
    }
    setDeleteConfirmId(null);
  };

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const children = getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <DroppableFolderItem
          folder={folder}
          depth={depth}
          isSelected={isSelected}
          isExpanded={isExpanded}
          hasChildren={hasChildren}
          onSelect={onSelectFolder}
          onToggleExpand={toggleExpand}
          onDelete={setDeleteConfirmId}
        />
        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          文件夹
        </span>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>新建文件夹</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <Input
                placeholder="文件夹名称"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
              />
              <Button onClick={createFolder} size="sm" disabled={creating}>
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* All files option - droppable root */}
      <DroppableAllFiles
        isSelected={!selectedFolderId}
        onSelect={() => onSelectFolder(null)}
      />

      {/* Folder tree */}
      {rootFolders.map((folder) => renderFolder(folder))}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除文件夹</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">确定要删除此文件夹吗？文件夹内的文件不会被删除。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteFolder(deleteConfirmId)}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
