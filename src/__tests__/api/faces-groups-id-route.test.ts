/**
 * faces/groups/[id] 路由 handler 级集成测试（PUT 重命名 / DELETE 删除）
 *
 * 锁定租户隔离契约（本轮修复重点）：原实现 `db.faceGroup.findUnique({ where: { id } })`
 * 仅按 id+userId 校验，多租户用户（同一 userId 属多个 tenant）可在任意租户上下文按 id
 * 越权重命名/删除他租户分组。修复后改走 `createTenantDb(tenantId)`，faceGroup.findFirst /
 * deleteMany 自动注入 tenantId，仅作用于当前租户。
 *
 * 覆盖：
 *   - 未认证 → 401 透传 authenticateRequest，不触达 DB。
 *   - PUT name 校验：空/非字符串 → 400 '名称不能为空'；超 100 字符 → 400 '名称不能超过100个字符'。
 *   - 分组不在当前租户（findFirst 返回 null）→ 404，update/deleteMany 不触达（租户隔离）。
 *   - 分组在租户但 userId 不匹配（非所有者）→ 404，update/deleteMany 不触达。
 *   - 成功 → createTenantDb 收到 auth.tenantId；findFirst 经 tenantDb 调用（非 db.faceGroup.findUnique）；
 *     PUT update 以 { where: { id }, data: { name } } 调用并回传 { id, name, updatedAt }；
 *     DELETE deleteMany 以 { where: { id } } 调用，返回 { success: true }。
 *   - update/deleteMany 抛错 → 500。
 *
 * 复用 faces-groups-route.test.ts 的 vi.hoisted 共享 MockNextResponse 范式；@/lib/db 同时
 * mock `db.faceGroup.update`（PUT 取回记录）与 `createTenantDb`（返回 tenantDb 代理）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateTenantDb,
  mockGroupFindFirst,
  mockGroupDeleteMany,
  mockGroupUpdate,
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
  // tenantDb 代理：route 经 createTenantDb(tenantId) 取得后调用其 faceGroup.findFirst/deleteMany
  const tenantDb = {
    faceGroup: {
      findFirst: (...args: unknown[]) => mockGroupFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockGroupDeleteMany(...args),
    },
  };
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockCreateTenantDb: vi.fn().mockReturnValue(tenantDb),
    mockGroupFindFirst: vi.fn(),
    mockGroupDeleteMany: vi.fn(),
    mockGroupUpdate: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    faceGroup: {
      update: (...args: unknown[]) => mockGroupUpdate(...args),
    },
  },
  createTenantDb: (...args: unknown[]) => mockCreateTenantDb(...args),
}));

import { PUT, DELETE } from "@/app/api/faces/groups/[id]/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条属当前租户、属当前用户的分组记录
const ownedGroup = {
  id: "grp-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "人物A",
  thumbnail: "file-1",
  createdAt: new Date("2026-06-29T00:00:00.000Z"),
  updatedAt: new Date("2026-06-29T00:00:00.000Z"),
};

function makePutRequest(id: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/faces/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeDeleteRequest(id: string): NextRequest {
  return new Request(`http://localhost/api/faces/groups/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/faces/groups/[id] 路由 PUT（重命名）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // clearAllMocks 会清掉 hoisted 工厂里设的 mockReturnValue，这里重建
    mockCreateTenantDb.mockReturnValue({
      faceGroup: {
        findFirst: (...args: unknown[]) => mockGroupFindFirst(...args),
        deleteMany: (...args: unknown[]) => mockGroupDeleteMany(...args),
      },
    });
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup });
    mockGroupUpdate.mockResolvedValue({
      id: "grp-1",
      name: "新名称",
      updatedAt: new Date("2026-07-09T00:00:00.000Z"),
    });
  });

  it("未认证 → 401 透传 authenticateRequest，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await PUT(makePutRequest("grp-1", { name: "x" }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("name 为空 → 400 '名称不能为空'，不触达 DB", async () => {
    const res = (await PUT(makePutRequest("grp-1", { name: "  " }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "名称不能为空" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("name 非字符串 → 400 '名称不能为空'", async () => {
    const res = (await PUT(makePutRequest("grp-1", { name: 123 }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "名称不能为空" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
  });

  it("name 超过 100 字符 → 400 '名称不能超过100个字符'", async () => {
    const res = (await PUT(makePutRequest("grp-1", { name: "x".repeat(101) }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "名称不能超过100个字符" });
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
  });

  it("分组不在当前租户（findFirst 返回 null）→ 404，update 不触达（租户隔离）", async () => {
    mockGroupFindFirst.mockResolvedValue(null);

    const res = (await PUT(makePutRequest("grp-x", { name: "新名称" }), ctx("grp-x"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分组不存在" });
    // 租户隔离：经 createTenantDb(tenantId) 调用 findFirst，而非 db.faceGroup.findUnique
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-x" } });
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("分组在租户但非所有者（userId 不匹配）→ 404，update 不触达", async () => {
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup, userId: "other-user" });

    const res = (await PUT(makePutRequest("grp-1", { name: "新名称" }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分组不存在" });
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("成功 → 200，update 以 { where:{id}, data:{name} } 调用，回传 { id, name, updatedAt }", async () => {
    const res = (await PUT(makePutRequest("grp-1", { name: "新名称" }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-1" } });
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: "grp-1" },
      data: { name: "新名称" },
    });
    expect(res.body).toEqual({
      id: "grp-1",
      name: "新名称",
      updatedAt: new Date("2026-07-09T00:00:00.000Z"),
    });
  });

  it("update 抛错 → 500 '更新分组失败'", async () => {
    mockGroupUpdate.mockRejectedValue(new Error("db down"));

    const res = (await PUT(makePutRequest("grp-1", { name: "新名称" }), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "更新分组失败" });
  });
});

describe("/api/faces/groups/[id] 路由 DELETE（删除）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockCreateTenantDb.mockReturnValue({
      faceGroup: {
        findFirst: (...args: unknown[]) => mockGroupFindFirst(...args),
        deleteMany: (...args: unknown[]) => mockGroupDeleteMany(...args),
      },
    });
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup });
    mockGroupDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("未认证 → 401 透传，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await DELETE(makeDeleteRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(401);
    expect(mockCreateTenantDb).not.toHaveBeenCalled();
    expect(mockGroupDeleteMany).not.toHaveBeenCalled();
  });

  it("分组不在当前租户（findFirst 返回 null）→ 404，deleteMany 不触达（租户隔离）", async () => {
    mockGroupFindFirst.mockResolvedValue(null);

    const res = (await DELETE(makeDeleteRequest("grp-x"), ctx("grp-x"))) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "分组不存在" });
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-x" } });
    expect(mockGroupDeleteMany).not.toHaveBeenCalled();
  });

  it("分组在租户但非所有者 → 404，deleteMany 不触达", async () => {
    mockGroupFindFirst.mockResolvedValue({ ...ownedGroup, userId: "other-user" });

    const res = (await DELETE(makeDeleteRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(404);
    expect(mockGroupDeleteMany).not.toHaveBeenCalled();
  });

  it("成功 → 200 { success: true }，deleteMany 以 { where: { id } } 调用", async () => {
    const res = (await DELETE(makeDeleteRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(200);
    expect(mockCreateTenantDb).toHaveBeenCalledWith("tenant-1");
    expect(mockGroupFindFirst).toHaveBeenCalledWith({ where: { id: "grp-1" } });
    expect(mockGroupDeleteMany).toHaveBeenCalledWith({ where: { id: "grp-1" } });
    expect(res.body).toEqual({ success: true });
  });

  it("deleteMany 抛错 → 500 '删除分组失败'", async () => {
    mockGroupDeleteMany.mockRejectedValue(new Error("db down"));

    const res = (await DELETE(makeDeleteRequest("grp-1"), ctx("grp-1"))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "删除分组失败" });
  });
});
