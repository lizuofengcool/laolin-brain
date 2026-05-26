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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

// ─── Login View ──────────────────────────────────────────────
function LoginView() {
  return <LoginForm />;
}

// ─── Dashboard View ──────────────────────────────────────────
function DashboardView() {
  const { files, user } = useAppStore();

  const docCount = files.filter((f) => f.fileType === "word" || f.fileType === "pdf").length;
  const imageCount = files.filter((f) => f.fileType === "image").length;
  const favCount = files.filter((f) => f.isFavorite).length;
  const totalSize = files.reduce((acc, f) => acc + f.fileSize, 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

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
          description="Word & PDF"
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

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
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
          <FileGrid files={filteredFiles} onPreview={handlePreview} />
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
  const { searchQuery, setSearchQuery } = useAppStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleSearch = () => {
    setSearchQuery(localQuery);
    setSearchTrigger((prev) => prev + 1);
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
          onChange={(v) => setLocalQuery(v)}
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
          <p>智能文档知识库 - MVP v1.0</p>
          <p>支持 Word、PDF、图片文件管理</p>
          <p>提供全文搜索和文件夹管理功能</p>
          <p className="text-xs mt-2 pt-2 border-t">
            Built with Next.js 16 + shadcn/ui + Prisma + Zustand
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function Home() {
  const {
    currentView,
    isAuthenticated,
    hydrateAuth,
  } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrateAuth();
    // Deferred setState to avoid cascading renders warning
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [hydrateAuth]);

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

  // Authenticated - show main app
  const viewMap: Record<ViewType, React.ReactNode> = {
    dashboard: <DashboardView />,
    files: <FilesView />,
    search: <SearchView />,
    settings: <SettingsView />,
    login: <LoginView />,
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar - desktop */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
          {viewMap[currentView] || <DashboardView />}
        </main>
      </div>

      {/* Mobile nav */}
      <MobileNav />
    </div>
  );
}
