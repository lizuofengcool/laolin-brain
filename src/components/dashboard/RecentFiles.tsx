"use client";

import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { File, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFileIcon,
  getFileColor,
  formatSize,
  formatTime,
} from "@/lib/file-utils";

export function RecentFiles() {
  const { files, setCurrentView } = useAppStore();
  const recentFiles = files.slice(0, 8);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">最近文件</CardTitle>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setCurrentView("files")}
          >
            查看全部
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {recentFiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <File className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无文件</p>
            <p className="text-xs mt-1">点击上传或拖拽文件到文件管理页面</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentFiles.map((file) => {
              const Icon = getFileIcon(file.fileType);
              const colorClass = getFileColor(file.fileType);
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setCurrentView("files")}
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                      colorClass
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {file.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(file.fileSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {formatTime(file.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
