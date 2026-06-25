/**
 * 工作流引擎类型定义
 */

// 节点类型
export type NodeType =
  | "start" // 开始节点
  | "end" // 结束节点
  | "condition" // 条件节点
  | "action" // 动作节点
  | "wait" // 等待节点
  | "parallel" // 并行节点
  | "subflow"; // 子流程节点

// 节点状态
export type NodeStatus =
  | "pending" // 待执行
  | "running" // 执行中
  | "completed" // 已完成
  | "failed" // 失败
  | "skipped"; // 跳过

// 工作流状态
export type WorkflowStatus =
  | "draft" // 草稿
  | "published" // 已发布
  | "archived"; // 已归档

// 实例状态
export type InstanceStatus =
  | "running" // 运行中
  | "completed" // 已完成
  | "failed" // 失败
  | "cancelled" // 已取消
  | "paused"; // 已暂停

// 工作流节点
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  config?: Record<string, any>;
  position?: {
    x: number;
    y: number;
  };
}

// 工作流连线
export interface WorkflowEdge {
  id: string;
  source: string; // 源节点ID
  target: string; // 目标节点ID
  label?: string;
  condition?: string; // 条件表达式
}

// 工作流变量
export interface WorkflowVariable {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  defaultValue?: any;
  description?: string;
}

// 工作流定义
export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  version: number;
  status: WorkflowStatus;
  triggerType?: string; // 触发类型
  triggerConfig?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

// 工作流实例
export interface WorkflowInstance {
  id: string;
  tenantId: string;
  workflowId: string;
  workflowVersion: number;
  status: InstanceStatus;
  variables: Record<string, any>;
  currentNodeId?: string;
  startedAt: Date;
  completedAt?: Date;
  startedBy: string;
  errorMessage?: string;
}

// 节点执行日志
export interface NodeExecutionLog {
  id: string;
  instanceId: string;
  nodeId: string;
  nodeType: NodeType;
  status: NodeStatus;
  input?: Record<string, any>;
  output?: Record<string, any>;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // 毫秒
}

// 工作流执行上下文
export interface WorkflowExecutionContext {
  instance: WorkflowInstance;
  definition: WorkflowDefinition;
  variables: Record<string, any>;
  nodeLogs: NodeExecutionLog[];
  currentNodeId?: string;
}

// 动作处理器
export type ActionHandler = (
  context: WorkflowExecutionContext,
  nodeConfig: Record<string, any>
) => Promise<Record<string, any>>;

// 条件处理器
export type ConditionHandler = (
  context: WorkflowExecutionContext,
  condition: string
) => Promise<boolean>;

// 内置动作类型
export const BUILTIN_ACTIONS = [
  {
    type: "create_file",
    name: "创建文件",
    description: "创建新文件",
    category: "文件操作",
  },
  {
    type: "move_file",
    name: "移动文件",
    description: "移动文件到指定文件夹",
    category: "文件操作",
  },
  {
    type: "send_notification",
    name: "发送通知",
    description: "发送系统通知",
    category: "通知",
  },
  {
    type: "call_webhook",
    name: "调用Webhook",
    description: "调用外部Webhook",
    category: "集成",
  },
  {
    type: "ai_summarize",
    name: "AI摘要",
    description: "生成文档摘要",
    category: "AI",
  },
  {
    type: "ai_generate_tags",
    name: "AI标签",
    description: "生成文件标签",
    category: "AI",
  },
  {
    type: "delay",
    name: "延迟",
    description: "等待指定时间",
    category: "流程控制",
  },
  {
    type: "http_request",
    name: "HTTP请求",
    description: "发送HTTP请求",
    category: "集成",
  },
];

// 内置工作流模板
export const BUILTIN_WORKFLOW_TEMPLATES = [
  {
    id: "file-processing",
    name: "文件处理流程",
    description: "上传文件后自动进行AI处理",
    category: "文件处理",
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "summarize", type: "action", name: "生成摘要", config: { actionType: "ai_summarize" } },
      { id: "tags", type: "action", name: "生成标签", config: { actionType: "ai_generate_tags" } },
      { id: "notify", type: "action", name: "发送通知", config: { actionType: "send_notification" } },
      { id: "end", type: "end", name: "结束" },
    ],
    edges: [
      { id: "e1", source: "start", target: "summarize" },
      { id: "e2", source: "summarize", target: "tags" },
      { id: "e3", source: "tags", target: "notify" },
      { id: "e4", source: "notify", target: "end" },
    ],
  },
  {
    id: "approval",
    name: "审批流程",
    description: "文件上传后需要审批才能发布",
    category: "审批",
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "condition", type: "condition", name: "是否需要审批", config: { expression: "{{fileSize}} > 10000000" } },
      { id: "approve", type: "wait", name: "等待审批" },
      { id: "publish", type: "action", name: "发布文件" },
      { id: "end", type: "end", name: "结束" },
    ],
    edges: [
      { id: "e1", source: "start", target: "condition" },
      { id: "e2", source: "condition", target: "approve", label: "是" },
      { id: "e3", source: "condition", target: "publish", label: "否" },
      { id: "e4", source: "approve", target: "publish" },
      { id: "e5", source: "publish", target: "end" },
    ],
  },
];
