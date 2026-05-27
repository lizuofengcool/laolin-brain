"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { Loader2, File, Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchResultsProps {
  query: string;
  triggerSearch: number;
  onPreview: (file: FileData) => void;
}

type FileTypeFilter = "all" | "document" | "image" | "other";
type DateRange = "all" | "today" | "week" | "month" | "year";
type SortMode = "relevance" | "date" | "name";

const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    new RegExp(`^${escapedQuery}$`, "i").test(part) ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/40 text-yellow-900 dark:text-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

function isInRange(date: Date, range: DateRange): boolean {
  if (range === "all") return true;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  switch (range) {
    case "today":
      return diff < 24 * 60 * 60 * 1000;
    case "week":
      return diff < 7 * 24 * 60 * 60 * 1000;
    case "month":
      return diff < 30 * 24 * 60 * 60 * 1000;
    case "year":
      return diff < 365 * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
}

export function SearchResults({ query, triggerSearch, onPreview }: SearchResultsProps) {
  const { files, storageMode, user } = useAppStore();
  const [rawResults, setRawResults] = useState<FileData[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const lastTriggerRef = useRef(0);

  // Filters
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortBy, setSortBy] = useState<SortMode>("relevance");
  const [withinQuery, setWithinQuery] = useState("");

  // Reset filters on new search
  useEffect(() => {
    setFileTypeFilter("all");
    setDateRange("all");
    setSortBy("relevance");
    setWithinQuery("");
  }, [triggerSearch]);

  useEffect(() => {
    if (triggerSearch === lastTriggerRef.current) return;
    if (!query.trim()) return;

    lastTriggerRef.current = triggerSearch;

    const performSearch = async (q: string) => {
      setSearching(true);
      setSearched(true);
      const startTime = Date.now();

      try {
        if (storageMode === "cloud" && user) {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}&userId=${user.id}`
          );
          if (res.ok) {
            const data = await res.json();
            setRawResults(data);
          } else {
            setRawResults([]);
          }
        } else {
          const lower = q.toLowerCase();
          const filtered = files.filter(
            (f) =>
              !f.isDeleted &&
              (f.fileName.toLowerCase().includes(lower) ||
              f.textContent?.toLowerCase().includes(lower) ||
              f.tags.some((t) => t.toLowerCase().includes(lower)))
          );
          setRawResults(filtered);
        }
      } catch {
        setRawResults([]);
      } finally {
        setSearchTime(Date.now() - startTime);
        setSearching(false);
      }
    };

    performSearch(query);
  }, [triggerSearch, query, storageMode, user, files]);

  // Apply filters
  const filteredResults = useMemo(() => {
    let results = [...rawResults];

    // File type filter
    if (fileTypeFilter === "document") {
      results = results.filter((f) => ["word", "pdf", "pptx", "markdown", "txt"].includes(f.fileType));
    } else if (fileTypeFilter === "image") {
      results = results.filter((f) => f.fileType === "image");
    } else if (fileTypeFilter === "other") {
      results = results.filter((f) => !["word", "pdf", "pptx", "markdown", "txt", "image"].includes(f.fileType));
    }

    // Date range filter
    if (dateRange !== "all") {
      results = results.filter((f) => isInRange(new Date(f.createdAt), dateRange));
    }

    // Search within results
    if (withinQuery.trim()) {
      const lower = withinQuery.toLowerCase();
      results = results.filter(
        (f) =>
          f.fileName.toLowerCase().includes(lower) ||
          f.textContent?.toLowerCase().includes(lower) ||
          f.tags.some((t) => t.toLowerCase().includes(lower))
      );
    }

    // Sort
    switch (sortBy) {
      case "date":
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "name":
        results.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
        break;
      case "relevance":
      default:
        // Files with matching text content first, then by name match
        results.sort((a, b) => {
          const aText = a.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
          const bText = b.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
          return bText - aText || a.fileName.localeCompare(b.fileName, "zh-CN");
        });
        break;
    }

    return results;
  }, [rawResults, fileTypeFilter, dateRange, sortBy, withinQuery, query]);

  const fileTypeOptions: { value: FileTypeFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "document", label: "文档" },
    { value: "image", label: "图片" },
    { value: "other", label: "其他" },
  ];

  const dateOptions: { value: DateRange; label: string }[] = [
    { value: "all", label: "全部时间" },
    { value: "today", label: "今天" },
    { value: "week", label: "本周" },
    { value: "month", label: "本月" },
    { value: "year", label: "今年" },
  ];

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: "relevance", label: "相关性" },
    { value: "date", label: "日期" },
    { value: "name", label: "名称" },
  ];

  if (!searched) return null;

  return (
    <div className="mt-6 space-y-4">
      {/* Filter bar */}
      <div className="space-y-3">
        {/* Search within results */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="在结果中搜索..."
            className="pl-9 pr-8 h-8 text-sm rounded-lg"
            value={withinQuery}
            onChange={(e) => setWithinQuery(e.target.value)}
          />
          {withinQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setWithinQuery("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />

          {/* File type */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            {fileTypeOptions.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  fileTypeFilter === opt.value
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setFileTypeFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            {dateOptions.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  dateRange === opt.value
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setDateRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors",
                  sortBy === opt.value
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {searching ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground text-sm">搜索中...</span>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {rawResults.length === 0 ? "未找到相关文件" : "没有符合筛选条件的文件"}
          </p>
          <p className="text-xs mt-1">尝试使用不同的关键词或调整筛选条件</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            找到 {filteredResults.length} 个结果
            {searchTime > 0 && <span className="ml-2">（{searchTime}ms）</span>}
            {rawResults.length !== filteredResults.length && (
              <span className="ml-1">，共 {rawResults.length} 条</span>
            )}
          </p>
          <div className="space-y-2">
            {filteredResults.map((file) => {
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
                      <FileIconDisplay fileType={file.fileType} className="h-6 w-6" />
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
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {formatSize(file.fileSize)} · {file.fileType.toUpperCase()}
                      </p>
                      {file.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {file.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {tag}
                            </Badge>
                          ))}
                          {file.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{file.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
