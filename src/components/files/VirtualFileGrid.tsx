"use client";

import { useRef, useCallback, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { FileCard, FileListItem, type CardSize } from "./FileCard";
import { LayoutGrid, List, File, Minimize2, Maximize2, SquareDashedBottom } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VirtualFileGridProps {
  files: FileData[];
  onPreview: (file: FileData) => void;
  onShowVersions?: (file: FileData) => void;
}

// Map card size to estimated row height (px)
const ROW_HEIGHT_MAP: Record<CardSize, number> = {
  small: 200,
  medium: 260,
  large: 360,
};

// List mode row height
const LIST_ROW_HEIGHT = 72;

// Map card size to grid columns per row (responsive — use a median)
const COLS_MAP: Record<CardSize, number> = {
  small: 5,
  medium: 4,
  large: 3,
};

const STORAGE_KEY_CARD_SIZE = "kb_card_size";

function getInitialCardSize(): CardSize {
  if (typeof window === "undefined") return "medium";
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CARD_SIZE) as CardSize | null;
    if (saved && ["small", "medium", "large"].includes(saved)) return saved;
  } catch {
    // ignore
  }
  return "medium";
}

/**
 * VirtualFileGrid — virtualised file grid using @tanstack/react-virtual.
 * Falls back to a simple grid when file count < 50 for simplicity.
 */
export function VirtualFileGrid({ files, onPreview, onShowVersions }: VirtualFileGridProps) {
  const { fileViewMode, setFileViewMode } = useAppStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSizeState] = useState<CardSize>(getInitialCardSize);

  const setCardSize = useCallback((size: CardSize) => {
    setCardSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEY_CARD_SIZE, size);
    } catch {
      // ignore
    }
  }, []);

  // In list mode, fall through to list virtualiser
  const isGrid = fileViewMode === "grid";
  const cols = isGrid ? COLS_MAP[cardSize] : 1;
  const estimatedRowHeight = isGrid ? ROW_HEIGHT_MAP[cardSize] : LIST_ROW_HEIGHT;
  const rowCount = Math.ceil(files.length / cols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => estimatedRowHeight, [estimatedRowHeight]),
    overscan: 5,
  });

  const totalHeight = rowVirtualizer.getTotalSize();

  // Memoise the files array reference to avoid re-renders
  const stableFiles = useMemo(() => files, [files]);

  if (files.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">暂无文件</p>
        <p className="text-xs mt-1">拖拽文件到此处或点击上传按钮</p>
      </div>
    );
  }

  return (
    <div>
      {/* View toggle + card size */}
      <div className="flex items-center justify-end mb-4 gap-2">
        {isGrid && (
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", cardSize === "small" && "bg-background shadow-sm")}
              onClick={() => setCardSize("small")}
              title="小卡片"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", cardSize === "medium" && "bg-background shadow-sm")}
              onClick={() => setCardSize("medium")}
              title="中卡片"
            >
              <SquareDashedBottom className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", cardSize === "large" && "bg-background shadow-sm")}
              onClick={() => setCardSize("large")}
              title="大卡片"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={isGrid ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setFileViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={!isGrid ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setFileViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Virtualised scroll container */}
      <div
        ref={parentRef}
        className={cn(
          "overflow-y-auto",
          isGrid ? "max-h-[70vh]" : "max-h-[70vh] border rounded-lg"
        )}
      >
        <div
          style={{
            height: `${totalHeight}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIdx = virtualRow.index * cols;
            const endIdx = Math.min(startIdx + cols, stableFiles.length);
            const rowFiles = stableFiles.slice(startIdx, endIdx);

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={cn(
                  isGrid
                    ? "absolute left-0 right-0 grid gap-4 px-0"
                    : "absolute left-0 right-0"
                )}
                style={{
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {isGrid && (
                  <div
                    className={cn(
                      "grid gap-4",
                      cardSize === "small" && "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6",
                      cardSize === "medium" && "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                      cardSize === "large" && "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
                    )}
                  >
                    {rowFiles.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        onPreview={onPreview}
                        cardSize={cardSize}
                        onShowVersions={onShowVersions}
                      />
                    ))}
                  </div>
                )}
                {!isGrid &&
                  rowFiles.map((file) => (
                    <FileListItem
                      key={file.id}
                      file={file}
                      onPreview={onPreview}
                      onShowVersions={onShowVersions}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
