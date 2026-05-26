"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Cloud, HardDrive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StorageSwitch() {
  const { storageMode, setStorageMode } = useAppStore();
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async (mode: string) => {
    if (mode === storageMode) return;

    if (mode === "local") {
      if (!confirm("切换到本地存储后，云端文件将不可见。确定要切换吗？")) return;
    } else {
      if (!confirm("切换到云端存储后，本地文件将不可见。确定要切换吗？")) return;
    }

    setSwitching(true);
    try {
      await setStorageMode(mode);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">存储模式</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            storageMode === "local"
              ? "border-primary bg-primary/5"
              : "border-muted hover:border-muted-foreground/30"
          )}
          onClick={() => handleSwitch("local")}
        >
          <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <HardDrive className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1">
            <Label className="text-sm font-medium">本地存储 (IndexedDB)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              文件存储在浏览器中，离线可用，适合个人使用
            </p>
          </div>
          <div
            className={cn(
              "h-5 w-5 rounded-full border-2 flex items-center justify-center",
              storageMode === "local"
                ? "border-primary"
                : "border-muted-foreground/30"
            )}
          >
            {storageMode === "local" && (
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            storageMode === "cloud"
              ? "border-primary bg-primary/5"
              : "border-muted hover:border-muted-foreground/30"
          )}
          onClick={() => handleSwitch("cloud")}
        >
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Cloud className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <Label className="text-sm font-medium">云端存储 (服务端)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              文件存储在服务器上，支持文档内容搜索，适合团队协作
            </p>
          </div>
          <div
            className={cn(
              "h-5 w-5 rounded-full border-2 flex items-center justify-center",
              storageMode === "cloud"
                ? "border-primary"
                : "border-muted-foreground/30"
            )}
          >
            {storageMode === "cloud" && (
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </div>
        </div>

        {switching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            正在切换存储模式...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
