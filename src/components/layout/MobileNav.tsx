"use client";

import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
} from "lucide-react";
import { useAppStore, type ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const navItems: { icon: typeof LayoutDashboard; label: string; view: ViewType }[] = [
  { icon: LayoutDashboard, label: "首页", view: "dashboard" },
  { icon: FolderOpen, label: "文件", view: "files" },
  { icon: Search, label: "搜索", view: "search" },
  { icon: Settings, label: "设置", view: "settings" },
];

export function MobileNav() {
  const { currentView, setCurrentView } = useAppStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur-sm">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors",
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
