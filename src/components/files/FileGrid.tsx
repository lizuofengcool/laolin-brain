"use client";

import { useState, useCallback, useMemo } from "react";
import type { FileData } from "@/lib/storage/base";
import type { MouseEvent } from "react";
import { useAppStore } from "@/stores/app-store";
import { FileCard, FileListItem, type CardSize } from "./FileCard";
import { SwipeableFileItem } from "./SwipeableFileItem";
import { GestureGridItem } from "./GestureGridItem";
import { LayoutGrid, List, File, Minimize2, Maximize2, SquareDashedBottom } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface FileGridProps {
  files: FileData[];
  onPreview: (file: FileData) => void;
  onShowVersions?: (file: FileData) => void;
  /** Desktop right-click context menu handler — receives the file and raw MouseEvent */
  onFileContextMenu?: (e: MouseEvent, file: FileData) => void;
}

const gridColsMap: Record<CardSize, string> = {
  small: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6",
  medium: "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3",
};

const STORAGE_KEY_CARD_SIZE = "kb_card_size";

function getInitialCardSize(): CardSize {
  if (typeof window === "undefined") return "medium";
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CARD_SIZE) as CardSize | null;
    if (saved && ["small", "medium", "large"].includes(saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return "medium";
}

export function FileGrid({ files, onPreview, onShowVersions, onFileContextMenu }: FileGridProps) {
  const { fileViewMode, setFileViewMode, batchSelectedIds } = useAppStore();
  const isMobile = useIsMobile();

  // Card size state with localStorage persistence (lazy init)
  const [cardSize, setCardSizeState] = useState<CardSize>(getInitialCardSize);

  const setCardSize = useCallback((size: CardSize) => {
    setCardSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEY_CARD_SIZE, size);
    } catch {
      // ignore
    }
  }, []);

  // Memoize the selected IDs set for GestureGridItem
  const selectedIdsSet = useMemo(
    () => new Set(batchSelectedIds),
    [batchSelectedIds]
  );

  return (
    <div>
      {/* View toggle + card size */}
      <div className="flex items-center justify-end mb-4 gap-2">
        {/* Card size selector (only in grid mode) */}
        {fileViewMode === "grid" && (
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                cardSize === "small" && "bg-background shadow-sm"
              )}
              onClick={() => setCardSize("small")}
              title="小卡片"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                cardSize === "medium" && "bg-background shadow-sm"
              )}
              onClick={() => setCardSize("medium")}
              title="中卡片"
            >
              <SquareDashedBottom className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                cardSize === "large" && "bg-background shadow-sm"
              )}
              onClick={() => setCardSize("large")}
              title="大卡片"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
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
      </div>

      {files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">暂无文件</p>
          <p className="text-xs mt-1">拖拽文件到此处或点击上传按钮</p>
        </div>
      ) : fileViewMode === "grid" ? (
        <div className={cn("grid gap-4", gridColsMap[cardSize])}>
          {files.map((file) => {
            // On mobile, wrap with gesture support (early return)
            if (isMobile) {
              return (
                <GestureGridItem
                  key={file.id}
                  file={file}
                  isSelected={selectedIdsSet.has(file.id)}
                >
                  <FileCard
                    file={file}
                    onPreview={onPreview}
                    cardSize={cardSize}
                    onShowVersions={onShowVersions}
                  />
                </GestureGridItem>
              );
            }

            // Desktop: create card with context menu
            return (
              <div
                key={file.id}
                onContextMenu={onFileContextMenu ? (e) => onFileContextMenu(e, file) : undefined}
              >
                <FileCard
                  file={file}
                  onPreview={onPreview}
                  cardSize={cardSize}
                  onShowVersions={onShowVersions}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {files.map((file) => {
            // On mobile, wrap with swipeable support (early return)
            if (isMobile) {
              return (
                <SwipeableFileItem key={file.id} file={file}>
                  <FileListItem
                    file={file}
                    onPreview={onPreview}
                    onShowVersions={onShowVersions}
                  />
                </SwipeableFileItem>
              );
            }

            // Desktop: create list item with context menu
            return (
              <div
                key={file.id}
                onContextMenu={onFileContextMenu ? (e) => onFileContextMenu(e, file) : undefined}
              >
                <FileListItem
                  file={file}
                  onPreview={onPreview}
                  onShowVersions={onShowVersions}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
