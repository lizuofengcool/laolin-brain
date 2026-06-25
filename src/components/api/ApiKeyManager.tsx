"use client";

import React, { useState, useMemo } from "react";

// ==================== 类型定义 ====================

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  enabled: boolean;
  usageCount: number;
}

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  scope: string;
  parameters?: { name: string; type: string; required: boolean; description: string }[];
  responseExample?: string;
}

// ==================== 模拟数据 ====================

const mockApiKeys: ApiKey[] = [
  {
    id: "key_1",
    name: "生产环境密钥",
    key: "demo-key-live-xxxxxxxxxxxxxxxxxxxxxx",
    scopes: ["files:read", "files:write", "folders:read", "search:read"],
    expiresAt: null,
    lastUsedAt: "2024-06-25 14:30:22",
    createdAt: "2024-05-10",
    enabled: true,
    usageCount: 15234,
  },
  {
    id: "key_2",
    name: "测试环境密钥",
    key: "demo-key-test-xxxxxxxxxxxxxxxxxxxxxx",
    scopes: ["files:read", "search:read"],
    expiresAt: "2024-12-31",
    lastUsedAt: "2024-06-20 09:15:00",
    createdAt: "2024-06-01",
    enabled: true,
    usageCount: 2341,
  },
  {
    id: "key_3",
    name: "只读密钥",
    key: "demo-key-read-xxxxxxxxxxxxxxxxxxxxxx",
    scopes: ["files:read", "folders:read", "search:read"],
    expiresAt: null,
    lastUsedAt: null,
    createdAt: "2024-06-15",
    enabled: false,
    usageCount: 0,
  },
];

const allScopes = [
  { value: "files:read", label: "读取文件", description: "读取文件列表和内容" },
  { value: "files:write", label: "写入文件", description: "上传、修改、删除文件" },
  { value: "folders:read", label: "读取文件夹", description: "读取文件夹结构" },
  { value: "folders:write", label: "写入文件夹", description: "创建、修改、删除文件夹" },
  { value: "search:read", label: "搜索", description: "搜索文件和内容" },
  { value: "ai:read", label: "AI功能", description: "使用AI相关功能" },
  { value: "admin:read", label: "管理读取", description: "读取管理数据" },
  { value: "admin:write", label: "管理写入", description: "管理操作权限" },
];

const apiEndpoints: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/files",
    description: "获取文件列表",
    scope: "files:read",
    parameters: [
      { name: "page", type: "number", required: false, description: "页码，默认1" },
      { name: "pageSize", type: "number", required: false, description: "每页数量，默认20" },
      { name: "folderId", type: "string", required: false, description: "文件夹ID" },
    ],
  },
  {
    method: "POST",
    path: "/api/files",
    description: "上传文件",
    scope: "files:write",
    parameters: [
      { name: "file", type: "file", required: true, description: "文件内容" },
      { name: "folderId", type: "string", required: false, description: "目标文件夹ID" },
      { name: "fileName", type: "string", required: false, description: "自定义文件名" },
    ],
  },
  {
    method: "GET",
    path: "/api/files/:id",
    description: "获取文件详情",
    scope: "files:read",
  },
  {
    method: "DELETE",
    path: "/api/files/:id",
    description: "删除文件",
    scope: "files:write",
  },
  {
    method: "GET",
    path: "/api/folders",
    description: "获取文件夹列表",
    scope: "folders:read",
  },
  {
    method: "POST",
    path: "/api/folders",
    description: "创建文件夹",
    scope: "folders:write",
  },
  {
    method: "GET",
    path: "/api/search",
    description: "搜索文件",
    scope: "search:read",
    parameters: [
      { name: "q", type: "string", required: true, description: "搜索关键词" },
      { name: "type", type: "string", required: false, description: "搜索类型：keyword/semantic/hybrid" },
    ],
  },
  {
    method: "POST",
    path: "/api/ai/summarize",
    description: "生成文档摘要",
    scope: "ai:read",
  },
  {
    method: "POST",
    path: "/api/ai/ocr",
    description: "OCR文字识别",
    scope: "ai:read",
  },
];

// ==================== 工具函数 ====================

const methodColors: Record<string, string> = {
  GET: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PUT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  PATCH: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return "从未使用";
  return dateStr;
};

// ==================== 主组件 ====================

export function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockApiKeys);
  const [activeTab, setActiveTab] = useState<"keys" | "docs" | "usage">("keys");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState<string>("never");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 过滤API端点
  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return apiEndpoints;
    const query = searchQuery.toLowerCase();
    return apiEndpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(query) ||
        ep.description.toLowerCase().includes(query) ||
        ep.method.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // 复制密钥
  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  // 切换密钥启用状态
  const toggleKey = (keyId: string) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, enabled: !k.enabled } : k))
    );
  };

  // 删除密钥
  const deleteKey = (keyId: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  // 创建新密钥
  const createKey = () => {
    if (!newKeyName.trim()) return;

    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      name: newKeyName,
      key: `sk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      scopes: selectedScopes,
      expiresAt: expiryDays === "never" ? null : new Date(Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      lastUsedAt: null,
      createdAt: new Date().toISOString().split("T")[0],
      enabled: true,
      usageCount: 0,
    };

    setApiKeys((prev) => [newKey, ...prev]);
    setShowCreateModal(false);
    setNewKeyName("");
    setSelectedScopes([]);
    setExpiryDays("never");
  };

  // 切换权限范围
  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 顶部 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              API 管理
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理 API 密钥和查看 API 文档
            </p>
          </div>

          {activeTab === "keys" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <span>+</span>
              创建密钥
            </button>
          )}
        </div>

        {/* 标签页 */}
        <div className="flex items-center gap-1">
          {[
            { value: "keys", label: "API 密钥", icon: "🔑" },
            { value: "docs", label: "API 文档", icon: "📚" },
            { value: "usage", label: "使用统计", icon: "📊" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as any)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === tab.value
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {/* API密钥列表 */}
        {activeTab === "keys" && (
          <div className="p-6">
            {apiKeys.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔑</div>
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                  还没有 API 密钥
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  创建一个 API 密钥开始使用 API
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                >
                  创建第一个密钥
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4"
                  >
                    {/* 头部 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-center text-xl">
                          🔑
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-800 dark:text-white">
                              {apiKey.name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                apiKey.enabled
                                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                              }`}
                            >
                              {apiKey.enabled ? "已启用" : "已禁用"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            创建于 {apiKey.createdAt}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleKey(apiKey.id)}
                          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          {apiKey.enabled ? "禁用" : "启用"}
                        </button>
                        <button
                          onClick={() => deleteKey(apiKey.id)}
                          className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {/* 密钥显示 */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <code className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                          {apiKey.key.substring(0, 8)}...{apiKey.key.substring(apiKey.key.length - 4)}
                        </code>
                        <button
                          onClick={() => copyKey(apiKey.key)}
                          className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          {copiedKey === apiKey.key ? "已复制 ✓" : "复制"}
                        </button>
                      </div>
                    </div>

                    {/* 权限范围 */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {apiKey.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>

                    {/* 统计信息 */}
                    <div className="flex items-center gap-6 text-xs text-gray-400 dark:text-gray-500">
                      <span>调用次数：{apiKey.usageCount.toLocaleString()}</span>
                      <span>最后使用：{formatDate(apiKey.lastUsedAt)}</span>
                      {apiKey.expiresAt && (
                        <span>过期时间：{apiKey.expiresAt}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* API文档 */}
        {activeTab === "docs" && (
          <div className="p-6">
            {/* 搜索框 */}
            <div className="mb-6">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索 API 端点..."
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* 认证说明 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">
                🔐 认证方式
              </h3>
              <p className="text-sm text-blue-600 dark:text-blue-300 mb-2">
                所有 API 请求都需要在请求头中携带 API 密钥：
              </p>
              <code className="text-xs bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded text-blue-700 dark:text-blue-300">
                Authorization: Bearer YOUR_API_KEY
              </code>
            </div>

            {/* API端点列表 */}
            <div className="space-y-2">
              {filteredEndpoints.map((endpoint, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        methodColors[endpoint.method] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {endpoint.method}
                    </span>
                    <code className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {endpoint.path}
                    </code>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {endpoint.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      权限：
                    </span>
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded">
                      {endpoint.scope}
                    </span>
                  </div>

                  {/* 参数列表 */}
                  {endpoint.parameters && endpoint.parameters.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        参数：
                      </p>
                      <div className="space-y-1">
                        {endpoint.parameters.map((param, pIndex) => (
                          <div
                            key={pIndex}
                            className="flex items-start gap-2 text-xs"
                          >
                            <code className="text-gray-600 dark:text-gray-400 font-mono">
                              {param.name}
                            </code>
                            <span className="text-gray-400 dark:text-gray-500">
                              ({param.type})
                            </span>
                            {param.required && (
                              <span className="text-red-500">必填</span>
                            )}
                            <span className="text-gray-500 dark:text-gray-400">
                              - {param.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 使用统计 */}
        {activeTab === "usage" && (
          <div className="p-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: "今日调用", value: "1,234", icon: "📈", trend: "+12%" },
                { label: "本周调用", value: "8,567", icon: "📊", trend: "+8%" },
                { label: "本月调用", value: "32,145", icon: "📅", trend: "+15%" },
                { label: "总调用量", value: "156,789", icon: "🔢", trend: "" },
              ].map((stat, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{stat.icon}</span>
                    {stat.trend && (
                      <span className="text-xs text-green-500">{stat.trend}</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-white mb-1">
                    {stat.value}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* 调用趋势图（占位） */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                调用趋势（近7天）
              </h3>
              <div className="h-48 flex items-end justify-between gap-2">
                {[65, 78, 52, 89, 72, 95, 88].map((height, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-gray-400 mt-2">
                      {["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 端点调用排行 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                端点调用排行
              </h3>
              <div className="space-y-3">
                {[
                  { path: "GET /api/files", count: 45231, percent: 85 },
                  { path: "GET /api/search", count: 32156, percent: 65 },
                  { path: "POST /api/files", count: 18923, percent: 40 },
                  { path: "GET /api/folders", count: 15678, percent: 32 },
                  { path: "POST /api/ai/summarize", count: 8765, percent: 18 },
                ].map((item, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                        {item.path}
                      </code>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.count.toLocaleString()} 次
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 创建密钥弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                  创建 API 密钥
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* 名称 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  密钥名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="例如：生产环境密钥"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* 过期时间 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  过期时间
                </label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="never">永不过期</option>
                  <option value="7">7 天</option>
                  <option value="30">30 天</option>
                  <option value="90">90 天</option>
                  <option value="365">1 年</option>
                </select>
              </div>

              {/* 权限范围 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  权限范围
                </label>
                <div className="space-y-2">
                  {allScopes.map((scope) => (
                    <label
                      key={scope.value}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope.value)}
                        onChange={() => toggleScope(scope.value)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {scope.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {scope.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={createKey}
                  disabled={!newKeyName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建密钥
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApiKeyManager;
