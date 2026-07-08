/**
 * activity-log 模块单测
 *
 * 锁定 src/lib/activity-log.ts 的行为契约：
 *   - logActivity：经 setImmediate 异步落库，details→JSON.stringify、缺省字段透传、
 *     db.create 失败走内层 catch（console.error 'Failed to log activity:'）不外抛。
 *   - getIpAddress：x-forwarded-for（多 IP 取首个 trim）优先于 x-real-ip，均无返回 'unknown'。
 *   - getUserAgent：user-agent header 缺省返回 'unknown'。
 *   - ActionType / ResourceType 常量键值锁定。
 *
 * 隔离策略：vi.mock('@/lib/db') 仅暴露 activityLog.create。logActivity 内 setImmediate
 * 将落库回调推迟到下一个事件循环，故每用例后 `await flushImmediate()`（再排一个
 * setImmediate）等待落库回调执行完毕后再断言。db.create 的 Promise.resolve/reject
 * 续体以微任务在 flushImmediate 的宏任务前 drain，断言时落库已发生。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ActivityLogData } from "@/lib/activity-log";

const { mockActivityLogCreate } = vi.hoisted(() => ({
  mockActivityLogCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    activityLog: {
      create: (...args: unknown[]) => mockActivityLogCreate(...args),
    },
  },
}));

import {
  logActivity,
  getIpAddress,
  getUserAgent,
  ActionType,
  ResourceType,
} from "@/lib/activity-log";

// 排一个 setImmediate 宏任务，等待 logActivity 内 setImmediate 落库回调执行完毕
function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test", { headers });
}

describe("logActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("完整字段透传，details 经 JSON.stringify", async () => {
    mockActivityLogCreate.mockResolvedValue({});
    const data: ActivityLogData = {
      userId: "u1",
      tenantId: "t1",
      action: "create",
      resourceType: "file",
      resourceId: "f1",
      details: { a: 1, b: "x" },
      ipAddress: "1.2.3.4",
      userAgent: "ua-1",
    };

    await logActivity(data);
    await flushImmediate();

    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
    expect(mockActivityLogCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        tenantId: "t1",
        action: "create",
        resourceType: "file",
        resourceId: "f1",
        details: JSON.stringify({ a: 1, b: "x" }),
        ipAddress: "1.2.3.4",
        userAgent: "ua-1",
      },
    });
  });

  it("resourceId 缺省 → undefined 透传（不入库为 null，由 schema 可空列承载）", async () => {
    mockActivityLogCreate.mockResolvedValue({});
    await logActivity({
      userId: "u1",
      tenantId: "t1",
      action: "login",
      resourceType: "user",
    });
    await flushImmediate();

    expect(mockActivityLogCreate.mock.calls[0][0].data.resourceId).toBeUndefined();
  });

  it("details 缺省 → null（三元 falsy 分支）", async () => {
    mockActivityLogCreate.mockResolvedValue({});
    await logActivity({
      userId: "u1",
      tenantId: "t1",
      action: "login",
      resourceType: "user",
    });
    await flushImmediate();

    expect(mockActivityLogCreate.mock.calls[0][0].data.details).toBeNull();
  });

  it("ipAddress / userAgent 缺省 → undefined 透传", async () => {
    mockActivityLogCreate.mockResolvedValue({});
    await logActivity({
      userId: "u1",
      tenantId: "t1",
      action: "login",
      resourceType: "user",
    });
    await flushImmediate();

    expect(mockActivityLogCreate.mock.calls[0][0].data.ipAddress).toBeUndefined();
    expect(mockActivityLogCreate.mock.calls[0][0].data.userAgent).toBeUndefined();
  });

  it("db.create reject → 内层 catch console.error('Failed to log activity:') 不外抛", async () => {
    const err = new Error("db down");
    mockActivityLogCreate.mockRejectedValue(err);

    await expect(
      logActivity({
        userId: "u1",
        tenantId: "t1",
        action: "login",
        resourceType: "user",
      })
    ).resolves.toBeUndefined();
    await flushImmediate();

    expect(console.error).toHaveBeenCalledWith("Failed to log activity:", err);
  });

  it("db.create 成功 → 不调用 console.error", async () => {
    mockActivityLogCreate.mockResolvedValue({ id: "log-1" });

    await logActivity({
      userId: "u1",
      tenantId: "t1",
      action: "login",
      resourceType: "user",
    });
    await flushImmediate();

    expect(console.error).not.toHaveBeenCalled();
  });

  it("返回 void（logActivity 不 await 落库，立即 resolve）", async () => {
    mockActivityLogCreate.mockResolvedValue({});
    const result = await logActivity({
      userId: "u1",
      tenantId: "t1",
      action: "login",
      resourceType: "user",
    });
    // flushImmediate 前落库尚未发生，证明 logActivity 未阻塞等待 db.create
    expect(mockActivityLogCreate).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    await flushImmediate();
    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
  });
});

describe("getIpAddress", () => {
  it("x-forwarded-for 单 IP 原样返回", () => {
    expect(getIpAddress(makeRequest({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
  });

  it("x-forwarded-for 多 IP 取首个并 trim（', ' 分隔）", () => {
    expect(getIpAddress(makeRequest({ "x-forwarded-for": "1.2.3.4 , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("无 x-forwarded-for 有 x-real-ip → 返回 x-real-ip", () => {
    expect(getIpAddress(makeRequest({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("x-forwarded-for 优先于 x-real-ip", () => {
    expect(
      getIpAddress(
        makeRequest({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })
      )
    ).toBe("1.1.1.1");
  });

  it("两者均无 → 'unknown'", () => {
    expect(getIpAddress(makeRequest())).toBe("unknown");
  });
});

describe("getUserAgent", () => {
  it("user-agent 存在 → 原样返回", () => {
    expect(getUserAgent(makeRequest({ "user-agent": "Mozilla/5.0" }))).toBe("Mozilla/5.0");
  });

  it("user-agent 缺省 → 'unknown'", () => {
    expect(getUserAgent(makeRequest())).toBe("unknown");
  });
});

describe("ActionType 常量", () => {
  it("锁定 12 个操作类型键值", () => {
    expect(ActionType).toEqual({
      CREATE: "create",
      UPDATE: "update",
      DELETE: "delete",
      DOWNLOAD: "download",
      UPLOAD: "upload",
      SHARE: "share",
      LOGIN: "login",
      LOGOUT: "logout",
      VIEW: "view",
      SEARCH: "search",
      EXPORT: "export",
      IMPORT: "import",
    });
    expect(Object.keys(ActionType).length).toBe(12);
  });
});

describe("ResourceType 常量", () => {
  it("锁定 7 个资源类型键值", () => {
    expect(ResourceType).toEqual({
      FILE: "file",
      FOLDER: "folder",
      USER: "user",
      TENANT: "tenant",
      SETTING: "setting",
      SHARE: "share",
      TAG: "tag",
    });
    expect(Object.keys(ResourceType).length).toBe(7);
  });
});
