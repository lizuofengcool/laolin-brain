/**
 * faces/groups/merge 路由 handler 级集成测试（POST 合并人脸分组）
 *
 * 锁定租户隔离契约 + 合并事务控制流。该路由使用 `db` 直接访问（未走 createTenantDb），
 * 但目标分组与源分组均以 `userId + tenantId` 双键校验，多租户用户无法越权合并他租户分组。
 * 审计确认无跨租户越权 bug；本测试守护该契约防回归。
 *
 * 覆盖：
 *   - 未认证 → 401 透传 authenticateRequest，不触达 DB。
 *   - 参数校验：sourceGroupIds 缺失/非数组/空数组 → 400；targetGroupId 缺失/非字符串 → 400；
 *     targetGroupId ∈ sourceGroupIds → 400。
 *   - 租户隔离：目标分组不存在 / userId 不匹配 / tenantId 不匹配 → 404，不触达 findMany/$transaction。
 *   - 源分组校验：findMany 返回数量与 sourceGroupIds 不一致 → 404 含缺失 id，不触达 $transaction。
 *   - 成功：$transaction 回调以 tx 执行；每源分组 updateMany({where:{groupId:src.id},data:{groupId:target}})
 *     + delete({where:{id:src.id}})；totalMovedFaces 聚合 updateMany.count；响应字段透传。
 *   - 名称继承：目标 name 为空且某源分组有 name → tx.faceGroup.update 写入 name。
 *   - 缩略图更新：合并后 max-count fileId 与原 thumbnail 不同 → tx.faceGroup.update 写入 thumbnail；
 *     相同则不更新。
 *   - $transaction 抛错 → 500。
 *
 * 复用 faces-groups-id-route.test.ts 的 vi.hoisted 共享 MockNextResponse 范式；
 * $transaction mock 透传 mockTx 给回调（与真实 Prisma 行为一致）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockGroupFindUnique,
  mockGroupFindMany,
  mockTx,
  mockInstanceUpdateMany,
  mockGroupDelete,
  mockInstanceFindMany,
  mockGroupUpdate,
  mockTransaction,
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
  // 事务 tx 代理：$transaction(fn) 透传 mockTx 给 fn
  const tx = {
    faceInstance: {
      updateMany: (...args: unknown[]) => mockInstanceUpdateMany(...args),
      findMany: (...args: unknown[]) => mockInstanceFindMany(...args),
    },
    faceGroup: {
      delete: (...args: unknown[]) => mockGroupDelete(...args),
      update: (...args: unknown[]) => mockGroupUpdate(...args),
    },
  };
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockGroupFindUnique: vi.fn(),
    mockGroupFindMany: vi.fn(),
    mockTx: tx,
    mockInstanceUpdateMany: vi.fn(),
    mockGroupDelete: vi.fn(),
    mockInstanceFindMany: vi.fn(),
    mockGroupUpdate: vi.fn(),
    mockTransaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    faceGroup: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
      findMany: (...args: unknown[]) => mockGroupFindMany(...args),
    },
    $transaction: (fn: (t: typeof mockTx) => Promise<unknown>) => mockTransaction(fn),
  },
}));

import { POST } from "@/app/api/faces/groups/merge/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

// 目标分组（当前租户、当前用户、有名称、有缩略图）
const targetGroup = {
  id: "grp-target",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "人物A",
  thumbnail: "file-thumb",
  createdAt: new Date("2026-06-29T00:00:00.000Z"),
  updatedAt: new Date("2026-06-29T00:00:00.000Z"),
  faces: [],
};

// 单个源分组（当前租户、当前用户、无名称）
const sourceGroupA = {
  id: "grp-src-a",
  tenantId: "tenant-1",
  userId: "user-1",
  name: null,
  thumbnail: "file-a",
  createdAt: new Date("2026-06-29T00:00:00.000Z"),
  updatedAt: new Date("2026-06-29T00:00:00.000Z"),
  faces: [],
};

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/faces/groups/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("/api/faces/groups/merge 路由 POST（合并人脸分组）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // clearAllMocks 会清掉 hoisted 工厂里的 mockTransaction 实现，这里重建透传
    mockTransaction.mockImplementation(
      async (fn: (t: typeof mockTx) => Promise<unknown>) => fn(mockTx)
    );
    mockGroupFindUnique.mockResolvedValue({ ...targetGroup, faces: [] });
    mockGroupFindMany.mockResolvedValue([{ ...sourceGroupA, faces: [] }]);
    mockInstanceUpdateMany.mockResolvedValue({ count: 0 });
    mockGroupDelete.mockResolvedValue(undefined);
    mockInstanceFindMany.mockResolvedValue([]);
    mockGroupUpdate.mockResolvedValue(undefined);
  });

  // ---- 认证 ----

  it("未认证 → 401 透传 authenticateRequest，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockGroupFindUnique).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ---- 参数校验 ----

  it("sourceGroupIds 缺失 → 400 '源分组ID列表不能为空'", async () => {
    const res = (await POST(makeRequest({ targetGroupId: "grp-target" }))) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "源分组ID列表不能为空" });
    expect(mockGroupFindUnique).not.toHaveBeenCalled();
  });

  it("sourceGroupIds 非数组 → 400 '源分组ID列表不能为空'", async () => {
    const res = (await POST(
      makeRequest({ sourceGroupIds: "grp-src-a", targetGroupId: "grp-target" })
    )) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "源分组ID列表不能为空" });
  });

  it("sourceGroupIds 空数组 → 400 '源分组ID列表不能为空'", async () => {
    const res = (await POST(
      makeRequest({ sourceGroupIds: [], targetGroupId: "grp-target" })
    )) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "源分组ID列表不能为空" });
  });

  it("targetGroupId 缺失 → 400 '目标分组ID不能为空'", async () => {
    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"] })
    )) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "目标分组ID不能为空" });
  });

  it("targetGroupId 非字符串 → 400 '目标分组ID不能为空'", async () => {
    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: 123 })
    )) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "目标分组ID不能为空" });
  });

  it("targetGroupId ∈ sourceGroupIds → 400 '目标分组不能在源分组列表中'", async () => {
    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-target"], targetGroupId: "grp-target" })
    )) as MockRes;
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "目标分组不能在源分组列表中" });
    expect(mockGroupFindUnique).not.toHaveBeenCalled();
  });

  // ---- 租户隔离：目标分组校验 ----

  it("目标分组不存在（findUnique 返回 null）→ 404，不触达 findMany/$transaction", async () => {
    mockGroupFindUnique.mockResolvedValue(null);

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "目标分组不存在或无权访问" });
    expect(mockGroupFindUnique).toHaveBeenCalledWith({
      where: { id: "grp-target" },
      include: { faces: true },
    });
    expect(mockGroupFindMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("目标分组 userId 不匹配 → 404（租户隔离）", async () => {
    mockGroupFindUnique.mockResolvedValue({ ...targetGroup, userId: "other-user" });

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "目标分组不存在或无权访问" });
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  it("目标分组 tenantId 不匹配 → 404（跨租户隔离）", async () => {
    mockGroupFindUnique.mockResolvedValue({ ...targetGroup, tenantId: "tenant-other" });

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "目标分组不存在或无权访问" });
    expect(mockGroupFindMany).not.toHaveBeenCalled();
  });

  // ---- 源分组校验 ----

  it("源分组 findMany 返回数量不一致 → 404 含缺失 id，不触达 $transaction", async () => {
    // 请求 2 个源分组，findMany 仅返回 1 个
    mockGroupFindMany.mockResolvedValue([{ ...sourceGroupA, faces: [] }]);

    const res = (await POST(
      makeRequest({
        sourceGroupIds: ["grp-src-a", "grp-missing"],
        targetGroupId: "grp-target",
      })
    )) as MockRes;

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: "部分分组不存在或无权访问: grp-missing",
    });
    // findMany 以 { id: { in: [...] }, userId, tenantId } 双键过滤
    expect(mockGroupFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["grp-src-a", "grp-missing"] }, userId: "user-1", tenantId: "tenant-1" },
      include: { faces: true },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ---- 成功路径 ----

  it("成功 → $transaction 执行 updateMany+delete per 源分组，响应字段透传", async () => {
    mockInstanceUpdateMany.mockResolvedValue({ count: 3 });
    mockInstanceFindMany.mockResolvedValue([]); // 目标无 faces → 不更新缩略图

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(200);
    // 事务内：每源分组 updateMany 把 groupId 改为 targetGroupId
    expect(mockInstanceUpdateMany).toHaveBeenCalledWith({
      where: { groupId: "grp-src-a" },
      data: { groupId: "grp-target" },
    });
    expect(mockGroupDelete).toHaveBeenCalledWith({ where: { id: "grp-src-a" } });
    expect(res.body).toEqual({
      success: true,
      message: "成功合并 1 个分组，移动 3 张人脸",
      targetGroupId: "grp-target",
      mergedGroups: 1,
      movedFaces: 3,
    });
  });

  it("成功 → totalMovedFaces 聚合多源分组 updateMany.count", async () => {
    const srcB = { ...sourceGroupA, id: "grp-src-b" };
    mockGroupFindMany.mockResolvedValue([
      { ...sourceGroupA, faces: [] },
      { ...srcB, faces: [] },
    ]);
    // 第一次 updateMany 返回 2，第二次返回 5 → 总 7
    mockInstanceUpdateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 5 });
    mockInstanceFindMany.mockResolvedValue([]);

    const res = (await POST(
      makeRequest({
        sourceGroupIds: ["grp-src-a", "grp-src-b"],
        targetGroupId: "grp-target",
      })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mergedGroups: 2, movedFaces: 7 });
    expect(mockInstanceUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockGroupDelete).toHaveBeenCalledTimes(2);
  });

  // ---- 名称继承 ----

  it("目标 name 为空且某源分组有 name → tx.faceGroup.update 写入源名称", async () => {
    mockGroupFindUnique.mockResolvedValue({ ...targetGroup, name: null });
    mockGroupFindMany.mockResolvedValue([
      { ...sourceGroupA, name: "继承名称", faces: [] },
    ]);
    mockInstanceFindMany.mockResolvedValue([]); // 不更新缩略图

    await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    );

    // 名称继承 update
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: "grp-target" },
      data: { name: "继承名称" },
    });
  });

  it("目标已有 name → 不触发名称继承 update", async () => {
    // targetGroup.name = "人物A"（默认非空）
    mockInstanceFindMany.mockResolvedValue([]);

    await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    );

    // 仅可能有的缩略图 update；此处 allFaces 为空 → 无任何 update
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  // ---- 缩略图更新 ----

  it("合并后 max-count fileId 与原 thumbnail 不同 → tx.faceGroup.update 写入新缩略图", async () => {
    mockInstanceFindMany.mockResolvedValue([
      { fileId: "new-thumb" },
      { fileId: "new-thumb" },
      { fileId: "file-thumb" }, // 原 thumbnail，count=1 < new-thumb count=2
    ]);

    await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    );

    expect(mockInstanceFindMany).toHaveBeenCalledWith({
      where: { groupId: "grp-target" },
      select: { fileId: true },
    });
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: "grp-target" },
      data: { thumbnail: "new-thumb" },
    });
  });

  it("合并后 max-count fileId 与原 thumbnail 相同 → 不更新缩略图", async () => {
    mockInstanceFindMany.mockResolvedValue([
      { fileId: "file-thumb" }, // 原 thumbnail，唯一 fileId count=1
    ]);

    await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    );

    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  // ---- 错误兜底 ----

  it("$transaction 抛错 → 500 '合并分组失败'", async () => {
    mockTransaction.mockRejectedValue(new Error("tx down"));

    const res = (await POST(
      makeRequest({ sourceGroupIds: ["grp-src-a"], targetGroupId: "grp-target" })
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "合并分组失败" });
  });
});
