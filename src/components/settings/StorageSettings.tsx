"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { HardDrive, Database, Cloud, Upload, Download, Trash2, RefreshCw, Settings } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// 存储使用数据
interface StorageUsage {
  total: number;
  used: number;
  available: number;
  percentage: number;
  byType: Array<{
    type: string;
    size: number;
    count: number;
  }>;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function StorageSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  // 云端同步设置
  const [cloudSync, setCloudSync] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [syncOnWifi, setSyncOnWifi] = useState(false);

  // 备份设置
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState("daily");

  // 加载存储使用数据
  useEffect(() => {
    loadStorageUsage();
  }, []);

  const loadStorageUsage = async () => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 模拟数据
      setUsage({
        total: 10 * 1024 * 1024 * 1024, // 10GB
        used: 3.5 * 1024 * 1024 * 1024, // 3.5GB
        available: 6.5 * 1024 * 1024 * 1024,
        percentage: 35,
        byType: [
          { type: "图片", size: 1.5 * 1024 * 1024 * 1024, count: 1250 },
          { type: "文档", size: 800 * 1024 * 1024, count: 320 },
          { type: "视频", size: 700 * 1024 * 1024, count: 15 },
          { type: "音频", size: 300 * 1024 * 1024, count: 85 },
          { type: "其他", size: 200 * 1024 * 1024, count: 180 },
        ],
      });
    } catch (error) {
      toast({
        title: "加载失败",
        description: "无法获取存储使用信息",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 清理缓存
  const clearCache = async () => {
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "缓存已清理",
        description: "已释放 125MB 存储空间",
      });
    } catch (error) {
      toast({
        title: "清理失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  // 立即同步
  const syncNow = async () => {
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: "同步完成",
        description: "所有文件已同步到云端",
      });
    } catch (error) {
      toast({
        title: "同步失败",
        description: "请检查网络连接",
        variant: "destructive",
      });
    }
  };

  // 立即备份
  const backupNow = async () => {
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 3000));

      toast({
        title: "备份完成",
        description: "数据备份已成功创建",
      });
    } catch (error) {
      toast({
        title: "备份失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 存储概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            存储概览
          </CardTitle>
          <CardDescription>
            查看你的存储空间使用情况
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 总使用量 */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已使用</span>
              <span className="font-medium">
                {formatFileSize(usage?.used || 0)} / {formatFileSize(usage?.total || 0)}
              </span>
            </div>
            <Progress value={usage?.percentage || 0} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usage?.percentage || 0}% 已使用</span>
              <span>剩余 {formatFileSize(usage?.available || 0)}</span>
            </div>
          </div>

          <Separator />

          {/* 按类型统计 */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">按文件类型</h4>
            {usage?.byType.map((item) => (
              <div key={item.type} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{item.type}</span>
                  <span className="text-muted-foreground">
                    {formatFileSize(item.size)} ({item.count} 个文件)
                  </span>
                </div>
                <Progress
                  value={(item.size / (usage?.total || 1)) * 100}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 云端同步设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            云端同步
          </CardTitle>
          <CardDescription>
            配置云端同步相关设置
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="cloud-sync" className="font-medium">
                启用云端同步
              </Label>
              <p className="text-sm text-muted-foreground">
                自动将文件同步到云端
              </p>
            </div>
            <Switch
              id="cloud-sync"
              checked={cloudSync}
              onCheckedChange={setCloudSync}
            />
          </div>

          {cloudSync && (
            <>
              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-sync" className="font-medium">
                    自动同步
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    文件变更后立即同步
                  </p>
                </div>
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={setAutoSync}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sync-wifi" className="font-medium">
                    仅Wi-Fi下同步
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    移动数据下不自动同步
                  </p>
                </div>
                <Switch
                  id="sync-wifi"
                  checked={syncOnWifi}
                  onCheckedChange={setSyncOnWifi}
                />
              </div>

              <Button onClick={syncNow} variant="outline" className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                立即同步
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* 备份设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            备份设置
          </CardTitle>
          <CardDescription>
            配置数据自动备份
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-backup" className="font-medium">
                自动备份
              </Label>
              <p className="text-sm text-muted-foreground">
                定期自动备份数据
              </p>
            </div>
            <Switch
              id="auto-backup"
              checked={autoBackup}
              onCheckedChange={setAutoBackup}
            />
          </div>

          {autoBackup && (
            <>
              <Separator />

              <div className="space-y-2">
                <Label>备份频率</Label>
                <select
                  value={backupFrequency}
                  onChange={(e) => setBackupFrequency(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="hourly">每小时</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
              </div>
            </>
          )}

          <Button onClick={backupNow} variant="outline" className="w-full">
            <Upload className="mr-2 h-4 w-4" />
            立即备份
          </Button>
        </CardContent>
      </Card>

      {/* 缓存管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            缓存管理
          </CardTitle>
          <CardDescription>
            管理本地缓存数据
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">本地缓存</Label>
              <p className="text-sm text-muted-foreground">
                约 125MB 缓存文件
              </p>
            </div>
            <Button onClick={clearCache} variant="outline" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              清理缓存
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
