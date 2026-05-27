"use client";

import { useMemo } from "react";
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Star,
  User,
} from "lucide-react";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const mainNavItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: LayoutDashboard, label: "首页", view: "dashboard" },
  { icon: FolderOpen, label: "文件", view: "files" },
  { icon: Star, label: "收藏", view: "favorites" },
  { icon: Search, label: "搜索", view: "search" },
  { icon: User, label: "我的", view: "profile" },
];

export function MobileNav() {
  const { currentView, setCurrentView, files } = useAppStore();

  const favCount = useMemo(() => files.filter((f) => f.isFavorite && !f.isDeleted).length, [files]);

  const handleNav = (view: ViewType) => {
    setCurrentView(view);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
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
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.view === "favorites" && favCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-medium">
                    {favCount > 99 ? "99+" : favCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
