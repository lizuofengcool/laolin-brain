"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  Star,
  Trash2,
  CalendarDays,
  ImageIcon,
  Tag,
  MoreHorizontal,
} from "lucide-react";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const mainNavItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: LayoutDashboard, label: "首页", view: "dashboard" },
  { icon: FolderOpen, label: "文件", view: "files" },
  { icon: Star, label: "收藏", view: "favorites" },
  { icon: Search, label: "搜索", view: "search" },
  { icon: Settings, label: "设置", view: "settings" },
];

const moreNavItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: ImageIcon, label: "相册", view: "albums" },
  { icon: Tag, label: "标签", view: "tags" },
  { icon: CalendarDays, label: "时间线", view: "timeline" },
  { icon: Trash2, label: "回收站", view: "recycleBin" },
];

export function MobileNav() {
  const { currentView, setCurrentView, files } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const recycleCount = files.filter((f) => f.isDeleted).length;

  const handleNav = (view: ViewType) => {
    setCurrentView(view);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-around h-14">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => handleNav(item.view)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors relative",
              moreOpen
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px]">更多</span>
          </button>
        </div>

        {/* Expandable "more" menu */}
        {moreOpen && (
          <div className="absolute bottom-14 left-0 right-0 bg-card border-t shadow-lg animate-in slide-in-from-bottom-2 duration-200 z-50">
            <div className="grid grid-cols-4 gap-1 p-2">
              {moreNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.view;
                return (
                  <button
                    key={item.view}
                    onClick={() => handleNav(item.view)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <div className="relative">
                      <Icon className="h-5 w-5" />
                      {item.view === "recycleBin" && recycleCount > 0 && (
                        <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-medium">
                          {recycleCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Click outside to close more menu */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}
