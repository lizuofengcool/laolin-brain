"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileData } from "@/lib/storage/base";

interface StorageChartsProps {
  files: FileData[];
}

const FILE_TYPE_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  image: { label: "图片", color: "#3b82f6" },
  word: { label: "文档", color: "#22c55e" },
  pdf: { label: "PDF", color: "#ef4444" },
  pptx: { label: "演示", color: "#f59e0b" },
};

function getFileTypeLabel(type: string): string {
  return FILE_TYPE_CONFIG[type]?.label ?? type;
}

function getFileTypeColor(type: string): string {
  return FILE_TYPE_CONFIG[type]?.color ?? "#6b7280";
}

function groupByFileType(files: FileData[]) {
  const counts: Record<string, number> = {};
  const sizes: Record<string, number> = {};

  for (const file of files) {
    const type = file.fileType;
    counts[type] = (counts[type] || 0) + 1;
    sizes[type] = (sizes[type] || 0) + file.fileSize;
  }

  return { counts, sizes };
}

function formatMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function CustomPieLegend({ payload }: { payload?: Array<{ color: string; name: string; value: number }> }) {
  if (!payload || payload.length === 0) return null;

  const total = payload.reduce((sum: number, entry) => sum + entry.value, 0);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-3">
      {payload.map((entry: any, index: number) => {
        const percentage =
          total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">
              {getFileTypeLabel(entry.name)}
            </span>
            <span className="font-medium">{entry.value}</span>
            <span className="text-muted-foreground">({percentage}%)</span>
          </div>
        );
      })}
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;

  const value = payload[0].value;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{getFileTypeLabel(label ?? "")}</p>
      <p className="text-muted-foreground">
        {value} MB
      </p>
    </div>
  );
}

function CustomPieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const total = payload.reduce((sum: number, item) => sum + item.value, 0);
  const percentage =
    total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{getFileTypeLabel(entry.name)}</p>
      <p className="text-muted-foreground">
        {entry.value} 个文件 ({percentage}%)
      </p>
    </div>
  );
}

export default function StorageCharts({ files }: StorageChartsProps) {
  if (!files || files.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">文件类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              暂无数据
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">存储空间占用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              暂无数据
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { counts, sizes } = groupByFileType(files);

  // Prepare pie chart data: only include known types with counts > 0
  const knownTypes = Object.keys(FILE_TYPE_CONFIG);
  const pieData = knownTypes
    .filter((type) => (counts[type] || 0) > 0)
    .map((type) => ({
      name: type,
      value: counts[type] || 0,
    }));

  // Prepare bar chart data: types with non-zero sizes
  const barData = knownTypes
    .filter((type) => (sizes[type] || 0) > 0)
    .map((type) => ({
      name: type,
      size: parseFloat(formatMB(sizes[type] || 0).toFixed(2)),
    }));

  const allSizesZero = barData.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Pie Chart: File Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">文件类型分布</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={getFileTypeColor(entry.name)}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend content={<CustomPieLegend />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart: Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">存储空间占用</CardTitle>
        </CardHeader>
        <CardContent>
          {allSizesZero ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              暂无数据
            </div>
          ) : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${value} MB`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={50}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => getFileTypeLabel(value)}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar
                    dataKey="size"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={28}
                  >
                    {barData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={getFileTypeColor(entry.name)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
