"use client";

import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Star,
  User,
  PieChart,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const mainNavItems: { icon: typeof LayoutDashboard; label: string; path: string }[] = [
  { icon: LayoutDashboard, label: "首页", path: "/dashboard" },
  { icon: FolderOpen, label: "文件", path: "/files" },
  { icon: Star, label: "收藏", path: "/favorites" },
  { icon: Search, label: "搜索", path: "/search" },
  { icon: PieChart, label: "报表", path: "/reports" },
  { icon: User, label: "我的", path: "/profile" },
];

export function MobileNav() {
  const favCount = useAppStore((s) => s.files.filter((f) => f.isFavorite && !f.isDeleted).length);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-14">
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          // 前缀匹配：详情页（如 /reports/[id]、/files/[id]）也高亮其所属导航项。
          // 以 item.path + "/" 作为前缀边界，避免 /files-extra 误命中 /files；
          // 当前 6 个 path 互不为前缀，至多一项 active。
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + "/");
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.path === "/favorites" && favCount > 0 && (
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
