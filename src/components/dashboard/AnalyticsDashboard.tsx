"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/app-store";
import { formatSize } from "@/lib/file-utils";
import {
  TrendingUp,
  HardDrive,
  FileText,
  Calendar,
  Tag,
  Zap,
  BarChart3,
  Activity,
} from "lucide-react";

interface AnalyticsData {
  fileGrowth: { month: string; count: number }[];
  storageByType: Record<string, number>;
  fileTypeTrend: { month: string; [type: string]: number | string }[];
  topFiles: { id: string; fileName: string; fileSize: number; fileType: string }[];
  activity: {
    byHour: number[];
    byDayOfWeek: number[];
  };
  stats: {
    totalFiles: number;
    totalSize: number;
    avgFileSize: number;
    filesThisWeek: number;
    filesThisMonth: number;
    topTags: { tag: string; count: number }[];
    efficiencyScore: number;
  };
  predictions: {
    oneMonth: number;
    threeMonths: number;
    sixMonths: number;
  };
}

const FILE_TYPE_COLORS: Record<string, string> = {
  image: "#22c55e",
  word: "#3b82f6",
  pdf: "#ef4444",
  pptx: "#f59e0b",
  markdown: "#a855f7",
  txt: "#8b5cf6",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  image: "图片",
  word: "文档",
  pdf: "PDF",
  pptx: "演示",
  markdown: "Markdown",
  txt: "文本",
};

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {entry.name.includes("文件数") ? entry.value : formatSize(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function HeatmapCell({ value, max, label }: { value: number; max: number; label: string }) {
  const intensity = max > 0 ? value / max : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-8 h-8 rounded-sm transition-colors"
        style={{
          backgroundColor: intensity === 0
            ? "var(--muted)"
            : `rgba(34, 197, 94, ${0.2 + intensity * 0.8})`,
        }}
        title={`${label}: ${value} 个文件`}
      />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { user } = useAppStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/analytics?userId=${userId}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err) {
        console.error("Failed to load analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [user]);

  // All file types from trend data - must be before early returns (hooks rule)
  const allTypes = useMemo(() => {
    if (!data) return [];
    const types = new Set<string>();
    data.fileTypeTrend.forEach((entry) => {
      Object.keys(entry).forEach((key) => {
        if (!["month"].includes(key)) types.add(key);
      });
    });
    return Array.from(types);
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">暂无分析数据</p>
      </div>
    );
  }

  const { fileGrowth, topFiles, activity, stats, predictions } = data;
  const hourMax = Math.max(...activity.byHour);
  const dayMax = Math.max(...activity.byDayOfWeek);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">存储分析</h1>
        <p className="text-muted-foreground text-sm mt-1">
          深入了解你的文件使用情况和存储趋势
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">平均文件大小</span>
            </div>
            <p className="text-lg font-bold">{formatSize(stats.avgFileSize)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">本周上传</span>
            </div>
            <p className="text-lg font-bold">{stats.filesThisWeek} <span className="text-xs font-normal text-muted-foreground">个</span></p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">本月上传</span>
            </div>
            <p className="text-lg font-bold">{stats.filesThisMonth} <span className="text-xs font-normal text-muted-foreground">个</span></p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">常用标签</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {stats.topTags.slice(0, 3).map((t) => (
                <Badge key={t.tag} variant="secondary" className="text-[10px]">
                  {t.tag}
                </Badge>
              ))}
              {stats.topTags.length === 0 && <span className="text-xs text-muted-foreground">暂无</span>}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">存储效率</span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold">{stats.efficiencyScore}</p>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File Growth Trend + Storage Prediction */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              文件增长趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fileGrowth.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fileGrowth} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => v.split("-")[1] + "月"}
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="文件数"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Prediction */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              存储预测
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <p className="text-muted-foreground mb-3">当前总存储</p>
              <p className="text-2xl font-bold">{formatSize(stats.totalSize)}</p>
            </div>
            <div className="space-y-3 pt-2 border-t">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">1 个月后</span>
                <Badge variant="outline">{formatSize(predictions.oneMonth)}</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">3 个月后</span>
                <Badge variant="outline">{formatSize(predictions.threeMonths)}</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">6 个月后</span>
                <Badge variant="outline">{formatSize(predictions.sixMonths)}</Badge>
              </div>
            </div>
            {stats.totalSize > 100 * 1024 * 1024 && (
              <p className="text-xs text-muted-foreground pt-2 border-t">
                💡 基于近几个月的增长趋势预测
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Largest Files */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            最大的 10 个文件
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topFiles.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">暂无数据</div>
          ) : (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topFiles.map((f) => ({
                    ...f,
                    name: f.fileName.length > 20 ? f.fileName.slice(0, 20) + "..." : f.fileName,
                    size: parseFloat((f.fileSize / (1024 * 1024)).toFixed(2)),
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value} MB`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                          <p className="font-medium">{d.fileName}</p>
                          <p className="text-muted-foreground">{formatSize(d.fileSize)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="size" fill="#f59e0b" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Type Distribution Trend */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            文件类型分布趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.fileTypeTrend.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">暂无数据</div>
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.fileTypeTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.split("-")[1] + "月"}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => FILE_TYPE_LABELS[value] || value}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  {allTypes.map((type) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="a"
                      fill={FILE_TYPE_COLORS[type] || "#6b7280"}
                      name={FILE_TYPE_LABELS[type] || type}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Heatmap */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            上传活跃度
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* By day of week */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">按星期分布</p>
            <div className="flex justify-center gap-2">
              {DAY_LABELS.map((label, i) => (
                <HeatmapCell
                  key={label}
                  value={activity.byDayOfWeek[i]}
                  max={dayMax}
                  label={label}
                />
              ))}
            </div>
          </div>
          {/* By hour of day */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">按小时分布</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {activity.byHour.map((value, i) => (
                <HeatmapCell
                  key={i}
                  value={value}
                  max={hourMax}
                  label={`${i}时`}
                />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            颜色越深表示上传频率越高
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
