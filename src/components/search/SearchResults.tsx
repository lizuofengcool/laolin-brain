"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";
import { Loader2, File, Filter, Search, X, Sparkles, Type, Blend, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

interface SearchResultsProps {
  query: string;
  triggerSearch: number;
  onPreview: (file: FileData) => void;
}

type FileTypeFilter = "all" | "document" | "image" | "other";
type DateRange = "all" | "today" | "week" | "month" | "year";
type SortMode = "relevance" | "date" | "name";
type SearchMode = "hybrid" | "semantic" | "keyword";

interface EnhancedFileData extends FileData {
  similarityScore?: number;
  matchType?: string;
  combinedScore?: number;
  matchedFaceNames?: string[];
}

const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$");
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

function MatchTypeBadge({ matchType, matchedFaceNames }: { matchType?: string; matchedFaceNames?: string[] }) {
  if (!matchType || matchType === "keyword") return null;

  if (matchType === "face") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300 gap-0.5">
              <ScanFace className="h-2.5 w-2.5" />
              人脸匹配{matchedFaceNames && matchedFaceNames.length > 0 ? `: ${matchedFaceNames.join(", ")}` : ""}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>通过人脸分组名称匹配</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (matchType === "semantic") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300 gap-0.5">
              <Sparkles className="h-2.5 w-2.5" />
              AI 匹配
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>基于语义相似度匹配</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (matchType === "both") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 gap-0.5">
              <Blend className="h-2.5 w-2.5" />
              混合匹配
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>同时匹配关键词和语义</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}

function SimilarityBar({ score }: { score: number }) {
  if (score <= 0) return null;
  const percent = Math.round(score * 100);
  const color =
    percent >= 70 ? "bg-emerald-500" :
    percent >= 40 ? "bg-amber-500" :
    "bg-red-400";

  return (
    <div className="flex items-center gap-1.5 w-20">
      <Progress value={percent} className="h-1.5 flex-1 [&>div]:bg-inherit">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${percent}%` }} />
      </Progress>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{percent}%</span>
    </div>
  );
}

export function SearchResults({ query, triggerSearch, onPreview }: SearchResultsProps) {
  const { files, storageMode, user } = useAppStore();
  const [rawResults, setRawResults] = useState<EnhancedFileData[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const lastTriggerRef = useRef(0);
  const prevSearchModeRef = useRef<string>("hybrid");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Filters
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortBy, setSortBy] = useState<SortMode>("relevance");
  const [withinQuery, setWithinQuery] = useState("");

  // Search mode
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [embeddingStatus, setEmbeddingStatus] = useState<{
    totalFiles: number;
    totalEmbeddings: number;
    coverage: number;
  } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Reset filters on new search
  useEffect(() => {
    setFileTypeFilter("all");
    setDateRange("all");
    setSortBy("relevance");
    setWithinQuery("");
  }, [triggerSearch]);

  // Fetch embedding status when user is available
  useEffect(() => {
    if (storageMode === "cloud" && user) {
      const abortController = new AbortController();
      const token = useAppStore.getState().token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      fetch(`/api/embeddings/generate?userId=${user.id}`, { headers, signal: abortController.signal })
        .then((res) => res.json())
        .then((data) => {
          if (data.totalFiles !== undefined) {
            setEmbeddingStatus(data);
          }
        })
        .catch(() => {});
      return () => abortController.abort();
    }
  }, [storageMode, user]);

  // Generate embeddings
  const handleGenerateEmbeddings = async () => {
    if (!user || generating) return;
    setGenerating(true);
    const token = useAppStore.getState().token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      await fetch("/api/embeddings/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: user.id }),
      });
      // Refresh embedding status
      const res = await fetch(`/api/embeddings/generate?userId=${user.id}`, { headers });
      const data = await res.json();
      if (data.totalFiles !== undefined) {
        setEmbeddingStatus(data);
      }
    } catch {
      // Silently handle
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    // Bypass guard if searchMode changed since last run
    const modeChanged = searchMode !== prevSearchModeRef.current;
    if (triggerSearch === lastTriggerRef.current && !modeChanged) return;
    if (!query.trim()) return;

    lastTriggerRef.current = triggerSearch;
    prevSearchModeRef.current = searchMode;

    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const performSearch = async (q: string) => {
      setSearching(true);
      setSearched(true);
      const startTime = Date.now();

      try {
        if (storageMode === "cloud" && user) {
          const modeParam = searchMode;
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}&userId=${user.id}&mode=${modeParam}`,
            { signal: abortController.signal }
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
              (f.tags?.some((t) => t.toLowerCase().includes(lower)) ?? false))
          );
          setRawResults(filtered);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRawResults([]);
      } finally {
        if (!abortController.signal.aborted) {
          setSearchTime(Date.now() - startTime);
          setSearching(false);
        }
      }
    };

    performSearch(query);

    return () => {
      abortController.abort();
    };
  }, [triggerSearch, query, storageMode, user, files, searchMode]);

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
          (f.tags?.some((t) => t.toLowerCase().includes(lower)) ?? false)
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
        // For hybrid/semantic mode, use similarity score; otherwise use content match
        if (searchMode !== "keyword") {
          results.sort((a, b) => {
            const aScore = (a as EnhancedFileData).combinedScore || (a as EnhancedFileData).similarityScore || 0;
            const bScore = (b as EnhancedFileData).combinedScore || (b as EnhancedFileData).similarityScore || 0;
            if (aScore !== bScore) return bScore - aScore;
            const aText = a.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            const bText = b.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            return bText - aText;
          });
        } else {
          results.sort((a, b) => {
            const aText = a.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            const bText = b.textContent?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
            return bText - aText || a.fileName.localeCompare(b.fileName, "zh-CN");
          });
        }
        break;
    }

    return results;
  }, [rawResults, fileTypeFilter, dateRange, sortBy, withinQuery, query, searchMode]);

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

  const searchModeOptions: { value: SearchMode; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "hybrid", label: "混合搜索", icon: <Blend className="h-3.5 w-3.5" />, desc: "结合关键词和语义" },
    { value: "semantic", label: "智能搜索", icon: <Sparkles className="h-3.5 w-3.5" />, desc: "AI语义理解" },
    { value: "keyword", label: "关键词", icon: <Type className="h-3.5 w-3.5" />, desc: "精确匹配" },
  ];

  if (!searched) return null;

  return (
    <div className="mt-6 space-y-4">
      {/* Filter bar */}
      <div className="space-y-3">
        {/* Search mode toggle + search within */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search mode selector */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            {searchModeOptions.map((opt) => (
              <TooltipProvider key={opt.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors",
                        searchMode === opt.value
                          ? "bg-background shadow-sm font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setSearchMode(opt.value)}
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{opt.desc}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>

          {/* Embedding status indicator (only for non-keyword modes) */}
          {searchMode !== "keyword" && embeddingStatus && storageMode === "cloud" && (
            <div className="flex items-center gap-2">
              {embeddingStatus.coverage < 100 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleGenerateEmbeddings}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {generating ? "生成中..." : `生成向量 (${embeddingStatus.coverage}%)`}
                </Button>
              ) : (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  向量就绪
                </Badge>
              )}
            </div>
          )}

          {/* Search within results */}
          <div className="relative max-w-sm flex-1">
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
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">
            {searchMode === "semantic" || searchMode === "hybrid" ? "AI 语义搜索中..." : "搜索中..."}
          </span>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <File className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {rawResults.length === 0 ? "未找到相关文件" : "没有符合筛选条件的文件"}
          </p>
          <p className="text-xs mt-1">尝试使用不同的关键词或调整筛选条件</p>
          {searchMode !== "keyword" && rawResults.length === 0 && embeddingStatus && embeddingStatus.coverage < 100 && (
            <p className="text-xs mt-2">
              提示：当前仅 {embeddingStatus.coverage}% 的文件有向量索引，
              <button
                className="text-primary hover:underline"
                onClick={handleGenerateEmbeddings}
              >
                点击生成
              </button>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            找到 {filteredResults.length} 个结果
            {searchTime > 0 && <span className="ml-2">（{searchTime}ms）</span>}
            {searchMode !== "keyword" && (
              <span className="ml-1 text-xs">
                {searchMode === "hybrid" ? "混合搜索" : "语义搜索"}
              </span>
            )}
            {rawResults.length !== filteredResults.length && (
              <span className="ml-1">，共 {rawResults.length} 条</span>
            )}
          </p>
          <div className="space-y-2">
            {filteredResults.map((file) => {
              const colorClass = getFileColor(file.fileType);
              const enhancedFile = file as EnhancedFileData;

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
                      loading="lazy"
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {highlightText(file.fileName, query)}
                      </p>
                      <MatchTypeBadge matchType={enhancedFile.matchType} matchedFaceNames={enhancedFile.matchedFaceNames} />
                    </div>
                    {file.textContent && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {highlightText(file.textContent.slice(0, 150), query)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        {formatSize(file.fileSize)} · {file.fileType.toUpperCase()}
                      </p>
                      {enhancedFile.similarityScore !== undefined && enhancedFile.similarityScore > 0 && (
                        <SimilarityBar score={enhancedFile.similarityScore} />
                      )}
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
