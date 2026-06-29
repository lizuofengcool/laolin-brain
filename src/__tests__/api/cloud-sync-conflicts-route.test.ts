/**
 * cloud-sync/conflicts 路由 handler 级集成测试
 *
 * 锁定 /api/cloud-sync/conflicts GET / POST 两个 handler 的安全与控制流契约：
 *
 * GET：
 *   - 未认证 → 401 透传，不触达 getConflictFiles
 *   - 成功 → getConflictFiles(auth.tenantId) 调用，返回 { success: true, data: conflicts }
 *   - getConflictFiles 抛错 → 500 { error: <message> }
 *
 * POST（三分支分发：auto 优先 → fileId+resolution → 400）：
 *   - 未认证 → 401 透传，不触达任一冲突解决服务
 *   - auto=true → resolveConflictsAuto(tenantId, userId, password, 'last_write_wins')，
 *     返回 { success: true, data: { resolved } }；strategy 路由 hardcode 为 'last_write_wins'（非 body 可配）
 *   - fileId+resolution（无 auto）→ resolveConflict(tenantId, userId, fileId, resolution, password)，
 *     返回 { success: true, message: '冲突已解决' }
 *   - auto=false + fileId+resolution → 仍走单分支（auto=false 是 falsy，落 else if）
 *   - 既无 auto 也无 fileId/resolution → 400 { error: '请提供fileId和resolution，或设置auto为true' }
 *   - resolveConflictsAuto 抛错 → 500
 *   - resolveConflict 抛错 → 500
 *   - body.tenantId/userId 被忽略（可信身份只来自 auth），resolveConflict 仍以 auth.tenantId/userId 调用
 *
 * Mock 策略：authenticateRequest / sync-engine / next/server 全部隔离，不触达真实数据库与对象存储。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 cloud-sync-config-route
 * 与 saas-subscription-route 的 vi.hoisted + MockNextResponse 范式。
 *
 * 未锁定的潜在逻辑空隙（记录备查，不立项）：
 * - auto=true 但 password 缺失时，路由不校验 password，直接以 password=undefined 透传
 *   resolveConflictsAuto。本轮不锁此 password=undefined 透传行为（避免锁定潜在 buggy 行为
 *   阻碍后续修复）。若立项修复需先确认业务规则（是否应在 auto 分支也校验 password 非空）。
 * - fileId+resolution 但 password 缺失时，同理不校验直接透传 resolveConflict。
 *   本轮不锁此透传行为，原因同上。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGetConflictFiles,
  mockResolveConflict,
  mockResolveConflictsAuto,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body?: unknown, init?: { status?: number } | undefined) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number } | undefined) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockGetConflictFiles: vi.fn(),
    mockResolveConflict: vi.fn(),
    mockResolveConflictsAuto: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/cloud-sync/sync-engine", () => ({
  getConflictFiles: (...args: unknown[]) => mockGetConflictFiles(...args),
  resolveConflict: (...args: unknown[]) => mockResolveConflict(...args),
  resolveConflictsAuto: (...args: unknown[]) => mockResolveConflictsAuto(...args),
}));

import { GET, POST } from "@/app/api/cloud-sync/conflicts/route";

function makeRequest(url: string, method: string = "GET", body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const sampleConflicts = [
  {
    id: "file-1",
    fileName: "doc.pdf",
    fileSize: 1024,
    updatedAt: new Date("2026-06-29T00:00:00Z"),
    fileHash: "abc123",
  },
];

describe("cloud-sync/conflicts 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
    mockGetConflictFiles.mockResolvedValue(sampleConflicts);
    mockResolveConflict.mockResolvedValue(undefined);
    mockResolveConflictsAuto.mockResolvedValue(2);
  });

  describe("GET /api/cloud-sync/conflicts", () => {
    it("未认证 → 401 透传，不触达 getConflictFiles", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/conflicts"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetConflictFiles).not.toHaveBeenCalled();
    });

    it("成功 → getConflictFiles(auth.tenantId)，返回 { success, data }", async () => {
      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/conflicts"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: sampleConflicts });
      expect(mockGetConflictFiles).toHaveBeenCalledWith("tenant-1");
    });

    it("getConflictFiles 抛错 → 500 { error: <message> }", async () => {
      mockGetConflictFiles.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/cloud-sync/conflicts"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "db down" });
    });
  });

  describe("POST /api/cloud-sync/conflicts", () => {
    it("未认证 → 401 透传，不触达任一冲突解决服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", { auto: true, password: "p" })
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockResolveConflict).not.toHaveBeenCalled();
      expect(mockResolveConflictsAuto).not.toHaveBeenCalled();
    });

    it("auto=true → resolveConflictsAuto(tenantId, userId, password, 'last_write_wins')，返回 { resolved }", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          auto: true,
          password: "p@ssw0rd",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { resolved: 2 } });
      // strategy 路由 hardcode 为 'last_write_wins'（非 body 可配）
      expect(mockResolveConflictsAuto).toHaveBeenCalledWith("tenant-1", "user-1", "p@ssw0rd", "last_write_wins");
      // auto 分支不触达单文件解决
      expect(mockResolveConflict).not.toHaveBeenCalled();
    });

    it("fileId+resolution（无 auto）→ resolveConflict 全参透传，返回 冲突已解决", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          fileId: "file-1",
          resolution: "local_wins",
          password: "p@ssw0rd",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "冲突已解决" });
      // 全参透传：tenantId/userId 来自 auth，fileId/resolution/password 来自 body
      expect(mockResolveConflict).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "file-1",
        "local_wins",
        "p@ssw0rd"
      );
      expect(mockResolveConflictsAuto).not.toHaveBeenCalled();
    });

    it("auto=false + fileId+resolution → 仍走单分支（auto=false 是 falsy）", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          auto: false,
          fileId: "file-1",
          resolution: "cloud_wins",
          password: "p@ssw0rd",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockResolveConflict).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "file-1",
        "cloud_wins",
        "p@ssw0rd"
      );
      expect(mockResolveConflictsAuto).not.toHaveBeenCalled();
    });

    it("既无 auto 也无 fileId/resolution → 400 请提供fileId和resolution", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {})
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "请提供fileId和resolution，或设置auto为true" });
      expect(mockResolveConflict).not.toHaveBeenCalled();
      expect(mockResolveConflictsAuto).not.toHaveBeenCalled();
    });

    it("仅 fileId 缺 resolution → 400（fileId && resolution 双条件）", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", { fileId: "file-1" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(mockResolveConflict).not.toHaveBeenCalled();
    });

    it("body 带 tenantId/userId → resolveConflict 仍以 auth.tenantId/userId 调用（忽略 body 注入）", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          fileId: "file-1",
          resolution: "keep_both",
          password: "p@ssw0rd",
          tenantId: "tenant-evil",
          userId: "user-evil",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      // 关键：tenantId/userId 用 auth 值，不取 body 注入
      expect(mockResolveConflict).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "file-1",
        "keep_both",
        "p@ssw0rd"
      );
    });

    it("resolveConflictsAuto 抛错 → 500", async () => {
      mockResolveConflictsAuto.mockRejectedValue(new Error("auto resolve failed"));

      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          auto: true,
          password: "p@ssw0rd",
        })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "auto resolve failed" });
    });

    it("resolveConflict 抛错 → 500", async () => {
      mockResolveConflict.mockRejectedValue(new Error("single resolve failed"));

      const res = (await POST(
        makeRequest("http://localhost/api/cloud-sync/conflicts", "POST", {
          fileId: "file-1",
          resolution: "local_wins",
          password: "p@ssw0rd",
        })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "single resolve failed" });
    });
  });
});
