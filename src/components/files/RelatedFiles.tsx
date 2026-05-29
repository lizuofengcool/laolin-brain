"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { FileIconDisplay } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RelatedFilesProps {
  currentFile: FileData;
  onFileClick: (file: FileData) => void;
}

// Cache for related file results (bounded LRU with max 100 entries)
const relatedCache = new Map<string, { ids: string[]; reasons: Record<string, string> }>();
const MAX_CACHE_SIZE = 100;

function cacheSet(key: string, value: { ids: string[]; reasons: Record<string, string> }) {
  if (relatedCache.size >= MAX_CACHE_SIZE) {
    // Delete oldest entry (first key in Map iteration order)
    const firstKey = relatedCache.keys().next().value;
    if (firstKey !== undefined) relatedCache.delete(firstKey);
  }
  relatedCache.set(key, value);
}

export function RelatedFiles({ currentFile, onFileClick }: RelatedFilesProps) {
  const { files } = useAppStore();
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchRelated = useCallback(async () => {
    if (loaded) return;
    // Don't fetch if file has no text content and no tags
    if (!currentFile.textContent && currentFile.tags.length === 0) {
      setLoaded(true);
      return;
    }

    // Check cache
    const cached = relatedCache.get(currentFile.id);
    if (cached) {
      setRelatedIds(cached.ids);
      setReasons(cached.reasons);
      setLoaded(true);
      return;
    }

    setLoading(true);
    try {
      const fileList = files
        .filter((f) => !f.isDeleted && f.id !== currentFile.id)
        .map((f) => ({
          id: f.id,
          fileName: f.fileName,
          textContent: f.textContent?.slice(0, 500) || "",
          tags: f.tags,
        }));

      if (fileList.length === 0) {
        setLoaded(true);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/ai/related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: currentFile.id,
          files: fileList,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRelatedIds(data.relatedFiles || []);
        setReasons(data.reasons || {});
        // Cache results (bounded LRU)
        cacheSet(currentFile.id, {
          ids: data.relatedFiles || [],
          reasons: data.reasons || {},
        });
      }
    } catch (err) {
      console.error("Failed to fetch related files:", err);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [currentFile, files, loaded]);

  useEffect(() => {
    setRelatedIds([]);
    setReasons({});
    setLoaded(false);
    setLoading(false);
  }, [currentFile.id]);

  useEffect(() => {
    if (!loaded && !loading) {
      fetchRelated();
    }
  }, [fetchRelated, loaded, loading]);

  const relatedFiles = relatedIds
    .map((id) => files.find((f) => f.id === id))
    .filter(Boolean) as FileData[];

  if (loading) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Link2 className="h-4 w-4" />
          相关文件
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (relatedFiles.length === 0) return null;

  return (
    <div className="space-y-2 p-1">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Link2 className="h-4 w-4" />
        相关文件
      </div>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-1.5">
          {relatedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
              onClick={() => onFileClick(file)}
            >
              <div className={cn(
                "h-8 w-8 rounded-md flex items-center justify-center shrink-0 text-xs",
                cn(
                  file.fileType === "word"
                    ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15"
                    : file.fileType === "pdf"
                    ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15"
                    : file.fileType === "image"
                    ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/15"
                    : file.fileType === "pptx"
                    ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15"
                    : "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/15"
                )
              )}>
                <FileIconDisplay fileType={file.fileType} className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={file.fileName}>
                  {file.fileName}
                </p>
                {reasons[file.id] && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {reasons[file.id]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
