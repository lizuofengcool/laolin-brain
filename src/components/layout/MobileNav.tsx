"use client";

import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  CalendarDays,
  Star,
  Trash2,
  ImageIcon,
  Tag,
} from "lucide-react";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const navItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: LayoutDashboard, label: "首页", view: "dashboard" },
  { icon: FolderOpen, label: "文件", view: "files" },
  { icon: ImageIcon, label: "相册", view: "albums" },
  { icon: Star, label: "收藏", view: "favorites" },
  { icon: Tag, label: "标签", view: "tags" },
  { icon: CalendarDays, label: "时间线", view: "timeline" },
  { icon: Search, label: "搜索", view: "search" },
  { icon: Trash2, label: "回收站", view: "recycleBin" },
  { icon: Settings, label: "设置", view: "settings" },
];

export function MobileNav() {
  const { currentView, setCurrentView } = useAppStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur-sm">
      <div className="flex items-center justify-around h-14 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-12 h-full shrink-0 transition-colors",
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
      </div>
    </nav>
  );
}
