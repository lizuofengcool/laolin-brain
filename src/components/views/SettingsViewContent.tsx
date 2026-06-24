"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/stores/app-store";
import { getStorageAdapter } from "@/lib/storage/factory";
import { StorageSwitch } from "@/components/settings/StorageSwitch";
import { BackupRestore } from "@/components/settings/BackupRestore";
import { CloudSync } from "@/components/settings/CloudSync";
import { ThemeCustomizer } from "@/components/settings/ThemeCustomizer";
import { BillingCenter } from "@/components/billing/BillingCenter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import {
  User, Mail, Shield, Clock, Settings,
  Download, FolderInput, CheckSquare, X,
  Zap, Info, BarChart3, HardDrive, Sparkles,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AutomationRules = dynamic(
  () => import("@/components/settings/AutomationRules"),
  { loading: () => <Skeleton className="h-48 rounded-lg" /> }
);
const VoiceNote = dynamic(
  () => import("@/components/voice/VoiceNote").then((m) => ({ default: m.VoiceNote })),
  { ssr: false }
);

export function SettingsViewContent() {
  const { user, token, exportData, importData, storageMode, autoAiProcessing, setAutoAiProcessing } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [batchDragOver, setBatchDragOver] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const jsonStr = await exportData();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-base-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      setExportError("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  // Fetch AI usage status on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/ai/usage', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setAiUsage(data); })
      .catch(() => {});
  }, [token]);

  // Auto-dismiss export error after 5s
  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => setExportError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [exportError]);

  return (
    <div className="max-w-2xl">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          管理你的账号和应用设置
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        {/* Tab Navigation */}
        <TabsList className="w-full grid grid-cols-5 mb-0">
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">通用</span>
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5">
            <HardDrive className="h-4 w-4" />
            <span className="hidden sm:inline">存储</span>
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-1.5">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">自动化</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5">
            <Crown className="h-4 w-4" />
            <span className="hidden sm:inline">会员</span>
          </TabsTrigger>
          <TabsTrigger value="about" className="gap-1.5">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">关于</span>
          </TabsTrigger>
        </TabsList>
        <Separator className="mt-2 mb-6" />

        {/* ── Tab 1: 通用 ── */}
        <TabsContent value="general">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Account info */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  账号信息
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                    {user?.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      {user?.email}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>用户 ID</span>
                  </div>
                  <span className="font-mono text-xs truncate">{user?.id}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>存储模式</span>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {user?.storageMode === "cloud" ? "☁️ 云端" : "💾 本地"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Theme Customizer */}
            <ThemeCustomizer />
          </motion.div>
        </TabsContent>

        {/* ── Tab 2: 存储与备份 ── */}
        <TabsContent value="storage">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Storage mode */}
            <StorageSwitch />

            {/* Data Export */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  数据备份与导出
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  导出所有文件元数据（文件名、标签、收藏状态等）为 JSON 格式，方便备份和迁移。注意：文件内容不会导出，仅导出元数据信息。
                </p>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? "导出中..." : "导出数据 (JSON)"}
                </Button>
                {exportError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <X className="h-4 w-4" />
                    {exportError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Data Import */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FolderInput className="h-4 w-4" />
                  数据导入
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  从之前导出的 JSON 文件恢复数据，或批量导入文件到知识库。
                </p>

                {/* JSON Import */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">JSON 导入</span>
                  <p className="text-xs text-muted-foreground">上传之前导出的 JSON 备份文件，恢复文件元数据。</p>
                  <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImporting(true);
                      setImportResult(null);
                      setImportError(null);
                      try {
                        const text = await file.text();
                        const count = await importData(text);
                        setImportResult(`成功导入 ${count} 个文件`);
                      } catch {
                        setImportError("导入失败：文件格式不正确");
                      } finally {
                        setImporting(false);
                        if (jsonInputRef.current) jsonInputRef.current.value = "";
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => jsonInputRef.current?.click()}
                    disabled={importing}
                  >
                    <FolderInput className="h-4 w-4 mr-2" />
                    {importing ? "导入中..." : "选择 JSON 文件"}
                  </Button>
                </div>

                <Separator />

                {/* Batch Import */}
                <div className="space-y-2">
                  <span className="text-sm font-medium">批量导入</span>
                  <p className="text-xs text-muted-foreground">拖拽文件到下方区域进行批量上传（仅支持 {storageMode === "cloud" ? "云端" : "本地"} 模式）。</p>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                      batchDragOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    )}
                    onDragOver={(e) => { e.preventDefault(); setBatchDragOver(true); }}
                    onDragLeave={() => setBatchDragOver(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setBatchDragOver(false);
                      const droppedFiles = Array.from(e.dataTransfer.files);
                      if (droppedFiles.length === 0) return;
                      setImporting(true);
                      setImportResult(null);
                      setImportError(null);
                      try {
                        let count = 0;
                        for (const f of droppedFiles) {
                          try {
                            const adapter = getStorageAdapter(storageMode);
                            if (!user) { setImportError("用户未登录"); break; }
                            await adapter.uploadFile(f, user.id);
                            count++;
                          } catch (err) {
                            console.error(`Failed to import ${f.name}:`, err);
                          }
                        }
                        useAppStore.getState().refreshFiles();
                        setImportResult(`成功导入 ${count} / ${droppedFiles.length} 个文件`);
                      } catch {
                        setImportError("批量导入失败");
                      } finally {
                        setImporting(false);
                      }
                    }}
                  >
                    <FolderInput className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {importing ? "导入中..." : "拖拽文件到这里，或点击选择文件"}
                    </p>
                  </div>
                </div>

                {/* Import result */}
                {importResult && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckSquare className="h-4 w-4" />
                    {importResult}
                  </div>
                )}
                {importError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <X className="h-4 w-4" />
                    {importError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ZIP Backup & Restore */}
            <BackupRestore />

            {/* Cloud Sync */}
            <CloudSync />
          </motion.div>
        </TabsContent>

        {/* ── Tab 3: 自动化 ── */}
        <TabsContent value="automation">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* AI Auto-Processing Toggle & Usage */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI 自动处理
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      开启后，上传文件时自动进行 AI 摘要、标签生成和 OCR 识别。
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      关闭后可节省 AI 调用次数。
                    </p>
                  </div>
                  <Switch
                    checked={autoAiProcessing}
                    onCheckedChange={setAutoAiProcessing}
                  />
                </div>
                {/* AI usage indicator */}
                {aiUsage && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">今日 AI 调用</span>
                      <span className="font-medium">{aiUsage.used} / {aiUsage.limit}</span>
                    </div>
                    <Progress value={(aiUsage.used / aiUsage.limit) * 100} />
                    <p className="text-xs text-muted-foreground">
                      剩余 {aiUsage.remaining} 次，每日零点重置
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Automation Rules */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  自动化规则
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  配置自动化规则，让知识库自动管理你的文件。支持自动标签、自动分类、回收站清理等功能。
                </p>
                <AutomationRules />
              </CardContent>
            </Card>

            {/* Voice Note */}
            <VoiceNote />
          </motion.div>
        </TabsContent>

        {/* ── Tab 4: 会员与订阅 ── */}
        <TabsContent value="billing">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <BillingCenter />
          </motion.div>
        </TabsContent>

        {/* ── Tab 5: 关于 ── */}
        <TabsContent value="about">
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* About */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">关于</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>智能文档知识库 - v3.0</p>
                <p>支持 Word、PDF、PPTX、图片文件管理</p>
                <p>提供全文搜索、AI 解读、时间线浏览功能</p>
                <p>新增：图片全屏查看、批量操作、回收站、文件重命名、数据导出</p>
                <p className="text-xs mt-2 pt-2 border-t">
                  Built with Next.js 16 + shadcn/ui + Prisma + Zustand
                </p>
              </CardContent>
            </Card>

            {/* Tech Stack */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  技术栈
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Next.js 16</Badge>
                  <Badge variant="outline">React 19</Badge>
                  <Badge variant="outline">TypeScript</Badge>
                  <Badge variant="outline">Tailwind CSS 4</Badge>
                  <Badge variant="outline">shadcn/ui</Badge>
                  <Badge variant="outline">Prisma</Badge>
                  <Badge variant="outline">Zustand</Badge>
                  <Badge variant="outline">Framer Motion</Badge>
                  <Badge variant="outline">Lucide Icons</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
