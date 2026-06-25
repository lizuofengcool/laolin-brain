"use client";

import React, { useState } from "react";

// ==================== 类型定义 ====================

type IntegrationType = "storage" | "auth" | "notification" | "office" | "ai";
type IntegrationStatus = "not-connected" | "connected" | "error";

interface Integration {
  id: string;
  name: string;
  description: string;
  type: IntegrationType;
  icon: string;
  status: IntegrationStatus;
  category: string;
  features: string[];
  configFields?: ConfigField[];
  connectedAt?: string;
  lastSync?: string;
}

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "number" | "boolean";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  description?: string;
}

// ==================== 模拟数据 ====================

const mockIntegrations: Integration[] = [
  // 存储集成
  {
    id: "aliyun-oss",
    name: "阿里云OSS",
    description: "阿里云对象存储服务，支持海量文件存储",
    type: "storage",
    icon: "☁️",
    status: "connected",
    category: "云存储",
    features: ["文件存储", "CDN加速", "图片处理", "跨区域复制"],
    connectedAt: "2024-06-01",
    lastSync: "2024-06-25 10:30",
    configFields: [
      { key: "accessKeyId", label: "AccessKey ID", type: "text", required: true, placeholder: "请输入AccessKey ID" },
      { key: "accessKeySecret", label: "AccessKey Secret", type: "password", required: true, placeholder: "请输入AccessKey Secret" },
      { key: "bucket", label: "Bucket名称", type: "text", required: true, placeholder: "请输入Bucket名称" },
      { key: "region", label: "地域", type: "select", required: true, options: [
        { label: "华东1（杭州）", value: "oss-cn-hangzhou" },
        { label: "华东2（上海）", value: "oss-cn-shanghai" },
        { label: "华北1（北京）", value: "oss-cn-beijing" },
        { label: "华南1（深圳）", value: "oss-cn-shenzhen" },
      ]},
    ],
  },
  {
    id: "tencent-cos",
    name: "腾讯云COS",
    description: "腾讯云对象存储，高可靠、高可用",
    type: "storage",
    icon: "🐧",
    status: "not-connected",
    category: "云存储",
    features: ["文件存储", "CDN加速", "数据加密", "生命周期管理"],
    configFields: [
      { key: "secretId", label: "SecretId", type: "text", required: true },
      { key: "secretKey", label: "SecretKey", type: "password", required: true },
      { key: "bucket", label: "存储桶名称", type: "text", required: true },
      { key: "region", label: "地域", type: "text", required: true, placeholder: "ap-beijing" },
    ],
  },
  {
    id: "qiniu-kodo",
    name: "七牛云Kodo",
    description: "七牛云对象存储，海量数据存储",
    type: "storage",
    icon: "📦",
    status: "not-connected",
    category: "云存储",
    features: ["文件存储", "CDN加速", "图片处理", "音视频处理"],
  },
  {
    id: "aws-s3",
    name: "AWS S3",
    description: "亚马逊简单存储服务，全球覆盖",
    type: "storage",
    icon: "🌐",
    status: "not-connected",
    category: "云存储",
    features: ["全球存储", "高可用性", "数据加密", "版本控制"],
  },

  // 认证集成
  {
    id: "wechat-work",
    name: "企业微信",
    description: "企业微信登录和消息通知集成",
    type: "auth",
    icon: "💬",
    status: "not-connected",
    category: "企业办公",
    features: ["扫码登录", "消息通知", "组织架构", "通讯录同步"],
    configFields: [
      { key: "corpId", label: "企业ID", type: "text", required: true },
      { key: "agentId", label: "应用AgentId", type: "text", required: true },
      { key: "secret", label: "应用Secret", type: "password", required: true },
    ],
  },
  {
    id: "dingtalk",
    name: "钉钉",
    description: "钉钉登录和工作通知集成",
    type: "auth",
    icon: "📌",
    status: "not-connected",
    category: "企业办公",
    features: ["扫码登录", "工作通知", "审批流程", "通讯录"],
  },
  {
    id: "feishu",
    name: "飞书",
    description: "飞书登录和文档集成",
    type: "auth",
    icon: "📘",
    status: "not-connected",
    category: "企业办公",
    features: ["扫码登录", "消息通知", "文档同步", "日历集成"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHub账号登录和代码仓库集成",
    type: "auth",
    icon: "🐙",
    status: "connected",
    category: "开发工具",
    features: ["OAuth登录", "仓库同步", "Issue管理", "代码预览"],
    connectedAt: "2024-05-15",
  },
  {
    id: "google",
    name: "Google",
    description: "Google账号登录和Drive集成",
    type: "auth",
    icon: "🔍",
    status: "not-connected",
    category: "Google服务",
    features: ["OAuth登录", "Drive同步", "日历集成", "Gmail通知"],
  },

  // 通知集成
  {
    id: "email-smtp",
    name: "邮件通知",
    description: "SMTP邮件发送服务",
    type: "notification",
    icon: "📧",
    status: "connected",
    category: "邮件",
    features: ["邮件通知", "批量发送", "模板管理", "发送统计"],
    connectedAt: "2024-06-10",
    configFields: [
      { key: "host", label: "SMTP服务器", type: "text", required: true, placeholder: "smtp.example.com" },
      { key: "port", label: "端口", type: "number", required: true, placeholder: "465" },
      { key: "username", label: "用户名", type: "text", required: true },
      { key: "password", label: "密码", type: "password", required: true },
      { key: "fromEmail", label: "发件人邮箱", type: "text", required: true },
      { key: "ssl", label: "启用SSL", type: "boolean" },
    ],
  },
  {
    id: "sms",
    name: "短信通知",
    description: "短信验证码和通知发送",
    type: "notification",
    icon: "📱",
    status: "not-connected",
    category: "短信",
    features: ["验证码", "通知短信", "批量发送", "发送记录"],
  },
  {
    id: "webhook-notify",
    name: "Webhook通知",
    description: "自定义Webhook事件通知",
    type: "notification",
    icon: "🔔",
    status: "not-connected",
    category: "Webhook",
    features: ["事件订阅", "自定义URL", "签名验证", "重试机制"],
  },

  // 办公集成
  {
    id: "feishu-docs",
    name: "飞书文档",
    description: "飞书文档同步和协作",
    type: "office",
    icon: "📝",
    status: "not-connected",
    category: "文档协作",
    features: ["文档同步", "在线编辑", "协作评论", "版本历史"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Notion笔记和数据库集成",
    type: "office",
    icon: "📓",
    status: "not-connected",
    category: "笔记",
    features: ["页面同步", "数据库查询", "模板导入", "双向链接"],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "微软OneDrive云存储集成",
    type: "office",
    icon: "💙",
    status: "not-connected",
    category: "云存储",
    features: ["文件同步", "在线编辑", "共享协作", "版本历史"],
  },

  // AI集成
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI GPT模型集成",
    type: "ai",
    icon: "🤖",
    status: "connected",
    category: "大模型",
    features: ["GPT-4", "GPT-3.5", "Embedding", "函数调用"],
    connectedAt: "2024-04-20",
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "sk-..." },
      { key: "baseUrl", label: "API地址", type: "text", placeholder: "https://api.openai.com/v1" },
      { key: "model", label: "默认模型", type: "select", options: [
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
        { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
      ]},
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Anthropic Claude模型集成",
    type: "ai",
    icon: "🧠",
    status: "not-connected",
    category: "大模型",
    features: ["Claude 3 Opus", "Claude 3 Sonnet", "长上下文", "安全可靠"],
  },
  {
    id: "qwen",
    name: "通义千问",
    description: "阿里通义千问大模型",
    type: "ai",
    icon: "✨",
    status: "not-connected",
    category: "大模型",
    features: ["通义千问Max", "通义千问Plus", "通义千问Turbo", "多模态"],
  },
];

const integrationTypes = [
  { value: "all", label: "全部", icon: "🔗" },
  { value: "storage", label: "存储", icon: "☁️" },
  { value: "auth", label: "认证", icon: "🔐" },
  { value: "notification", label: "通知", icon: "🔔" },
  { value: "office", label: "办公", icon: "📋" },
  { value: "ai", label: "AI", icon: "🤖" },
];

// ==================== 主组件 ====================

export function IntegrationManager() {
  const [integrations, setIntegrations] = useState<Integration[]>(mockIntegrations);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, any>>({});

  // 过滤集成
  const filteredIntegrations = integrations.filter((integration) => {
    // 按类型筛选
    if (selectedType !== "all" && integration.type !== selectedType) {
      return false;
    }

    // 搜索
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        integration.name.toLowerCase().includes(query) ||
        integration.description.toLowerCase().includes(query) ||
        integration.category.toLowerCase().includes(query) ||
        integration.features.some((f) => f.toLowerCase().includes(query))
      );
    }

    return true;
  });

  // 已连接的数量
  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  // 打开配置
  const openConfig = (integration: Integration) => {
    setSelectedIntegration(integration);
    setConfigValues({});
    setShowConfig(true);
  };

  // 保存配置
  const saveConfig = () => {
    if (!selectedIntegration) return;

    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === selectedIntegration.id
          ? { ...i, status: "connected", connectedAt: new Date().toISOString().split("T")[0] }
          : i
      )
    );
    setShowConfig(false);
    setSelectedIntegration(null);
  };

  // 断开连接
  const disconnect = (integrationId: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === integrationId ? { ...i, status: "not-connected", connectedAt: undefined } : i
      )
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
              集成中心
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              已连接 <span className="text-blue-500 font-medium">{connectedCount}</span> 个集成
            </p>
          </div>

          {/* 搜索框 */}
          <div className="relative w-72">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索集成..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 类型筛选 */}
        <div className="flex items-center gap-1">
          {integrationTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                selectedType === type.value
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 集成列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredIntegrations.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔗</div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
              没有找到集成
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              试试其他关键词或分类
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md transition-all"
              >
                {/* 头部 */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                    {integration.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-medium text-gray-800 dark:text-white truncate">
                        {integration.name}
                      </h3>
                      {integration.status === "connected" && (
                        <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {integration.category}
                    </p>
                  </div>
                </div>

                {/* 描述 */}
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                  {integration.description}
                </p>

                {/* 功能标签 */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {integration.features.slice(0, 3).map((feature) => (
                    <span
                      key={feature}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded"
                    >
                      {feature}
                    </span>
                  ))}
                  {integration.features.length > 3 && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded">
                      +{integration.features.length - 3}
                    </span>
                  )}
                </div>

                {/* 状态和操作 */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {integration.status === "connected" && integration.connectedAt && (
                      <span>已连接 · {integration.connectedAt}</span>
                    )}
                    {integration.status === "not-connected" && (
                      <span className="text-gray-400">未连接</span>
                    )}
                  </div>

                  <button
                    onClick={() => openConfig(integration)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      integration.status === "connected"
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                    }`}
                  >
                    {integration.status === "connected" ? "管理" : "连接"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 配置弹窗 */}
      {showConfig && selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* 弹窗头部 */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-center text-2xl">
                    {selectedIntegration.icon}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                      {selectedIntegration.name}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedIntegration.category}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowConfig(false);
                    setSelectedIntegration(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {selectedIntegration.status === "connected" ? (
                // 已连接状态
                <div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        连接成功
                      </span>
                    </div>
                    {selectedIntegration.connectedAt && (
                      <p className="text-xs text-green-600 dark:text-green-500">
                        连接时间：{selectedIntegration.connectedAt}
                      </p>
                    )}
                    {selectedIntegration.lastSync && (
                      <p className="text-xs text-green-600 dark:text-green-500">
                        最后同步：{selectedIntegration.lastSync}
                      </p>
                    )}
                  </div>

                  {/* 功能列表 */}
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      支持的功能
                    </h3>
                    <div className="space-y-2">
                      {selectedIntegration.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="text-green-500">✓</span>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        // 重新配置
                      }}
                      className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      重新配置
                    </button>
                    <button
                      onClick={() => {
                        disconnect(selectedIntegration.id);
                        setShowConfig(false);
                        setSelectedIntegration(null);
                      }}
                      className="flex-1 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      断开连接
                    </button>
                  </div>
                </div>
              ) : (
                // 未连接状态 - 配置表单
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    {selectedIntegration.description}
                  </p>

                  {/* 配置字段 */}
                  {selectedIntegration.configFields && selectedIntegration.configFields.length > 0 ? (
                    <div className="space-y-4">
                      {selectedIntegration.configFields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          
                          {field.type === "text" && (
                            <input
                              type="text"
                              value={configValues[field.key] || ""}
                              onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          )}

                          {field.type === "password" && (
                            <input
                              type="password"
                              value={configValues[field.key] || ""}
                              onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          )}

                          {field.type === "number" && (
                            <input
                              type="number"
                              value={configValues[field.key] || ""}
                              onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                          )}

                          {field.type === "select" && field.options && (
                            <select
                              value={configValues[field.key] || ""}
                              onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                              <option value="">请选择</option>
                              {field.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}

                          {field.type === "boolean" && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={configValues[field.key] || false}
                                onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-600 dark:text-gray-400">启用</span>
                            </label>
                          )}

                          {field.description && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {field.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p>点击下方按钮开始连接</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 弹窗底部 */}
            {selectedIntegration.status !== "connected" && (
              <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowConfig(false);
                      setSelectedIntegration(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveConfig}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    连接
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default IntegrationManager;
