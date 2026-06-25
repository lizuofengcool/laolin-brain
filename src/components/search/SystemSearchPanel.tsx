"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HardDrive, Search, RefreshCw, ShieldAlert, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── 类型 ──────────────────────────────────────────────────────

interface SystemFileEntry {
  path: string;
  name: string;
  ext: string;
  is_dir: boolean;
  size: number;
  created: string | null;
  modified: string | null;
}

interface IndexStatus {
  is_ready: boolean;
  total_files: number;
  total_dirs: number;
  indexed_drives: string[];
  index_time_ms: number;
  last_update: string | null;
}

// ─── Tauri invoke 封装 ──────────────────────────────────────────

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__;
  return typeof tauri === "object" && tauri !== null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__ as {
    core: { invoke: <R>(c: string, a?: Record<string, unknown>) => Promise<R> };
  };
  if (!tauri?.core?.invoke) {
    throw new Error("Tauri invoke 不可用");
  }
  return tauri.core.invoke<T>(cmd, args);
}

// ─── 工具函数 ──────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

function formatTimestamp(ms: string | null): string {
  if (!ms) return "";
  const num = parseInt(ms, 10);
  if (isNaN(num) || num === 0) return "";
  return new Date(num).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(ext: string, isDir: boolean): string {
  if (isDir) return "📁";
  const map: Record<string, string> = {
    pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
    ppt: "📑", pptx: "📑", txt: "📃", md: "📃",
    jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", webp: "🖼️", svg: "🖼️", bmp: "🖼️",
    mp3: "🎵", wav: "🎵", flac: "🎵", aac: "🎵",
    mp4: "🎬", avi: "🎬", mkv: "🎬", mov: "🎬", wmv: "🎬",
    zip: "📦", rar: "📦", "7z": "📦", tar: "📦", gz: "📦",
    exe: "⚙️", msi: "⚙️", dll: "⚙️",
    js: "💻", ts: "💻", py: "💻", rs: "💻", java: "💻", cpp: "💻", c: "💻",
    html: "🌐", css: "🎨", json: "📋", xml: "📋", yaml: "📋", yml: "📋",
  };
  return map[ext.toLowerCase()] || "📎";
}

// ─── 组件 ──────────────────────────────────────────────────────

export function SystemSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SystemFileEntry[]>([]);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extFilter, setExtFilter] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [watcherRunning, setWatcherRunning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检查是否在 Tauri 环境中
  const isTauriEnv = isTauri();

  // 检测管理员权限
  useEffect(() => {
    if (!isTauriEnv) return;
    invoke<boolean>("system_search_is_admin")
      .then((admin) => setIsAdmin(admin))
      .catch(() => setIsAdmin(false));
  }, [isTauriEnv]);

  // 加载监听状态
  useEffect(() => {
    if (!isTauriEnv) return;
    invoke<boolean>("system_search_watcher_status")
      .then((running) => setWatcherRunning(running))
      .catch(() => setWatcherRunning(false));
  }, [isTauriEnv]);

  // 加载索引状态
  const loadStatus = useCallback(async () => {
    if (!isTauriEnv) return;
    try {
      const s = await invoke<IndexStatus>("system_search_status");
      setStatus(s);
    } catch {
      // 忽略
    }
  }, [isTauriEnv]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // 构建索引
  const handleBuildIndex = async () => {
    if (!isTauriEnv) return;
    setBuilding(true);
    setError(null);
    try {
      const s = await invoke<IndexStatus>("system_search_build_index");
      setStatus(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setBuilding(false);
    }
  };

  // 搜索
  const handleSearch = useCallback(async (q: string) => {
    if (!isTauriEnv || !q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<SystemFileEntry[]>("system_search_query", {
        query: q.trim(),
        extFilter: extFilter.trim() || null,
        maxResults: 200,
      });
      setResults(r);
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [isTauriEnv, extFilter]);

  // 防抖搜索
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => handleSearch(value), 200);
    } else {
      setResults([]);
    }
  };

  // 清理
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 非 Tauri 环境
  if (!isTauriEnv) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">全盘搜索仅桌面版可用</p>
        <p className="text-xs mt-1">请安装 Tauri 桌面版体验毫秒级全盘文件搜索</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 管理员权限提示 */}
      {isAdmin === false && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">需要管理员权限</p>
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              全盘搜索需要读取 NTFS 文件系统索引（MFT），请右键应用图标选择"以管理员身份运行"后重试。
            </p>
          </div>
        </div>
      )}

      {/* 索引状态栏 */}
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          {status?.is_ready ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-muted-foreground" />
          )}
          <div className="text-sm">
            {status?.is_ready ? (
              <>
                <span className="font-medium">索引就绪</span>
                <span className="text-muted-foreground ml-2">
                  {status.total_files.toLocaleString()} 文件 · {status.total_dirs.toLocaleString()} 文件夹 ·
                  索引耗时 {status.index_time_ms}ms
                </span>
                {watcherRunning && (
                  <span className="ml-2 text-green-600 dark:text-green-400">● 实时监听中</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">索引未构建，点击右侧按钮开始</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.is_ready && (
            <Button
              variant={watcherRunning ? "default" : "outline"}
              size="sm"
              onClick={async () => {
                try {
                  if (watcherRunning) {
                    await invoke<boolean>("system_search_stop_watcher");
                    setWatcherRunning(false);
                  } else {
                    const started = await invoke<boolean>("system_search_start_watcher");
                    setWatcherRunning(started);
                  }
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              {watcherRunning ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                  停止监听
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  实时监听
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBuildIndex}
            disabled={building}
          >
            {building ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                构建中...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {status?.is_ready ? "刷新索引" : "构建索引"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="搜索全盘文件名... (支持多关键词空格分隔)"
            className="pl-9"
            disabled={!status?.is_ready}
          />
        </div>
        <Input
          value={extFilter}
          onChange={(e) => setExtFilter(e.target.value)}
          placeholder="扩展名过滤 (如 pdf)"
          className="w-36"
          disabled={!status?.is_ready}
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 搜索结果 */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">搜索中...</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="border rounded-lg divide-y max-h-[60vh] overflow-y-auto">
          <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground">
            找到 {results.length} 个结果
          </div>
          {results.map((file, i) => (
            <div
              key={`${file.path}-${i}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
              onDoubleClick={() => {
                // 双击打开文件
                invoke("open_file_externally", { filePath: file.path }).catch(() => {});
              }}
            >
              <span className="text-lg shrink-0">{getFileIcon(file.ext, file.is_dir)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground truncate" title={file.path}>
                  {file.path}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">
                  {!file.is_dir && formatSize(file.size)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(file.modified)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && query && results.length === 0 && status?.is_ready && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          未找到匹配的文件
        </div>
      )}

      {/* 提示 */}
      {status?.is_ready && !query && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">输入关键词搜索全盘文件</p>
          <p className="text-xs mt-1">支持多关键词空格分隔，如：报告 2025 pdf</p>
        </div>
      )}
    </div>
  );
}
