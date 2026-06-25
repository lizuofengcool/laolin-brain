"use client";

import React, { useState, useMemo } from "react";

// ==================== 类型定义 ====================

export type TemplateCategory = "document" | "spreadsheet" | "presentation" | "mindmap" | "flowchart";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  color: string;
  preview?: string;
  isFavorite?: boolean;
  isBuiltIn?: boolean;
  usageCount?: number;
  tags?: string[];
}

export interface TemplateSystemProps {
  templates?: Template[];
  onUseTemplate?: (template: Template) => void;
  className?: string;
}

// ==================== 分类配置 ====================

const CATEGORIES: { id: TemplateCategory | "all"; name: string; icon: string }[] = [
  { id: "all", name: "全部", icon: "📚" },
  { id: "document", name: "文档", icon: "📝" },
  { id: "spreadsheet", name: "表格", icon: "📊" },
  { id: "presentation", name: "演示", icon: "📽️" },
  { id: "mindmap", name: "思维导图", icon: "🧠" },
  { id: "flowchart", name: "流程图", icon: "📋" },
];

// ==================== 内置模板数据 ====================

const builtInTemplates: Template[] = [
  // 文档模板
  {
    id: "doc-meeting",
    name: "会议纪要",
    description: "记录会议时间、参会人员、议题和决议",
    category: "document",
    icon: "📝",
    color: "bg-blue-500",
    isBuiltIn: true,
    usageCount: 1256,
    tags: ["会议", "工作", "记录"],
  },
  {
    id: "doc-project",
    name: "项目计划书",
    description: "项目目标、时间表、资源分配和风险评估",
    category: "document",
    icon: "📋",
    color: "bg-green-500",
    isBuiltIn: true,
    usageCount: 892,
    tags: ["项目", "计划", "管理"],
  },
  {
    id: "doc-weekly",
    name: "周报模板",
    description: "本周工作总结、下周计划和问题反馈",
    category: "document",
    icon: "📅",
    color: "bg-purple-500",
    isBuiltIn: true,
    usageCount: 2341,
    tags: ["周报", "总结", "计划"],
  },
  {
    id: "doc-monthly",
    name: "月报模板",
    description: "月度工作回顾、成果展示和下月规划",
    category: "document",
    icon: "📆",
    color: "bg-orange-500",
    isBuiltIn: true,
    usageCount: 678,
    tags: ["月报", "总结", "规划"],
  },
  {
    id: "doc-reading",
    name: "读书笔记",
    description: "书籍要点摘录、心得体会和行动清单",
    category: "document",
    icon: "📖",
    color: "bg-cyan-500",
    isBuiltIn: true,
    usageCount: 567,
    tags: ["读书", "笔记", "学习"],
  },
  {
    id: "doc-todo",
    name: "待办清单",
    description: "任务列表、优先级排序和进度跟踪",
    category: "document",
    icon: "✅",
    color: "bg-pink-500",
    isBuiltIn: true,
    usageCount: 3421,
    tags: ["待办", "任务", "效率"],
  },

  // 表格模板
  {
    id: "sheet-budget",
    name: "预算表",
    description: "收入支出预算和实际对比分析",
    category: "spreadsheet",
    icon: "💰",
    color: "bg-green-500",
    isBuiltIn: true,
    usageCount: 789,
    tags: ["预算", "财务", "分析"],
  },
  {
    id: "sheet-attendance",
    name: "考勤表",
    description: "员工出勤记录和统计汇总",
    category: "spreadsheet",
    icon: "📋",
    color: "bg-blue-500",
    isBuiltIn: true,
    usageCount: 567,
    tags: ["考勤", "人事", "统计"],
  },
  {
    id: "sheet-inventory",
    name: "库存管理表",
    description: "商品库存出入库记录和库存预警",
    category: "spreadsheet",
    icon: "📦",
    color: "bg-orange-500",
    isBuiltIn: true,
    usageCount: 432,
    tags: ["库存", "管理", "仓储"],
  },

  // 演示模板
  {
    id: "ppt-business",
    name: "商务汇报",
    description: "专业商务风格的汇报演示模板",
    category: "presentation",
    icon: "💼",
    color: "bg-blue-500",
    isBuiltIn: true,
    usageCount: 1567,
    tags: ["商务", "汇报", "专业"],
  },
  {
    id: "ppt-product",
    name: "产品介绍",
    description: "产品功能介绍和卖点展示",
    category: "presentation",
    icon: "🎯",
    color: "bg-purple-500",
    isBuiltIn: true,
    usageCount: 890,
    tags: ["产品", "介绍", "营销"],
  },
  {
    id: "ppt-education",
    name: "教学课件",
    description: "课程教学演示用PPT模板",
    category: "presentation",
    icon: "🎓",
    color: "bg-green-500",
    isBuiltIn: true,
    usageCount: 654,
    tags: ["教学", "课件", "教育"],
  },

  // 思维导图模板
  {
    id: "mind-brainstorm",
    name: "头脑风暴",
    description: "创意发散和想法整理",
    category: "mindmap",
    icon: "💡",
    color: "bg-yellow-500",
    isBuiltIn: true,
    usageCount: 1234,
    tags: ["创意", "头脑风暴", "发散"],
  },
  {
    id: "mind-knowledge",
    name: "知识体系",
    description: "学科知识框架和要点梳理",
    category: "mindmap",
    icon: "📚",
    color: "bg-blue-500",
    isBuiltIn: true,
    usageCount: 876,
    tags: ["知识", "学习", "体系"],
  },
  {
    id: "mind-project",
    name: "项目拆解",
    description: "项目任务分解和责任分配",
    category: "mindmap",
    icon: "🏗️",
    color: "bg-green-500",
    isBuiltIn: true,
    usageCount: 543,
    tags: ["项目", "拆解", "任务"],
  },

  // 流程图模板
  {
    id: "flow-workflow",
    name: "工作流程",
    description: "标准工作流程和审批节点",
    category: "flowchart",
    icon: "🔄",
    color: "bg-blue-500",
    isBuiltIn: true,
    usageCount: 678,
    tags: ["工作流", "审批", "流程"],
  },
  {
    id: "flow-user",
    name: "用户旅程",
    description: "用户使用产品的完整路径",
    category: "flowchart",
    icon: "👤",
    color: "bg-purple-500",
    isBuiltIn: true,
    usageCount: 432,
    tags: ["用户", "体验", "旅程"],
  },
  {
    id: "flow-algorithm",
    name: "算法逻辑",
    description: "程序算法和逻辑流程图",
    category: "flowchart",
    icon: "⚙️",
    color: "bg-gray-500",
    isBuiltIn: true,
    usageCount: 321,
    tags: ["算法", "程序", "逻辑"],
  },
];

// ==================== 主组件 ====================

export function TemplateSystem({
  templates = builtInTemplates,
  onUseTemplate,
  className = "",
}: TemplateSystemProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "name">("popular");

  // 过滤和排序模板
  const filteredTemplates = useMemo(() => {
    let result = [...templates];

    // 按分类过滤
    if (activeCategory !== "all") {
      result = result.filter((t) => t.category === activeCategory);
    }

    // 按搜索词过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // 排序
    switch (sortBy) {
      case "popular":
        result.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        break;
      case "newest":
        result.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [templates, activeCategory, searchQuery, sortBy]);

  // 获取分类名称
  const getCategoryName = (category: TemplateCategory): string => {
    return CATEGORIES.find((c) => c.id === category)?.name || category;
  };

  // 使用模板
  const handleUseTemplate = (template: Template) => {
    if (onUseTemplate) {
      onUseTemplate(template);
    } else {
      setSelectedTemplate(template);
    }
  };

  // ==================== 渲染 ====================

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* 头部 */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">模板中心</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              从 {templates.length} 个精选模板开始
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* 搜索框 */}
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模板..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* 分类标签 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all
                ${activeCategory === cat.id
                  ? "bg-blue-500 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                }
              `}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 排序和统计 */}
      <div className="px-6 py-3 border-b border-gray-50 dark:border-gray-700/50 flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          共 {filteredTemplates.length} 个模板
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">排序：</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm bg-transparent text-gray-600 dark:text-gray-400 border-none focus:outline-none cursor-pointer"
          >
            <option value="popular">最热门</option>
            <option value="newest">最新</option>
            <option value="name">按名称</option>
          </select>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="p-6">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500 dark:text-gray-400">没有找到匹配的模板</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">试试其他关键词或分类</p>
          </div>
        ) : viewMode === "grid" ? (
          // 网格视图
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="group bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-600/50 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-500/30 transition-all cursor-pointer"
                onClick={() => setSelectedTemplate(template)}
              >
                {/* 预览区 */}
                <div className={`h-32 ${template.color} flex items-center justify-center relative`}>
                  <span className="text-4xl">{template.icon}</span>
                  {template.isBuiltIn && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full">
                      官方
                    </span>
                  )}
                </div>

                {/* 信息区 */}
                <div className="p-3">
                  <h3 className="font-medium text-gray-800 dark:text-white text-sm mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {template.usageCount?.toLocaleString()} 次使用
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseTemplate(template);
                      }}
                      className="px-2.5 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      使用
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // 列表视图
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600/50 hover:border-blue-200 dark:hover:border-blue-500/30 transition-all cursor-pointer group"
                onClick={() => setSelectedTemplate(template)}
              >
                <div className={`w-12 h-12 ${template.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <span className="text-xl">{template.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-800 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {template.description}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {getCategoryName(template.category)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {template.usageCount?.toLocaleString()} 次
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUseTemplate(template);
                    }}
                    className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    使用模板
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 模板预览弹窗 */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTemplate(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 预览头部 */}
            <div className={`h-40 ${selectedTemplate.color} flex items-center justify-center relative`}>
              <span className="text-6xl">{selectedTemplate.icon}</span>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 预览内容 */}
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                    {selectedTemplate.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedTemplate.description}
                  </p>
                </div>
                {selectedTemplate.isBuiltIn && (
                  <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                    官方模板
                  </span>
                )}
              </div>

              {/* 标签 */}
              {selectedTemplate.tags && selectedTemplate.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedTemplate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 统计信息 */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl mb-6">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-800 dark:text-white">
                    {selectedTemplate.usageCount?.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">使用次数</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-800 dark:text-white">
                    {getCategoryName(selectedTemplate.category)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">模板分类</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-800 dark:text-white">⭐ 4.9</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">用户评分</div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    handleUseTemplate(selectedTemplate);
                    setSelectedTemplate(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  使用此模板
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TemplateSystem;
