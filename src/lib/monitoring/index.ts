/**
 * 监控系统
 * 收集系统指标、业务指标，支持告警
 */

import { emailService } from "@/lib/email";

// 指标类型
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

// 指标标签
export interface MetricLabels {
  [key: string]: string | number | boolean;
}

// 指标数据点
export interface MetricPoint {
  value: number;
  timestamp: number;
  labels: MetricLabels;
}

// 指标定义
export interface Metric {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels: string[];
  data: MetricPoint[];
}

// 告警级别
export type AlertLevel = "info" | "warning" | "error" | "critical";

// 告警状态
export type AlertStatus = "pending" | "firing" | "resolved" | "silenced";

// 告警规则
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: string; // e.g., "> 100", "< 10", "== 0"
  threshold: number;
  level: AlertLevel;
  duration: number; // 持续时间（秒）
  labels: MetricLabels;
  enabled: boolean;
  silencedUntil?: number;
  notificationChannels: string[];
}

// 告警事件
export interface AlertEvent {
  id: string;
  ruleId: string;
  name: string;
  level: AlertLevel;
  status: AlertStatus;
  message: string;
  value: number;
  threshold: number;
  labels: MetricLabels;
  startedAt: number;
  resolvedAt?: number;
  duration?: number;
}

// 通知渠道
export type NotificationChannelType = "email" | "webhook" | "wecom" | "dingtalk" | "feishu";

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * 指标收集器
 */
export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();
  private maxDataPoints = 1000;

  /**
   * 注册指标
   */
  registerMetric(
    name: string,
    type: MetricType,
    description: string,
    labels: string[] = [],
    unit?: string
  ): void {
    if (this.metrics.has(name)) {
      return;
    }

    this.metrics.set(name, {
      name,
      type,
      description,
      unit,
      labels,
      data: [],
    });
  }

  /**
   * 记录指标值
   */
  record(name: string, value: number, labels: MetricLabels = {}): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Metric not found: ${name}`);
      return;
    }

    const point: MetricPoint = {
      value,
      timestamp: Date.now(),
      labels,
    };

    metric.data.push(point);

    // 限制数据点数量
    if (metric.data.length > this.maxDataPoints) {
      metric.data = metric.data.slice(-this.maxDataPoints);
    }
  }

  /**
   * 增加计数器
   */
  increment(name: string, labels: MetricLabels = {}, value: number = 1): void {
    this.record(name, value, labels);
  }

  /**
   * 获取指标
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * 获取指标值（最新）
   */
  getValue(name: string, labels?: MetricLabels): number | null {
    const metric = this.metrics.get(name);
    if (!metric || metric.data.length === 0) {
      return null;
    }

    if (labels) {
      const filtered = metric.data.filter((point) =>
        Object.entries(labels).every(
          ([key, value]) => point.labels[key] === value
        )
      );
      if (filtered.length === 0) return null;
      return filtered[filtered.length - 1].value;
    }

    return metric.data[metric.data.length - 1].value;
  }

  /**
   * 计算指标统计
   */
  getStats(name: string, labels?: MetricLabels, duration?: number): {
    min: number;
    max: number;
    avg: number;
    sum: number;
    count: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const metric = this.metrics.get(name);
    if (!metric || metric.data.length === 0) {
      return null;
    }

    let data = metric.data;

    // 按标签过滤
    if (labels) {
      data = data.filter((point) =>
        Object.entries(labels).every(
          ([key, value]) => point.labels[key] === value
        )
      );
    }

    // 按时间过滤
    if (duration) {
      const since = Date.now() - duration * 1000;
      data = data.filter((point) => point.timestamp >= since);
    }

    if (data.length === 0) return null;

    const values = data.map((p) => p.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;

    return {
      min: values[0],
      max: values[count - 1],
      avg: sum / count,
      sum,
      count,
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)],
    };
  }

  /**
   * 清理旧数据
   */
  cleanup(olderThan: number): void {
    const cutoff = Date.now() - olderThan * 1000;

    for (const metric of this.metrics.values()) {
      metric.data = metric.data.filter((point) => point.timestamp >= cutoff);
    }
  }

  /**
   * 重置指标
   */
  reset(name?: string): void {
    if (name) {
      const metric = this.metrics.get(name);
      if (metric) {
        metric.data = [];
      }
    } else {
      for (const metric of this.metrics.values()) {
        metric.data = [];
      }
    }
  }
}

/**
 * 告警引擎
 */
export class AlertEngine {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Map<string, AlertEvent> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();
  private metricsCollector: MetricsCollector;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector;
  }

  /**
   * 注册告警规则
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 注册通知渠道
   */
  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
  }

  /**
   * 评估告警规则
   */
  evaluateRules(): AlertEvent[] {
    const newAlerts: AlertEvent[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const value = this.metricsCollector.getValue(rule.metric, rule.labels);
      if (value === null) continue;

      const isFiring = this.evaluateCondition(value, rule.condition, rule.threshold);
      const existingAlert = this.alerts.get(rule.id);

      if (isFiring) {
        if (!existingAlert || existingAlert.status === "resolved") {
          // 新告警
          const alert: AlertEvent = {
            id: `${rule.id}-${Date.now()}`,
            ruleId: rule.id,
            name: rule.name,
            level: rule.level,
            status: "pending",
            message: `${rule.name}: 当前值 ${value}，阈值 ${rule.condition} ${rule.threshold}`,
            value,
            threshold: rule.threshold,
            labels: rule.labels,
            startedAt: Date.now(),
          };

          this.alerts.set(rule.id, alert);
          newAlerts.push(alert);

          // 如果持续时间为0，立即触发
          if (rule.duration === 0) {
            this.triggerAlert(alert);
          }
        } else if (existingAlert.status === "pending") {
          // 检查是否达到持续时间
          const duration = (Date.now() - existingAlert.startedAt) / 1000;
          if (duration >= rule.duration) {
            this.triggerAlert(existingAlert);
          }
        }
      } else {
        if (existingAlert && existingAlert.status === "firing") {
          // 告警恢复
          existingAlert.status = "resolved";
          existingAlert.resolvedAt = Date.now();
          existingAlert.duration = (Date.now() - existingAlert.startedAt) / 1000;
          this.sendNotification(existingAlert, "resolved");
        } else if (existingAlert && existingAlert.status === "pending") {
          // 未达到持续时间就恢复了，删除
          this.alerts.delete(rule.id);
        }
      }
    }

    return newAlerts;
  }

  /**
   * 评估条件
   */
  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition.trim()) {
      case ">":
        return value > threshold;
      case ">=":
        return value >= threshold;
      case "<":
        return value < threshold;
      case "<=":
        return value <= threshold;
      case "==":
      case "=":
        return value === threshold;
      case "!=":
        return value !== threshold;
      default:
        console.warn(`Unknown condition: ${condition}`);
        return false;
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(alert: AlertEvent): void {
    alert.status = "firing";
    this.sendNotification(alert, "firing");
  }

  /**
   * 发送通知
   */
  private async sendNotification(alert: AlertEvent, status: "firing" | "resolved"): Promise<void> {
    const rule = this.rules.get(alert.ruleId);
    if (!rule) return;

    for (const channelId of rule.notificationChannels) {
      const channel = this.channels.get(channelId);
      if (!channel || !channel.enabled) continue;

      try {
        await this.sendToChannel(channel, alert, status);
      } catch (error) {
        console.error(`Failed to send alert to channel ${channelId}:`, error);
      }
    }
  }

  /**
   * 发送到指定渠道
   *
   * webhook / wecom / dingtalk / feishu 走 HTTP POST 投递（url 取自 channel.config.url）；
   * email 渠道经 sendEmailAlert 调用邮件服务（src/lib/email）投递，不经 HTTP 路径。
   */
  private async sendToChannel(
    channel: NotificationChannel,
    alert: AlertEvent,
    status: "firing" | "resolved"
  ): Promise<void> {
    console.log(`[Alert] Sending ${status} alert to ${channel.type}: ${alert.name}`);

    // email 渠道走邮件服务（src/lib/email），不经 HTTP POST 路径
    if (channel.type === "email") {
      await this.sendEmailAlert(channel, alert, status);
      return;
    }

    const payload = this.buildNotificationPayload(channel, alert, status);
    if (!payload) {
      // 未知类型：不触达 fetch
      return;
    }

    const url = channel.config?.url;
    if (!url || typeof url !== "string") {
      console.warn(
        `[Alert] channel ${channel.id} (${channel.type}) 缺 config.url，跳过投递`
      );
      return;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(payload.headers ?? {}),
        },
        body: JSON.stringify(payload.body),
      });
      if (!res.ok) {
        console.error(
          `[Alert] ${channel.type} 渠道 ${channel.id} 投递失败：HTTP ${res.status} ${res.statusText}`
        );
      }
    } catch (err) {
      console.error(
        `[Alert] ${channel.type} 渠道 ${channel.id} 投递异常：`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * 构造各渠道通知 payload。返回 null 表示该渠道类型不经 HTTP 投递
   *（email 由 sendEmailAlert 处理；未知类型）。
   */
  private buildNotificationPayload(
    channel: NotificationChannel,
    alert: AlertEvent,
    status: "firing" | "resolved"
  ): { body: unknown; headers?: Record<string, string> } | null {
    const statusText = status === "firing" ? "触发" : "恢复";
    const title = `[${alert.level.toUpperCase()}] ${alert.name} ${statusText}`;
    const detail = `${alert.message}（当前值 ${alert.value}，阈值 ${alert.threshold}）`;
    const ts = new Date(alert.startedAt).toISOString();

    switch (channel.type) {
      case "webhook":
        // 通用 webhook：透传结构化 alert 字段 + 自定义 headers（如鉴权头）
        return {
          body: {
            alert: alert.name,
            status,
            level: alert.level,
            message: alert.message,
            value: alert.value,
            threshold: alert.threshold,
            ruleId: alert.ruleId,
            alertId: alert.id,
            timestamp: ts,
          },
          headers: channel.config?.headers,
        };
      case "wecom":
        // 企业微信群机器人：markdown 消息
        return {
          body: {
            msgtype: "markdown",
            markdown: { content: `${title}\n${detail}` },
          },
        };
      case "dingtalk":
        // 钉钉群机器人：markdown 消息（title + text）
        return {
          body: {
            msgtype: "markdown",
            markdown: { title: alert.name, text: `${title}\n${detail}` },
          },
        };
      case "feishu":
        // 飞书群机器人：text 消息
        return {
          body: {
            msg_type: "text",
            content: { text: `${title}\n${detail}` },
          },
        };
      case "email":
        // email 经 sendToChannel 上层路由到 sendEmailAlert（邮件服务），不经 HTTP 路径
        return null;
      default:
        return null;
    }
  }

  /**
   * 通过邮件服务投递告警通知。
   *
   * 收件人取自 `channel.config.to`（string）；缺失或非 string 时 console.warn 跳过，
   * 不抛错（保持 evaluateRules 的 fire-and-forget 语义）。投递异常 console.error 记录，
   * 不外抛（不中断主流程）。模板 id 为 alert-notification（src/lib/email 中注册）。
   * emailService.sendEmail 为队列式异步投递，未配置 SMTP 时内部 console.warn 后清空
   * 队列跳过，调用方无感。
   */
  private async sendEmailAlert(
    channel: NotificationChannel,
    alert: AlertEvent,
    status: "firing" | "resolved"
  ): Promise<void> {
    const to = channel.config?.to;
    if (!to || typeof to !== "string") {
      console.warn(
        `[Alert] email 渠道 ${channel.id} 缺 config.to，跳过投递`
      );
      return;
    }

    const statusText = status === "firing" ? "触发" : "恢复";
    const variables: Record<string, string> = {
      alertName: alert.name,
      level: alert.level,
      statusText,
      message: alert.message,
      value: String(alert.value),
      threshold: String(alert.threshold),
      ruleId: alert.ruleId,
      timestamp: new Date(alert.startedAt).toISOString(),
    };

    try {
      await emailService.sendEmail(to, "alert-notification", variables, "", "");
    } catch (err) {
      console.error(
        `[Alert] email 渠道 ${channel.id} 投递异常：`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * 启动告警检查
   */
  start(intervalMs: number = 60000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.evaluateRules();
    }, intervalMs);
  }

  /**
   * 停止告警检查
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.alerts.values()).filter(
      (alert) => alert.status === "firing" || alert.status === "pending"
    );
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit: number = 100): AlertEvent[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  /**
   * 静默告警
   */
  silenceRule(ruleId: string, duration: number): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.silencedUntil = Date.now() + duration * 1000;
    }
  }
}

// 导出默认实例
export const metricsCollector = new MetricsCollector();
export const alertEngine = new AlertEngine(metricsCollector);

// 注册默认指标
export function registerDefaultMetrics(): void {
  // 系统指标
  metricsCollector.registerMetric("system_cpu_usage", "gauge", "CPU使用率", [], "%");
  metricsCollector.registerMetric("system_memory_usage", "gauge", "内存使用率", [], "%");
  metricsCollector.registerMetric("system_disk_usage", "gauge", "磁盘使用率", [], "%");

  // API指标
  metricsCollector.registerMetric("http_requests_total", "counter", "HTTP请求总数", ["method", "route", "status"]);
  metricsCollector.registerMetric("http_request_duration_seconds", "histogram", "HTTP请求耗时", ["method", "route"], "s");
  metricsCollector.registerMetric("http_errors_total", "counter", "HTTP错误总数", ["method", "route", "status"]);

  // 业务指标
  metricsCollector.registerMetric("users_total", "gauge", "用户总数", ["tenant"]);
  metricsCollector.registerMetric("files_total", "gauge", "文件总数", ["tenant"]);
  metricsCollector.registerMetric("storage_usage_bytes", "gauge", "存储使用量", ["tenant"], "bytes");
  metricsCollector.registerMetric("api_calls_total", "counter", "API调用总数", ["tenant", "endpoint"]);

  // 数据库指标
  metricsCollector.registerMetric("db_query_duration_seconds", "histogram", "数据库查询耗时", ["operation"], "s");
  metricsCollector.registerMetric("db_connections_active", "gauge", "活跃数据库连接数");
}

// 注册默认告警规则
export function registerDefaultAlertRules(): void {
  // CPU使用率告警
  alertEngine.registerRule({
    id: "high_cpu_usage",
    name: "CPU使用率过高",
    description: "CPU使用率超过阈值",
    metric: "system_cpu_usage",
    condition: ">",
    threshold: 80,
    level: "warning",
    duration: 300, // 5分钟
    labels: {},
    enabled: true,
    notificationChannels: ["default"],
  });

  // 内存使用率告警
  alertEngine.registerRule({
    id: "high_memory_usage",
    name: "内存使用率过高",
    description: "内存使用率超过阈值",
    metric: "system_memory_usage",
    condition: ">",
    threshold: 85,
    level: "warning",
    duration: 300,
    labels: {},
    enabled: true,
    notificationChannels: ["default"],
  });

  // 磁盘使用率告警
  alertEngine.registerRule({
    id: "high_disk_usage",
    name: "磁盘使用率过高",
    description: "磁盘使用率超过阈值",
    metric: "system_disk_usage",
    condition: ">",
    threshold: 90,
    level: "critical",
    duration: 60,
    labels: {},
    enabled: true,
    notificationChannels: ["default"],
  });

  // API错误率告警
  alertEngine.registerRule({
    id: "high_error_rate",
    name: "API错误率过高",
    description: "API错误率超过阈值",
    metric: "http_errors_total",
    condition: ">",
    threshold: 100,
    level: "error",
    duration: 60,
    labels: {},
    enabled: true,
    notificationChannels: ["default"],
  });
}
