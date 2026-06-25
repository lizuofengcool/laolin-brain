/**
 * 工作流引擎（基础版）
 * 负责工作流的执行、节点调度和状态管理
 */

import {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowNode,
  WorkflowEdge,
  NodeExecutionLog,
  WorkflowExecutionContext,
  NodeStatus,
  InstanceStatus,
  ActionHandler,
} from "./types";

/**
 * 工作流引擎类
 */
export class WorkflowEngine {
  private actionHandlers: Map<string, ActionHandler> = new Map();

  constructor() {
    this.registerDefaultActionHandlers();
  }

  /**
   * 注册默认动作处理器
   */
  private registerDefaultActionHandlers() {
    this.actionHandlers.set("send_notification", this.handleSendNotification.bind(this));
    this.actionHandlers.set("call_webhook", this.handleCallWebhook.bind(this));
    this.actionHandlers.set("delay", this.handleDelay.bind(this));
    this.actionHandlers.set("ai_summarize", this.handleAiSummarize.bind(this));
    this.actionHandlers.set("ai_generate_tags", this.handleAiGenerateTags.bind(this));
    this.actionHandlers.set("move_file", this.handleMoveFile.bind(this));
    this.actionHandlers.set("http_request", this.handleHttpRequest.bind(this));
  }

  /**
   * 启动工作流
   */
  async startWorkflow(
    definition: WorkflowDefinition,
    initialVariables: Record<string, any> = {},
    startedBy: string
  ): Promise<WorkflowInstance> {
    // 初始化变量
    const variables = { ...initialVariables };
    for (const v of definition.variables) {
      if (!(v.name in variables) && v.defaultValue !== undefined) {
        variables[v.name] = v.defaultValue;
      }
    }

    // 创建实例
    const instance: WorkflowInstance = {
      id: `wf-instance-${Date.now()}`,
      tenantId: definition.tenantId,
      workflowId: definition.id,
      workflowVersion: definition.version,
      status: "running",
      variables,
      startedAt: new Date(),
      startedBy,
    };

    // 执行工作流
    await this.executeWorkflow(definition, instance);

    return instance;
  }

  /**
   * 执行工作流
   */
  private async executeWorkflow(
    definition: WorkflowDefinition,
    instance: WorkflowInstance
  ): Promise<void> {
    const context: WorkflowExecutionContext = {
      instance,
      definition,
      variables: { ...instance.variables },
      nodeLogs: [],
    };

    try {
      // 找到开始节点
      const startNode = definition.nodes.find((n) => n.type === "start");

      if (!startNode) {
        throw new Error("工作流没有开始节点");
      }

      // 从开始节点执行
      let currentNodeId = startNode.id;

      while (currentNodeId) {
        const node = definition.nodes.find((n) => n.id === currentNodeId);

        if (!node) {
          throw new Error(`节点不存在: ${currentNodeId}`);
        }

        // 执行节点
        const result = await this.executeNode(node, context);

        // 记录日志
        context.nodeLogs.push(result.log);

        // 更新变量
        if (result.output) {
          Object.assign(context.variables, result.output);
        }

        // 如果节点失败，工作流失败
        if (result.log.status === "failed") {
          instance.status = "failed";
          instance.errorMessage = result.log.errorMessage;
          break;
        }

        // 如果是结束节点，工作流完成
        if (node.type === "end") {
          instance.status = "completed";
          break;
        }

        // 找到下一个节点
        const nextNodeId = this.getNextNodeId(node, definition.edges, context);

        if (!nextNodeId) {
          // 没有下一个节点，工作流完成
          instance.status = "completed";
          break;
        }

        currentNodeId = nextNodeId;
      }

      instance.completedAt = new Date();
      instance.variables = context.variables;
    } catch (error: any) {
      instance.status = "failed";
      instance.errorMessage = error.message;
      instance.completedAt = new Date();
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: WorkflowNode,
    context: WorkflowExecutionContext
  ): Promise<{
    log: NodeExecutionLog;
    output?: Record<string, any>;
  }> {
    const log: NodeExecutionLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      instanceId: context.instance.id,
      nodeId: node.id,
      nodeType: node.type,
      status: "running",
      startedAt: new Date(),
    };

    try {
      let output: Record<string, any> | undefined;

      switch (node.type) {
        case "start":
          // 开始节点，直接通过
          log.status = "completed";
          break;

        case "end":
          // 结束节点，直接通过
          log.status = "completed";
          break;

        case "condition":
          // 条件节点，不在这里处理（在getNextNodeId中处理）
          log.status = "completed";
          break;

        case "action":
          // 动作节点
          output = await this.executeActionNode(node, context);
          log.status = "completed";
          log.output = output;
          break;

        case "wait":
          // 等待节点（简化版，直接跳过）
          log.status = "completed";
          break;

        case "parallel":
          // 并行节点（简化版，顺序执行）
          log.status = "completed";
          break;

        case "subflow":
          // 子流程节点（简化版，直接通过）
          log.status = "completed";
          break;

        default:
          throw new Error(`未知的节点类型: ${node.type}`);
      }

      log.completedAt = new Date();
      log.duration = log.completedAt.getTime() - log.startedAt.getTime();

      return { log, output };
    } catch (error: any) {
      log.status = "failed";
      log.errorMessage = error.message;
      log.completedAt = new Date();
      log.duration = log.completedAt.getTime() - log.startedAt.getTime();

      return { log };
    }
  }

  /**
   * 执行动作节点
   */
  private async executeActionNode(
    node: WorkflowNode,
    context: WorkflowExecutionContext
  ): Promise<Record<string, any>> {
    const actionType = node.config?.actionType;

    if (!actionType) {
      throw new Error("动作节点缺少actionType配置");
    }

    const handler = this.actionHandlers.get(actionType);

    if (!handler) {
      throw new Error(`未知的动作类型: ${actionType}`);
    }

    return await handler(context, node.config || {});
  }

  /**
   * 获取下一个节点ID
   */
  private getNextNodeId(
    currentNode: WorkflowNode,
    edges: WorkflowEdge[],
    context: WorkflowExecutionContext
  ): string | undefined {
    // 找到所有从当前节点出发的边
    const outgoingEdges = edges.filter((e) => e.source === currentNode.id);

    if (outgoingEdges.length === 0) {
      return undefined;
    }

    // 如果是条件节点，根据条件选择边
    if (currentNode.type === "condition") {
      for (const edge of outgoingEdges) {
        if (edge.condition) {
          const conditionMet = this.evaluateCondition(edge.condition, context);
          if (conditionMet) {
            return edge.target;
          }
        }
      }
      // 如果没有条件匹配，返回第一条边的目标
      return outgoingEdges[0]?.target;
    }

    // 普通节点，返回第一条边的目标
    return outgoingEdges[0]?.target;
  }

  /**
   * 评估条件表达式（简化版）
   */
  private evaluateCondition(
    condition: string,
    context: WorkflowExecutionContext
  ): boolean {
    try {
      // 简单的变量替换
      let expr = condition;
      for (const [key, value] of Object.entries(context.variables)) {
        expr = expr.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          JSON.stringify(value)
        );
      }

      // 安全评估（简化版，实际应该使用更安全的方式）
      // 这里只支持简单的比较表达式
      const match = expr.match(/(.+)\s*(==|!=|>|<|>=|<=)\s*(.+)/);

      if (match) {
        const left = this.parseValue(match[1].trim());
        const operator = match[2];
        const right = this.parseValue(match[3].trim());

        switch (operator) {
          case "==":
            return left == right;
          case "!=":
            return left != right;
          case ">":
            return left > right;
          case "<":
            return left < right;
          case ">=":
            return left >= right;
          case "<=":
            return left <= right;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 解析值
   */
  private parseValue(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      // 去掉引号
      if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
      }
      return value;
    }
  }

  // ==================== 动作处理器 ====================

  private async handleSendNotification(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("发送通知:", config.title || "工作流通知");
    return { notificationSent: true };
  }

  private async handleCallWebhook(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("调用Webhook:", config.url);
    return { webhookCalled: true };
  }

  private async handleDelay(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    const delayMs = config.duration || 1000;
    console.log("等待:", delayMs, "毫秒");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { delayed: true, duration: delayMs };
  }

  private async handleAiSummarize(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("AI生成摘要");
    return { summarized: true };
  }

  private async handleAiGenerateTags(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("AI生成标签");
    return { tagsGenerated: true };
  }

  private async handleMoveFile(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("移动文件到:", config.targetFolder);
    return { moved: true };
  }

  private async handleHttpRequest(
    context: WorkflowExecutionContext,
    config: any
  ): Promise<Record<string, any>> {
    console.log("发送HTTP请求:", config.method, config.url);
    return { requestSent: true };
  }

  /**
   * 注册自定义动作处理器
   */
  registerActionHandler(actionType: string, handler: ActionHandler) {
    this.actionHandlers.set(actionType, handler);
  }

  /**
   * 获取所有支持的动作类型
   */
  getSupportedActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys());
  }

  /**
   * 验证工作流定义
   */
  validateWorkflow(definition: WorkflowDefinition): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查是否有开始节点
    const startNodes = definition.nodes.filter((n) => n.type === "start");
    if (startNodes.length === 0) {
      errors.push("工作流缺少开始节点");
    } else if (startNodes.length > 1) {
      errors.push("工作流有多个开始节点");
    }

    // 检查是否有结束节点
    const endNodes = definition.nodes.filter((n) => n.type === "end");
    if (endNodes.length === 0) {
      errors.push("工作流缺少结束节点");
    }

    // 检查节点ID唯一性
    const nodeIds = new Set<string>();
    for (const node of definition.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`重复的节点ID: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // 检查边的有效性
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`边的源节点不存在: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`边的目标节点不存在: ${edge.target}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// 导出单例
export const workflowEngine = new WorkflowEngine();
