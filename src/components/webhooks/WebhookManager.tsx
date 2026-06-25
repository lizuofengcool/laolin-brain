"use client";

import React, { useState } from "react";

// ==================== 类型定义 ====================

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
  successCount: number;
  failureCount: number;
}

interface WebhookLog {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed" | "retrying";
  responseCode: number | null;
  responseTime: number | null;
  errorMessage: string | null;
  triggeredAt: string;
  retryCount: number;
}

// ==================== 模拟数据 ====================

const eventTypes = [
  { value: "file.created", label: "文件创建", category: "文件", description: "当有新文件上传时触发" },
  { value: "file.updated", label: "文件更新", category: "文件", description: "当文件内容或元数据更新时触发" },
  { value: "file.deleted", label: "文件删除", category: "文件", description: "当文件被删除时触发" },
  { value: "file.moved", label: "文件移动", category: "文件", description: "当文件被移动时触发" },
  { value: "file.downloaded", label: "文件下载", category: "文件", description: "当文件被下载时触发" },
  { value: "folder.created", label: "文件夹创建", category: "文件夹", description: "当有新文件夹创建时触发" },
  { value: "folder.updated", label: "文件夹更新", category: "文件夹", description: "当文件夹更新时触发" },
  { value: "folder.deleted", label: "文件夹删除", category: "文件夹", description: "当文件夹被删除时触发" },
  { value: "share.created", label: "分享创建", category: "分享", description: "当创建新的分享链接时触发" },
  { value: "share.deleted", label: "分享删除", category: "分享", description: "当分享链接被删除时触发" },
  { value: "user.created", label: "用户注册", category: "用户", description: "当有新用户注册时触发" },
  { value: "user.updated", label: "用户更新", category: "用户", description: "当用户信息更新时触发" },
  { value: "comment.created", label: "评论创建", category: "评论", description: "当有新评论时触发" },
  { value: "ai.completed", label: "AI处理完成", category: "AI", description: "当AI处理任务完成时触发" },
];

const mockWebhooks: Webhook[] = [
  {
    id: "wh_1",
    name: "文件同步Webhook",
    url: "https://api.example.com/webhooks/files",
    events: ["file.created", "file.updated", "file.deleted"],
    secret: "whsec_xxxxxxxxxxxxxxxx",
    enabled: true,
    createdAt: "2024-05-15",
    lastTriggeredAt: "2024-06-25 14:30:00",
    successCount: 1234,
    failureCount: 12,
  },
  {
    id: "wh_2",
    name: "用户通知Webhook",
    url: "https://api.example.com/webhooks/users",
    events: ["user.created", "user.updated"],
    secret: "whsec_yyyyyyyyyyyyyyyy",
    enabled: true,
    createdAt: "2024-06-01",
    lastTriggeredAt: "2024-06-24 10:20:00",
    successCount: 567,
    failureCount: 3,
  },
  {
    id: "wh_3",
    name: "测试Webhook",
    url: "https://test.example.com/webhook",
    events: ["file.created"],
    secret: "whsec_zzzzzzzzzzzzzzzz",
    enabled: false,
    createdAt: "2024-06-10",
    lastTriggeredAt: null,
    successCount: 0,
    failureCount: 0,
  },
];

const mockWebhookLogs: WebhookLog[] = [
  {
    id: "log_1",
    webhookId: "wh_1",
    event: "file.created",
    status: "success",
    responseCode: 200,
    responseTime: 156,
    errorMessage: null,
    triggeredAt: "2024-06-25 14:30:00",
    retryCount: 0,
  },
  {
    id: "log_2",
    webhookId: "wh_1",
    event: "file.updated",
    status: "success",
    responseCode: 200,
    responseTime: 203,
    errorMessage: null,
    triggeredAt: "2024-06-25 14:25:00",
    retryCount: 0,
  },
  {
    id: "log_3",
    webhookId: "wh_1",
    event: "file.deleted",
    status: "failed",
    responseCode: 500,
    responseTime: 5000,
    errorMessage: "Internal Server Error",
    triggeredAt: "2024-06-25 14:20:00",
    retryCount: 3,
  },
  {
    id: "log_4",
    webhookId: "wh_2",
    event: "user.created",
    status: "success",
    responseCode: 201,
    responseTime: 89,
    errorMessage: null,
    triggeredAt: "2024-06-24 10:20:00",
    retryCount: 0,
  },
  {
    id: "log_5",
    webhookId: "wh_1",
    event: "file.created",
    status: "retrying",
    responseCode: null,
    responseTime: null,
    errorMessage: "Connection timeout",
    triggeredAt: "2024-06-25 14:15:00",
    retryCount: 2,
  },
];

// ==================== 工具函数 ====================

const getStatusColor = (status: string): string => {
  switch (status) {
    case "success":
      return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
    case "failed":
      return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
    case "retrying":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "retrying":
      return "重试中";
    default:
      return status;
  }
};

// ==================== 主组件 ====================

export function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>(mockWebhooks);
  const [activeTab, setActiveTab] = useState<"list" | "logs">("list");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  // 切换Webhook启用状态
  const toggleWebhook = (webhookId: string) => {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === webhookId ? { ...w, enabled: !w.enabled } : w))
    );
  };

  // 删除Webhook
  const deleteWebhook = (webhookId: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
  };

  // 创建Webhook
  const createWebhook = () => {
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;

    const newWebhook: Webhook = {
      id: `wh_${Date.now()}`,
      name: newWebhookName,
      url: newWebhookUrl,
      events: selectedEvents,
      secret: `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      enabled: true,
      createdAt: new Date().toISOString().split("T")[0],
      lastTriggeredAt: null,
      successCount: 0,
      failureCount: 0,
    };

    setWebhooks((prev) => [newWebhook, ...prev]);
    setShowCreateModal(false);
    setNewWebhookName("");
    setNewWebhookUrl("");
    setSelectedEvents([]);
  };

  // 切换事件选择
  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  // 复制密钥
  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(secret);
      setTimeout(() => setCopiedSecret(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  // 测试Webhook
  const testWebhook = (webhookId: string) => {
    // 模拟测试
    alert("Webhook测试已发送，请查看目标地址是否收到请求");
  };

  // 查看详情
  const viewDetail = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setShowDetail(true);
  };

  // 按分类分组事件
  const groupedEvents = eventTypes.reduce((acc, event) => {
    if (!acc[event.category]) {
      acc[event.category] = [];
    }
    acc[event.category].push(event);
    return acc;
  }, {} as Record<string, typeof eventTypes>);

  // ==================== 渲染 ====================

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* 顶部 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              Webhook 管理
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              配置事件通知和回调地址
            </p>
          </div>

          {activeTab === "list" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <span>+</span>
              创建 Webhook
            </button>
          )}
        </div>

        {/* 标签页 */}
        <div className="flex items-center gap-1">
          {[
            { value: "list", label: "Webhook 列表", icon: "🔗" },
            { value: "logs", label: "调用日志", icon: "📋" },
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
        {/* Webhook列表 */}
        {activeTab === "list" && (
          <div className="p-6">
            {webhooks.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔗</div>
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                  还没有 Webhook
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  创建一个 Webhook 开始接收事件通知
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                >
                  创建第一个 Webhook
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors"
                  >
                    {/* 头部 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-center text-xl">
                          🔗
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-800 dark:text-white">
                              {webhook.name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                webhook.enabled
                                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                              }`}
                            >
                              {webhook.enabled ? "已启用" : "已禁用"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-md">
                            {webhook.url}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => testWebhook(webhook.id)}
                          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          测试
                        </button>
                        <button
                          onClick={() => viewDetail(webhook)}
                          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => toggleWebhook(webhook.id)}
                          className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          {webhook.enabled ? "禁用" : "启用"}
                        </button>
                        <button
                          onClick={() => deleteWebhook(webhook.id)}
                          className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {/* 事件标签 */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {webhook.events.map((event) => (
                        <span
                          key={event}
                          className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded"
                        >
                          {event}
                        </span>
                      ))}
                    </div>

                    {/* 统计信息 */}
                    <div className="flex items-center gap-6 text-xs text-gray-400 dark:text-gray-500">
                      <span>成功：{webhook.successCount.toLocaleString()}</span>
                      <span>失败：{webhook.failureCount}</span>
                      <span>最后触发：{webhook.lastTriggeredAt || "从未触发"}</span>
                      <span>创建于：{webhook.createdAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 调用日志 */}
        {activeTab === "logs" && (
          <div className="p-6">
            {/* 筛选栏 */}
            <div className="flex items-center gap-4 mb-6">
              <select className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">全部 Webhook</option>
                {webhooks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <select className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">全部状态</option>
                <option value="success">成功</option>
                <option value="failed">失败</option>
                <option value="retrying">重试中</option>
              </select>

              <select className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">全部事件</option>
                {eventTypes.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 日志列表 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      事件
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      响应码
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      响应时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      重试次数
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      触发时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {mockWebhookLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <code className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                          {log.event}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(log.status)}`}>
                          {getStatusLabel(log.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {log.responseCode || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {log.responseTime ? `${log.responseTime}ms` : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {log.retryCount}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {log.triggeredAt}
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs text-blue-500 hover:text-blue-600">
                          查看详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 创建Webhook弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                  创建 Webhook
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
                  Webhook 名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  placeholder="例如：文件同步通知"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* 回调地址 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  回调地址 (URL) <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  事件发生时会向该地址发送 POST 请求
                </p>
              </div>

              {/* 事件选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  触发事件
                </label>
                <div className="space-y-4">
                  {Object.entries(groupedEvents).map(([category, events]) => (
                    <div key={category}>
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        {category}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {events.map((event) => (
                          <label
                            key={event.value}
                            className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedEvents.includes(event.value)}
                              onChange={() => toggleEvent(event.value)}
                              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            />
                            <div>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {event.label}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {event.description}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
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
                  onClick={createWebhook}
                  disabled={!newWebhookName.trim() || !newWebhookUrl.trim()}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建 Webhook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Webhook详情弹窗 */}
      {showDetail && selectedWebhook && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-center text-xl">
                    🔗
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                      {selectedWebhook.name}
                    </h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {selectedWebhook.enabled ? "已启用" : "已禁用"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDetail(false);
                    setSelectedWebhook(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
              {/* 回调地址 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  回调地址
                </h3>
                <code className="block text-xs bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-gray-600 dark:text-gray-400 font-mono break-all">
                  {selectedWebhook.url}
                </code>
              </div>

              {/* 签名密钥 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  签名密钥 (Secret)
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {showSecret ? selectedWebhook.secret : "••••••••••••••••"}
                    </code>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-xs text-gray-500 hover:text-gray-600"
                      >
                        {showSecret ? "隐藏" : "显示"}
                      </button>
                      <button
                        onClick={() => copySecret(selectedWebhook.secret)}
                        className="text-xs text-blue-500 hover:text-blue-600"
                      >
                        {copiedSecret === selectedWebhook.secret ? "已复制" : "复制"}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  用于验证 Webhook 请求的签名，请妥善保管
                </p>
              </div>

              {/* 订阅事件 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  订阅事件
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedWebhook.events.map((event) => (
                    <span
                      key={event}
                      className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded"
                    >
                      {event}
                    </span>
                  ))}
                </div>
              </div>

              {/* 统计信息 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  调用统计
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {selectedWebhook.successCount.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500">
                      成功次数
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {selectedWebhook.failureCount}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-500">
                      失败次数
                    </p>
                  </div>
                </div>
              </div>

              {/* 安全说明 */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                  ⚠️ 安全提示
                </h4>
                <ul className="text-xs text-yellow-600 dark:text-yellow-500 space-y-1">
                  <li>• 请确保回调地址使用 HTTPS 协议</li>
                  <li>• 使用签名密钥验证请求来源</li>
                  <li>• 建议设置请求超时和重试机制</li>
                  <li>• 定期轮换签名密钥</li>
                </ul>
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex gap-3">
                <button
                  onClick={() => testWebhook(selectedWebhook.id)}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  测试 Webhook
                </button>
                <button
                  onClick={() => {
                    setShowDetail(false);
                    setSelectedWebhook(null);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WebhookManager;
