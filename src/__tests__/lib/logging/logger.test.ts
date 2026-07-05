import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  logger,
  createLoggerMiddleware,
  defaultLogRotationConfig,
} from "@/lib/logging/logger";

/**
 * 直接覆盖 src/lib/logging/logger.ts 的运行时导出：
 *   - `logger` 单例（Logger 类未导出，仅实例导出）的 17 个实例方法
 *   - `createLoggerMiddleware()` 工厂
 *   - `defaultLogRotationConfig` 常量
 *
 * 历史背景：本模块此前零真实覆盖。Logger 类是纯内存实现（logs 数组 +
 * maxLogs 软上限 + minLevel 过滤 + 控制台镜像输出），无任何运行时外部依赖，
 * 仅依赖全局 Date/Math/console，适合 fake timers + console spy 锁定控制流。
 *
 * 隔离策略：
 *   - vitest 默认按测试文件隔离模块注册表，跨文件无单例污染。
 *   - 文件内通过 `beforeEach` 调 `logger.clear()` + `logger.setMinLevel("debug")`
 *     将单例重置为出厂状态（空 logs、minLevel=debug）。
 *   - `vi.useFakeTimers()` + `vi.setSystemTime()` 固定时间戳，使 id（含 Date.now()）、
 *     timestamp、byHour 分组、时间范围过滤全部确定性可断言。
 *   - console.debug/info/warn/error 全部 spy 并 mock 为 no-op，避免污染测试输出，
 *     并断言"低于 minLevel 时 log() 在 consoleOutput 之前早退"。
 */

const FIXED_NOW = new Date("2026-01-15T10:30:00.000Z").getTime();

describe("logger / src/lib/logging/logger.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    logger.clear();
    logger.setMinLevel("debug");
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ==================== getMinLevel / setMinLevel ====================

  describe("getMinLevel / setMinLevel", () => {
    it("默认 minLevel 为 debug", () => {
      expect(logger.getMinLevel()).toBe("debug");
    });

    it("setMinLevel 设置后 getMinLevel 立即反映", () => {
      logger.setMinLevel("warn");
      expect(logger.getMinLevel()).toBe("warn");
      logger.setMinLevel("fatal");
      expect(logger.getMinLevel()).toBe("fatal");
    });

    it("setMinLevel 可往返复位", () => {
      logger.setMinLevel("error");
      logger.setMinLevel("debug");
      expect(logger.getMinLevel()).toBe("debug");
    });
  });

  // ==================== log() 级别过滤 ====================

  describe("log() 级别过滤", () => {
    it("minLevel=debug：debug/info/warn/error/fatal 全部记录", () => {
      logger.log({ level: "debug", type: "system", message: "d" });
      logger.log({ level: "info", type: "system", message: "i" });
      logger.log({ level: "warn", type: "system", message: "w" });
      logger.log({ level: "error", type: "system", message: "e" });
      logger.log({ level: "fatal", type: "system", message: "f" });
      expect(logger.query().total).toBe(5);
    });

    it("minLevel=info：过滤 debug，保留 info/warn/error/fatal", () => {
      logger.setMinLevel("info");
      logger.log({ level: "debug", type: "system", message: "d" });
      logger.log({ level: "info", type: "system", message: "i" });
      logger.log({ level: "warn", type: "system", message: "w" });
      logger.log({ level: "error", type: "system", message: "e" });
      logger.log({ level: "fatal", type: "system", message: "f" });
      const { data } = logger.query({ pageSize: 100 });
      expect(data.map((l) => l.level).sort()).toEqual([
        "error",
        "fatal",
        "info",
        "warn",
      ]);
    });

    it("minLevel=warn：过滤 debug/info，保留 warn/error/fatal", () => {
      logger.setMinLevel("warn");
      logger.log({ level: "debug", type: "system", message: "d" });
      logger.log({ level: "info", type: "system", message: "i" });
      logger.log({ level: "warn", type: "system", message: "w" });
      logger.log({ level: "error", type: "system", message: "e" });
      logger.log({ level: "fatal", type: "system", message: "f" });
      expect(logger.query().total).toBe(3);
    });

    it("minLevel=error：仅保留 error/fatal", () => {
      logger.setMinLevel("error");
      logger.log({ level: "warn", type: "system", message: "w" });
      logger.log({ level: "error", type: "system", message: "e" });
      logger.log({ level: "fatal", type: "system", message: "f" });
      expect(logger.query().total).toBe(2);
    });

    it("minLevel=fatal：仅保留 fatal；边界级别等于 minLevel 时记录", () => {
      logger.setMinLevel("fatal");
      logger.log({ level: "error", type: "system", message: "e" });
      logger.log({ level: "fatal", type: "system", message: "f" });
      const { data } = logger.query();
      expect(data).toHaveLength(1);
      expect(data[0].level).toBe("fatal");
    });

    it("低于 minLevel 时 log() 在 consoleOutput 之前早退（不调用 console）", () => {
      logger.setMinLevel("error");
      logger.log({ level: "debug", type: "system", message: "filtered" });
      expect(console.debug).not.toHaveBeenCalled();
      expect(logger.query().total).toBe(0);
    });
  });

  // ==================== log() 条目形状 ====================

  describe("log() 条目形状", () => {
    it("注入 id（log_<ts>_<9chars>）与 timestamp（Date 实例）", () => {
      logger.log({ level: "info", type: "system", message: "m" });
      const entry = logger.query().data[0];
      expect(entry.id).toMatch(/^log_\d+_[a-z0-9]{9}$/);
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).toBe(FIXED_NOW);
    });

    it("保留传入的可选字段（userId/tenantId/module/ipAddress 等）", () => {
      logger.log({
        level: "info",
        type: "audit",
        message: "m",
        module: "billing",
        userId: "u1",
        tenantId: "t1",
        ipAddress: "1.2.3.4",
        userAgent: "ua",
        requestId: "r1",
        details: { k: "v" },
        duration: 42,
        statusCode: 200,
        method: "GET",
        path: "/x",
      });
      const entry = logger.query().data[0];
      expect(entry.module).toBe("billing");
      expect(entry.userId).toBe("u1");
      expect(entry.tenantId).toBe("t1");
      expect(entry.ipAddress).toBe("1.2.3.4");
      expect(entry.userAgent).toBe("ua");
      expect(entry.requestId).toBe("r1");
      expect(entry.details).toEqual({ k: "v" });
      expect(entry.duration).toBe(42);
      expect(entry.statusCode).toBe(200);
      expect(entry.method).toBe("GET");
      expect(entry.path).toBe("/x");
    });
  });

  // ==================== 便捷方法默认 type/level ====================

  describe("便捷方法默认 type 与 level", () => {
    it("debug() 默认 type=system、level=debug", () => {
      logger.debug("hello");
      const e = logger.query().data[0];
      expect(e.level).toBe("debug");
      expect(e.type).toBe("system");
      expect(e.message).toBe("hello");
    });

    it("info() 默认 type=system、level=info", () => {
      logger.info("hello");
      const e = logger.query().data[0];
      expect(e.level).toBe("info");
      expect(e.type).toBe("system");
    });

    it("warn() 默认 type=system、level=warn", () => {
      logger.warn("hello");
      const e = logger.query().data[0];
      expect(e.level).toBe("warn");
      expect(e.type).toBe("system");
    });

    it("error() 默认 type=error（非 system）、level=error", () => {
      logger.error("hello");
      const e = logger.query().data[0];
      expect(e.level).toBe("error");
      expect(e.type).toBe("error");
    });

    it("fatal() 默认 type=error、level=fatal", () => {
      logger.fatal("hello");
      const e = logger.query().data[0];
      expect(e.level).toBe("fatal");
      expect(e.type).toBe("error");
    });

    it("便捷方法透传 options 并覆盖默认 type", () => {
      logger.info("m", { type: "access", userId: "u9" });
      const e = logger.query().data[0];
      expect(e.type).toBe("access");
      expect(e.userId).toBe("u9");
    });
  });

  // ==================== access() ====================

  describe("access()", () => {
    it("2xx 记录 level=info，含 method/path/status/duration 与格式化 message", () => {
      logger.access("GET", "/api/x", 200, 12);
      const e = logger.query().data[0];
      expect(e.level).toBe("info");
      expect(e.type).toBe("access");
      expect(e.message).toBe("GET /api/x - 200 (12ms)");
      expect(e.method).toBe("GET");
      expect(e.path).toBe("/api/x");
      expect(e.statusCode).toBe(200);
      expect(e.duration).toBe(12);
    });

    it("status>=400 记录 level=warn", () => {
      logger.access("POST", "/api/y", 500, 5);
      expect(logger.query().data[0].level).toBe("warn");
    });

    it("边界：399→info，400→warn", () => {
      logger.access("GET", "/a", 399, 1);
      logger.access("GET", "/b", 400, 1);
      const { data } = logger.query({ pageSize: 100 });
      const byPath = Object.fromEntries(data.map((d) => [d.path, d.level]));
      expect(byPath["/a"]).toBe("info");
      expect(byPath["/b"]).toBe("warn");
    });
  });

  // ==================== operation() / audit() ====================

  describe("operation()", () => {
    it("记录 level=info/type=operation，message=`${action} ${resource}`，module=operation", () => {
      logger.operation("create", "file");
      const e = logger.query().data[0];
      expect(e.level).toBe("info");
      expect(e.type).toBe("operation");
      expect(e.message).toBe("create file");
      expect(e.module).toBe("operation");
    });
  });

  describe("audit()", () => {
    it("记录 level=info/type=audit，message=`[AUDIT] ${action} ${resource}`，module=audit", () => {
      logger.audit("delete", "user");
      const e = logger.query().data[0];
      expect(e.level).toBe("info");
      expect(e.type).toBe("audit");
      expect(e.message).toBe("[AUDIT] delete user");
      expect(e.module).toBe("audit");
    });
  });

  // ==================== security() ====================

  describe("security()", () => {
    it("severity=low → level=info", () => {
      logger.security("login", "low");
      const e = logger.query().data[0];
      expect(e.level).toBe("info");
      expect(e.type).toBe("security");
      expect(e.message).toBe("[SECURITY-LOW] login");
      expect(e.module).toBe("security");
    });

    it("severity=medium → level=warn", () => {
      logger.security("x", "medium");
      expect(logger.query().data[0].level).toBe("warn");
    });

    it("severity=high → level=error", () => {
      logger.security("x", "high");
      expect(logger.query().data[0].level).toBe("error");
    });

    it("severity=critical → level=fatal", () => {
      logger.security("x", "critical");
      expect(logger.query().data[0].level).toBe("fatal");
    });
  });

  // ==================== query() 过滤 ====================

  describe("query() 过滤", () => {
    beforeEach(() => {
      logger.info("upload started", { type: "operation", module: "file", userId: "u1", tenantId: "t1" });
      logger.error("disk full", { type: "error", module: "storage", userId: "u2", tenantId: "t1" });
      logger.warn("slow query", { type: "system", module: "db", userId: "u1", tenantId: "t2" });
    });

    it("按 type 过滤", () => {
      expect(logger.query({ type: "error" }).total).toBe(1);
      expect(logger.query({ type: "operation" }).total).toBe(1);
      expect(logger.query({ type: "audit" }).total).toBe(0);
    });

    it("按 level 过滤", () => {
      expect(logger.query({ level: "warn" }).total).toBe(1);
      expect(logger.query({ level: "info" }).total).toBe(1);
    });

    it("按 module 过滤", () => {
      expect(logger.query({ module: "file" }).total).toBe(1);
      expect(logger.query({ module: "storage" }).total).toBe(1);
      expect(logger.query({ module: "missing" }).total).toBe(0);
    });

    it("按 userId 过滤", () => {
      expect(logger.query({ userId: "u1" }).total).toBe(2);
      expect(logger.query({ userId: "u2" }).total).toBe(1);
    });

    it("按 tenantId 过滤", () => {
      expect(logger.query({ tenantId: "t1" }).total).toBe(2);
      expect(logger.query({ tenantId: "t2" }).total).toBe(1);
    });

    it("按时间范围过滤（startTime/endTime）", () => {
      const base = FIXED_NOW;
      // beforeEach 已写入 3 条 @ base；此处再写 +60s / +120s 各一条
      vi.setSystemTime(base + 60_000);
      logger.error("disk full 2", { type: "error", module: "storage" });
      vi.setSystemTime(base + 120_000);
      logger.warn("slow 2", { type: "system", module: "db" });
      // 范围 [base+30s, base+150s] 命中 +60s 与 +120s 两条（3 条 @base 被排除）
      const r = logger.query({
        startTime: new Date(base + 30_000),
        endTime: new Date(base + 150_000),
      });
      expect(r.total).toBe(2);
    });

    it("按 keyword 过滤 message（大小写不敏感）", () => {
      expect(logger.query({ keyword: "DISK" }).total).toBe(1);
      expect(logger.query({ keyword: "upload" }).total).toBe(1);
    });

    it("按 keyword 命中 details 的 JSON 序列化", () => {
      logger.info("ctx", { details: { token: "abc-secret-xyz" } });
      expect(logger.query({ keyword: "abc-secret-xyz" }).total).toBe(1);
    });
  });

  // ==================== query() 排序与分页 ====================

  describe("query() 排序与分页", () => {
    beforeEach(() => {
      // 依次写入 4 条，时间递增
      logger.debug("first");
      vi.setSystemTime(FIXED_NOW + 10_000);
      logger.info("second");
      vi.setSystemTime(FIXED_NOW + 20_000);
      logger.warn("third");
      vi.setSystemTime(FIXED_NOW + 30_000);
      logger.error("fourth");
    });

    it("默认按 timestamp desc", () => {
      const { data } = logger.query({ pageSize: 100 });
      expect(data.map((d) => d.message)).toEqual([
        "fourth",
        "third",
        "second",
        "first",
      ]);
    });

    it("sortBy=timestamp asc", () => {
      const { data } = logger.query({ pageSize: 100, sortOrder: "asc" });
      expect(data.map((d) => d.message)).toEqual([
        "first",
        "second",
        "third",
        "fourth",
      ]);
    });

    it("sortBy=level desc（按 levelValues 数值倒序）", () => {
      const { data } = logger.query({ pageSize: 100, sortBy: "level" });
      // levelValues: debug0 info1 warn2 error3 → desc: error,warn,info,debug
      expect(data.map((d) => d.level)).toEqual([
        "error",
        "warn",
        "info",
        "debug",
      ]);
    });

    it("分页 page/pageSize + total", () => {
      const page1 = logger.query({ pageSize: 2, page: 1 });
      const page2 = logger.query({ pageSize: 2, page: 2 });
      expect(page1.total).toBe(4);
      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);
      // desc 顺序：fourth,third | second,first
      expect(page1.data.map((d) => d.message)).toEqual(["fourth", "third"]);
      expect(page2.data.map((d) => d.message)).toEqual(["second", "first"]);
    });

    it("默认 page=1 pageSize=50", () => {
      const r = logger.query();
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(50);
    });
  });

  // ==================== getStats() ====================

  describe("getStats()", () => {
    beforeEach(() => {
      logger.info("a", { type: "system", module: "m1" });
      logger.warn("b", { type: "operation", module: "m1" });
      logger.error("c", { type: "error", module: "m2" });
      logger.fatal("d", { type: "security", module: "m2" });
    });

    it("total 与 byLevel/byType/byModule 计数正确", () => {
      const s = logger.getStats();
      expect(s.total).toBe(4);
      expect(s.byLevel).toEqual({
        debug: 0,
        info: 1,
        warn: 1,
        error: 1,
        fatal: 1,
      });
      expect(s.byType.system).toBe(1);
      expect(s.byType.operation).toBe(1);
      expect(s.byType.error).toBe(1);
      expect(s.byType.security).toBe(1);
      expect(s.byModule.m1).toBe(2);
      expect(s.byModule.m2).toBe(2);
    });

    it("errorRate = (error+fatal)/total*100", () => {
      const s = logger.getStats();
      // 2/4 * 100 = 50
      expect(s.errorRate).toBe(50);
    });

    it("空日志 errorRate=0、total=0", () => {
      logger.clear();
      const s = logger.getStats();
      expect(s.total).toBe(0);
      expect(s.errorRate).toBe(0);
    });

    it("byHour 按 YYYY-MM-DDTHH 分桶", () => {
      const s = logger.getStats();
      // FIXED_NOW = 2026-01-15T10:30 → slice(0,13) = "2026-01-15T10"
      expect(s.byHour["2026-01-15T10"]).toBe(4);
    });
  });

  // ==================== exportLogs() ====================

  describe("exportLogs()", () => {
    beforeEach(() => {
      logger.info("hello,world", { type: "system", module: "m", userId: "u1" });
      logger.error("boom", { type: "error", module: "e" });
    });

    it("json 格式可解析回原条目", () => {
      const out = logger.exportLogs("json");
      const parsed = JSON.parse(out);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].message).toMatch(/hello,world|boom/);
    });

    it("csv 格式含表头并正确转义含逗号的字段", () => {
      const out = logger.exportLogs("csv");
      const lines = out.split("\n");
      expect(lines[0]).toContain("timestamp,level,type,module,message");
      // message "hello,world" 应被双引号包裹
      const commaRow = lines.find((l) => l.includes('"hello,world"'));
      expect(commaRow).toBeDefined();
    });

    it("text 格式每行 `[ts] [LEVEL] [type] message`", () => {
      const out = logger.exportLogs("text");
      const lines = out.split("\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(
        /^\[2026-01-15T10:30:00\.000Z\] \[(INFO|ERROR)\] \[(system|error)\] /
      );
    });

    it("exportLogs 尊重 filter options", () => {
      const out = logger.exportLogs("text", { level: "error" });
      expect(out.split("\n")).toHaveLength(1);
      expect(out).toContain("boom");
    });
  });

  // ==================== cleanOldLogs() / clear() ====================

  describe("cleanOldLogs()", () => {
    it("删除早于给定时间的条目并返回删除数", () => {
      logger.info("old");
      vi.setSystemTime(FIXED_NOW + 60_000);
      logger.info("new");
      const removed = logger.cleanOldLogs(new Date(FIXED_NOW + 30_000));
      expect(removed).toBe(1);
      const { data } = logger.query();
      expect(data).toHaveLength(1);
      expect(data[0].message).toBe("new");
    });

    it("保留 timestamp >= olderThan 的边界条目", () => {
      logger.info("boundary");
      // 边界：olderThan 恰等于该条时间，应保留
      const removed = logger.cleanOldLogs(new Date(FIXED_NOW));
      expect(removed).toBe(0);
      expect(logger.query().total).toBe(1);
    });
  });

  describe("clear()", () => {
    it("清空所有日志", () => {
      logger.info("a");
      logger.error("b");
      expect(logger.query().total).toBe(2);
      logger.clear();
      expect(logger.query().total).toBe(0);
    });
  });

  // ==================== maxLogs 软上限驱逐 ====================

  describe("maxLogs 软上限", () => {
    it("超过 10000 条时裁剪至最近 10000 条（淘汰最早、保留最新）", () => {
      // 写入 10001 条，每条时间戳递增，使 desc 排序确定
      for (let i = 0; i < 10001; i++) {
        vi.setSystemTime(FIXED_NOW + i);
        logger.info(`m${i}`);
      }
      const all = logger.query({ pageSize: 10005 });
      expect(all.total).toBe(10000);
      // 最新一条 m10000 在 desc 首位
      expect(all.data[0].message).toBe("m10000");
      // 最早的 m0 已被淘汰
      expect(all.data.some((d) => d.message === "m0")).toBe(false);
      // m1 仍保留（slice(-10000) 保留 m1..m10000）
      expect(all.data.some((d) => d.message === "m1")).toBe(true);
    });
  });

  // ==================== createLoggerMiddleware() ====================

  describe("createLoggerMiddleware()", () => {
    it("成功请求：记录 access 日志并透传响应；从 headers 读取 ip/ua/requestId", async () => {
      const mw = createLoggerMiddleware();
      const request = new Request("http://localhost/api/x", {
        method: "POST",
        headers: {
          "x-forwarded-for": "9.9.9.9",
          "user-agent": "vitest-ua",
          "x-request-id": "req-abc",
        },
      });
      const next = vi.fn(async () => {
        vi.advanceTimersByTime(42);
        return { status: 201 } as unknown as Response;
      });

      const res = await mw(request, next);
      expect(res).toEqual({ status: 201 });
      expect(next).toHaveBeenCalledTimes(1);

      const entry = logger.query().data[0];
      expect(entry.type).toBe("access");
      expect(entry.method).toBe("POST");
      expect(entry.path).toBe("/api/x");
      expect(entry.statusCode).toBe(201);
      expect(entry.level).toBe("info"); // 201 < 400
      expect(entry.ipAddress).toBe("9.9.9.9");
      expect(entry.userAgent).toBe("vitest-ua");
      expect(entry.requestId).toBe("req-abc");
      expect(entry.duration).toBe(42);
    });

    it("next 抛错：记录 error 日志并重新抛出", async () => {
      const mw = createLoggerMiddleware();
      const request = new Request("http://localhost/api/y", {
        method: "GET",
        headers: { "x-request-id": "req-err" },
      });
      const boom = new Error("boom");
      const next = vi.fn(async () => {
        throw boom;
      });

      await expect(mw(request, next)).rejects.toThrow("boom");

      const entry = logger.query().data[0];
      expect(entry.level).toBe("error");
      expect(entry.type).toBe("error");
      expect(entry.message).toContain("GET /api/y");
      expect(entry.requestId).toBe("req-err");
      expect(entry.details).toBe(boom);
    });

    it("缺省 headers：requestId 自动生成 `req_...`、ipAddress 回退 unknown", async () => {
      const mw = createLoggerMiddleware();
      const request = new Request("http://localhost/api/z", { method: "GET" });
      const next = vi.fn(async () => ({ status: 200 } as unknown as Response));

      await mw(request, next);
      const entry = logger.query().data[0];
      expect(entry.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(entry.ipAddress).toBe("unknown");
      expect(entry.userAgent).toBe("unknown");
    });
  });

  // ==================== defaultLogRotationConfig ====================

  describe("defaultLogRotationConfig", () => {
    it("默认值：10MB / 10 文件 / 30 天 / 压缩", () => {
      expect(defaultLogRotationConfig.maxSize).toBe(10 * 1024 * 1024);
      expect(defaultLogRotationConfig.maxFiles).toBe(10);
      expect(defaultLogRotationConfig.maxAge).toBe(30);
      expect(defaultLogRotationConfig.compress).toBe(true);
    });
  });

  // ==================== 控制台镜像分发 ====================

  describe("consoleOutput 分发", () => {
    it("info 日志调用 console.info 且前缀含 [LEVEL]/[type]", () => {
      logger.info("hi", { type: "system" });
      expect(console.info).toHaveBeenCalledTimes(1);
      const args = (console.info as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[0]).toContain("[INFO]");
      expect(args[0]).toContain("[system]");
      expect(args[1]).toBe("hi");
    });

    it("error/fatal 调用 console.error", () => {
      logger.error("e1");
      logger.fatal("f1");
      expect(console.error).toHaveBeenCalledTimes(2);
    });
  });
});
