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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const navItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: LayoutDashboard, label: "仪表盘", view: "dashboard" },
  { icon: FolderOpen, label: "文件管理", view: "files" },
  { icon: Search, label: "搜索", view: "search" },
  { icon: Settings, label: "设置", view: "settings" },
];

export function Sidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, logout, user } =
    useAppStore();

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
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
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
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
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
