/**
 * 日志系统
 * 支持多种日志级别、结构化日志、日志查询和分析
 */

// 日志级别
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// 日志级别数值
export const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// 日志类型
export type LogType =
  | "system" // 系统日志
  | "access" // 访问日志
  | "error" // 错误日志
  | "audit" // 审计日志
  | "operation" // 操作日志
  | "security" // 安全日志
  | "performance"; // 性能日志

// 日志条目
export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  type: LogType;
  message: string;
  module?: string;
  tenantId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  duration?: number;
  statusCode?: number;
  method?: string;
  path?: string;
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  tags?: string[];
}

// 日志过滤器
export interface LogFilter {
  level?: LogLevel;
  type?: LogType;
  module?: string;
  tenantId?: string;
  userId?: string;
  keyword?: string;
  startTime?: number;
  endTime?: number;
  tags?: string[];
}

// 日志存储接口
export interface LogStorage {
  save(entry: LogEntry): Promise<void>;
  query(filter: LogFilter, options?: {
    limit?: number;
    offset?: number;
    sort?: "asc" | "desc";
  }): Promise<{
    logs: LogEntry[];
    total: number;
  }>;
  cleanup(olderThan: number): Promise<number>;
  getStats(filter?: LogFilter): Promise<{
    total: number;
    byLevel: Record<LogLevel, number>;
    byType: Record<LogType, number>;
  }>;
}

/**
 * 内存日志存储（默认实现）
 */
export class MemoryLogStorage implements LogStorage {
  private logs: LogEntry[] = [];
  private maxLogs = 10000;

  async save(entry: LogEntry): Promise<void> {
    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  async query(
    filter: LogFilter,
    options?: {
      limit?: number;
      offset?: number;
      sort?: "asc" | "desc";
    }
  ): Promise<{ logs: LogEntry[]; total: number }> {
    let filtered = this.filterLogs(filter);

    // 排序
    const sort = options?.sort || "desc";
    filtered.sort((a, b) => {
      if (sort === "asc") {
        return a.timestamp - b.timestamp;
      }
      return b.timestamp - a.timestamp;
    });

    const total = filtered.length;

    // 分页
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const logs = filtered.slice(offset, offset + limit);

    return { logs, total };
  }

  async cleanup(olderThan: number): Promise<number> {
    const cutoff = Date.now() - olderThan * 1000;
    const beforeCount = this.logs.length;
    this.logs = this.logs.filter((log) => log.timestamp >= cutoff);
    return beforeCount - this.logs.length;
  }

  async getStats(filter?: LogFilter): Promise<{
    total: number;
    byLevel: Record<LogLevel, number>;
    byType: Record<LogType, number>;
  }> {
    const logs = filter ? this.filterLogs(filter) : this.logs;

    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };

    const byType: Record<LogType, number> = {
      system: 0,
      access: 0,
      error: 0,
      audit: 0,
      operation: 0,
      security: 0,
      performance: 0,
    };

    for (const log of logs) {
      byLevel[log.level]++;
      byType[log.type]++;
    }

    return {
      total: logs.length,
      byLevel,
      byType,
    };
  }

  private filterLogs(filter: LogFilter): LogEntry[] {
    return this.logs.filter((log) => {
      // 级别过滤
      if (filter.level && LOG_LEVELS[log.level] < LOG_LEVELS[filter.level]) {
        return false;
      }

      // 类型过滤
      if (filter.type && log.type !== filter.type) {
        return false;
      }

      // 模块过滤
      if (filter.module && log.module !== filter.module) {
        return false;
      }

      // 租户过滤
      if (filter.tenantId && log.tenantId !== filter.tenantId) {
        return false;
      }

      // 用户过滤
      if (filter.userId && log.userId !== filter.userId) {
        return false;
      }

      // 时间过滤
      if (filter.startTime && log.timestamp < filter.startTime) {
        return false;
      }
      if (filter.endTime && log.timestamp > filter.endTime) {
        return false;
      }

      // 关键词搜索
      if (filter.keyword) {
        const keyword = filter.keyword.toLowerCase();
        const searchText = [
          log.message,
          log.module,
          log.path,
          JSON.stringify(log.data || {}),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchText.includes(keyword)) {
          return false;
        }
      }

      // 标签过滤
      if (filter.tags && filter.tags.length > 0) {
        if (!log.tags || !filter.tags.some((tag) => log.tags!.includes(tag))) {
          return false;
        }
      }

      return true;
    });
  }
}

/**
 * 日志记录器
 */
export class Logger {
  private module: string;
  private storage: LogStorage;
  private minLevel: LogLevel = "info";
  private tenantId?: string;
  private userId?: string;

  constructor(
    module: string,
    options?: {
      storage?: LogStorage;
      minLevel?: LogLevel;
      tenantId?: string;
      userId?: string;
    }
  ) {
    this.module = module;
    this.storage = options?.storage || defaultLogStorage;
    this.minLevel = options?.minLevel || "info";
    this.tenantId = options?.tenantId;
    this.userId = options?.userId;
  }

  /**
   * 创建子日志记录器
   */
  child(module: string): Logger {
    return new Logger(`${this.module}:${module}`, {
      storage: this.storage,
      minLevel: this.minLevel,
      tenantId: this.tenantId,
      userId: this.userId,
    });
  }

  /**
   * 设置租户ID
   */
  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  /**
   * 设置用户ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * 记录日志
   */
  private log(
    level: LogLevel,
    type: LogType,
    message: string,
    data?: Record<string, any>
  ): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      type,
      message,
      module: this.module,
      tenantId: this.tenantId,
      userId: this.userId,
      data,
    };

    // 输出到控制台
    this.logToConsole(entry);

    // 保存到存储
    this.storage.save(entry).catch((error) => {
      console.error("Failed to save log:", error);
    });
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.type}] [${entry.module}]`;

    const message = entry.message;

    switch (entry.level) {
      case "debug":
        console.debug(prefix, message, entry.data || "");
        break;
      case "info":
        console.info(prefix, message, entry.data || "");
        break;
      case "warn":
        console.warn(prefix, message, entry.data || "");
        break;
      case "error":
      case "fatal":
        console.error(prefix, message, entry.data || "", entry.error?.stack || "");
        break;
    }
  }

  /**
   * 生成日志ID
   */
  private generateId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 便捷方法
  debug(message: string, data?: Record<string, any>): void {
    this.log("debug", "system", message, data);
  }

  info(message: string, data?: Record<string, any>): void {
    this.log("info", "system", message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log("warn", "system", message, data);
  }

  error(message: string, error?: Error, data?: Record<string, any>): void {
    this.log("error", "error", message, {
      ...data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  fatal(message: string, error?: Error, data?: Record<string, any>): void {
    this.log("fatal", "error", message, {
      ...data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  // 访问日志
  access(message: string, data?: {
    method?: string;
    path?: string;
    statusCode?: number;
    duration?: number;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): void {
    this.log("info", "access", message, data as Record<string, any>);
  }

  // 审计日志
  audit(message: string, data?: Record<string, any>): void {
    this.log("info", "audit", message, data);
  }

  // 操作日志
  operation(message: string, data?: Record<string, any>): void {
    this.log("info", "operation", message, data);
  }

  // 安全日志
  security(message: string, level: LogLevel = "warn", data?: Record<string, any>): void {
    this.log(level, "security", message, data);
  }

  // 性能日志
  performance(message: string, duration: number, data?: Record<string, any>): void {
    this.log("debug", "performance", message, {
      ...data,
      duration,
    });
  }
}

// 默认日志存储
const defaultLogStorage = new MemoryLogStorage();

// 默认日志记录器
export const logger = new Logger("app", {
  storage: defaultLogStorage,
  minLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
});

// 导出存储实例供查询使用
export const logStorage = defaultLogStorage;

/**
 * 日志中间件（用于API请求）
 */
export function createLoggerMiddleware(options?: {
  module?: string;
  logRequestBody?: boolean;
  logResponseBody?: boolean;
}) {
  const module = options?.module || "http";
  const log = logger.child(module);

  return function loggerMiddleware(req: any, res: any, next: any) {
    const startTime = Date.now();
    const requestId = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 设置请求ID
    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);

    // 请求开始日志
    log.access(`${req.method} ${req.url}`, {
      method: req.method,
      path: req.url,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      requestId,
    });

    // 响应结束日志
    const originalEnd = res.end;
    res.end = function (chunk: any, encoding: any) {
      const duration = Date.now() - startTime;

      log.access(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`, {
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
        requestId,
      });

      // 错误请求额外记录
      if (res.statusCode >= 400) {
        log.warn(`HTTP ${res.statusCode} - ${req.method} ${req.url}`, {
          method: req.method,
          path: req.url,
          statusCode: res.statusCode,
          duration,
          requestId,
        });
      }

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * 性能计时器
 */
export class PerformanceTimer {
  private name: string;
  private startTime: number;
  private logger: Logger;

  constructor(name: string, customLogger?: Logger) {
    this.name = name;
    this.logger = customLogger || logger;
    this.startTime = Date.now();
  }

  /**
   * 记录时间点
   */
  lap(label: string): void {
    const elapsed = Date.now() - this.startTime;
    this.logger.performance(`${this.name} - ${label}`, elapsed);
  }

  /**
   * 结束计时
   */
  end(): number {
    const duration = Date.now() - this.startTime;
    this.logger.performance(`${this.name} - completed`, duration);
    return duration;
  }
}
