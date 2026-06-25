"use client";

import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// ==================== 类型定义 ====================

export interface DashboardStats {
  totalFiles: number;
  totalFolders: number;
  storageUsed: number;
  storageQuota: number;
  todayUploads: number;
  weekUploads: number;
  monthUploads: number;
}

export interface DashboardProps {
  stats?: DashboardStats;
  className?: string;
}

// ==================== 模拟数据 ====================

const mockStats: DashboardStats = {
  totalFiles: 1284,
  totalFolders: 86,
  storageUsed: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
  storageQuota: 10 * 1024 * 1024 * 1024, // 10 GB
  todayUploads: 12,
  weekUploads: 87,
  monthUploads: 324,
};

// 存储趋势数据（近7天）
const storageTrendData = [
  { date: "周一", size: 2.0, files: 1100 },
  { date: "周二", size: 2.1, files: 1150 },
  { date: "周三", size: 2.1, files: 1180 },
  { date: "周四", size: 2.2, files: 1200 },
  { date: "周五", size: 2.3, files: 1240 },
  { date: "周六", size: 2.35, files: 1260 },
  { date: "周日", size: 2.4, files: 1284 },
];

// 文件类型分布
const fileTypeData = [
  { name: "文档", value: 35, color: "#3b82f6" },
  { name: "图片", value: 28, color: "#22c55e" },
  { name: "视频", value: 15, color: "#f97316" },
  { name: "音频", value: 8, color: "#8b5cf6" },
  { name: "压缩包", value: 7, color: "#06b6d4" },
  { name: "其他", value: 7, color: "#6b7280" },
];

// 上传趋势数据
const uploadTrendData = [
  { date: "周一", uploads: 8, downloads: 15 },
  { date: "周二", uploads: 12, downloads: 22 },
  { date: "周三", uploads: 6, downloads: 18 },
  { date: "周四", uploads: 15, downloads: 25 },
  { date: "周五", uploads: 20, downloads: 30 },
  { date: "周六", uploads: 18, downloads: 28 },
  { date: "周日", uploads: 12, downloads: 20 },
];

// 最近活动
const recentActivities = [
  { id: 1, type: "upload", name: "项目计划书.docx", time: "5分钟前", size: "2.3 MB" },
  { id: 2, type: "edit", name: "会议纪要.md", time: "15分钟前", size: "45 KB" },
  { id: 3, type: "download", name: "产品设计图.png", time: "32分钟前", size: "5.6 MB" },
  { id: 4, type: "share", name: "季度报表.xlsx", time: "1小时前", size: "1.2 MB" },
  { id: 5, type: "upload", name: "培训视频.mp4", time: "2小时前", size: "128 MB" },
  { id: 6, type: "delete", name: "旧版本备份.zip", time: "3小时前", size: "45 MB" },
];

// 快捷操作
const quickActions = [
  { id: "upload", icon: "📤", label: "上传文件", color: "bg-blue-500" },
  { id: "folder", icon: "📁", label: "新建文件夹", color: "bg-green-500" },
  { id: "document", icon: "📝", label: "新建文档", color: "bg-purple-500" },
  { id: "search", icon: "🔍", label: "搜索文件", color: "bg-orange-500" },
];

// ==================== 工具函数 ====================

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

const getActivityIcon = (type: string): string => {
  const icons: Record<string, string> = {
    upload: "📤",
    edit: "✏️",
    download: "📥",
    share: "🔗",
    delete: "🗑️",
  };
  return icons[type] || "📄";
};

const getActivityColor = (type: string): string => {
  const colors: Record<string, string> = {
    upload: "text-green-500",
    edit: "text-blue-500",
    download: "text-purple-500",
    share: "text-orange-500",
    delete: "text-red-500",
  };
  return colors[type] || "text-gray-500";
};

// ==================== 统计卡片组件 ====================

function StatCard({
  icon,
  label,
  value,
  subValue,
  trend,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: { value: number; isUp: boolean };
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}</p>
          {subValue && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subValue}</p>}
        </div>
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-lg`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center text-xs">
          <span className={trend.isUp ? "text-green-500" : "text-red-500"}>
            {trend.isUp ? "↑" : "↓"} {trend.value}%
          </span>
          <span className="text-gray-400 dark:text-gray-500 ml-1">较上周</span>
        </div>
      )}
    </div>
  );
}

// ==================== 主组件 ====================

export function Dashboard({ stats = mockStats, className = "" }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "files" | "activity">("overview");

  const storagePercent = useMemo(() => {
    return Math.round((stats.storageUsed / stats.storageQuota) * 100);
  }, [stats]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 欢迎语 */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1">欢迎回来 👋</h2>
        <p className="text-white/80 text-sm">
          今天是美好的一天，你有 {stats.todayUploads} 个新文件上传
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon="📄"
          label="文件总数"
          value={stats.totalFiles.toLocaleString()}
          subValue={`${stats.todayUploads} 个今日新增`}
          trend={{ value: 12, isUp: true }}
          color="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          icon="📁"
          label="文件夹"
          value={stats.totalFolders}
          subValue="个文件夹"
          trend={{ value: 5, isUp: true }}
          color="bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          icon="💾"
          label="存储使用"
          value={formatFileSize(stats.storageUsed)}
          subValue={`共 ${formatFileSize(stats.storageQuota)}`}
          color="bg-purple-100 dark:bg-purple-900/30"
        />
        <StatCard
          icon="📅"
          label="今日上传"
          value={stats.todayUploads}
          subValue="个文件"
          trend={{ value: 20, isUp: true }}
          color="bg-orange-100 dark:bg-orange-900/30"
        />
        <StatCard
          icon="📊"
          label="本周新增"
          value={stats.weekUploads}
          subValue="个文件"
          trend={{ value: 8, isUp: true }}
          color="bg-cyan-100 dark:bg-cyan-900/30"
        />
        <StatCard
          icon="📈"
          label="本月新增"
          value={stats.monthUploads}
          subValue="个文件"
          trend={{ value: 15, isUp: true }}
          color="bg-pink-100 dark:bg-pink-900/30"
        />
      </div>

      {/* 存储进度条 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">存储空间</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatFileSize(stats.storageUsed)} / {formatFileSize(stats.storageQuota)}
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${storagePercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
          <span>已使用 {storagePercent}%</span>
          <span>剩余 {formatFileSize(stats.storageQuota - stats.storageUsed)}</span>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">快捷操作</h3>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              className="flex flex-col items-center p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition-transform`}>
                {action.icon}
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 存储趋势图 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">存储趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={storageTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" unit=" GB" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="size"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  activeDot={{ r: 6 }}
                  name="存储量"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 文件类型分布 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">文件类型分布</h3>
          <div className="h-64 flex items-center">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fileTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {fileTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 space-y-2">
              {fileTypeData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-500 font-medium">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 上传趋势 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 lg:col-span-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">上传/下载趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uploadTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend />
                <Bar dataKey="uploads" name="上传" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="downloads" name="下载" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">最近活动</h3>
          <button className="text-xs text-blue-500 hover:text-blue-600">查看全部</button>
        </div>
        <div className="space-y-3">
          {recentActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
            >
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center mr-3 ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {activity.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{activity.time}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{activity.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
