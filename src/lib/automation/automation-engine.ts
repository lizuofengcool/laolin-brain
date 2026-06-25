/**
 * 自动化规则引擎
 * 负责规则的执行、条件判断和动作执行
 */

import {
  AutomationRule,
  ConditionConfig,
  ConditionGroup,
  ActionConfig,
  RuleExecutionContext,
  ActionExecutionLog,
  ExecutionStatus,
  TriggerType,
} from "./types";

/**
 * 自动化规则引擎类
 */
export class AutomationEngine {
  private actionHandlers: Map<string, (context: RuleExecutionContext, config: any) => Promise<any>> =
    new Map();

  constructor() {
    this.registerDefaultActionHandlers();
  }

  /**
   * 注册默认动作处理器
   */
  private registerDefaultActionHandlers() {
    // 文件操作
    this.actionHandlers.set("move_file", this.handleMoveFile.bind(this));
    this.actionHandlers.set("copy_file", this.handleCopyFile.bind(this));
    this.actionHandlers.set("delete_file", this.handleDeleteFile.bind(this));
    this.actionHandlers.set("rename_file", this.handleRenameFile.bind(this));

    // 标签操作
    this.actionHandlers.set("add_tags", this.handleAddTags.bind(this));
    this.actionHandlers.set("remove_tags", this.handleRemoveTags.bind(this));

    // 收藏操作
    this.actionHandlers.set("set_favorite", this.handleSetFavorite.bind(this));
    this.actionHandlers.set("unset_favorite", this.handleUnsetFavorite.bind(this));

    // 通知操作
    this.actionHandlers.set("send_notification", this.handleSendNotification.bind(this));
    this.actionHandlers.set("call_webhook", this.handleCallWebhook.bind(this));

    // AI操作
    this.actionHandlers.set("ai_summarize", this.handleAiSummarize.bind(this));
    this.actionHandlers.set("ai_ocr", this.handleAiOcr.bind(this));
    this.actionHandlers.set("ai_generate_tags", this.handleAiGenerateTags.bind(this));

    // 文件处理
    this.actionHandlers.set("compress_file", this.handleCompressFile.bind(this));
    this.actionHandlers.set("convert_format", this.handleConvertFormat.bind(this));
  }

  /**
   * 执行规则
   */
  async executeRule(
    rule: AutomationRule,
    triggerData: Record<string, any>
  ): Promise<{
    success: boolean;
    logs: ActionExecutionLog[];
    error?: string;
  }> {
    const context: RuleExecutionContext = {
      rule,
      triggerData,
      file: triggerData.file,
      variables: { ...triggerData },
      logs: [],
    };

    try {
      // 检查条件
      const conditionMet = this.evaluateConditionGroup(rule.conditions, context);

      if (!conditionMet) {
        return {
          success: true,
          logs: [],
        };
      }

      // 按顺序执行动作
      const sortedActions = [...rule.actions].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      for (const action of sortedActions) {
        const result = await this.executeAction(action, context);
        context.logs.push(result);

        if (result.status === "failed") {
          // 继续执行其他动作，但记录错误
          console.error(`动作执行失败: ${action.type}`, result.errorMessage);
        }
      }

      return {
        success: true,
        logs: context.logs,
      };
    } catch (error: any) {
      return {
        success: false,
        logs: context.logs,
        error: error.message,
      };
    }
  }

  /**
   * 执行单个动作
   */
  async executeAction(
    action: ActionConfig,
    context: RuleExecutionContext
  ): Promise<ActionExecutionLog> {
    const log: ActionExecutionLog = {
      actionType: action.type,
      status: "running",
      startedAt: new Date(),
    };

    try {
      const handler = this.actionHandlers.get(action.type);

      if (!handler) {
        throw new Error(`未知的动作类型: ${action.type}`);
      }

      const result = await handler(context, action.config || {});

      log.status = "success";
      log.result = result;
      log.completedAt = new Date();

      return log;
    } catch (error: any) {
      log.status = "failed";
      log.errorMessage = error.message;
      log.completedAt = new Date();

      return log;
    }
  }

  /**
   * 评估条件组
   */
  evaluateConditionGroup(
    group: ConditionGroup,
    context: RuleExecutionContext
  ): boolean {
    if (!group.conditions || group.conditions.length === 0) {
      return true; // 空条件组默认通过
    }

    const results = group.conditions.map((condition) => {
      if ("logic" in condition) {
        // 嵌套条件组
        return this.evaluateConditionGroup(condition as ConditionGroup, context);
      } else {
        // 单个条件
        return this.evaluateSingleCondition(condition as ConditionConfig, context);
      }
    });

    if (group.logic === "AND") {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  /**
   * 评估单个条件
   */
  evaluateSingleCondition(
    condition: ConditionConfig,
    context: RuleExecutionContext
  ): boolean {
    const file = context.file;
    const actualValue = this.getFieldValue(condition.type, condition.field, file, context);

    return this.compareValues(
      actualValue,
      condition.operator,
      condition.value
    );
  }

  /**
   * 获取字段值
   */
  private getFieldValue(
    conditionType: string,
    field: string | undefined,
    file: any,
    context: RuleExecutionContext
  ): any {
    switch (conditionType) {
      case "file_type":
        return file?.fileType || file?.mimeType || "";
      case "file_size":
        return file?.fileSize || 0;
      case "file_name":
        return file?.fileName || "";
      case "has_tag":
        return file?.tags || [];
      case "in_folder":
        return file?.folderId || "";
      case "time_range":
        return new Date();
      case "custom_expression":
        return this.evaluateExpression(field || "", context);
      default:
        return undefined;
    }
  }

  /**
   * 比较值
   */
  private compareValues(
    actual: any,
    operator: string,
    expected: any
  ): boolean {
    switch (operator) {
      case "equals":
        return actual === expected;
      case "not_equals":
        return actual !== expected;
      case "contains":
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return String(actual).includes(String(expected));
      case "not_contains":
        if (Array.isArray(actual)) {
          return !actual.includes(expected);
        }
        return !String(actual).includes(String(expected));
      case "starts_with":
        return String(actual).startsWith(String(expected));
      case "ends_with":
        return String(actual).endsWith(String(expected));
      case "greater_than":
        return Number(actual) > Number(expected);
      case "less_than":
        return Number(actual) < Number(expected);
      case "greater_equal":
        return Number(actual) >= Number(expected);
      case "less_equal":
        return Number(actual) <= Number(expected);
      case "in":
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      case "not_in":
        if (Array.isArray(expected)) {
          return !expected.includes(actual);
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * 评估自定义表达式（简化版）
   */
  private evaluateExpression(
    expression: string,
    context: RuleExecutionContext
  ): any {
    try {
      // 简单的变量替换
      let result = expression;
      for (const [key, value] of Object.entries(context.variables)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
      return result;
    } catch {
      return "";
    }
  }

  // ==================== 动作处理器 ====================

  private async handleMoveFile(context: RuleExecutionContext, config: any) {
    // 实际实现需要调用文件API
    console.log("移动文件:", context.file?.fileName, "到:", config.targetFolder);
    return { moved: true, targetFolder: config.targetFolder };
  }

  private async handleCopyFile(context: RuleExecutionContext, config: any) {
    console.log("复制文件:", context.file?.fileName);
    return { copied: true };
  }

  private async handleDeleteFile(context: RuleExecutionContext, config: any) {
    console.log("删除文件:", context.file?.fileName);
    return { deleted: true };
  }

  private async handleRenameFile(context: RuleExecutionContext, config: any) {
    console.log("重命名文件:", context.file?.fileName, "为:", config.newName);
    return { renamed: true, newName: config.newName };
  }

  private async handleAddTags(context: RuleExecutionContext, config: any) {
    console.log("添加标签:", config.tags, "到文件:", context.file?.fileName);
    return { tagsAdded: config.tags };
  }

  private async handleRemoveTags(context: RuleExecutionContext, config: any) {
    console.log("移除标签:", config.tags, "从文件:", context.file?.fileName);
    return { tagsRemoved: config.tags };
  }

  private async handleSetFavorite(context: RuleExecutionContext, config: any) {
    console.log("设置收藏:", context.file?.fileName);
    return { favorited: true };
  }

  private async handleUnsetFavorite(context: RuleExecutionContext, config: any) {
    console.log("取消收藏:", context.file?.fileName);
    return { unfavorited: true };
  }

  private async handleSendNotification(context: RuleExecutionContext, config: any) {
    console.log("发送通知:", config.title, "-", config.content);
    return { notificationSent: true };
  }

  private async handleCallWebhook(context: RuleExecutionContext, config: any) {
    console.log("调用Webhook:", config.url);
    return { webhookCalled: true, url: config.url };
  }

  private async handleAiSummarize(context: RuleExecutionContext, config: any) {
    console.log("AI生成摘要:", context.file?.fileName);
    return { summarized: true, length: config.length };
  }

  private async handleAiOcr(context: RuleExecutionContext, config: any) {
    console.log("AI OCR识别:", context.file?.fileName);
    return { ocrCompleted: true };
  }

  private async handleAiGenerateTags(context: RuleExecutionContext, config: any) {
    console.log("AI生成标签:", context.file?.fileName);
    return { tagsGenerated: true, count: config.tagCount };
  }

  private async handleCompressFile(context: RuleExecutionContext, config: any) {
    console.log("压缩文件:", context.file?.fileName);
    return { compressed: true };
  }

  private async handleConvertFormat(context: RuleExecutionContext, config: any) {
    console.log("转换格式:", context.file?.fileName, "为:", config.targetFormat);
    return { converted: true, targetFormat: config.targetFormat };
  }

  /**
   * 注册自定义动作处理器
   */
  registerActionHandler(
    actionType: string,
    handler: (context: RuleExecutionContext, config: any) => Promise<any>
  ) {
    this.actionHandlers.set(actionType, handler);
  }

  /**
   * 获取所有支持的动作类型
   */
  getSupportedActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys());
  }

  /**
   * 触发事件，执行所有匹配的规则
   */
  async triggerEvent(
    triggerType: TriggerType,
    triggerData: Record<string, any>,
    rules: AutomationRule[]
  ): Promise<{
    executedRules: number;
    successfulActions: number;
    failedActions: number;
  }> {
    // 筛选出该触发器类型且启用的规则
    const matchingRules = rules.filter(
      (r) => r.trigger.type === triggerType && r.status === "enabled"
    );

    // 按优先级排序
    matchingRules.sort((a, b) => a.priority - b.priority);

    let successfulActions = 0;
    let failedActions = 0;

    for (const rule of matchingRules) {
      const result = await this.executeRule(rule, triggerData);

      if (result.success) {
        successfulActions += result.logs.filter((l) => l.status === "success").length;
        failedActions += result.logs.filter((l) => l.status === "failed").length;
      } else {
        failedActions++;
      }
    }

    return {
      executedRules: matchingRules.length,
      successfulActions,
      failedActions,
    };
  }
}

// 导出单例
export const automationEngine = new AutomationEngine();
