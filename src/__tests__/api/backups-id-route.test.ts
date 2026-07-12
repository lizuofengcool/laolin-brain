/**
 * backups/[id] 路由 DELETE handler 级集成测试
 *
 * 此前该路由 DELETE 为零覆盖。本轮为 DELETE 补齐行为契约锁定：
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
 * 隔离策略：vi.hoisted 共享 MockNextResponse / mockAuthenticate / mockBackupFindFirst /
 * mockBackupDelete / mockUnlink，使 `auth instanceof NextResponse` 命中且 fs/promises.unlink
 * 可断言。复用第三十轮 cloud-sync-config-route 与 backups-route GET 的 mock 范式。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockBackupFindFirst,
  mockBackupDelete,
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
    mockBackupFindFirst: vi.fn(),
    mockBackupDelete: vi.fn(),
    mockUnlink: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    backup: {
      findFirst: (...args: unknown[]) => mockBackupFindFirst(...args),
      delete: (...args: unknown[]) => mockBackupDelete(...args),
    },
  },
}));
vi.mock("fs/promises", () => ({
  default: { unlink: (...args: unknown[]) => mockUnlink(...args) },
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

import { DELETE } from "@/app/api/backups/[id]/route";

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
    mockBackupFindFirst.mockResolvedValue(makeBackup());
    mockBackupDelete.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockBackupFindFirst).not.toHaveBeenCalled();
    expect(mockBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
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
    expect(mockBackupFindFirst).not.toHaveBeenCalled();
    expect(mockBackupDelete).not.toHaveBeenCalled();
  });

  it("findFirst 返回 null → 404 { error: '备份不存在' }，不触达 delete/unlink", async () => {
    mockBackupFindFirst.mockResolvedValue(null);

    const res = (await DELETE(makeDeleteRequest("bk-99"), ctx("bk-99"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "备份不存在" });
    // findFirst 以 { id, tenantId } 作用域（租户隔离）
    expect(mockBackupFindFirst).toHaveBeenCalledWith({
      where: { id: "bk-99", tenantId: "tenant-1" },
    });
    expect(mockBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("status === 'running' → 400 { error: '备份正在进行中，无法删除' }，不触达 delete/unlink", async () => {
    mockBackupFindFirst.mockResolvedValue(makeBackup({ status: "running" }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "备份正在进行中，无法删除" });
    expect(mockBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("filePath 越界（不在 ./backups 下）→ 400 { error: 'Invalid file path' }，不触达 delete/unlink（前置阻断）", async () => {
    mockBackupFindFirst.mockResolvedValue(makeBackup({ filePath: evilFilePath }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid file path" });
    expect(mockBackupDelete).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("成功（filePath=null）→ delete 以 { id } 调用，unlink 不触达，200", async () => {
    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    expect(mockBackupDelete).toHaveBeenCalledWith({ where: { id: "bk-1" } });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("成功（filePath 合法）→ delete + unlink(filePath)，200", async () => {
    mockBackupFindFirst.mockResolvedValue(makeBackup({ filePath: safeFilePath }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    expect(mockBackupDelete).toHaveBeenCalledWith({ where: { id: "bk-1" } });
    expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
  });

  it("unlink 抛错（ENOENT 等）→ best-effort catch，仍 200（DB 记录已删除，文件缺失不阻断响应）", async () => {
    mockBackupFindFirst.mockResolvedValue(makeBackup({ filePath: safeFilePath }));
    mockUnlink.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "备份已删除" });
    // delete 仍执行（unlink 错误被吞）
    expect(mockBackupDelete).toHaveBeenCalledWith({ where: { id: "bk-1" } });
    expect(mockUnlink).toHaveBeenCalledWith(safeFilePath);
  });

  it("delete 抛错 → 500 { error: '删除备份失败' }", async () => {
    mockBackupDelete.mockRejectedValue(new Error("db down"));

    const res = (await DELETE(makeDeleteRequest("bk-1"), ctx("bk-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "删除备份失败" });
    // delete 抛错前已通过路径校验，但 unlink 在 delete 之后，故 unlink 不触达
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
