/**
 * 自动化规则类型定义
 */

// 触发器类型
export type TriggerType =
  | "file_uploaded" // 文件上传
  | "file_modified" // 文件修改
  | "file_deleted" // 文件删除
  | "scheduled" // 定时触发
  | "webhook" // Webhook触发
  | "manual"; // 手动触发

// 条件类型
export type ConditionType =
  | "file_type" // 文件类型
  | "file_size" // 文件大小
  | "file_name" // 文件名
  | "has_tag" // 有标签
  | "in_folder" // 在文件夹中
  | "time_range" // 时间范围
  | "custom_expression"; // 自定义表达式

// 条件操作符
export type ConditionOperator =
  | "equals" // 等于
  | "not_equals" // 不等于
  | "contains" // 包含
  | "not_contains" // 不包含
  | "starts_with" // 开头是
  | "ends_with" // 结尾是
  | "greater_than" // 大于
  | "less_than" // 小于
  | "greater_equal" // 大于等于
  | "less_equal" // 小于等于
  | "in" // 在列表中
  | "not_in"; // 不在列表中

// 动作类型
export type ActionType =
  | "move_file" // 移动文件
  | "copy_file" // 复制文件
  | "delete_file" // 删除文件
  | "rename_file" // 重命名文件
  | "add_tags" // 添加标签
  | "remove_tags" // 移除标签
  | "set_favorite" // 设置收藏
  | "unset_favorite" // 取消收藏
  | "send_notification" // 发送通知
  | "call_webhook" // 调用Webhook
  | "ai_summarize" // AI摘要
  | "ai_ocr" // AI OCR
  | "ai_generate_tags" // AI生成标签
  | "compress_file" // 压缩文件
  | "convert_format"; // 转换格式

// 规则状态
export type RuleStatus = "enabled" | "disabled" | "error";

// 执行状态
export type ExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

// 触发器配置
export interface TriggerConfig {
  type: TriggerType;
  config?: Record<string, any>;
}

// 条件配置
export interface ConditionConfig {
  type: ConditionType;
  operator: ConditionOperator;
  value: any;
  field?: string;
}

// 条件组（支持AND/OR组合）
export interface ConditionGroup {
  logic: "AND" | "OR";
  conditions: (ConditionConfig | ConditionGroup)[];
}

// 动作配置
export interface ActionConfig {
  type: ActionType;
  config?: Record<string, any>;
  order?: number;
}

// 自动化规则
export interface AutomationRule {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string;
  trigger: TriggerConfig;
  conditions: ConditionGroup;
  actions: ActionConfig[];
  status: RuleStatus;
  priority: number; // 优先级，数字越小越先执行
  executionCount: number;
  lastExecutedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 规则执行日志
export interface RuleExecutionLog {
  id: string;
  tenantId: string;
  ruleId: string;
  triggerType: TriggerType;
  triggerData?: Record<string, any>;
  status: ExecutionStatus;
  actions: ActionExecutionLog[];
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// 动作执行日志
export interface ActionExecutionLog {
  actionType: ActionType;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  result?: any;
  errorMessage?: string;
}

// 规则执行上下文
export interface RuleExecutionContext {
  rule: AutomationRule;
  triggerData: Record<string, any>;
  file?: any; // File对象
  variables: Record<string, any>;
  logs: ActionExecutionLog[];
}

// 规则模板
export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  trigger: TriggerConfig;
  conditions: ConditionGroup;
  actions: ActionConfig[];
  tags: string[];
}

// 内置规则模板
export const BUILTIN_RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "image-auto-archive",
    name: "图片自动归档到相册",
    description: "上传图片时自动移动到相册文件夹",
    category: "文件管理",
    icon: "image",
    trigger: { type: "file_uploaded" },
    conditions: {
      logic: "AND",
      conditions: [
        {
          type: "file_type",
          operator: "in",
          value: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        },
      ],
    },
    actions: [
      {
        type: "move_file",
        config: { targetFolder: "相册" },
        order: 1,
      },
    ],
    tags: ["图片", "归档", "自动整理"],
  },
  {
    id: "doc-auto-tag",
    name: "文档自动添加标签",
    description: "上传文档时自动添加文档标签",
    category: "标签管理",
    icon: "file-text",
    trigger: { type: "file_uploaded" },
    conditions: {
      logic: "AND",
      conditions: [
        {
          type: "file_type",
          operator: "in",
          value: [
            "application/pdf",
            "application/msword",
            "text/plain",
            "text/markdown",
          ],
        },
      ],
    },
    actions: [
      {
        type: "add_tags",
        config: { tags: ["文档", "待整理"] },
        order: 1,
      },
    ],
    tags: ["文档", "标签", "自动整理"],
  },
  {
    id: "large-file-alert",
    name: "大文件自动提醒",
    description: "上传超过100MB的文件时发送通知",
    category: "通知提醒",
    icon: "bell",
    trigger: { type: "file_uploaded" },
    conditions: {
      logic: "AND",
      conditions: [
        {
          type: "file_size",
          operator: "greater_than",
          value: 100 * 1024 * 1024, // 100MB
        },
      ],
    },
    actions: [
      {
        type: "send_notification",
        config: {
          title: "大文件上传提醒",
          content: "您上传了一个超过100MB的大文件",
          type: "storage",
        },
        order: 1,
      },
    ],
    tags: ["大文件", "通知", "提醒"],
  },
  {
    id: "auto-ai-summary",
    name: "文档自动生成摘要",
    description: "上传文档时自动生成AI摘要",
    category: "AI处理",
    icon: "sparkles",
    trigger: { type: "file_uploaded" },
    conditions: {
      logic: "AND",
      conditions: [
        {
          type: "file_type",
          operator: "in",
          value: [
            "application/pdf",
            "text/plain",
            "text/markdown",
            "application/msword",
          ],
        },
      ],
    },
    actions: [
      {
        type: "ai_summarize",
        config: { length: "medium" },
        order: 1,
      },
    ],
    tags: ["AI", "摘要", "文档", "自动处理"],
  },
  {
    id: "auto-ai-tags",
    name: "文件自动生成标签",
    description: "上传文件时自动生成AI标签",
    category: "AI处理",
    icon: "tag",
    trigger: { type: "file_uploaded" },
    conditions: {
      logic: "AND",
      conditions: [
        {
          type: "file_type",
          operator: "in",
          value: [
            "application/pdf",
            "text/plain",
            "text/markdown",
            "image/jpeg",
            "image/png",
          ],
        },
      ],
    },
    actions: [
      {
        type: "ai_generate_tags",
        config: { tagCount: 8 },
        order: 1,
      },
    ],
    tags: ["AI", "标签", "自动整理"],
  },
  {
    id: "weekly-cleanup",
    name: "每周清理回收站",
    description: "每周一自动清空30天前的回收站文件",
    category: "系统维护",
    icon: "trash-2",
    trigger: {
      type: "scheduled",
      config: { cron: "0 0 * * 1" }, // 每周一0点
    },
    conditions: {
      logic: "AND",
      conditions: [],
    },
    actions: [
      {
        type: "delete_file",
        config: {
          source: "trash",
          olderThanDays: 30,
        },
        order: 1,
      },
    ],
    tags: ["清理", "回收站", "定时任务"],
  },
];
