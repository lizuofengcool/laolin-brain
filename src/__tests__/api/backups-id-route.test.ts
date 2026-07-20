/**
 * backups/[id] 路由 GET / DELETE handler 级集成测试
 *
 * DELETE 此前为零覆盖（第一百四十八轮补齐），GET 此前仍为零覆盖（本轮补齐）。
 *
 * GET 行为契约（本轮锁定）：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 非 owner/admin 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst。
 *   - findFirst 返回 null → 404 { error: '备份不存在' }。
 *   - 成功 → 200 { success: true, data: { id,name,type,size,fileCount,status,
 *     error,filePath,createdAt,completedAt } }，findFirst 以 { id, tenantId } 调用（租户隔离）。
 *   - findFirst 抛错 → 500 { error: '获取备份详情失败' }。
 *
 * DELETE 行为契约（第一百四十八轮锁定）：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB。
 *   - 非 owner/admin 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst。
 *   - findFirst 返回 null → 404 { error: '备份不存在' }，不触达 delete。
 *   - status === 'running' → 400 { error: '备份正在进行中，无法删除' }，不触达 delete。
 *   - **路径遍历防护**：filePath 越界（不在 ./backups 目录下）→ 400
 *     { error: 'Invalid file path' }，不触达 delete / unlink（前置阻断，与
 *     files/[id] DELETE 的 upload 目录前缀校验同范式）。
 *   - 成功（filePath=null）→ delete 以 { id } 调用，unlink 不触达，200
 *     { success: true, message: '备份已删除' }。
 *   - 成功（filePath 合法）→ delete + unlink(filePath)，200。
 *   - unlink 抛错（ENOENT 等）→ best-effort catch，仍 200（DB 记录已删除，
 *     文件缺失不应阻断响应）。
 *   - delete 抛错 → 500 { error: '删除备份失败' }。
 *
 * 第二百零一轮：路由从 raw db.backup.* 收口至 TenantDb 隔离层（与 files-id-route
 * 同范式）。mock 策略同步迁移：createTenantDb 用 hand-written wrapper 模拟真实
 * TenantDb 的 tenantId 注入行为（backup where 末尾追加 tenantId）；raw db.backup
 * 独立 mock 供"路由不绕过 tenantDb"负向断言。delete where 子句追加 tenantId
 * （wrapper 注入），与原 { id } 调用契约略变，但语义等价（deleteMany + tenantId
 * 守卫比 findFirst + delete 多一道防御）。
 *
 * 隔离策略：vi.hoisted 共享 MockNextResponse / mockAuthenticate / mockCreateTenantDb /
 * mockTenantBackupFindFirst / mockTenantBackupDelete / mockUnlink + raw db 负向断言 mock。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  // raw db（供"路由不绕过 tenantDb"负向断言：GET/DELETE 不应触达 raw db.backup.*）
  mockRawBackupFindFirst,
  mockRawBackupDelete,
  // tenantDb wrapper 注入 tenantId 后的实际承接方
  mockTenantBackupFindFirst,
  mockTenantBackupDelete,
  mockUnlink,
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
    mockRawBackupDelete: vi.fn(),
    mockTenantBackupFindFirst: vi.fn(),
    mockTenantBackupDelete: vi.fn(),
    mockUnlink: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  // raw db：GET/DELETE 不应触达（负向断言）。保留 backup.findFirst / delete 供
  // "路由不绕过 tenantDb"断言。
  db: {
    backup: {
      findFirst: (...args: unknown[]) => mockRawBackupFindFirst(...args),
      delete: (...args: unknown[]) => mockRawBackupDelete(...args),
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
        delete: (args: { where?: Record<string, unknown> }) =>
          mockTenantBackupDelete({
            ...args,
            where: { ...(args.where || {}), tenantId },
          }),
      },
    };
  },
}));
vi.mock("fs/promises", () => ({
  default: { unlink: (...args: unknown[]) => mockUnlink(...args) },
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

import { GET, DELETE } from "@/app/api/backups/[id]/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeDeleteRequest(backupId: string): NextRequest {
  const url = `http://localhost/api/backups/${backupId}`;
  return new Request(url, { method: "DELETE" }) as unknown as NextRequest;
}

function makeGetRequest(backupId: string): NextRequest {
  const url = `http://localhost/api/backups/${backupId}`;
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

function ctx(backupId: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: backupId }) };
}

type MockRes = InstanceType<typeof MockNextResponse>;

const backupDir = path.resolve("./backups");
const safeFilePath = path.join(backupDir, "tenant-1", "full-20260713.json");
const evilFilePath = "/etc/passwd";

// 一条 status=completed 的备份记录（含 filePath 字段，由各测试按需覆盖）
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
    filePath: null,
    createdAt: "2026-07-13T00:00:00.000Z",
    completedAt: "2026-07-13T01:00:00.000Z",
    ...overrides,
  };
}

describe("/api/backups/[id] 路由 DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup());
    mockTenantBackupDelete.mockResolvedValue({ count: 1 });
    mockUnlink.mockResolvedValue(undefined);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
    expect(mockTenantBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
    // 负向断言：路由不绕过 tenantDb 直接走 raw db
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
    expect(mockRawBackupDelete).not.toHaveBeenCalled();
  });

  it("member 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
    expect(mockTenantBackupDelete).not.toHaveBeenCalled();
  });

  it("findFirst 返回 null → 404 { error: '备份不存在' }，不触达 delete/unlink", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(null);

    const res = (await DELETE(makeDeleteRequest("bk-99"), ctx("bk-99"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "备份不存在" });
    // findFirst 以 { id } + tenantId（wrapper 注入）作用域（租户隔离）
    expect(mockTenantBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-99", tenantId: "tenant-1" },
    });
    expect(mockTenantBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("status === 'running' → 400 { error: '备份正在进行中，无法删除' }，不触达 delete/unlink", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ status: "running" }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "备份正在进行中，无法删除" });
    expect(mockTenantBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("filePath 越界（不在 ./backups 下）→ 400 { error: 'Invalid file path' }，不触达 delete/unlink（前置阻断）", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ filePath: evilFilePath }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid file path" });
    expect(mockTenantBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("成功（filePath=null）→ delete 以 { id, tenantId } 调用（wrapper 注入），unlink 不触达，200", async () => {
    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    // 第二百零一轮：delete where 追加 tenantId（wrapper 注入），比原 { id } 多一道
    // 租户守卫，语义等价但更安全（deleteMany + tenantId 守卫）
    expect(mockTenantBackupDelete).toHaveBeenCalledWith({
      where: { id: "bk-1", tenantId: "tenant-1" },
    });
    expect(mockUnlink).not.toHaveBeenCalled();
    // 负向断言：路由不绕过 tenantDb 直接走 raw db
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
    expect(mockRawBackupDelete).not.toHaveBeenCalled();
  });

  it("成功（filePath 合法）→ delete + unlink(filePath)，200", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ filePath: safeFilePath }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    expect(mockTenantBackupDelete).toHaveBeenCalledWith({
      where: { id: "bk-1", tenantId: "tenant-1" },
    });
    expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
  });

  it("unlink 抛错（ENOENT 等）→ best-effort catch，仍 200（DB 记录已删除，文件缺失不阻断响应）", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup({ filePath: safeFilePath }));
    mockUnlink.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    // delete 仍执行（unlink 错误被吞）
    expect(mockTenantBackupDelete).toHaveBeenCalledWith({
      where: { id: "bk-1", tenantId: "tenant-1" },
    });
    expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
  });

  it("delete 抛错 → 500 { error: '删除备份失败' }", async () => {
    mockTenantBackupDelete.mockRejectedValue(new Error("db down"));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "删除备份失败" });
    // delete 抛错前已通过路径校验，但 unlink 在 delete 之后，故 unlink 不触达
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});

describe("/api/backups/[id] 路由 GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockTenantBackupFindFirst.mockResolvedValue(makeBackup());
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await GET(makeGetRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
  });

  it("member 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await GET(makeGetRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockTenantBackupFindFirst).not.toHaveBeenCalled();
  });

  it("findFirst 返回 null → 404 { error: '备份不存在' }，findFirst 以 { id, tenantId } 调用（租户隔离）", async () => {
    mockTenantBackupFindFirst.mockResolvedValue(null);

    const res = (await GET(makeGetRequest("bk-99"), ctx("bk-99"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "备份不存在" });
    expect(mockTenantBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-99", tenantId: "tenant-1" },
    });
  });

  it("成功 → 200 { success: true, data: { 映射字段 } }，findFirst 以 { id, tenantId } 调用", async () => {
    const backup = makeBackup({
      filePath: safeFilePath,
      error: "上次错误信息",
    });

    mockTenantBackupFindFirst.mockResolvedValue(backup);

    const res = (await GET(makeGetRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        id: backup.id,
        name: backup.name,
        type: backup.type,
        size: backup.size,
        fileCount: backup.fileCount,
        status: backup.status,
        error: backup.error,
        filePath: backup.filePath,
        createdAt: backup.createdAt,
        completedAt: backup.completedAt,
      },
    });
    expect(mockTenantBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-1", tenantId: "tenant-1" },
    });
    // 负向断言：路由不绕过 tenantDb 直接走 raw db
    expect(mockRawBackupFindFirst).not.toHaveBeenCalled();
  });

  it("admin 角色同样允许获取详情（与 owner 同级权限）", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-3",
      email: "admin@example.com",
      tenantId: "tenant-1",
      role: "admin",
    });

    const res = (await GET(makeGetRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect(mockTenantBackupFindFirst).toHaveBeenCalled();
  });

  it("findFirst 抛错 → 500 { error: '获取备份详情失败' }", async () => {
    mockTenantBackupFindFirst.mockRejectedValue(new Error("db down"));

    const res = (await GET(makeGetRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "获取备份详情失败" });
  });
});
