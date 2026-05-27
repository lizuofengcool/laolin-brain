"use client";

import { useMemo } from "react";
import {
  User,
  Mail,
  Shield,
  Clock,
  HardDrive,
  FileText,
  Image as ImageIcon,
  Star,
  Trash2,
  Settings,
  Palette,
  Tag,
  CalendarDays,
  FolderOpen,
  BarChart3,
  Network,
  ScanFace,
  Download,
  FolderInput,
  Zap,
  Volume2,
  Archive,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Globe,
  Info,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * 个人中心页面
 * 包含：用户信息、存储统计、快捷入口（设置+更多功能）、退出登录
 */

export function ProfileView() {
  const { user, files, setCurrentView, logout } = useAppStore();
  const { theme, setTheme } = useTheme();

  const stats = useMemo(() => {
    const active = files.filter((f) => !f.isDeleted);
    const images = active.filter((f) => f.fileType === "image");
    const docs = active.filter((f) => ["word", "pdf", "pptx"].includes(f.fileType));
    const favs = active.filter((f) => f.isFavorite);
    const deleted = files.filter((f) => f.isDeleted);
    const totalSize = active.reduce((s, f) => s + (f.fileSize || 0), 0);
    return {
      total: active.length,
      images: images.length,
      docs: docs.length,
      favorites: favs.length,
      deleted: deleted.length,
      totalSize: formatSize(totalSize),
    };
  }, [files]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">我的</h1>
        <p className="text-muted-foreground text-sm mt-1">个人信息与应用管理</p>
      </div>

      {/* User profile card */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate">{user?.name || "用户"}</h2>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <Badge variant="outline" className="mt-2">
                {user?.storageMode === "cloud" ? "☁️ 云端存储" : "💾 本地存储"}
              </Badge>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>用户 ID</span>
            </div>
            <span className="font-mono text-xs truncate">{user?.id}</span>
          </div>
        </CardContent>
      </Card>

      {/* Storage statistics */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            存储概况
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground mt-1">总文件</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.images}</p>
              <p className="text-xs text-muted-foreground mt-1">图片</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.docs}</p>
              <p className="text-xs text-muted-foreground mt-1">文档</p>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-semibold text-primary">{stats.favorites}</p>
              <p className="text-xs text-muted-foreground mt-1">收藏</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-destructive">{stats.deleted}</p>
              <p className="text-xs text-muted-foreground mt-1">回收站</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{stats.totalSize}</p>
              <p className="text-xs text-muted-foreground mt-1">已用空间</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" />
            快捷操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {quickActions.map((action, i) => (
            <div key={action.view}>
              <button
                onClick={() => action.onClick(setCurrentView)}
                className="flex items-center gap-3 w-full px-6 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", action.bgColor)}>
                  <action.icon className={cn("h-4 w-4", action.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{action.label}</span>
                  <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
              {i < quickActions.length - 1 && <Separator className="ml-16" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* More features */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            更多功能
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {moreFeatures.map((feature, i) => (
            <div key={feature.view}>
              <button
                onClick={() => feature.onClick(setCurrentView)}
                className="flex items-center gap-3 w-full px-6 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <feature.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium flex-1">{feature.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
              {i < moreFeatures.length - 1 && <Separator className="ml-16" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Palette className="h-4 w-4" />
            偏好设置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-6 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {theme === "dark" ? (
                <Moon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Sun className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <span className="text-sm font-medium flex-1 text-left">
              {theme === "dark" ? "深色模式" : "浅色模式"}
            </span>
            <Badge variant="outline" className="text-xs">
              {theme === "dark" ? "已开启" : "已关闭"}
            </Badge>
          </button>
          <Separator className="ml-16" />
          {/* Settings */}
          <button
            onClick={() => setCurrentView("settings")}
            className="flex items-center gap-3 w-full px-6 py-3 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium flex-1">系统设置</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="shadow-sm">
        <CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            <span>智能文档知识库 v3.0</span>
          </div>
          <p className="text-xs">
            Built with Next.js 16 + shadcn/ui + Prisma + Zustand
          </p>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={logout}
      >
        <LogOut className="h-4 w-4 mr-2" />
        退出登录
      </Button>
    </div>
  );
}

// Quick action items
const quickActions: {
  icon: typeof User;
  label: string;
  desc: string;
  bgColor: string;
  iconColor: string;
  view: string;
  onClick: (set: (v: ViewType) => void) => void;
}[] = [
  {
    icon: Star,
    label: "我的收藏",
    desc: "查看收藏的文件和文档",
    bgColor: "bg-amber-100 dark:bg-amber-950/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    view: "favorites",
    onClick: (set) => set("favorites"),
  },
  {
    icon: Trash2,
    label: "回收站",
    desc: "查看和恢复已删除的文件",
    bgColor: "bg-red-100 dark:bg-red-950/30",
    iconColor: "text-red-600 dark:text-red-400",
    view: "recycleBin",
    onClick: (set) => set("recycleBin"),
  },
  {
    icon: Tag,
    label: "标签管理",
    desc: "管理文件标签分类",
    bgColor: "bg-blue-100 dark:bg-blue-950/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    view: "tags",
    onClick: (set) => set("tags"),
  },
  {
    icon: BarChart3,
    label: "数据分析",
    desc: "查看存储使用和文件统计",
    bgColor: "bg-green-100 dark:bg-green-950/30",
    iconColor: "text-green-600 dark:text-green-400",
    view: "analytics",
    onClick: (set) => set("analytics"),
  },
];

// More feature items
const moreFeatures: {
  icon: typeof User;
  label: string;
  view: string;
  onClick: (set: (v: ViewType) => void) => void;
}[] = [
  { icon: ImageIcon, label: "智能相册", view: "albums", onClick: (set) => set("albums") },
  { icon: ScanFace, label: "人脸识别", view: "faceGroups", onClick: (set) => set("faceGroups") },
  { icon: CalendarDays, label: "时间线", view: "timeline", onClick: (set) => set("timeline") },
  { icon: Network, label: "知识图谱", view: "knowledgeGraph", onClick: (set) => set("knowledgeGraph") },
];

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
