/**
 * backups/[id]/restore 路由 POST handler 级集成测试
 *
 * 此前为零覆盖（schema 注释在 [id]/route.ts:11 提及 POST /api/backups/[id]/restore
 * 但 route.ts 未实现 restore handler；backup-tool.ts restoreBackup 已有逻辑可接入）。
 * 本轮新增 restore/route.ts 并补齐 handler 级测试。
 *
 * POST 行为契约（本轮锁定）：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 非 owner/admin 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst。
 *   - findFirst 返回 null → 404 { error: '备份不存在' }，findFirst 以 { id, tenantId }
 *     调用（租户隔离契约）。
 *   - status !== 'completed' → 400 { error: '仅已完成的备份可恢复' }，不触达 readFile。
 *   - filePath 缺失（null）→ 400 { error: '备份文件路径缺失，无法恢复' }。
 *   - filePath 越界（不在 ./backups 下）→ 400 { error: 'Invalid file path' }，
 *     不触达 readFile（前置阻断，与 DELETE 同范式）。
 *   - readFile 抛错（ENOENT 等）→ 500 { error: '恢复备份失败' }。
 *   - JSON.parse 失败 → 500 { error: '备份文件已损坏或格式无效' }。
 *   - restoreBackup 返回 success: false → 500 { success: false, error: '恢复过程中发生错误',
 *     details: result.errors }。
 *   - restoreBackup 抛错 → 500 { error: '恢复备份失败' }。
 *   - body.conflictStrategy 非法 → 400 { error: 'conflictStrategy 必须为...' }。
 *   - 成功（空 body）→ 200，restoreBackup 以 conflictStrategy='skip' 调用。
 *   - 成功（body.conflictStrategy='overwrite'）→ 200，策略透传。
 *   - admin 角色同样允许恢复（与 owner 同级权限）。
 *
 * 第二百零一轮：路由从 raw db.backup.* 收口至 TenantDb 隔离层（与 backups/[id] 路由
 * 同范式）。mock 策略同步迁移：createTenantDb 用 hand-written wrapper 模拟真实
 * TenantDb 的 tenantId 注入行为（backup where 末尾追加 tenantId）；raw db.backup
 * 独立 mock 供"路由不绕过 tenantDb"负向断言。
 *
 * 隔离策略：vi.hoisted 共享 MockNextResponse / mockAuthenticate / mockCreateTenantDb /
 * mockTenantBackupFindFirst / mockReadFile / mockRestoreBackup + raw db 负向断言 mock。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db（供"路由不绕过 tenantDb"负向断言：POST 不应触达 raw db.backup.*）
  mockRawBackupFindFirst,
  // tenantDb wrapper 注入 tenantId 后的实际承接方
  mockTenantBackupFindFirst,
  mockReadFile,
  mockRestoreBackup,
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
    mockCreateTenantDb: vi.fn(),
    mockRawBackupFindFirst: vi.fn(),
    mockTenantBackupFindFirst: vi.fn(),
    mockReadFile: vi.fn(),
    mockRestoreBackup: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：POST 不应触达（负向断言）。保留 backup.findFirst 供"路由不绕过 tenantDb"断言。
  db: {
    backup: {
      findFirst: (...args: unknown[]) => mockRawBackupFindFirst(...args),
    },
  },
  // createTenantDb：hand-written wrapper 模拟真实 TenantDb 的 tenantId 注入行为
  // （backup where 末尾追加 tenantId），与 tenant-db.ts backup getter 行为一致。
  createTenantDb: (tenantId: string) => {
    mockCreateTenantDb(tenantId);
    return {
      backup: {
        findFirst: (args: { where?: Record<string, unknown> }) =>
          mockTenantBackupFindFirst({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
    };
  },
}));
vi.mock("fs/promises", () => ({
  default: { readFile: (...args: unknown[]) => mockReadFile(...args) },
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock("@/lib/backup/backup-tool", () => ({
  restoreBackup: (...args: unknown[]) => mockRestoreBackup(...args),
}));

import { POST } from "@/app/api/backups/[id]/restore/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeRestoreRequest(backupId: string, body?: unknown): NextRequest {
  const url = `http://localhost/api/backups/${backupId}/restore`;
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init) as unknown as NextRequest;
}

function ctx(backupId: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: backupId }) };
}

type MockRes = InstanceType<typeof MockNextResponse>;

const backupDir = path.resolve("./backups");
const safeFilePath = path.join(backupDir, "tenant-1", "full-20260713.json");
const evilFilePath = "/etc/passwd";

// 一条 status=completed 的备份记录（含合法 filePath，由各测试按需覆盖）
function makeBackup(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk-1",
    tenantId: "tenant-1",
    userId: "user-1",
    name: "全量备份-20260713",
    type: "full",
    size: 1024,
    fileCount: 10,
    status: "completed",
    error: null,
    filePath: safeFilePath,
    createdAt: "2026-07-13T00:00:00.000Z",
    completedAt: "2026-07-13T01:00:00.000Z",
    ...overrides,
  };
}

// restoreBackup 成功返回（与 backup-tool.ts RestoreResult 形状一致）
function makeRestoreResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    restored: { files: 10, folders: 2, tags: 0, settings: 0, shares: 0 },
    skipped: 0,
    errors: [],
    totalDuration: 42,
    ...overrides,
  };
}

const sampleJson = JSON.stringify({
  version: "1.0.0",
  createdAt: "2026-07-13T00:00:00.000Z",
  type: "full",
  tenantId: "tenant-1",
  data: { files: [{ id: "f-1" }], folders: [] },
  metadata: { fileCount: 1, totalSize: 100, schemaVersion: "1.0.0" },
});

describe("/api/backups/[id]/restore 路由 POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup());
    mockReadFile.mockResolvedValue(sampleJson);
    mockRestoreBackup.mockResolvedValue(makeRestoreResult());
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    // 负向断言：路由不绕过 tenantDb 直接走 raw db
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
  });

  it("member 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
  });

  it("findFirst 返回 null → 404 { error: '备份不存在' }，findFirst 以 { id, tenantId } 调用（租户隔离）", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(null);

    const res = (await POST(
      makeRestoreRequest("bk-99"),
      ctx("bk-99")
    )) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "备份不存在" });
    expect(mockTenantBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-99", tenantId: "tenant-1" },
    });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("status !== 'completed'（running）→ 400 { error: '仅已完成的备份可恢复' }，不触达 readFile", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ status: "running" }));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "仅已完成的备份可恢复" });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("status='failed' 同样拒绝恢复 → 400", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ status: "failed" }));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "仅已完成的备份可恢复" });
  });

  it("filePath 缺失（null）→ 400 { error: '备份文件路径缺失，无法恢复' }", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ filePath: null }));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "备份文件路径缺失，无法恢复" });
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("filePath 越界（不在 ./backups 下）→ 400 { error: 'Invalid file path' }，不触达 readFile（前置阻断）", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ filePath: evilFilePath }));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid file path" });
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("readFile 抛错（ENOENT 等）→ 500 { error: '恢复备份失败' }", async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "恢复备份失败" });
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("JSON.parse 失败 → 500 { error: '备份文件已损坏或格式无效' }", async () => {
    mockReadFile.mockResolvedValue("not-json{{{");

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "备份文件已损坏或格式无效" });
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it("restoreBackup 返回 success: false → 500 { success: false, error: '恢复过程中发生错误', details }", async () => {
    mockRestoreBackup.mockResolvedValue(
      makeRestoreResult({
        success: false,
        errors: ["恢复文件失败: f-1 - boom"],
      })
    );

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: "恢复过程中发生错误",
      details: ["恢复文件失败: f-1 - boom"],
    });
  });

  it("restoreBackup 抛错 → 500 { error: '恢复备份失败' }", async () => {
    mockRestoreBackup.mockRejectedValue(new Error("db down"));

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "恢复备份失败" });
  });

  it("body.conflictStrategy 非法 → 400 { error: 'conflictStrategy 必须为...' }，不触达 findFirst", async () => {
    const res = (await POST(
      makeRestoreRequest("bk-1", { conflictStrategy: "delete" }),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "conflictStrategy 必须为 skip / overwrite / rename 之一",
    });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
  });

  it("成功（空 body）→ 200，restoreBackup 以 conflictStrategy='skip' 调用，readFile 以 resolvedPath+utf8 调用", async () => {
    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: makeRestoreResult(),
      message: "备份恢复已完成",
    });
    // createTenantDb 以 auth.tenantId 调用
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    // findFirst 以 { id } + tenantId（wrapper 注入）调用
    expect(mockTenantBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-1", tenantId: "tenant-1" },
    });
    // readFile 以解析后的绝对路径调用（路径遍历防护已通过）
    expect(mockReadFile).toHaveBeenCalledWith(safeFilePath, "utf8");
    // restoreBackup 以 parse 后的 JSON 对象 + skip 策略调用
    expect(mockRestoreBackup).toHaveBeenCalledWith(
      JSON.parse(sampleJson),
      { conflictStrategy: "skip", includeFiles: true, includeFolders: true }
    );
    // 负向断言：路由不绕过 tenantDb 直接走 raw db
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
  });

  it("成功（body.conflictStrategy='overwrite'）→ 200，策略透传至 restoreBackup", async () => {
    const res = (await POST(
      makeRestoreRequest("bk-1", { conflictStrategy: "overwrite" }),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(mockRestoreBackup).toHaveBeenCalledWith(
      JSON.parse(sampleJson),
      { conflictStrategy: "overwrite", includeFiles: true, includeFolders: true }
    );
  });

  it("admin 角色同样允许恢复（与 owner 同级权限）", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-3",
      email: "admin@example.com",
      tenantId: "tenant-1",
      role: "admin",
    });

    const res = (await POST(
      makeRestoreRequest("bk-1"),
      ctx("bk-1")
    )) as MockRes;

    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(mockRestoreBackup).toHaveBeenCalled();
  });

  it("空 body（非 JSON，被 catch）→ 默认 skip 策略，仍 200", async () => {
    // 构造一个 body 为空字符串的请求（request.json() 会抛 → 走 catch 默认 skip）
    const url = `http://localhost/api/backups/bk-1/restore`;
    const req = new Request(url, {
      method: "POST",
      body: "",
    }) as unknown as NextRequest;

    const res = (await POST(req, ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockRestoreBackup).toHaveBeenCalledWith(
      JSON.parse(sampleJson),
      { conflictStrategy: "skip", includeFiles: true, includeFolders: true }
    );
  });
});
