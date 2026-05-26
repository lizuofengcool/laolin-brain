"use client";

import { useState } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import {
  FileText,
  Image as ImageIcon,
  File,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  query: string;
  triggerSearch: boolean;
  onPreview: (file: FileData) => void;
}

const getFileIcon = (fileType: string) => {
  switch (fileType) {
    case "word":
      return FileText;
    case "pdf":
      return File;
    case "image":
      return ImageIcon;
    default:
      return File;
  }
};

const getFileColor = (fileType: string) => {
  switch (fileType) {
    case "word":
      return "text-blue-600 bg-blue-50";
    case "pdf":
      return "text-red-600 bg-red-50";
    case "image":
      return "text-green-600 bg-green-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

export function SearchResults({ query, triggerSearch, onPreview }: SearchResultsProps) {
  const { files, storageMode, user } = useAppStore();
  const [results, setResults] = useState<FileData[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearched(true);

    try {
      if (storageMode === "cloud" && user) {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&userId=${user.id}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        } else {
          setResults([]);
        }
      } else {
        const lower = q.toLowerCase();
        const filtered = files.filter(
          (f) =>
            f.fileName.toLowerCase().includes(lower) ||
            f.textContent?.toLowerCase().includes(lower) ||
            f.tags.some((t) => t.toLowerCase().includes(lower))
        );
        setResults(filtered);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Trigger search when triggerSearch changes
  if (triggerSearch && query.trim()) {
    performSearch(query);
  }

  if (!searched) return null;

  return (
    <div className="mt-6 space-y-4">
      {searching ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">搜索中...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">未找到相关文件</p>
          <p className="text-xs mt-1">尝试使用不同的关键词搜索</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            找到 {results.length} 个结果
          </p>
          <div className="space-y-2">
            {results.map((file) => {
              const Icon = getFileIcon(file.fileType);
              const colorClass = getFileColor(file.fileType);

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border"
                  onClick={() => onPreview(file)}
                >
                  {file.fileType === "image" && file.thumbnailUrl ? (
                    <img
                      src={file.thumbnailUrl}
                      alt={file.fileName}
                      className="h-12 w-12 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className={cn(
                        "h-12 w-12 rounded-lg flex items-center justify-center shrink-0",
                        colorClass
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {highlightText(file.fileName, query)}
                    </p>
                    {file.textContent && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {highlightText(file.textContent.slice(0, 150), query)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatSize(file.fileSize)} · {file.fileType.toUpperCase()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
