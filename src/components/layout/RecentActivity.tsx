"use client";

import { useState } from "react";
import {
  Upload,
  Trash2,
  RotateCcw,
  Star,
  StarOff,
  PenLine,
  Share2,
  Tag,
  Clock,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActivityStore, type ActivityType } from "@/stores/activity-store";

const VISIBLE_COUNT = 10;

/** 活动类型的图标、颜色、描述映射 */
const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: typeof Upload; color: string; bgColor: string; label: string }
> = {
  upload: {
    icon: Upload,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-950/30",
    label: "上传了",
  },
  delete: {
    icon: Trash2,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-950/30",
    label: "删除了",
  },
  restore: {
    icon: RotateCcw,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-950/30",
    label: "恢复了",
  },
  favorite: {
    icon: Star,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-950/30",
    label: "收藏了",
  },
  unfavorite: {
    icon: StarOff,
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-800/30",
    label: "取消收藏",
  },
  rename: {
    icon: PenLine,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-950/30",
    label: "重命名了",
  },
  share: {
    icon: Share2,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-950/30",
    label: "分享了",
  },
  tag: {
    icon: Tag,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-950/30",
    label: "标记了",
  },
};

/** 相对时间格式化 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay === 1) return "昨天";
  if (diffDay < 30) return `${diffDay}天前`;

  // 超过 30 天显示日期
  const date = new Date(isoString);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 活动时间线组件
 * - 左侧竖线 + 彩色圆点 + 图标
 * - 右侧：操作描述 + 文件名 + 相对时间
 * - 空状态 + 最多显示 10 条 + 查看全部
 */
export function RecentActivity() {
  const { activities } = useActivityStore();
  const [showAll, setShowAll] = useState(false);

  const displayList = showAll ? activities : activities.slice(0, VISIBLE_COUNT);
  const hasMore = activities.length > VISIBLE_COUNT;

  if (activities.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            活动记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无活动记录</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              上传、收藏、删除等操作将在此显示
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" />
          活动记录
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            共 {activities.length} 条
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative max-h-96 overflow-y-auto space-y-0 pr-1">
          {/* Timeline items */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-0">
              {displayList.map((item) => {
                const config = ACTIVITY_CONFIG[item.type];
                const Icon = config.icon;

                return (
                  <div
                    key={item.id}
                    className="relative flex items-start gap-3 py-2.5"
                  >
                    {/* Icon dot */}
                    <div
                      className={cn(
                        "relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 border-background",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-sm">
                        <span className="text-muted-foreground">
                          {config.label}
                        </span>{" "}
                        <span className="font-medium truncate">
                          {item.fileName}
                        </span>
                      </p>
                      {item.details && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                          {item.details}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Show all / collapse button */}
        {hasMore && (
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground text-xs"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "收起" : `查看全部 (${activities.length} 条)`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
