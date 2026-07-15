/**
 * 日志系统
 * 支持访问日志、错误日志、操作日志、系统日志、审计日志
 */
import { escapeCsvCell } from "../csv-utils";

// 日志级别
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// 日志类型
export type LogType =
  | "access" // 访问日志
  | "error" // 错误日志
  | "operation" // 操作日志
  | "system" // 系统日志
  | "audit" // 审计日志
  | "security"; // 安全日志

// 日志条目
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  type: LogType;
  message: string;
  module?: string;
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  details?: any;
  duration?: number; // 毫秒
  statusCode?: number;
  method?: string;
  path?: string;
}

// 日志查询选项
export interface LogQueryOptions {
  type?: LogType;
  level?: LogLevel;
  module?: string;
  userId?: string;
  tenantId?: string;
  startTime?: Date;
  endTime?: Date;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "timestamp" | "level";
  sortOrder?: "asc" | "desc";
}

// 日志统计结果
export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byType: Record<LogType, number>;
  byModule: Record<string, number>;
  byHour: Record<string, number>;
  errorRate: number;
}

/**
 * 日志记录器
 */
class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 10000; // 最大保留日志数
  private minLevel: LogLevel = "debug";

  // 日志级别数值
  private levelValues: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  /**
   * 记录日志
   */
  log(entry: Omit<LogEntry, "id" | "timestamp">) {
    // 检查日志级别
    if (this.levelValues[entry.level] < this.levelValues[this.minLevel]) {
      return;
    }

    const logEntry: LogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    this.logs.push(logEntry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 同时输出到控制台
    this.consoleOutput(logEntry);
  }

  /**
   * 控制台输出
   */
  private consoleOutput(entry: LogEntry) {
    const prefix = `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] [${entry.type}]`;

    switch (entry.level) {
      case "debug":
        console.debug(prefix, entry.message, entry.details || "");
        break;
      case "info":
        console.info(prefix, entry.message, entry.details || "");
        break;
      case "warn":
        console.warn(prefix, entry.message, entry.details || "");
        break;
      case "error":
      case "fatal":
        console.error(prefix, entry.message, entry.details || "");
        break;
    }
  }

  /**
   * 记录调试日志
   */
  debug(message: string, options?: Partial<LogEntry>) {
    this.log({
      ...options,
      level: "debug",
      type: options?.type || "system",
      message,
    });
  }

  /**
   * 记录信息日志
   */
  info(message: string, options?: Partial<LogEntry>) {
    this.log({
      ...options,
      level: "info",
      type: options?.type || "system",
      message,
    });
  }

  /**
   * 记录警告日志
   */
  warn(message: string, options?: Partial<LogEntry>) {
    this.log({
      ...options,
      level: "warn",
      type: options?.type || "system",
      message,
    });
  }

  /**
   * 记录错误日志
   */
  error(message: string, options?: Partial<LogEntry>) {
    this.log({
      ...options,
      level: "error",
      type: options?.type || "error",
      message,
    });
  }

  /**
   * 记录致命错误日志
   */
  fatal(message: string, options?: Partial<LogEntry>) {
    this.log({
      ...options,
      level: "fatal",
      type: options?.type || "error",
      message,
    });
  }

  /**
   * 记录访问日志
   */
  access(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    options?: Partial<LogEntry>
  ) {
    this.log({
      ...options,
      level: statusCode >= 400 ? "warn" : "info",
      type: "access",
      message: `${method} ${path} - ${statusCode} (${duration}ms)`,
      method,
      path,
      statusCode,
      duration,
    });
  }

  /**
   * 记录操作日志
   */
  operation(
    action: string,
    resource: string,
    options?: Partial<LogEntry>
  ) {
    this.log({
      ...options,
      level: "info",
      type: "operation",
      message: `${action} ${resource}`,
      module: "operation",
    });
  }

  /**
   * 记录审计日志
   */
  audit(
    action: string,
    resource: string,
    options?: Partial<LogEntry>
  ) {
    this.log({
      ...options,
      level: "info",
      type: "audit",
      message: `[AUDIT] ${action} ${resource}`,
      module: "audit",
    });
  }

  /**
   * 记录安全日志
   */
  security(
    event: string,
    severity: "low" | "medium" | "high" | "critical",
    options?: Partial<LogEntry>
  ) {
    const level: LogLevel =
      severity === "critical"
        ? "fatal"
        : severity === "high"
        ? "error"
        : severity === "medium"
        ? "warn"
        : "info";

    this.log({
      ...options,
      level,
      type: "security",
      message: `[SECURITY-${severity.toUpperCase()}] ${event}`,
      module: "security",
    });
  }

  /**
   * 查询日志
   */
  query(options: LogQueryOptions = {}): {
    data: LogEntry[];
    total: number;
    page: number;
    pageSize: number;
  } {
    let filtered = [...this.logs];

    // 按类型过滤
    if (options.type) {
      filtered = filtered.filter((log) => log.type === options.type);
    }

    // 按级别过滤
    if (options.level) {
      filtered = filtered.filter((log) => log.level === options.level);
    }

    // 按模块过滤
    if (options.module) {
      filtered = filtered.filter((log) => log.module === options.module);
    }

    // 按用户过滤
    if (options.userId) {
      filtered = filtered.filter((log) => log.userId === options.userId);
    }

    // 按租户过滤
    if (options.tenantId) {
      filtered = filtered.filter((log) => log.tenantId === options.tenantId);
    }

    // 按时间范围过滤
    if (options.startTime) {
      filtered = filtered.filter(
        (log) => log.timestamp >= options.startTime!
      );
    }
    if (options.endTime) {
      filtered = filtered.filter((log) => log.timestamp <= options.endTime!);
    }

    // 按关键词搜索
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(keyword) ||
          (log.details &&
            JSON.stringify(log.details).toLowerCase().includes(keyword))
      );
    }

    // 排序
    const sortBy = options.sortBy || "timestamp";
    const sortOrder = options.sortOrder || "desc";
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "timestamp") {
        comparison = a.timestamp.getTime() - b.timestamp.getTime();
      } else if (sortBy === "level") {
        comparison =
          this.levelValues[a.level] - this.levelValues[b.level];
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // 分页
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return {
      data,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取日志统计
   */
  getStats(options: LogQueryOptions = {}): LogStats {
    const { data: allLogs } = this.query({
      ...options,
      page: 1,
      pageSize: this.maxLogs,
    });

    const stats: LogStats = {
      total: allLogs.length,
      byLevel: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
      byType: {
        access: 0,
        error: 0,
        operation: 0,
        system: 0,
        audit: 0,
        security: 0,
      },
      byModule: {},
      byHour: {},
      errorRate: 0,
    };

    let errorCount = 0;

    for (const log of allLogs) {
      // 按级别统计
      stats.byLevel[log.level]++;

      // 按类型统计
      stats.byType[log.type]++;

      // 按模块统计
      if (log.module) {
        stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1;
      }

      // 按小时统计
      const hour = log.timestamp.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;

      // 错误计数
      if (log.level === "error" || log.level === "fatal") {
        errorCount++;
      }
    }

    // 错误率
    stats.errorRate =
      stats.total > 0 ? (errorCount / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * 导出日志
   */
  exportLogs(
    format: "json" | "csv" | "text",
    options: LogQueryOptions = {}
  ): string {
    const { data: logs } = this.query({
      ...options,
      page: 1,
      pageSize: this.maxLogs,
    });

    switch (format) {
      case "json":
        return JSON.stringify(logs, null, 2);

      case "csv": {
        const headers = [
          "timestamp",
          "level",
          "type",
          "module",
          "message",
          "userId",
          "tenantId",
          "ipAddress",
          "duration",
          "statusCode",
          "method",
          "path",
        ];
        const rows = logs.map((log) =>
          headers
            .map((h) => {
              const value = (log as any)[h];
              // timestamp 为 Date 对象，escapeCsvCell 会经 JSON.stringify
              // 产生带外层引号的串（如 "2026-01-15T10:30:00.000Z"）进而被双包，
              // 先 toISOString 预 coercion 为裸 ISO 字符串。
              if (value instanceof Date) return escapeCsvCell(value.toISOString());
              return escapeCsvCell(value);
            })
            .join(",")
        );
        return [headers.map(escapeCsvCell).join(","), ...rows].join("\n");
      }

      case "text":
      default:
        return logs
          .map(
            (log) =>
              `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] [${log.type}] ${log.message}`
          )
          .join("\n");
    }
  }

  /**
   * 清理旧日志
   */
  cleanOldLogs(olderThan: Date): number {
    const beforeCount = this.logs.length;
    this.logs = this.logs.filter((log) => log.timestamp >= olderThan);
    return beforeCount - this.logs.length;
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
  }

  /**
   * 设置最低日志级别
   */
  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  /**
   * 获取当前日志级别
   */
  getMinLevel(): LogLevel {
    return this.minLevel;
  }
}

// 全局日志记录器
export const logger = new Logger();

/**
 * 日志中间件工厂
 */
export function createLoggerMiddleware() {
  return async (request: Request, next: () => Promise<Response>) => {
    const startTime = Date.now();
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;

    // 获取IP和User-Agent
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const requestId =
      request.headers.get("x-request-id") ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const response = await next();
      const duration = Date.now() - startTime;

      // 记录访问日志
      logger.access(method, path, response.status, duration, {
        ipAddress,
        userAgent,
        requestId,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // 记录错误日志
      logger.error(`请求处理失败: ${method} ${path}`, {
        type: "error",
        ipAddress,
        userAgent,
        requestId,
        duration,
        details: error,
      });

      throw error;
    }
  };
}

/**
 * 日志轮转配置
 */
export interface LogRotationConfig {
  maxSize: number; // 最大文件大小（字节）
  maxFiles: number; // 最大文件数
  maxAge: number; // 最大保留天数
  compress: boolean; // 是否压缩
}

/**
 * 默认日志轮转配置
 */
export const defaultLogRotationConfig: LogRotationConfig = {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  maxAge: 30, // 30天
  compress: true,
};
