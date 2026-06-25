"use client";

import React, { useState, useMemo } from "react";

// ==================== 类型定义 ====================

type PluginType = "feature" | "theme" | "integration" | "tool" | "ai";

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  icon?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  category: string;
  tags: string[];
  installed: boolean;
  enabled: boolean;
  hasUpdate: boolean;
  latestVersion?: string;
  lastUpdated?: string;
}

// ==================== 模拟数据 ====================

const mockPlugins: Plugin[] = [
  {
    id: "markdown-enhancer",
    name: "Markdown增强器",
    version: "1.2.0",
    description: "增强Markdown编辑体验，支持更多语法、实时预览和多种导出格式",
    author: "Laolin Team",
    type: "feature",
    icon: "📝",
    downloads: 12580,
    rating: 4.8,
    ratingCount: 256,
    category: "编辑器",
    tags: ["markdown", "编辑", "导出"],
    installed: true,
    enabled: true,
    hasUpdate: false,
    lastUpdated: "2024-06-15",
  },
  {
    id: "dark-theme-pro",
    name: "深色主题Pro",
    version: "2.0.1",
    description: "精美的深色主题，支持多种配色方案，护眼模式",
    author: "Theme Studio",
    type: "theme",
    icon: "🌙",
    downloads: 8930,
    rating: 4.6,
    ratingCount: 189,
    category: "主题",
    tags: ["主题", "深色", "护眼"],
    installed: true,
    enabled: false,
    hasUpdate: true,
    latestVersion: "2.1.0",
    lastUpdated: "2024-06-20",
  },
  {
    id: "wechat-integration",
    name: "企业微信集成",
    version: "1.0.3",
    description: "企业微信登录、消息通知和组织架构同步",
    author: "Laolin Team",
    type: "integration",
    icon: "💬",
    downloads: 5620,
    rating: 4.5,
    ratingCount: 128,
    category: "集成",
    tags: ["企业微信", "登录", "通知"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-10",
  },
  {
    id: "image-compressor",
    name: "图片压缩工具",
    version: "1.1.0",
    description: "批量压缩图片，支持JPG/PNG/WebP，质量可调",
    author: "Tool Lab",
    type: "tool",
    icon: "🖼️",
    downloads: 15200,
    rating: 4.9,
    ratingCount: 423,
    category: "工具",
    tags: ["图片", "压缩", "优化"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-18",
  },
  {
    id: "ai-assistant",
    name: "AI助手",
    version: "3.0.0",
    description: "智能AI助手，支持文档问答、摘要生成、翻译、写作辅助",
    author: "Laolin AI",
    type: "ai",
    icon: "🤖",
    downloads: 20100,
    rating: 4.7,
    ratingCount: 567,
    category: "AI",
    tags: ["AI", "问答", "摘要", "翻译"],
    installed: true,
    enabled: true,
    hasUpdate: false,
    lastUpdated: "2024-06-22",
  },
  {
    id: "pdf-tools",
    name: "PDF工具箱",
    version: "1.5.2",
    description: "PDF编辑、转换、合并、拆分、加密解密",
    author: "PDF Pro",
    type: "tool",
    icon: "📕",
    downloads: 18500,
    rating: 4.8,
    ratingCount: 389,
    category: "工具",
    tags: ["PDF", "转换", "编辑"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-12",
  },
  {
    id: "feishu-integration",
    name: "飞书集成",
    version: "1.0.0",
    description: "飞书登录、文档同步和消息通知",
    author: "Laolin Team",
    type: "integration",
    icon: "📘",
    downloads: 3450,
    rating: 4.4,
    ratingCount: 78,
    category: "集成",
    tags: ["飞书", "登录", "文档"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-08",
  },
  {
    id: "mind-map-pro",
    name: "思维导图Pro",
    version: "2.3.1",
    description: "专业思维导图工具，支持多种布局、样式和导出格式",
    author: "Mind Studio",
    type: "feature",
    icon: "🧠",
    downloads: 9870,
    rating: 4.7,
    ratingCount: 234,
    category: "编辑器",
    tags: ["思维导图", "脑图", "可视化"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-16",
  },
  {
    id: "github-integration",
    name: "GitHub集成",
    version: "1.2.0",
    description: "GitHub登录、仓库同步和Issue管理",
    author: "Laolin Team",
    type: "integration",
    icon: "🐙",
    downloads: 7890,
    rating: 4.6,
    ratingCount: 156,
    category: "集成",
    tags: ["GitHub", "开发", "代码"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-14",
  },
  {
    id: "code-highlighter",
    name: "代码高亮增强",
    version: "1.3.0",
    description: "支持50+编程语言的语法高亮，多种主题可选",
    author: "Code Lab",
    type: "feature",
    icon: "💻",
    downloads: 11200,
    rating: 4.8,
    ratingCount: 289,
    category: "编辑器",
    tags: ["代码", "高亮", "编程"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-19",
  },
  {
    id: "data-visualizer",
    name: "数据可视化",
    version: "2.0.0",
    description: "将数据转换为精美图表，支持折线图、柱状图、饼图等",
    author: "Chart Studio",
    type: "tool",
    icon: "📊",
    downloads: 13400,
    rating: 4.7,
    ratingCount: 312,
    category: "工具",
    tags: ["图表", "数据", "可视化"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-17",
  },
  {
    id: "password-manager",
    name: "密码管理器",
    version: "1.0.0",
    description: "安全的密码管理，支持自动填充和密码生成",
    author: "Security Team",
    type: "tool",
    icon: "🔐",
    downloads: 6780,
    rating: 4.5,
    ratingCount: 145,
    category: "安全",
    tags: ["密码", "安全", "加密"],
    installed: false,
    enabled: false,
    hasUpdate: false,
    lastUpdated: "2024-06-11",
  },
];

const pluginTypes = [
  { value: "all", label: "全部", icon: "📦" },
  { value: "feature", label: "功能", icon: "✨" },
  { value: "theme", label: "主题", icon: "🎨" },
  { value: "integration", label: "集成", icon: "🔗" },
  { value: "tool", label: "工具", icon: "🛠️" },
  { value: "ai", label: "AI", icon: "🤖" },
];

const categories = ["全部", "编辑器", "主题", "集成", "工具", "AI", "安全"];

// ==================== 工具函数 ====================

const formatDownloads = (num: number): string => {
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toString();
};

const getTypeColor = (type: PluginType): string => {
  const colors: Record<PluginType, string> = {
    feature: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    theme: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    integration: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    tool: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    ai: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  };
  return colors[type];
};

// ==================== 主组件 ====================

export function PluginManager() {
  const [plugins, setPlugins] = useState<Plugin[]>(mockPlugins);
  const [activeTab, setActiveTab] = useState<"market" | "installed">("market");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("全部");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"downloads" | "rating" | "updated">("downloads");
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // 过滤和排序插件
  const filteredPlugins = useMemo(() => {
    let result = [...plugins];

    // 按标签页筛选
    if (activeTab === "installed") {
      result = result.filter((p) => p.installed);
    }

    // 按类型筛选
    if (selectedType !== "all") {
      result = result.filter((p) => p.type === selectedType);
    }

    // 按分类筛选
    if (selectedCategory !== "全部") {
      result = result.filter((p) => p.category === selectedCategory);
    }

    // 搜索
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.author.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // 排序
    result.sort((a, b) => {
      // 已安装的优先
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      
      switch (sortBy) {
        case "downloads":
          return b.downloads - a.downloads;
        case "rating":
          return b.rating - a.rating;
        case "updated":
          return new Date(b.lastUpdated || "").getTime() - new Date(a.lastUpdated || "").getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [plugins, activeTab, selectedType, selectedCategory, searchQuery, sortBy]);

  // 安装插件
  const installPlugin = (pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId ? { ...p, installed: true, enabled: true } : p
      )
    );
  };

  // 卸载插件
  const uninstallPlugin = (pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId ? { ...p, installed: false, enabled: false } : p
      )
    );
  };

  // 启用/禁用插件
  const togglePlugin = (pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  // 更新插件
  const updatePlugin = (pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId && p.latestVersion
          ? { ...p, version: p.latestVersion, hasUpdate: false }
          : p
      )
    );
  };

  // 查看详情
  const viewDetail = (plugin: Plugin) => {
    setSelectedPlugin(plugin);
    setShowDetail(true);
  };

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 顶部导航 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            插件中心
          </h1>
          
          {/* 搜索框 */}
          <div className="relative w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索插件..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("market")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "market"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            插件市场
          </button>
          <button
            onClick={() => setActiveTab("installed")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "installed"
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            已安装
            <span className="ml-1.5 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400 text-xs rounded-full">
              {plugins.filter((p) => p.installed).length}
            </span>
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/50 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* 类型筛选 */}
          <div className="flex items-center gap-1">
            {pluginTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                  selectedType === type.value
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            ))}
          </div>

          {/* 排序 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              共 {filteredPlugins.length} 个
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="downloads">下载量</option>
              <option value="rating">评分</option>
              <option value="updated">最近更新</option>
            </select>
          </div>
        </div>
      </div>

      {/* 插件列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredPlugins.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
              没有找到插件
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              试试其他关键词或筛选条件
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => viewDetail(plugin)}
              >
                {/* 头部 */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    {plugin.icon || "📦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-medium text-gray-800 dark:text-white truncate">
                        {plugin.name}
                      </h3>
                      {plugin.hasUpdate && (
                        <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs rounded">
                          更新
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      v{plugin.version} · {plugin.author}
                    </p>
                  </div>
                </div>

                {/* 描述 */}
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                  {plugin.description}
                </p>

                {/* 标签 */}
                <div className="flex flex-wrap gap-1 mb-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeColor(plugin.type)}`}>
                    {plugin.category}
                  </span>
                  {plugin.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* 底部信息和操作 */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                    <span>⬇️ {formatDownloads(plugin.downloads)}</span>
                    <span>⭐ {plugin.rating}</span>
                  </div>

                  {/* 操作按钮 */}
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!plugin.installed ? (
                      <button
                        onClick={() => installPlugin(plugin.id)}
                        className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        安装
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => togglePlugin(plugin.id)}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                            plugin.enabled
                              ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {plugin.enabled ? "已启用" : "已禁用"}
                        </button>
                        {plugin.hasUpdate && (
                          <button
                            onClick={() => updatePlugin(plugin.id)}
                            className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            更新
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 状态指示 */}
                {plugin.installed && (
                  <div className="absolute top-3 right-3">
                    <div className={`w-2 h-2 rounded-full ${
                      plugin.enabled ? "bg-green-500" : "bg-gray-400"
                    }`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 插件详情弹窗 */}
      {showDetail && selectedPlugin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center text-3xl">
                    {selectedPlugin.icon || "📦"}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                      {selectedPlugin.name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      v{selectedPlugin.version} · {selectedPlugin.author}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>⬇️ {formatDownloads(selectedPlugin.downloads)} 次下载</span>
                      <span>⭐ {selectedPlugin.rating} 分</span>
                      <span>📅 更新于 {selectedPlugin.lastUpdated}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {/* 描述 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  插件介绍
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {selectedPlugin.description}
                </p>
              </div>

              {/* 标签 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  标签
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPlugin.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* 功能特性 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  主要功能
                </h3>
                <ul className="space-y-2">
                  {[
                    "完整的功能支持",
                    "与系统深度集成",
                    "高性能低占用",
                    "持续更新维护",
                    "专业技术支持",
                  ].map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-green-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 权限说明 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  所需权限
                </h3>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    ⚠️ 该插件需要以下权限：读取文件、写入文件、网络请求、本地存储
                  </p>
                </div>
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedPlugin.installed ? (
                    selectedPlugin.enabled ? (
                      <span className="text-green-600 dark:text-green-400">● 已启用</span>
                    ) : (
                      <span className="text-gray-400">● 已禁用</span>
                    )
                  ) : (
                    <span>未安装</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {selectedPlugin.installed ? (
                    <>
                      <button
                        onClick={() => {
                          togglePlugin(selectedPlugin.id);
                          setSelectedPlugin({ ...selectedPlugin, enabled: !selectedPlugin.enabled });
                        }}
                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                          selectedPlugin.enabled
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                            : "bg-blue-500 text-white hover:bg-blue-600"
                        }`}
                      >
                        {selectedPlugin.enabled ? "禁用" : "启用"}
                      </button>
                      <button
                        onClick={() => {
                          uninstallPlugin(selectedPlugin.id);
                          setSelectedPlugin({ ...selectedPlugin, installed: false, enabled: false });
                        }}
                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        卸载
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        installPlugin(selectedPlugin.id);
                        setSelectedPlugin({ ...selectedPlugin, installed: true, enabled: true });
                      }}
                      className="px-6 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      立即安装
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PluginManager;
