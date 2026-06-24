/**
 * 监控和告警系统
 * 支持系统监控、应用监控、业务监控和告警功能
 */

import { os } from "os";

// 告警级别
export type AlertLevel = "info" | "warn" | "error" | "critical";

// 告警状态
export type AlertStatus = "active" | "acknowledged" | "resolved";

// 告警规则
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metric: string; // 监控指标
  condition: "gt" | "lt" | "gte" | "lte" | "eq" | "neq"; // 条件
  threshold: number; // 阈值
  level: AlertLevel;
  enabled: boolean;
  duration?: number; // 持续时间（秒）
  notifications: {
    email?: boolean;
    webhook?: boolean;
    inApp?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// 告警记录
export interface AlertRecord {
  id: string;
  ruleId: string;
  ruleName: string;
  level: AlertLevel;
  status: AlertStatus;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  tenantId?: string;
}

// 系统指标
export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number; // 百分比
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number; // 字节
    used: number;
    free: number;
    usage: number; // 百分比
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number; // 百分比
  };
  network: {
    connections: number;
    bytesIn: number;
    bytesOut: number;
  };
  process: {
    uptime: number; // 秒
    memoryUsage: number; // 字节
    cpuUsage: number;
  };
}

// 应用指标
export interface ApplicationMetrics {
  timestamp: Date;
  requests: {
    total: number;
    perSecond: number;
    success: number;
    failed: number;
    errorRate: number; // 百分比
  };
  responseTime: {
    average: number; // 毫秒
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  statusCodes: Record<string, number>;
  endpoints: Record<
    string,
    {
      requests: number;
      avgResponseTime: number;
      errorRate: number;
    }
  >;
}

// 业务指标
export interface BusinessMetrics {
  timestamp: Date;
  users: {
    total: number;
    active: number;
    newToday: number;
    online: number;
  };
  files: {
    total: number;
    uploadedToday: number;
    totalSize: number;
  };
  storage: {
    totalUsage: number;
    growthRate: number;
  };
  ai: {
    totalCalls: number;
    callsToday: number;
    successRate: number;
  };
  payment: {
    totalRevenue: number;
    revenueToday: number;
    conversionRate: number;
  };
}

// 健康检查结果
export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: Date;
  version: string;
  uptime: number;
  checks: {
    name: string;
    status: "healthy" | "degraded" | "unhealthy";
    message?: string;
    responseTime?: number;
    details?: any;
  }[];
}

/**
 * 监控数据收集器
 */
class MetricsCollector {
  private requestStats: Map<
    string,
    {
      count: number;
      totalTime: number;
      errors: number;
      statusCodes: Record<string, number>;
    }
  > = new Map();

  private totalRequests = 0;
  private totalErrors = 0;
  private startTime = Date.now();

  /**
   * 记录请求
   */
  recordRequest(endpoint: string, responseTime: number, statusCode: number) {
    this.totalRequests++;

    if (statusCode >= 400) {
      this.totalErrors++;
    }

    let stats = this.requestStats.get(endpoint);
    if (!stats) {
      stats = { count: 0, totalTime: 0, errors: 0, statusCodes: {} };
      this.requestStats.set(endpoint, stats);
    }

    stats.count++;
    stats.totalTime += responseTime;
    if (statusCode >= 400) {
      stats.errors++;
    }
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
  }

  /**
   * 获取应用指标
   */
  getApplicationMetrics(): ApplicationMetrics {
    const uptime = (Date.now() - this.startTime) / 1000;
    const perSecond = uptime > 0 ? this.totalRequests / uptime : 0;
    const errorRate =
      this.totalRequests > 0
        ? (this.totalErrors / this.totalRequests) * 100
        : 0;

    // 计算响应时间统计
    let allResponseTimes: number[] = [];
    const endpoints: Record<
      string,
      {
        requests: number;
        avgResponseTime: number;
        errorRate: number;
      }
    > = {};

    this.requestStats.forEach((stats, endpoint) => {
      const avgTime = stats.count > 0 ? stats.totalTime / stats.count : 0;
      const epErrorRate =
        stats.count > 0 ? (stats.errors / stats.count) * 100 : 0;

      endpoints[endpoint] = {
        requests: stats.count,
        avgResponseTime: avgTime,
        errorRate: epErrorRate,
      };
    });

    return {
      timestamp: new Date(),
      requests: {
        total: this.totalRequests,
        perSecond,
        success: this.totalRequests - this.totalErrors,
        failed: this.totalErrors,
        errorRate,
      },
      responseTime: {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
      },
      statusCodes: {},
      endpoints,
    };
  }

  /**
   * 重置统计
   */
  reset() {
    this.requestStats.clear();
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.startTime = Date.now();
  }
}

// 全局监控收集器
export const metricsCollector = new MetricsCollector();

/**
 * 获取系统指标
 */
export function getSystemMetrics(): SystemMetrics {
  const now = new Date();

  // CPU信息
  const cpus = os.cpus();
  const cpuCores = cpus.length;

  // 计算CPU使用率
  let totalIdle = 0;
  let totalTick = 0;
  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  const cpuUsage = 100 - ~~((totalIdle / totalTick) * 100);

  // 内存信息
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = (usedMem / totalMem) * 100;

  // 进程信息
  const processUptime = process.uptime();
  const processMemory = process.memoryUsage();

  return {
    timestamp: now,
    cpu: {
      usage: cpuUsage,
      cores: cpuCores,
      loadAverage: os.loadavg(),
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usage: memUsage,
    },
    disk: {
      total: 0,
      used: 0,
      free: 0,
      usage: 0,
    },
    network: {
      connections: 0,
      bytesIn: 0,
      bytesOut: 0,
    },
    process: {
      uptime: processUptime,
      memoryUsage: processMemory.rss,
      cpuUsage: 0,
    },
  };
}

/**
 * 健康检查
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = [];

  // 检查数据库连接
  try {
    const startTime = Date.now();
    // 这里可以添加实际的数据库检查
    const responseTime = Date.now() - startTime;
    checks.push({
      name: "database",
      status: "healthy",
      message: "数据库连接正常",
      responseTime,
    });
  } catch (error) {
    checks.push({
      name: "database",
      status: "unhealthy",
      message: `数据库连接失败: ${error}`,
    });
  }

  // 检查内存使用
  const mem = getSystemMetrics().memory;
  if (mem.usage > 90) {
    checks.push({
      name: "memory",
      status: "critical",
      message: `内存使用率过高: ${mem.usage.toFixed(1)}%`,
    });
  } else if (mem.usage > 70) {
    checks.push({
      name: "memory",
      status: "degraded",
      message: `内存使用率较高: ${mem.usage.toFixed(1)}%`,
    });
  } else {
    checks.push({
      name: "memory",
      status: "healthy",
      message: `内存使用率正常: ${mem.usage.toFixed(1)}%`,
    });
  }

  // 检查CPU使用
  const cpu = getSystemMetrics().cpu;
  if (cpu.usage > 90) {
    checks.push({
      name: "cpu",
      status: "critical",
      message: `CPU使用率过高: ${cpu.usage.toFixed(1)}%`,
    });
  } else if (cpu.usage > 70) {
    checks.push({
      name: "cpu",
      status: "degraded",
      message: `CPU使用率较高: ${cpu.usage.toFixed(1)}%`,
    });
  } else {
    checks.push({
      name: "cpu",
      status: "healthy",
      message: `CPU使用率正常: ${cpu.usage.toFixed(1)}%`,
    });
  }

  // 检查API错误率
  const appMetrics = metricsCollector.getApplicationMetrics();
  if (appMetrics.requests.errorRate > 10) {
    checks.push({
      name: "api_errors",
      status: "critical",
      message: `API错误率过高: ${appMetrics.requests.errorRate.toFixed(1)}%`,
    });
  } else if (appMetrics.requests.errorRate > 5) {
    checks.push({
      name: "api_errors",
      status: "degraded",
      message: `API错误率较高: ${appMetrics.requests.errorRate.toFixed(1)}%`,
    });
  } else {
    checks.push({
      name: "api_errors",
      status: "healthy",
      message: `API错误率正常: ${appMetrics.requests.errorRate.toFixed(1)}%`,
    });
  }

  // 计算整体状态
  const hasUnhealthy = checks.some((c) => c.status === "unhealthy");
  const hasDegraded = checks.some((c) => c.status === "degraded");

  let overallStatus: HealthCheckResult["status"] = "healthy";
  if (hasUnhealthy) {
    overallStatus = "unhealthy";
  } else if (hasDegraded) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: process.uptime(),
    checks,
  };
}

/**
 * 告警管理器
 */
class AlertManager {
  private rules: AlertRule[] = [];
  private activeAlerts: Map<string, AlertRecord> = new Map();
  private alertHistory: AlertRecord[] = [];

  /**
   * 添加告警规则
   */
  addRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt">): AlertRule {
    const newRule: AlertRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rules.push(newRule);
    return newRule;
  }

  /**
   * 获取所有规则
   */
  getRules(): AlertRule[] {
    return this.rules;
  }

  /**
   * 检查告警
   */
  checkAlerts(metrics: SystemMetrics & ApplicationMetrics) {
    const triggeredAlerts: AlertRecord[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // 获取指标值
      let value = 0;
      switch (rule.metric) {
        case "cpu.usage":
          value = metrics.cpu.usage;
          break;
        case "memory.usage":
          value = metrics.memory.usage;
          break;
        case "disk.usage":
          value = metrics.disk.usage;
          break;
        case "requests.errorRate":
          value = metrics.requests.errorRate;
          break;
        case "requests.perSecond":
          value = metrics.requests.perSecond;
          break;
        default:
          continue;
      }

      // 检查条件
      let triggered = false;
      switch (rule.condition) {
        case "gt":
          triggered = value > rule.threshold;
          break;
        case "lt":
          triggered = value < rule.threshold;
          break;
        case "gte":
          triggered = value >= rule.threshold;
          break;
        case "lte":
          triggered = value <= rule.threshold;
          break;
        case "eq":
          triggered = value === rule.threshold;
          break;
        case "neq":
          triggered = value !== rule.threshold;
          break;
      }

      if (triggered) {
        const alertId = `alert_${rule.id}_${Date.now()}`;
        const alert: AlertRecord = {
          id: alertId,
          ruleId: rule.id,
          ruleName: rule.name,
          level: rule.level,
          status: "active",
          metric: rule.metric,
          value,
          threshold: rule.threshold,
          message: `${rule.name}: ${rule.metric} = ${value.toFixed(2)} (阈值: ${rule.threshold})`,
          triggeredAt: new Date(),
        };

        this.activeAlerts.set(alertId, alert);
        this.alertHistory.push(alert);
        triggeredAlerts.push(alert);
      }
    }

    return triggeredAlerts;
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertRecord[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(limit = 100): AlertRecord[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string, userId?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = "acknowledged";
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      return true;
    }
    return false;
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = "resolved";
      alert.resolvedAt = new Date();
      this.activeAlerts.delete(alertId);
      return true;
    }
    return false;
  }
}

// 全局告警管理器
export const alertManager = new AlertManager();

// 添加默认告警规则
alertManager.addRule({
  name: "CPU使用率过高",
  description: "当CPU使用率超过80%时触发",
  metric: "cpu.usage",
  condition: "gt",
  threshold: 80,
  level: "warn",
  enabled: true,
  notifications: { inApp: true, email: true },
});

alertManager.addRule({
  name: "内存使用率过高",
  description: "当内存使用率超过85%时触发",
  metric: "memory.usage",
  condition: "gt",
  threshold: 85,
  level: "error",
  enabled: true,
  notifications: { inApp: true, email: true },
});

alertManager.addRule({
  name: "API错误率过高",
  description: "当API错误率超过5%时触发",
  metric: "requests.errorRate",
  condition: "gt",
  threshold: 5,
  level: "warn",
  enabled: true,
  notifications: { inApp: true },
});

/**
 * 监控中间件（用于记录API请求）
 */
export function metricsMiddleware(
  request: Request,
  response: Response,
  duration: number
) {
  const url = new URL(request.url);
  const endpoint = url.pathname;
  const statusCode = response.status;

  metricsCollector.recordRequest(endpoint, duration, statusCode);
}
