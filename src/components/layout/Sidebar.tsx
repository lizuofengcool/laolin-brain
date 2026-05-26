"use client";

import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Upload,
  CalendarDays,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const navItems: { icon: typeof LayoutDashboard; label: string; view: ViewType; badge?: () => number }[] = [
  { icon: LayoutDashboard, label: "仪表盘", view: "dashboard" },
  { icon: FolderOpen, label: "文件管理", view: "files" },
  { icon: CalendarDays, label: "时间线", view: "timeline" },
  { icon: Star, label: "收藏夹", view: "favorites", badge: () => 0 },
  { icon: Trash2, label: "回收站", view: "recycleBin", badge: () => 0 },
  { icon: Search, label: "搜索", view: "search" },
  { icon: Settings, label: "设置", view: "settings" },
];

export function Sidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, logout, user, files } =
    useAppStore();

  // Get last 5 recently viewed files for sidebar
  const recentFiles = files.filter((f) => !f.isDeleted).slice(0, 5);

  // Compute dynamic badge counts
  const favCount = files.filter((f) => f.isFavorite && !f.isDeleted).length;
  const recycleCount = files.filter((f) => f.isDeleted).length;

  const getBadgeCount = (view: ViewType) => {
    if (view === "favorites") return favCount;
    if (view === "recycleBin") return recycleCount;
    return 0;
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-card transition-all duration-300 h-screen sticky top-0",
        sidebarOpen ? "w-56" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
            KB
          </div>
          {sidebarOpen && (
            <span className="font-semibold text-sm truncate">知识库</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          const badgeCount = getBadgeCount(item.view);
          return (
            <Button
              key={item.view}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 h-10",
                !sidebarOpen && "justify-center px-0"
              )}
              onClick={() => setCurrentView(item.view)}
            >
              <Icon className={cn(
                "h-4 w-4 shrink-0",
                item.view === "recycleBin" && recycleCount > 0 && "text-destructive"
              )} />
              {sidebarOpen && (
                <>
                  <span className="text-sm flex-1 text-left">{item.label}</span>
                  {badgeCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {badgeCount}
                    </Badge>
                  )}
                </>
              )}
            </Button>
          );
        })}

        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 h-10 mt-4",
            !sidebarOpen && "justify-center px-0"
          )}
          onClick={() => setCurrentView("files")}
        >
          <Upload className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span className="text-sm">上传文件</span>}
        </Button>

        {/* Recent files section */}
        {sidebarOpen && recentFiles.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="px-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                最近文件
              </span>
            </div>
            {recentFiles.map((file) => (
              <Button
                key={file.id}
                variant="ghost"
                className="w-full justify-start gap-3 h-8 text-xs truncate"
                onClick={() => {
                  setCurrentView("files");
                }}
              >
                <div className="h-5 w-5 rounded flex items-center justify-center shrink-0 bg-muted">
                  <span className="text-[10px]">
                    {file.fileType === "image" ? "🖼" : file.fileType === "word" ? "📝" : "📄"}
                  </span>
                </div>
                <span className="truncate">{file.fileName}</span>
              </Button>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
        {sidebarOpen && user && (
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">
            {user.name}
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 h-10 text-destructive hover:text-destructive",
            !sidebarOpen && "justify-center px-0"
          )}
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span className="text-sm">退出登录</span>}
        </Button>
      </div>

      {/* Collapse toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-18 h-6 w-6 rounded-full border bg-background shadow-sm hover:bg-accent"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>
    </aside>
  );
}
