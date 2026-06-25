"use client";

import React, { useState, useMemo } from "react";

// ==================== 类型定义 ====================

export interface FavoriteGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  itemCount: number;
  sortOrder: number;
  createdAt: string;
}

export interface FavoriteItem {
  id: string;
  name: string;
  type: "file" | "folder";
  fileType?: string;
  size?: number;
  thumbnail?: string;
  addedAt: string;
  groupId?: string;
  note?: string;
  isPinned?: boolean;
}

export interface FavoritesProps {
  groups?: FavoriteGroup[];
  items?: FavoriteItem[];
  onAddToGroup?: (itemId: string, groupId: string) => void;
  onRemoveFavorite?: (itemId: string) => void;
  onCreateGroup?: (name: string, color: string, icon: string) => void;
  className?: string;
}

// ==================== 模拟数据 ====================

const mockGroups: FavoriteGroup[] = [
  { id: "all", name: "全部收藏", icon: "⭐", color: "bg-yellow-500", itemCount: 42, sortOrder: 0, createdAt: "2024-01-01" },
  { id: "work", name: "工作文档", icon: "💼", color: "bg-blue-500", itemCount: 15, sortOrder: 1, createdAt: "2024-01-15" },
  { id: "study", name: "学习资料", icon: "📚", color: "bg-green-500", itemCount: 12, sortOrder: 2, createdAt: "2024-02-01" },
  { id: "project", name: "项目文件", icon: "📁", color: "bg-purple-500", itemCount: 8, sortOrder: 3, createdAt: "2024-02-15" },
  { id: "photo", name: "照片收藏", icon: "🖼️", color: "bg-pink-500", itemCount: 7, sortOrder: 4, createdAt: "2024-03-01" },
];

const mockItems: FavoriteItem[] = [
  { id: "1", name: "项目计划书.docx", type: "file", fileType: "document", size: 2457600, addedAt: "2024-06-20 14:30", groupId: "work", isPinned: true },
  { id: "2", name: "产品设计稿.png", type: "file", fileType: "image", size: 5242880, addedAt: "2024-06-19 10:15", groupId: "project", isPinned: true },
  { id: "3", name: "技术文档", type: "folder", size: 0, addedAt: "2024-06-18 16:45", groupId: "study" },
  { id: "4", name: "季度报表.xlsx", type: "file", fileType: "spreadsheet", size: 1572864, addedAt: "2024-06-17 09:20", groupId: "work" },
  { id: "5", name: "会议纪要.md", type: "file", fileType: "document", size: 45056, addedAt: "2024-06-16 15:00", groupId: "work" },
  { id: "6", name: "旅行照片.jpg", type: "file", fileType: "image", size: 8388608, addedAt: "2024-06-15 20:30", groupId: "photo" },
  { id: "7", name: "学习笔记", type: "folder", size: 0, addedAt: "2024-06-14 11:00", groupId: "study" },
  { id: "8", name: "演示文稿.pptx", type: "file", fileType: "presentation", size: 10485760, addedAt: "2024-06-13 13:45", groupId: "project" },
  { id: "9", name: "源代码.zip", type: "file", fileType: "archive", size: 52428800, addedAt: "2024-06-12 17:20", groupId: "project" },
  { id: "10", name: "读书笔记.pdf", type: "file", fileType: "pdf", size: 3145728, addedAt: "2024-06-11 08:30", groupId: "study" },
  { id: "11", name: "家庭照片", type: "folder", size: 0, addedAt: "2024-06-10 19:00", groupId: "photo" },
  { id: "12", name: "合同模板.docx", type: "file", fileType: "document", size: 524288, addedAt: "2024-06-09 14:15", groupId: "work" },
];

// 颜色选项
const colorOptions = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-green-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-gray-500",
];

// 图标选项
const iconOptions = ["⭐", "💼", "📚", "📁", "🖼️", "🎵", "🎬", "📝", "💡", "🏷️", "🎯", "🚀"];

// ==================== 工具函数 ====================

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

const getFileTypeIcon = (fileType?: string): string => {
  const icons: Record<string, string> = {
    document: "📄",
    image: "🖼️",
    spreadsheet: "📊",
    presentation: "📽️",
    pdf: "📕",
    archive: "📦",
    video: "🎬",
    audio: "🎵",
  };
  return icons[fileType || ""] || "📄";
};

// ==================== 主组件 ====================

export function Favorites({
  groups = mockGroups,
  items = mockItems,
  onAddToGroup,
  onRemoveFavorite,
  onCreateGroup,
  className = "",
}: FavoritesProps) {
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("bg-blue-500");
  const [newGroupIcon, setNewGroupIcon] = useState("⭐");

  // 过滤和排序收藏项
  const filteredItems = useMemo(() => {
    let result = [...items];

    // 按分组过滤
    if (activeGroup !== "all") {
      result = result.filter((item) => item.groupId === activeGroup);
    }

    // 按搜索词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) => item.name.toLowerCase().includes(query));
    }

    // 排序
    switch (sortBy) {
      case "recent":
        result.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "size":
        result.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
    }

    // 置顶的排在前面
    result.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return result;
  }, [items, activeGroup, searchQuery, sortBy]);

  // 切换选中
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // 全选
  const selectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  // 创建分组
  const handleCreateGroup = () => {
    if (newGroupName.trim() && onCreateGroup) {
      onCreateGroup(newGroupName.trim(), newGroupColor, newGroupIcon);
      setShowCreateGroup(false);
      setNewGroupName("");
    }
  };

  // ==================== 渲染 ====================

  return (
    <div className={`flex h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* 左侧分组列表 */}
      <div className="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-800 dark:text-white">我的收藏</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            共 {items.length} 个收藏项
          </p>
        </div>

        {/* 分组列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveGroup(group.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-1
                ${activeGroup === group.id
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }
              `}
            >
              <div className={`w-8 h-8 ${group.color} rounded-lg flex items-center justify-center text-sm`}>
                {group.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{group.name}</p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{group.itemCount}</span>
            </button>
          ))}
        </div>

        {/* 新建分组按钮 */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <span>➕</span>
            <span>新建分组</span>
          </button>
        </div>
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 搜索框 */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索收藏..."
                  className="w-64 pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* 排序 */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="recent">最近添加</option>
                <option value="name">按名称</option>
                <option value="size">按大小</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {/* 批量操作 */}
              {selectedItems.size > 0 && (
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    已选 {selectedItems.size} 项
                  </span>
                  <button className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    移除收藏
                  </button>
                </div>
              )}

              {/* 视图切换 */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === "grid"
                      ? "bg-white dark:bg-gray-600 text-gray-700 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  网格
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === "list"
                      ? "bg-white dark:bg-gray-600 text-gray-700 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  列表
                </button>
              </div>
            </div>
          </div>

          {/* 全选 */}
          {filteredItems.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                onChange={selectAll}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">全选</span>
            </div>
          )}
        </div>

        {/* 收藏内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-4">⭐</div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                {searchQuery ? "没有找到匹配的收藏" : "暂无收藏"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchQuery ? "试试其他关键词" : "点击文件的收藏按钮添加收藏"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            // 网格视图
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`
                    group bg-white dark:bg-gray-800 rounded-xl border overflow-hidden transition-all cursor-pointer
                    ${selectedItems.has(item.id)
                      ? "border-blue-500 ring-2 ring-blue-500/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md"
                    }
                  `}
                  onClick={() => toggleSelect(item.id)}
                >
                  {/* 预览区 */}
                  <div className="h-24 bg-gray-50 dark:bg-gray-700/30 flex items-center justify-center relative">
                    <span className="text-3xl">
                      {item.type === "folder" ? "📁" : getFileTypeIcon(item.fileType)}
                    </span>
                    {item.isPinned && (
                      <span className="absolute top-2 left-2 text-yellow-500">📌</span>
                    )}
                    {selectedItems.has(item.id) && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">
                        ✓
                      </div>
                    )}
                  </div>

                  {/* 信息区 */}
                  <div className="p-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate" title={item.name}>
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {item.size ? formatFileSize(item.size) : "文件夹"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // 列表视图
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer
                    ${selectedItems.has(item.id)
                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30"
                      : "bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-500/30"
                    }
                  `}
                  onClick={() => toggleSelect(item.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />

                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">
                      {item.type === "folder" ? "📁" : getFileTypeIcon(item.fileType)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {item.name}
                      </p>
                      {item.isPinned && <span className="text-yellow-500 text-xs">📌</span>}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      添加于 {item.addedAt}
                    </p>
                  </div>

                  <div className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {item.size ? formatFileSize(item.size) : "-"}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // 移动到分组
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="移动到分组"
                    >
                      📂
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onRemoveFavorite) onRemoveFavorite(item.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="移除收藏"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 新建分组弹窗 */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateGroup(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">新建收藏分组</h3>

              {/* 分组名称 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  分组名称
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="输入分组名称"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  autoFocus
                />
              </div>

              {/* 选择颜色 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  选择颜色
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewGroupColor(color)}
                      className={`
                        w-8 h-8 ${color} rounded-full transition-all
                        ${newGroupColor === color ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110" : ""}
                      `}
                    />
                  ))}
                </div>
              </div>

              {/* 选择图标 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  选择图标
                </label>
                <div className="flex flex-wrap gap-2">
                  {iconOptions.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewGroupIcon(icon)}
                      className={`
                        w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-lg transition-all
                        ${newGroupIcon === icon ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-200 dark:hover:bg-gray-600"}
                      `}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateGroup(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建分组
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Favorites;
