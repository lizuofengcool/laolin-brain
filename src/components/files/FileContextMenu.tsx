"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  Star,
  Copy,
  FolderInput,
  Tag,
  PenLine,
  Share2,
  Download,
  Trash2,
} from "lucide-react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

import { ShareDialog } from "./ShareDialog";

interface FileContextMenuProps {
  file: FileData | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onPreview?: (file: FileData) => void;
}

/** Approximate menu dimensions for viewport boundary detection */
const MENU_WIDTH = 200;
const MENU_ITEM_HEIGHT = 36;
const MENU_PADDING = 8;
const SEPARATOR_HEIGHT = 17;

interface MenuItemDef {
  id: string;
  type?: "item";
  label: string;
  icon: React.ReactNode;
  variant?: "default" | "destructive";
  action: () => void;
}

interface MenuSeparator {
  id: string;
  type: "separator";
}

type MenuEntry = MenuItemDef | MenuSeparator;

export function FileContextMenu({ file, position, onClose, onPreview }: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { toggleFavorite, softDeleteFile, renameFile } = useAppStore();
  const router = useRouter();

  // ── Actions ──────────────────────────────────────────────
  const handleOpenPreview = useCallback(() => {
    if (file && onPreview) onPreview(file);
    onClose();
  }, [file, onPreview, onClose]);

  const handleToggleFavorite = useCallback(() => {
    if (file) toggleFavorite(file.id);
    onClose();
  }, [file, toggleFavorite, onClose]);

  const handleCopyFileName = useCallback(async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.fileName);
    } catch {
      // Fallback: select a temporary input
      const input = document.createElement("input");
      input.value = file.fileName;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    onClose();
  }, [file, onClose]);

  const handleMoveToFolder = useCallback(() => {
    router.push("/files");
    onClose();
  }, [router, onClose]);

  const handleManageTags = useCallback(() => {
    router.push("/tags");
    onClose();
  }, [router, onClose]);

  const handleRename = useCallback(() => {
    if (file) {
      const newName = prompt("重命名文件", file.fileName);
      if (newName && newName.trim() && newName !== file.fileName) {
        renameFile(file.id, newName.trim());
      }
    }
    onClose();
  }, [file, renameFile, onClose]);

  const handleShare = useCallback(() => {
    if (file) setShareOpen(true);
  }, [file]);

  const handleDownload = useCallback(() => {
    if (!file) return;
    const { token, user } = useAppStore.getState();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/files/${file.id}/download?userId=${user?.id || ""}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(console.error);
    onClose();
  }, [file, onClose]);

  const handleDelete = useCallback(() => {
    if (file) softDeleteFile(file.id);
    onClose();
  }, [file, softDeleteFile, onClose]);

  // ── Build menu items ────────────────────────────────────
  const menuItems: MenuEntry[] = useMemo(() => {
    if (!file) return [];
    const isFav = file.isFavorite;

    return [
      {
        id: "preview",
        label: "打开预览",
        icon: <Eye className="h-4 w-4" />,
        action: handleOpenPreview,
      },
      {
        id: "favorite",
        label: isFav ? "取消收藏" : "收藏",
        icon: <Star className={cn("h-4 w-4", isFav && "fill-amber-400 text-amber-400")} />,
        action: handleToggleFavorite,
      },
      { id: "sep1", type: "separator" },
      {
        id: "copy-name",
        label: "复制文件名",
        icon: <Copy className="h-4 w-4" />,
        action: handleCopyFileName,
      },
      {
        id: "move-folder",
        label: "移动到文件夹",
        icon: <FolderInput className="h-4 w-4" />,
        action: handleMoveToFolder,
      },
      {
        id: "manage-tags",
        label: "管理标签",
        icon: <Tag className="h-4 w-4" />,
        action: handleManageTags,
      },
      { id: "sep2", type: "separator" },
      {
        id: "rename",
        label: "重命名",
        icon: <PenLine className="h-4 w-4" />,
        action: handleRename,
      },
      {
        id: "share",
        label: "分享",
        icon: <Share2 className="h-4 w-4" />,
        action: handleShare,
      },
      {
        id: "download",
        label: "下载",
        icon: <Download className="h-4 w-4" />,
        action: handleDownload,
      },
      { id: "sep3", type: "separator" },
      {
        id: "delete",
        label: "删除",
        icon: <Trash2 className="h-4 w-4" />,
        variant: "destructive",
        action: handleDelete,
      },
    ];
  }, [file, handleOpenPreview, handleToggleFavorite, handleCopyFileName, handleMoveToFolder, handleManageTags, handleRename, handleShare, handleDownload, handleDelete]);

  // ── Boundary detection ──────────────────────────────────
  const adjustedPosition = useMemo(() => {
    if (!position) return { x: 0, y: 0 };
    const separatorCount = menuItems.filter((i) => i.type === "separator").length;
    const itemHeight = menuItems.filter((i) => i.type !== "separator").length * MENU_ITEM_HEIGHT;
    const totalHeight = itemHeight + separatorCount * SEPARATOR_HEIGHT + MENU_PADDING * 2;

    let x = position.x;
    let y = position.y;

    if (x + MENU_WIDTH > window.innerWidth) {
      x = window.innerWidth - MENU_WIDTH - 8;
    }
    if (y + totalHeight > window.innerHeight) {
      y = window.innerHeight - totalHeight - 8;
    }

    // Clamp to ensure positive values
    x = Math.max(4, x);
    y = Math.max(4, y);

    return { x, y };
  }, [position, menuItems]);

  // ── Close on outside click ──────────────────────────────
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use a short delay to avoid the right-click event itself closing the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [position, onClose]);

  // ── Close on Escape ─────────────────────────────────────
  useEffect(() => {
    if (!position) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [position, onClose]);

  // ── Prevent default context menu on the menu itself ─────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  if (!file || !position) {
    if (shareOpen) {
      return (
        <ShareDialog
          file={{ id: file?.id || "", fileName: file?.fileName || "" }}
          open={shareOpen}
          onClose={() => { setShareOpen(false); onClose(); }}
        />
      );
    }
    return null;
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          ref={menuRef}
          onContextMenu={handleContextMenu}
          className="fixed z-[60] min-w-[180px] max-w-[220px] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg backdrop-blur-sm"
          style={{
            left: adjustedPosition.x,
            top: adjustedPosition.y,
            transformOrigin: `${position.x - adjustedPosition.x}px ${position.y - adjustedPosition.y}px`,
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          {menuItems.map((item) => {
            if (item.type === "separator") {
              return (
                <div
                  key={item.id}
                  className="-mx-1 my-1 h-px bg-border"
                />
              );
            }

            return (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
                  "transition-colors duration-75 cursor-pointer",
                  item.variant === "destructive"
                    ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                    : "hover:bg-accent focus:bg-accent",
                )}
                onClick={item.action}
              >
                <span className={cn(
                  "shrink-0 [&_svg]:pointer-events-none [&_svg]:size-4",
                  item.variant === "destructive" ? "[&_svg]:text-destructive" : "[&_svg]:text-muted-foreground",
                )}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
      <ShareDialog
        file={{ id: file.id, fileName: file.fileName, fileType: file.fileType, fileSize: file.fileSize }}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
