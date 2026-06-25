"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";

// ==================== 类型定义 ====================

export type SearchMode = "keyword" | "semantic" | "hybrid" | "tag";
export type FileTypeFilter = "all" | "document" | "image" | "video" | "audio" | "archive" | "spreadsheet" | "presentation";
export type DateFilter = "all" | "today" | "week" | "month" | "year" | "custom";
export type SortBy = "relevance" | "date" | "size" | "name";

export interface SearchResult {
  id: string;
  name: string;
  type: "file" | "folder";
  fileType?: string;
  size?: number;
  path?: string;
  tags?: string[];
  modifiedAt: string;
  score?: number;
  highlights?: string[];
  thumbnail?: string;
  isFavorite?: boolean;
}

export interface SearchEnhancedProps {
  onSearch?: (query: string, mode: SearchMode, filters: SearchFilters) => void;
  results?: SearchResult[];
  isLoading?: boolean;
  className?: string;
}

export interface SearchFilters {
  fileType: FileTypeFilter;
  dateRange: DateFilter;
  customDateFrom?: string;
  customDateTo?: string;
  minSize?: number;
  maxSize?: number;
  tags?: string[];
  folderId?: string;
  onlyFavorites?: boolean;
}

// ==================== 模拟数据 ====================

const mockResults: SearchResult[] = [
  {
    id: "1",
    name: "项目计划书.docx",
    type: "file",
    fileType: "document",
    size: 2457600,
    path: "/工作文档/项目",
    tags: ["项目", "计划", "重要"],
    modifiedAt: "2024-06-20 14:30",
    score: 0.95,
    highlights: ["项目计划书中提到了关键的<mark>时间节点</mark>", "包含详细的<mark>预算</mark>分析"],
    isFavorite: true,
  },
  {
    id: "2",
    name: "产品设计稿.png",
    type: "file",
    fileType: "image",
    size: 5242880,
    path: "/设计稿/产品",
    tags: ["设计", "产品", "UI"],
    modifiedAt: "2024-06-19 10:15",
    score: 0.88,
    highlights: ["产品<mark>设计稿</mark>最终版本"],
    isFavorite: true,
  },
  {
    id: "3",
    name: "技术文档",
    type: "folder",
    path: "/学习资料",
    modifiedAt: "2024-06-18 16:45",
    score: 0.82,
  },
  {
    id: "4",
    name: "季度报表.xlsx",
    type: "file",
    fileType: "spreadsheet",
    size: 1572864,
    path: "/工作文档/财务",
    tags: ["财务", "报表", "季度"],
    modifiedAt: "2024-06-17 09:20",
    score: 0.79,
    highlights: ["Q2<mark>季度报表</mark>数据汇总"],
  },
  {
    id: "5",
    name: "会议纪要.md",
    type: "file",
    fileType: "document",
    size: 45056,
    path: "/工作文档/会议",
    tags: ["会议", "纪要"],
    modifiedAt: "2024-06-16 15:00",
    score: 0.75,
    highlights: ["<mark>会议纪要</mark>记录了重要决策"],
  },
  {
    id: "6",
    name: "旅行照片.jpg",
    type: "file",
    fileType: "image",
    size: 8388608,
    path: "/照片/旅行",
    tags: ["照片", "旅行"],
    modifiedAt: "2024-06-15 20:30",
    score: 0.72,
  },
  {
    id: "7",
    name: "学习笔记",
    type: "folder",
    path: "/学习资料",
    modifiedAt: "2024-06-14 11:00",
    score: 0.68,
  },
  {
    id: "8",
    name: "演示文稿.pptx",
    type: "file",
    fileType: "presentation",
    size: 10485760,
    path: "/工作文档/项目",
    tags: ["演示", "项目"],
    modifiedAt: "2024-06-13 13:45",
    score: 0.65,
    highlights: ["项目<mark>演示文稿</mark>包含完整方案"],
  },
];

const searchHistory = [
  "项目计划",
  "设计稿",
  "财务报表",
  "会议纪要",
  "产品需求",
  "技术文档",
];

const hotSearches = [
  { keyword: "项目计划书", hot: 1256 },
  { keyword: "产品设计", hot: 987 },
  { keyword: "财务报表", hot: 876 },
  { keyword: "会议纪要", hot: 765 },
  { keyword: "技术文档", hot: 654 },
  { keyword: "学习资料", hot: 543 },
];

const searchSuggestions = [
  "项目计划书模板",
  "项目进度跟踪表",
  "项目风险管理",
  "项目里程碑",
  "项目预算表",
];

const allTags = [
  "重要", "工作", "学习", "项目", "设计", "财务", 
  "会议", "个人", "待办", "参考", "备份", "分享"
];

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

const getFileTypeColor = (fileType?: string): string => {
  const colors: Record<string, string> = {
    document: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    image: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    spreadsheet: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    presentation: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    video: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    audio: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
    archive: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return colors[fileType || ""] || "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
};

// ==================== 主组件 ====================

export function SearchEnhanced({
  onSearch,
  results = mockResults,
  isLoading = false,
  className = "",
}: SearchEnhancedProps) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const [filters, setFilters] = useState<SearchFilters>({
    fileType: "all",
    dateRange: "all",
    onlyFavorites: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // 过滤和排序结果
  const filteredResults = useMemo(() => {
    let result = [...results];

    // 按文件类型过滤
    if (filters.fileType !== "all") {
      result = result.filter((item) => item.fileType === filters.fileType);
    }

    // 按收藏过滤
    if (filters.onlyFavorites) {
      result = result.filter((item) => item.isFavorite);
    }

    // 按标签过滤
    if (selectedTags.length > 0) {
      result = result.filter((item) => 
        item.tags?.some((tag) => selectedTags.includes(tag))
      );
    }

    // 排序
    switch (sortBy) {
      case "relevance":
        result.sort((a, b) => (b.score || 0) - (a.score || 0));
        break;
      case "date":
        result.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
        break;
      case "size":
        result.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [results, filters, sortBy, selectedTags]);

  // 执行搜索
  const handleSearch = () => {
    if (query.trim()) {
      setHasSearched(true);
      setShowSuggestions(false);
      if (onSearch) {
        onSearch(query, searchMode, filters);
      }
    }
  };

  // 清除搜索
  const clearSearch = () => {
    setQuery("");
    setHasSearched(false);
    setSelectedTags([]);
    setFilters({
      fileType: "all",
      dateRange: "all",
      onlyFavorites: false,
    });
    inputRef.current?.focus();
  };

  // 切换标签
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ==================== 渲染 ====================

  return (
    <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* 搜索头部 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        {/* 搜索栏 */}
        <div className="relative max-w-3xl mx-auto">
          {/* 搜索模式切换 */}
          <div className="flex items-center gap-1 mb-2">
            {(["keyword", "semantic", "hybrid", "tag"] as SearchMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                className={`
                  px-2.5 py-1 text-xs rounded-md transition-colors
                  ${searchMode === mode
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }
                `}
              >
                {mode === "keyword" && "关键词"}
                {mode === "semantic" && "语义"}
                {mode === "hybrid" && "混合"}
                {mode === "tag" && "标签"}
              </button>
            ))}
          </div>

          {/* 搜索输入框 */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") {
                  setShowSuggestions(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder={
                searchMode === "semantic" 
                  ? "用自然语言描述你要找的内容..." 
                  : searchMode === "tag"
                  ? "按标签搜索文件..."
                  : "搜索文件、文件夹、内容..."
              }
              className="w-full pl-12 pr-24 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            
            {/* 右侧按钮组 */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <button
                  onClick={clearSearch}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`
                  p-1.5 rounded-lg transition-colors
                  ${showFilters 
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" 
                    : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }
                `}
                title="筛选"
              >
                ⚙️
              </button>
              <button
                onClick={handleSearch}
                className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
              >
                搜索
              </button>
            </div>
          </div>

          {/* 搜索建议下拉 */}
          {showSuggestions && query && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
              {/* 搜索建议 */}
              <div className="p-2">
                <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">搜索建议</p>
                {searchSuggestions
                  .filter((s) => s.toLowerCase().includes(query.toLowerCase()))
                  .slice(0, 5)
                  .map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(suggestion);
                        handleSearch();
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2"
                    >
                      <span className="text-gray-400">🔍</span>
                      <span>{suggestion}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* 未搜索时显示历史和热门 */}
          {showSuggestions && !query && !hasSearched && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50 p-4">
              {/* 搜索历史 */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">搜索历史</p>
                  <button className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    清除
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(item);
                        handleSearch();
                      }}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* 热门搜索 */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">热门搜索</p>
                <div className="space-y-1">
                  {hotSearches.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(item.keyword);
                        handleSearch();
                      }}
                      className="w-full flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-left"
                    >
                      <span className={`
                        w-5 h-5 rounded text-xs flex items-center justify-center font-medium
                        ${index < 3 ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400"}
                      `}>
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{item.keyword}</span>
                      <span className="text-xs text-gray-400">{item.hot}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* 文件类型 */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">文件类型</p>
              <div className="flex flex-wrap gap-2">
                {(["all", "document", "image", "video", "audio", "archive", "spreadsheet", "presentation"] as FileTypeFilter[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilters((prev) => ({ ...prev, fileType: type }))}
                    className={`
                      px-3 py-1.5 text-sm rounded-lg transition-colors
                      ${filters.fileType === type
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }
                    `}
                  >
                    {type === "all" && "全部"}
                    {type === "document" && "📄 文档"}
                    {type === "image" && "🖼️ 图片"}
                    {type === "video" && "🎬 视频"}
                    {type === "audio" && "🎵 音频"}
                    {type === "archive" && "📦 压缩包"}
                    {type === "spreadsheet" && "📊 表格"}
                    {type === "presentation" && "📽️ 演示"}
                  </button>
                ))}
              </div>
            </div>

            {/* 时间范围 */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">修改时间</p>
              <div className="flex flex-wrap gap-2">
                {(["all", "today", "week", "month", "year"] as DateFilter[]).map((date) => (
                  <button
                    key={date}
                    onClick={() => setFilters((prev) => ({ ...prev, dateRange: date }))}
                    className={`
                      px-3 py-1.5 text-sm rounded-lg transition-colors
                      ${filters.dateRange === date
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }
                    `}
                  >
                    {date === "all" && "全部时间"}
                    {date === "today" && "今天"}
                    {date === "week" && "本周"}
                    {date === "month" && "本月"}
                    {date === "year" && "今年"}
                  </button>
                ))}
              </div>
            </div>

            {/* 标签筛选 */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">标签筛选</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`
                      px-2.5 py-1 text-sm rounded-full transition-colors
                      ${selectedTags.includes(tag)
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }
                    `}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 其他选项 */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.onlyFavorites}
                  onChange={(e) => setFilters((prev) => ({ ...prev, onlyFavorites: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">仅显示收藏</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 搜索结果 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {/* 未搜索状态 */}
          {!hasSearched && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                开始搜索
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                支持关键词搜索、语义搜索、标签搜索等多种方式
              </p>
              
              {/* 快捷搜索标签 */}
              <div className="flex flex-wrap justify-center gap-2">
                {["项目文档", "设计稿", "财务报表", "会议记录", "学习资料"].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setQuery(tag);
                      handleSearch();
                    }}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full hover:border-blue-300 dark:hover:border-blue-500/50 hover:text-blue-500 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 搜索结果统计和工具栏 */}
          {hasSearched && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  找到 <span className="font-medium text-gray-700 dark:text-gray-300">{filteredResults.length}</span> 个结果
                  {query && <span>，关键词「<span className="text-blue-500">{query}</span>」</span>}
                </p>

                <div className="flex items-center gap-3">
                  {/* 排序 */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="text-sm bg-transparent text-gray-600 dark:text-gray-400 border-none focus:outline-none cursor-pointer"
                  >
                    <option value="relevance">相关度</option>
                    <option value="date">修改时间</option>
                    <option value="size">文件大小</option>
                    <option value="name">名称</option>
                  </select>

                  {/* 视图切换 */}
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode("list")}
                      className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
                        viewMode === "list"
                          ? "bg-white dark:bg-gray-600 text-gray-700 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      列表
                    </button>
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
                        viewMode === "grid"
                          ? "bg-white dark:bg-gray-600 text-gray-700 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      网格
                    </button>
                  </div>
                </div>
              </div>

              {/* 加载状态 */}
              {isLoading && (
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">搜索中...</p>
                </div>
              )}

              {/* 无结果 */}
              {!isLoading && filteredResults.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">😕</div>
                  <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                    没有找到匹配的结果
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    试试其他关键词或调整筛选条件
                  </p>
                </div>
              )}

              {/* 结果列表 - 列表视图 */}
              {!isLoading && filteredResults.length > 0 && viewMode === "list" && (
                <div className="space-y-2">
                  {filteredResults.map((result) => (
                    <div
                      key={result.id}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        {/* 图标 */}
                        <div className={`
                          w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                          ${result.type === "folder" 
                            ? "bg-yellow-100 dark:bg-yellow-900/30" 
                            : getFileTypeColor(result.fileType)
                          }
                        `}>
                          <span className="text-lg">
                            {result.type === "folder" ? "📁" : getFileTypeIcon(result.fileType)}
                          </span>
                        </div>

                        {/* 主内容 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-800 dark:text-white truncate">
                              {result.name}
                            </h4>
                            {result.isFavorite && (
                              <span className="text-yellow-500 text-xs">⭐</span>
                            )}
                            {result.score && result.score > 0.8 && (
                              <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs rounded">
                                高匹配
                              </span>
                            )}
                          </div>

                          {/* 路径 */}
                          {result.path && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                              📂 {result.path}
                            </p>
                          )}

                          {/* 高亮内容 */}
                          {result.highlights && result.highlights.length > 0 && (
                            <p 
                              className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: result.highlights[0] }}
                            />
                          )}

                          {/* 标签 */}
                          {result.tags && result.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {result.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 右侧信息 */}
                        <div className="text-right flex-shrink-0">
                          {result.size !== undefined && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {formatFileSize(result.size)}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {result.modifiedAt}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 结果列表 - 网格视图 */}
              {!isLoading && filteredResults.length > 0 && viewMode === "grid" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredResults.map((result) => (
                    <div
                      key={result.id}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md transition-all cursor-pointer group"
                    >
                      {/* 预览区 */}
                      <div className="h-28 bg-gray-50 dark:bg-gray-700/30 flex items-center justify-center relative">
                        <span className="text-4xl">
                          {result.type === "folder" ? "📁" : getFileTypeIcon(result.fileType)}
                        </span>
                        {result.isFavorite && (
                          <span className="absolute top-2 right-2 text-yellow-500">⭐</span>
                        )}
                      </div>

                      {/* 信息区 */}
                      <div className="p-3">
                        <h4 className="text-sm font-medium text-gray-800 dark:text-white truncate mb-1">
                          {result.name}
                        </h4>
                        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                          <span>{result.size !== undefined ? formatFileSize(result.size) : "文件夹"}</span>
                          <span>{result.modifiedAt.split(" ")[0]}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchEnhanced;
