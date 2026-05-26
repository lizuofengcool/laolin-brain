"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore, type ViewType } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { LoginForm } from "@/components/auth/LoginForm";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentFiles } from "@/components/dashboard/RecentFiles";
import { FileGrid } from "@/components/files/FileGrid";
import { FolderTree } from "@/components/files/FolderTree";
import { UploadZone } from "@/components/files/UploadZone";
import { FilePreview } from "@/components/files/FilePreview";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { StorageSwitch } from "@/components/settings/StorageSwitch";
import { AIChatPanel } from "@/components/ai/AIChatPanel";
import { TimelineView } from "@/components/timeline/TimelineView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Image as ImageIcon,
  HardDrive,
  Star,
  Clock,
  User,
  Mail,
  Shield,
} from "lucide-react";
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
  return <LoginForm />;
}

// ─── Dashboard View ──────────────────────────────────────────
function DashboardView() {
  const { files, user } = useAppStore();

  const docCount = files.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx").length;
  const imageCount = files.filter((f) => f.fileType === "image").length;
  const favCount = files.filter((f) => f.isFavorite).length;
  const totalSize = files.reduce((acc, f) => acc + f.fileSize, 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (files.length === 0) {
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="文档"
          value={docCount}
          icon={FileText}
          description="Word & PDF & PPT"
        />
        <StatsCard
          title="图片"
          value={imageCount}
          icon={ImageIcon}
          description="照片 & 图片"
        />
        <StatsCard
          title="收藏"
          value={favCount}
          icon={Star}
          description="标记的重要文件"
        />
        <StatsCard
          title="存储"
          value={formatSize(totalSize)}
          icon={HardDrive}
          description={`${files.length} 个文件`}
        />
      </div>

      {/* Recent files */}
      <RecentFiles />
    </div>
  );
}

// ─── Files View ──────────────────────────────────────────────
function FilesView() {
  const { files, selectedFolderId, setSelectedFolderId, storageMode } =
    useAppStore();
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setVisibleCount(20);
  };

  // Filter files
  let filteredFiles = files;
  if (selectedFolderId) {
    filteredFiles = filteredFiles.filter((f) => f.folderId === selectedFolderId);
  } else {
    filteredFiles = filteredFiles.filter((f) => !f.folderId);
  }
  if (tagFilter) {
    filteredFiles = filteredFiles.filter((f) => f.tags.includes(tagFilter));
  }

  // Pagination
  const visibleFiles = filteredFiles.slice(0, visibleCount);
  const hasMore = visibleCount < filteredFiles.length;

  // Collect all tags
  const allTags = [...new Set(files.flatMap((f) => f.tags))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文件管理</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理、上传和浏览你的文件
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {storageMode === "cloud" ? "☁️ 云端模式" : "💾 本地模式"}
        </Badge>
      </div>

      {/* Upload zone */}
      <UploadZone />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - Folders & Tags */}
        <div className="lg:w-56 shrink-0 space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4">
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
          <FileGrid files={visibleFiles} onPreview={handlePreview} />

          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                加载更多（剩余 {filteredFiles.length - visibleCount} 个文件）
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
    </div>
  );
}

// ─── Search View ─────────────────────────────────────────────
function SearchView() {
  const { searchQuery, setSearchQuery, aiChatFile, setAiChatFile } = useAppStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = () => {
    setSearchQuery(localQuery);
    setSearchTrigger((prev) => prev + 1);
  };

  // Debounced search on input change
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

// ─── Settings View ───────────────────────────────────────────
function SettingsView() {
  const { user } = useAppStore();

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

      {/* About */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">关于</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>智能文档知识库 - v2.0</p>
          <p>支持 Word、PDF、PPTX、图片文件管理</p>
          <p>提供全文搜索、AI 解读、时间线浏览功能</p>
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
    files,
  } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrateAuth();
    // Deferred setState to avoid cascading renders warning
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
        return files.length === 0 ? (
          <motion.div key="dashboard" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
            <DashboardView />
          </motion.div>
        ) : (
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
    </div>
  );
}
