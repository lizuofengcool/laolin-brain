"use client";

import { Search, Sun, Moon, Languages, User, Settings, Star, Trash2, Tag, BarChart3, ImageIcon, ScanFace, CalendarDays, Network, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { useAvatar } from "@/hooks/use-avatar";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useI18n, LOCALES, type Locale } from "@/lib/i18n";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function Header() {
  const { user, searchQuery, setSearchQuery, logout } = useAppStore();
  const { setTheme, resolvedTheme } = useTheme();
  const { locale, setLocale } = useI18n();
  const { avatar } = useAvatar();
  const { pendingCount } = useOfflineQueue();
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push("/search");
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-30 flex items-center px-4 gap-4 pt-[env(safe-area-inset-top)]">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索文件... (Ctrl+K)"
            className="pl-9 h-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      <div className="flex items-center gap-2 ml-auto">
        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={toggleTheme}
          title={resolvedTheme === "dark" ? "切换亮色模式" : "切换暗色模式"}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Language switch */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" title="切换语言">
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {LOCALES.map((l) => (
              <DropdownMenuItem
                key={l.value}
                onClick={() => setLocale(l.value as Locale)}
                className={locale === l.value ? "bg-accent" : ""}
              >
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification bell */}
        <NotificationBell />

        {/* Offline queue indicator */}
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-xs gap-1">
            <WifiOff className="h-3 w-3" />
            {pendingCount} 待同步
          </Badge>
        )}

        {/* My profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={avatar || undefined} alt="头像" />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {user?.name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-sm font-medium">
                {user?.name || "用户"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name || "用户"}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User className="mr-2 h-4 w-4" />
              个人中心
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/favorites")}>
              <Star className="mr-2 h-4 w-4" />
              我的收藏
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/trash")}>
              <Trash2 className="mr-2 h-4 w-4" />
              回收站
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/albums")}>
              <ImageIcon className="mr-2 h-4 w-4" />
              智能相册
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/faces")}>
              <ScanFace className="mr-2 h-4 w-4" />
              人脸识别
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/timeline")}>
              <CalendarDays className="mr-2 h-4 w-4" />
              时间线
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/tags")}>
              <Tag className="mr-2 h-4 w-4" />
              标签管理
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/analytics")}>
              <BarChart3 className="mr-2 h-4 w-4" />
              数据分析
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/graph")}>
              <Network className="mr-2 h-4 w-4" />
              知识图谱
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              系统设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:text-destructive"
            >
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
