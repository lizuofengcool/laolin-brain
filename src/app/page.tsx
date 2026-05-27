"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAppStore, type ViewType } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";

// ─── Core layout & auth (static — used every page load) ───
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { LoginForm } from "@/components/auth/LoginForm";

// ─── Core UI components (static — used frequently) ───
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentFiles } from "@/components/dashboard/RecentFiles";
import { FileGrid } from "@/components/files/FileGrid";
import { FolderTree } from "@/components/files/FolderTree";
import { UploadZone } from "@/components/files/UploadZone";
import { FilePreview } from "@/components/files/FilePreview";
import { FileVersions } from "@/components/files/FileVersions";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { StorageSwitch } from "@/components/settings/StorageSwitch";
import { BackupRestore } from "@/components/settings/BackupRestore";
import { ThemeCustomizer } from "@/components/settings/ThemeCustomizer";
import { ShortcutHelpPanel } from "@/components/help/ShortcutHelpPanel";
import { BatchActions } from "@/components/files/BatchActions";
import { SortFilter } from "@/components/files/SortFilter";
import { VirtualFileGrid } from "@/components/files/VirtualFileGrid";

// ─── Heavy / seldom-used views (code-split via dynamic import) ───
const TimelineView = dynamic(
  () => import("@/components/timeline/TimelineView").then((m) => ({ default: m.TimelineView })),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const AnalyticsDashboard = dynamic(
  () => import("@/components/dashboard/AnalyticsDashboard"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const StorageCharts = dynamic(
  () => import("@/components/dashboard/StorageCharts"),
  { loading: () => <Skeleton className="h-48 rounded-lg" /> }
);
const KnowledgeGraphView = dynamic(
  () => import("@/components/graph/KnowledgeGraph").then((m) => ({ default: m.KnowledgeGraphView })),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const AIChatPanel = dynamic(
  () => import("@/components/ai/AIChatPanel").then((m) => ({ default: m.AIChatPanel })),
  { ssr: false }
);
const VoiceNote = dynamic(
  () => import("@/components/voice/VoiceNote").then((m) => ({ default: m.VoiceNote })),
  { ssr: false }
);
const ImageLightbox = dynamic(
  () => import("@/components/files/ImageLightbox").then((m) => ({ default: m.ImageLightbox })),
  { ssr: false }
);
const FaceGroups = dynamic(
  () => import("@/components/album/FaceGroups"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const FaceGroupPhotos = dynamic(
  () => import("@/components/album/FaceGroupPhotos"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const TagManagement = dynamic(
  () => import("@/components/tags/TagManagement"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const AlbumView = dynamic(
  () => import("@/components/album/AlbumView"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const AutomationRules = dynamic(
  () => import("@/components/settings/AutomationRules"),
  { loading: () => <Skeleton className="h-48 rounded-lg" /> }
);

// ─── Hooks & utilities ───
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { getStorageAdapter } from "@/lib/storage/factory";

// ─── UI primitives (tree-shaken) ───
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useI18n, LOCALES } from "@/lib/i18n";
import {
  FileText,
  Image as ImageIcon,
  HardDrive,
  Star,
  Clock,
  User,
  Mail,
  Shield,
  Trash2,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  Download,
  StarOff,
  FolderInput,
  ArrowUpDown,
  BarChart3,
  Zap,
} from "lucide-react";
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ─── Empty State SVGs ─────────────────────────────────────
function EmptyDashboard() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <svg className="h-20 w-20 mx-auto mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <p className="text-sm font-medium">欢迎使用知识库</p>
      <p className="text-xs mt-1">上传你的第一个文件开始使用</p>
    </div>
  );
}

function EmptySearch() {
  return (
    <div className="text-center py-20 text-muted-foreground">
      <svg className="h-20 w-20 mx-auto mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <p className="text-sm font-medium">搜索你的文件</p>
      <p className="text-xs mt-1">输入关键词搜索文件名、文档内容或标签</p>
    </div>
  );
}

// ─── Skeleton Loading ─────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────
function ConfirmDialog({ open, title, description, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button variant="destructive" onClick={onConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilesSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Login View ──────────────────────────────────────────────
function LoginView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
      <LoginForm />
      <p className="text-xs text-muted-foreground mt-4">
        按 <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted px-1 text-xs font-mono">?</kbd> 查看快捷键
      </p>
    </div>
  );
}

// ─── Dashboard View ──────────────────────────────────────────
function DashboardView() {
  const { files, user, setCurrentView, setFileTypeFilter } = useAppStore();
  const activeFiles = useMemo(() => files.filter((f) => !f.isDeleted), [files]);
  const docCount = useMemo(() => activeFiles.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx").length, [activeFiles]);
  const imageCount = useMemo(() => activeFiles.filter((f) => f.fileType === "image").length, [activeFiles]);
  const favCount = useMemo(() => activeFiles.filter((f) => f.isFavorite).length, [activeFiles]);
  const totalSize = useMemo(() => activeFiles.reduce((acc, f) => acc + f.fileSize, 0), [activeFiles]);

  const handleStatClick = (filterType: string | null) => {
    setFileTypeFilter(filterType);
    setCurrentView("files");
  };

  if (activeFiles.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            欢迎回来，{user?.name || "用户"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            这是你的知识库概览，快速了解文件情况
          </p>
        </div>
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          欢迎回来，{user?.name || "用户"} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          这是你的知识库概览，快速了解文件情况
        </p>
      </div>

      {/* Stats - clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="文档"
          value={docCount}
          icon={FileText}
          description="Word & PDF & PPT"
          onClick={() => handleStatClick("document")}
        />
        <StatsCard
          title="图片"
          value={imageCount}
          icon={ImageIcon}
          description="照片 & 图片"
          onClick={() => handleStatClick("image")}
        />
        <StatsCard
          title="收藏"
          value={favCount}
          icon={Star}
          description="标记的重要文件"
          onClick={() => handleStatClick("favorite")}
        />
        <StatsCard
          title="存储"
          value={formatSize(totalSize)}
          icon={HardDrive}
          description={`${activeFiles.length} 个文件`}
          onClick={() => handleStatClick(null)}
        />
      </div>

      {/* Charts */}
      <StorageCharts files={activeFiles} />

      {/* View Analytics Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => setCurrentView("analytics")}
          className="gap-2"
        >
          <BarChart3 className="h-4 w-4" />
          查看详细分析
        </Button>
      </div>

      {/* Recent files */}
      <RecentFiles />
    </div>
  );
}

// ─── Files View ──────────────────────────────────────────────
function FilesView() {
  const {
    files,
    selectedFolderId,
    setSelectedFolderId,
    storageMode,
    fileTypeFilter,
    setFileTypeFilter,
    batchMode,
    toggleBatchMode,
    batchSelectedIds,
    selectAllFiles,
    clearBatchSelection,
    batchToggleFavorite,
    batchDeleteFiles,
    sortBy,
    sortOrder,
    setSort,
    folders,
    updateFile,
    refreshFiles,
  } = useAppStore();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [batchActionsOpen, setBatchActionsOpen] = useState(false);
  const [versionFile, setVersionFile] = useState<FileData | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleShowVersions = (file: FileData) => {
    setVersionFile(file);
    setVersionsOpen(true);
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setVisibleCount(20);
  };

  // Filter active (non-deleted) files
  let filteredFiles = files.filter((f) => !f.isDeleted);

  // Apply file type filter (from dashboard stats click)
  if (fileTypeFilter === "document") {
    filteredFiles = filteredFiles.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx");
  } else if (fileTypeFilter === "image") {
    filteredFiles = filteredFiles.filter((f) => f.fileType === "image");
  } else if (fileTypeFilter === "favorite") {
    filteredFiles = filteredFiles.filter((f) => f.isFavorite);
  }

  // Filter by folder
  if (selectedFolderId) {
    filteredFiles = filteredFiles.filter((f) => f.folderId === selectedFolderId);
  } else if (!fileTypeFilter) {
    filteredFiles = filteredFiles.filter((f) => !f.folderId);
  }

  // Filter by tag
  if (tagFilter) {
    filteredFiles = filteredFiles.filter((f) => f.tags.includes(tagFilter));
  }

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];
    const order = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => order * a.fileName.localeCompare(b.fileName, "zh-CN"));
        break;
      case "size":
        sorted.sort((a, b) => order * (a.fileSize - b.fileSize));
        break;
      case "type":
        sorted.sort((a, b) => order * a.fileType.localeCompare(b.fileType));
        break;
      case "date":
      default:
        sorted.sort((a, b) => order * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        break;
    }
    return sorted;
  }, [filteredFiles, sortBy, sortOrder]);

  // Pagination
  const visibleFiles = sortedFiles.slice(0, visibleCount);
  const hasMore = visibleCount < sortedFiles.length;

  // Collect all tags
  const allTags = [...new Set(files.filter((f) => !f.isDeleted).flatMap((f) => f.tags))];

  // Clear file type filter when entering files view directly
  useEffect(() => {
    return () => {
      setFileTypeFilter(null);
    };
  }, [setFileTypeFilter]);

  const filterLabel = fileTypeFilter === "document"
    ? "📄 文档"
    : fileTypeFilter === "image"
    ? "🖼️ 图片"
    : fileTypeFilter === "favorite"
    ? "⭐ 收藏"
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文件管理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理、上传和浏览你的文件
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filterLabel && (
            <Badge variant="secondary" className="text-xs gap-1">
              {filterLabel}
              <button onClick={() => setFileTypeFilter(null)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {storageMode === "cloud" ? "☁️ 云端模式" : "💾 本地模式"}
          </Badge>
        </div>
      </div>

      {/* Upload zone */}
      {!batchMode && <UploadZone />}

      {/* Batch operations toolbar */}
      {batchMode && (
        <Card className="shadow-sm border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllFiles}>
                <CheckSquare className="h-4 w-4 mr-1" />
                全选
              </Button>
              <Button variant="outline" size="sm" onClick={clearBatchSelection}>
                <Square className="h-4 w-4 mr-1" />
                取消全选
              </Button>
              <span className="text-sm text-muted-foreground">
                已选择 {batchSelectedIds.length} 个文件
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => batchToggleFavorite(batchSelectedIds, true)}
              >
                <Star className="h-4 w-4 mr-1" />
                收藏
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => batchToggleFavorite(batchSelectedIds, false)}
              >
                <StarOff className="h-4 w-4 mr-1" />
                取消收藏
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => setBatchDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                删除
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={batchSelectedIds.length === 0}
                onClick={() => setBatchActionsOpen(true)}
              >
                <FolderInput className="h-4 w-4 mr-1" />
                更多操作
              </Button>
              <Button variant="outline" size="sm" onClick={toggleBatchMode}>
                <X className="h-4 w-4 mr-1" />
                退出批量
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Folders & Tags */}
        <div className="lg:w-56 shrink-0 space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">文件夹</span>
                {!batchMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={toggleBatchMode}
                  >
                    批量管理
                  </Button>
                )}
              </div>
              <FolderTree
                onSelectFolder={handleFolderSelect}
                selectedFolderId={selectedFolderId}
              />
            </CardContent>
          </Card>

          {allTags.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  标签筛选
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge
                    variant={tagFilter === null ? "default" : "secondary"}
                    className="cursor-pointer text-xs"
                    onClick={() => setTagFilter(null)}
                  >
                    全部
                  </Badge>
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={tagFilter === tag ? "default" : "secondary"}
                      className="cursor-pointer text-xs"
                      onClick={() =>
                        setTagFilter(tagFilter === tag ? null : tag)
                      }
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* File grid */}
        <div className="flex-1 min-w-0">
          <SortFilter
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={setSort}
            totalFiles={files.filter((f) => !f.isDeleted).length}
            filteredCount={sortedFiles.length}
          />
          <div className="mt-3">
            {sortedFiles.length > 50 ? (
              <VirtualFileGrid files={sortedFiles} onPreview={handlePreview} onShowVersions={handleShowVersions} />
            ) : (
              <FileGrid files={visibleFiles} onPreview={handlePreview} onShowVersions={handleShowVersions} />
            )}
          </div>

          {/* Only show "load more" when not using virtual grid */}
          {hasMore && sortedFiles.length <= 50 && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {sortedFiles.length - visibleCount} 个文件）
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* File preview dialog */}
      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* File versions dialog */}
      <FileVersions
        file={versionFile}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
      />

      <BatchActions
        open={batchActionsOpen}
        onClose={() => setBatchActionsOpen(false)}
      />

      <ConfirmDialog
        open={batchDeleteConfirm}
        title="批量删除文件"
        description={`确定要删除选中的 ${batchSelectedIds.length} 个文件吗？文件将移入回收站。`}
        onConfirm={() => { batchDeleteFiles(batchSelectedIds); setBatchDeleteConfirm(false); }}
        onCancel={() => setBatchDeleteConfirm(false)}
      />
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────
function SearchView() {
  const { searchQuery, setSearchQuery, aiChatFile, setAiChatFile, files } = useAppStore();
  const [localQuery, setLocalQuery] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect all tags and file names for suggestions
  const allSuggestions = useMemo(() => {
    const tags = [...new Set(files.filter((f) => !f.isDeleted).flatMap((f) => f.tags))];
    const names = files.filter((f) => !f.isDeleted).map((f) => f.fileName);
    return [...tags, ...names];
  }, [files]);

  // Sync from store (e.g. when navigating from header search)
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalQuery(searchQuery);
  }

  const handleSearch = () => {
    setSearchQuery(localQuery);
    setSearchTrigger((prev) => prev + 1);
  };

  const handleChange = (value: string) => {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
        setSearchTrigger((prev) => prev + 1);
      }, 300);
    }
  };

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-6">搜索文件</h1>
        <SearchBar
          value={localQuery}
          onChange={handleChange}
          onSearch={handleSearch}
          suggestions={allSuggestions}
        />
      </div>

      <SearchResults
        query={localQuery}
        triggerSearch={searchTrigger}
        onPreview={handlePreview}
      />

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <AIChatPanel open={!!aiChatFile} onOpenChange={(open) => { if (!open) setAiChatFile(null); }} />
    </div>
  );
}

// ─── Favorites View ──────────────────────────────────────────
function FavoritesView() {
  const { files, refreshFiles } = useAppStore();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [versionFile, setVersionFile] = useState<FileData | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const favFiles = useMemo(() => {
    const sorted = files.filter((f) => f.isFavorite && !f.isDeleted);
    if (sortBy === "name") {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [files, sortBy]);

  // Group favorites by file type
  const groupedFavs = useMemo(() => {
    const groups: Record<string, typeof favFiles> = {};
    for (const f of favFiles) {
      const type = f.fileType === "image" ? "image" :
                   f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx" ? "document" :
                   f.fileType === "markdown" || f.fileType === "txt" ? "note" : "other";
      if (!groups[type]) groups[type] = [];
      groups[type].push(f);
    }
    return groups;
  }, [favFiles]);

  const typeGroupLabels: Record<string, string> = {
    image: "图片",
    document: "文档",
    note: "笔记",
    other: "其他",
  };

  const visibleFiles = favFiles.slice(0, visibleCount);
  const hasMore = visibleCount < favFiles.length;

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleShowVersions = (file: FileData) => {
    setVersionFile(file);
    setVersionsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">收藏夹</h1>
          <p className="text-muted-foreground text-sm mt-1">
            你标记为重要和收藏的文件
          </p>
        </div>
        {favFiles.length > 0 && (
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-sm border rounded-md px-2 py-1 bg-background"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "name")}
            >
              <option value="date">按日期</option>
              <option value="name">按名称</option>
            </select>
          </div>
        )}
      </div>

      {favFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">暂无收藏</p>
          <p className="text-xs mt-1">点击文件卡片上的星标来收藏文件</p>
        </div>
      ) : (
        <>
          {/* Grouped favorites */}
          {Object.entries(groupedFavs).map(([groupType, groupFiles]) => (
            <div key={groupType} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{typeGroupLabels[groupType] || groupType}</h3>
                <Badge variant="secondary" className="text-xs">{groupFiles.length}</Badge>
              </div>
              <FileGrid files={groupFiles.slice(0, 8)} onPreview={handlePreview} onShowVersions={handleShowVersions} />
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {favFiles.length - visibleFiles.length} 个文件）
              </Button>
            </div>
          )}
        </>
      )}

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <FileVersions
        file={versionFile}
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
      />
    </div>
  );
}

// ─── Recycle Bin View ────────────────────────────────────────
function RecycleBinView() {
  const { files, restoreFile, permanentDeleteFile, emptyRecycleBin } = useAppStore();
  const [visibleCount, setVisibleCount] = useState(20);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"deletedAt" | "name">("deletedAt");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [emptyConfirm, setEmptyConfirm] = useState(false);

  const deletedFiles = useMemo(() => {
    const sorted = files.filter((f) => f.isDeleted);
    if (sortBy === "name") {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    } else {
      sorted.sort((a, b) => {
        const dateA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
        const dateB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    return sorted;
  }, [files, sortBy]);

  const visibleFiles = deletedFiles.slice(0, visibleCount);
  const hasMore = visibleCount < deletedFiles.length;

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleRestore = async (id: string) => {
    await restoreFile(id);
  };

  const handlePermanentDelete = async (id: string) => {
    await permanentDeleteFile(id);
    setDeleteConfirmId(null);
  };

  const handleEmptyRecycleBin = async () => {
    await emptyRecycleBin();
    setEmptyConfirm(false);
  };

  const formatDeletedAt = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">回收站</h1>
          <p className="text-muted-foreground text-sm mt-1">
            已删除的文件可以恢复或永久删除
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deletedFiles.length > 0 && (
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <select
                className="text-sm border rounded-md px-2 py-1 bg-background"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "deletedAt" | "name")}
              >
                <option value="deletedAt">按删除时间</option>
                <option value="name">按名称</option>
              </select>
            </div>
          )}
          {deletedFiles.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setEmptyConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              清空回收站
            </Button>
          )}
        </div>
      </div>

      {deletedFiles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">回收站为空</p>
          <p className="text-xs mt-1">删除的文件会出现在这里</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {visibleFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
            >
              {/* Thumbnail / Icon */}
              {file.fileType === "image" && (file.thumbnailUrl || file.previewUrl) ? (
                <img
                  src={file.thumbnailUrl || file.previewUrl}
                  alt={file.fileName}
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", getFileColor(file.fileType))}>
                  <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.fileName}>{file.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.fileSize)} · {file.deletedAt ? formatDeletedAt(file.deletedAt) : "已删除"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreview(file)}
                >
                  预览
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(file.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  恢复
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirmId(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {deletedFiles.length - visibleCount} 个文件）
              </Button>
            </div>
          )}
        </div>
      )}

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="永久删除文件"
        description="确定要永久删除此文件吗？此操作不可恢复。"
        onConfirm={() => deleteConfirmId && handlePermanentDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <ConfirmDialog
        open={emptyConfirm}
        title="清空回收站"
        description={`确定要永久删除回收站中的 ${deletedFiles.length} 个文件吗？此操作不可恢复。`}
        onConfirm={handleEmptyRecycleBin}
        onCancel={() => setEmptyConfirm(false)}
      />
    </div>
  );
}

// ─── Face Groups View ────────────────────────────────────────
function FaceGroupsView() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

  if (selectedGroupId) {
    return (
      <FaceGroupPhotos
        groupId={selectedGroupId}
        groupName={selectedGroupName}
        onBack={() => {
          setSelectedGroupId(null);
          setSelectedGroupName(null);
        }}
      />
    );
  }

  return (
    <FaceGroups
      onSelectGroup={(groupId, groupName) => {
        setSelectedGroupId(groupId);
        setSelectedGroupName(groupName);
      }}
    />
  );
}

// ─── Settings View ───────────────────────────────────────────
function SettingsView() {
  const { user, exportData, importData, storageMode } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [batchDragOver, setBatchDragOver] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const jsonStr = await exportData();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-base-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          管理你的账号和应用设置
        </p>
      </div>

      {/* Account info */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            账号信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div>
              <p className="font-medium">{user?.name}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>用户 ID</span>
            </div>
            <span className="font-mono text-xs truncate">{user?.id}</span>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>存储模式</span>
            </div>
            <Badge variant="outline" className="w-fit">
              {user?.storageMode === "cloud" ? "☁️ 云端" : "💾 本地"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Storage mode */}
      <StorageSwitch />

      {/* Data Export */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            数据备份与导出
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            导出所有文件元数据（文件名、标签、收藏状态等）为 JSON 格式，方便备份和迁移。注意：文件内容不会导出，仅导出元数据信息。
          </p>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "导出中..." : "导出数据 (JSON)"}
          </Button>
        </CardContent>
      </Card>

      {/* Data Import */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderInput className="h-4 w-4" />
            数据导入
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            从之前导出的 JSON 文件恢复数据，或批量导入文件到知识库。
          </p>

          {/* JSON Import */}
          <div className="space-y-2">
            <span className="text-sm font-medium">JSON 导入</span>
            <p className="text-xs text-muted-foreground">上传之前导出的 JSON 备份文件，恢复文件元数据。</p>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImporting(true);
                setImportResult(null);
                setImportError(null);
                try {
                  const text = await file.text();
                  const count = await importData(text);
                  setImportResult(`成功导入 ${count} 个文件`);
                } catch {
                  setImportError("导入失败：文件格式不正确");
                } finally {
                  setImporting(false);
                  if (jsonInputRef.current) jsonInputRef.current.value = "";
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => jsonInputRef.current?.click()}
              disabled={importing}
            >
              <FolderInput className="h-4 w-4 mr-2" />
              {importing ? "导入中..." : "选择 JSON 文件"}
            </Button>
          </div>

          <Separator />

          {/* Batch Import */}
          <div className="space-y-2">
            <span className="text-sm font-medium">批量导入</span>
            <p className="text-xs text-muted-foreground">拖拽文件到下方区域进行批量上传（仅支持 {storageMode === "cloud" ? "云端" : "本地"} 模式）。</p>
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                batchDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
              onDragOver={(e) => { e.preventDefault(); setBatchDragOver(true); }}
              onDragLeave={() => setBatchDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setBatchDragOver(false);
                const droppedFiles = Array.from(e.dataTransfer.files);
                if (droppedFiles.length === 0) return;
                setImporting(true);
                setImportResult(null);
                setImportError(null);
                try {
                  let count = 0;
                  for (const f of droppedFiles) {
                    try {
                      const adapter = getStorageAdapter(storageMode);
                      await adapter.uploadFile(f, user!.id);
                      count++;
                    } catch (err) {
                      console.error(`Failed to import ${f.name}:`, err);
                    }
                  }
                  useAppStore.getState().refreshFiles();
                  setImportResult(`成功导入 ${count} / ${droppedFiles.length} 个文件`);
                } catch {
                  setImportError("批量导入失败");
                } finally {
                  setImporting(false);
                }
              }}
            >
              <FolderInput className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {importing ? "导入中..." : "拖拽文件到这里，或点击选择文件"}
              </p>
            </div>
          </div>

          {/* Import result */}
          {importResult && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckSquare className="h-4 w-4" />
              {importResult}
            </div>
          )}
          {importError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <X className="h-4 w-4" />
              {importError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ZIP Backup & Restore */}
      <BackupRestore />

      {/* Voice Note */}
      <VoiceNote />

      {/* Theme Customizer */}
      <ThemeCustomizer />

      {/* Automation Rules */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" />
            自动化规则
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            配置自动化规则，让知识库自动管理你的文件。支持自动标签、自动分类、回收站清理等功能。
          </p>
          <AutomationRules />
        </CardContent>
      </Card>

      {/* About */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">关于</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>智能文档知识库 - v3.0</p>
          <p>支持 Word、PDF、PPTX、图片文件管理</p>
          <p>提供全文搜索、AI 解读、时间线浏览功能</p>
          <p>新增：图片全屏查看、批量操作、回收站、文件重命名、数据导出</p>
          <p className="text-xs mt-2 pt-2 border-t">
            Built with Next.js 16 + shadcn/ui + Prisma + Zustand
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────
const viewVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export default function Home() {
  const {
    currentView,
    isAuthenticated,
    hydrateAuth,
    aiChatFile,
    setAiChatFile,
    lightboxOpen,
    lightboxImages,
    lightboxIndex,
    closeLightbox,
  } = useAppStore();
  const [mounted, setMounted] = useState(false);

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    hydrateAuth();
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [hydrateAuth]);

  // AI chat panel open state derived from aiChatFile
  const aiChatOpen = !!aiChatFile;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <LoginView />;
  }

  const renderView = (view: ViewType) => {
    switch (view) {
      case "dashboard":
        return (
          <motion.div key="dashboard" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <DashboardView />
          </motion.div>
        );
      case "files":
        return (
          <motion.div key="files" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <FilesView />
          </motion.div>
        );
      case "search":
        return (
          <motion.div key="search" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <SearchView />
          </motion.div>
        );
      case "settings":
        return (
          <motion.div key="settings" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <SettingsView />
          </motion.div>
        );
      case "timeline":
        return (
          <motion.div key="timeline" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <TimelineView />
          </motion.div>
        );
      case "favorites":
        return (
          <motion.div key="favorites" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <FavoritesView />
          </motion.div>
        );
      case "recycleBin":
        return (
          <motion.div key="recycleBin" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <RecycleBinView />
          </motion.div>
        );
      case "albums":
        return (
          <motion.div key="albums" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <AlbumView />
          </motion.div>
        );
      case "faceGroups":
        return (
          <motion.div key="faceGroups" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <FaceGroupsView />
          </motion.div>
        );
      case "tags":
        return (
          <motion.div key="tags" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <TagManagement />
          </motion.div>
        );
      case "analytics":
        return (
          <motion.div key="analytics" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <AnalyticsDashboard />
          </motion.div>
        );
      case "knowledgeGraph":
        return (
          <motion.div key="knowledgeGraph" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <KnowledgeGraphView />
          </motion.div>
        );
      default:
        return <LoginView />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar - desktop */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
          <AnimatePresence mode="wait">
            {renderView(currentView)}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile nav */}
      <MobileNav />

      {/* Global AI Chat Panel */}
      <AIChatPanel open={aiChatOpen} onOpenChange={(open) => { if (!open) setAiChatFile(null); }} />

      {/* Global Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={closeLightbox}
      />

      {/* Global Shortcut Help Panel */}
      <ShortcutHelpPanel />
    </div>
  );
}
