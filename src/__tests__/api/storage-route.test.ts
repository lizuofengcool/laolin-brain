/**
 * storage 路由 handler 级集成测试
 *
 * 锁定 /api/storage 路由层（GET）的安全与计算契约：
 *
 * 核心安全契约：存储分析是个人级数据，所有 db.file / db.folder 调用的 where 恒以
 * (userId, tenantId) 双键作用域（与 access-history 一致、与 system-logs 的单键 + role
 * 门控对照）。路由 `const { userId, tenantId, role } = auth` 解构 role 但全文未引用，
 * 故 member 亦可读自己的存储分析——这是有意设计（存储配额按用户消费归属，admin 也不
 * 应看他人占用），测试通过"member 仍可读"用例显式锁定，防止后续误加 role 门控。
 *
 *   - GET type=overview（默认）：
 *     · 未认证 401 透传，不触达 DB。
 *     · file.aggregate where {userId,tenantId,isDeleted:false}（_count.id/_sum.fileSize）；
 *       folder.count where {userId,tenantId}（无 isDeleted，folder 无删除标记）；
 *       file.count where {userId,tenantId,isDeleted:true}（回收站，isDeleted 取反）；
 *       tenant.findUnique where {id:tenantId} select storageQuota+aiQuota。
 *     · 计算契约：totalStorage=Number(_sum.fileSize||0)；storageQuota=Number(tenant?.storageQuota||10GB)；
 *       usagePercent=Math.min(100, total/quota*100)（封顶 100）；remainingStorage=Math.max(0, quota-total)（封底 0）。
 *     · tenant 为 null → storageQuota 默认 10GB；_sum.fileSize 为 null → totalStorage=0。
 *     · type 未知 → fallthrough 到 overview（default 分支）。
 *     · aggregate 抛错 → 500 { error: '存储分析失败' }。
 *   - GET type=by-type：
 *     · file.findMany where {userId,tenantId,isDeleted:false} select fileType+fileSize；
 *       fileType 为 null/空 → 归类 'other'；按 size 降序；countPercent/sizePercent 计算。
 *     · 文件列表空 → data=[] / total.count=0 / total.size=0（不报错）。
 *   - GET type=large-files：
 *     · file.count where {userId,tenantId,isDeleted:false}；file.findMany orderBy fileSize desc、
 *       skip=(page-1)*pageSize、take=pageSize、select 7 字段；totalPages=Math.ceil(total/pageSize)；
 *       hasMore=page*pageSize<total。
 *     · page/pageSize/limit 默认 20；pageSize 与 limit 上限 100 截断。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileAggregate,
  mockFileCount,
  mockFileFindMany,
  mockFolderCount,
  mockTenantFindUnique,
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
    mockFileAggregate: vi.fn(),
    mockFileCount: vi.fn(),
    mockFileFindMany: vi.fn(),
    mockFolderCount: vi.fn(),
    mockTenantFindUnique: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    file: {
      aggregate: (...args: unknown[]) => mockFileAggregate(...args),
      count: (...args: unknown[]) => mockFileCount(...args),
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
    },
    folder: {
      count: (...args: unknown[]) => mockFolderCount(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
  },
}));

import { GET } from "@/app/api/storage/route";

const DEFAULT_GB = 10 * 1024 * 1024 * 1024;

// 默认 owner 身份（逐用例按需覆盖 role）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/storage${query}`;
  return new Request(url) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

describe("/api/storage 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("GET type=overview（默认）", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockFileAggregate).not.toHaveBeenCalled();
      expect(mockFolderCount).not.toHaveBeenCalled();
      expect(mockFileCount).not.toHaveBeenCalled();
      expect(mockTenantFindUnique).not.toHaveBeenCalled();
    });

    it("默认 type=overview → 四个 DB 调用 where 形状正确（双键 + isDeleted 取反）；返回 7 字段", async () => {
      mockFileAggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: { fileSize: 1024 },
      });
      mockFolderCount.mockResolvedValue(2);
      mockFileCount.mockResolvedValue(3);
      mockTenantFindUnique.mockResolvedValue({
        storageQuota: 100 * 1024 * 1024 * 1024,
        aiQuota: 1000,
      });

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      // 核心契约：file.aggregate where 双键 + isDeleted:false
      expect(mockFileAggregate.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: false },
        _count: { id: true },
        _sum: { fileSize: true },
      });
      // folder.count where 双键（无 isDeleted，folder 无删除标记）
      expect(mockFolderCount.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1" },
      });
      // file.count where 双键 + isDeleted:true（回收站，取反）
      expect(mockFileCount.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: true },
      });
      // tenant.findUnique where {id:tenantId} 单键 + select
      expect(mockTenantFindUnique.mock.calls[0][0]).toEqual({
        where: { id: "tenant-1" },
        select: { storageQuota: true, aiQuota: true },
      });
      // 返回字段
      const body = res.body as Record<string, unknown>;
      expect(body).toEqual({
        totalFiles: 5,
        totalFolders: 2,
        totalStorage: 1024,
        storageQuota: 100 * 1024 * 1024 * 1024,
        usagePercent: (1024 / (100 * 1024 * 1024 * 1024)) * 100,
        remainingStorage: 100 * 1024 * 1024 * 1024 - 1024,
        deletedFiles: 3,
      });
    });

    it("显式 type=overview → 走 overview 分支（与默认等价）", async () => {
      mockFileAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { fileSize: null } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue(null);

      const res = (await GET(makeGetRequest("?type=overview"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockFileAggregate).toHaveBeenCalledTimes(1);
    });

    it("type 未知 → fallthrough 到 overview（default 分支）", async () => {
      mockFileAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { fileSize: null } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue(null);

      const res = (await GET(makeGetRequest("?type=unknown-type"))) as MockRes;

      expect(res.status).toBe(200);
      // 命中 overview 分支即 aggregate 被调用
      expect(mockFileAggregate).toHaveBeenCalledTimes(1);
      // by-type / large-files 分支不应被触发
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });

    it("tenant 为 null → storageQuota 默认 10GB；_sum.fileSize 为 null → totalStorage=0；usagePercent=0；remainingStorage=10GB", async () => {
      mockFileAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { fileSize: null } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue(null);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.totalStorage).toBe(0);
      expect(body.storageQuota).toBe(DEFAULT_GB);
      expect(body.usagePercent).toBe(0);
      expect(body.remainingStorage).toBe(DEFAULT_GB);
    });

    it("tenant.storageQuota=0（falsy）→ 走 || 默认 10GB；usagePercent 0（quota>0 分支）", async () => {
      mockFileAggregate.mockResolvedValue({ _count: { id: 1 }, _sum: { fileSize: 100 } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue({ storageQuota: 0, aiQuota: 0 });

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      // storageQuota=0 是 falsy → || 走 10GB 默认
      expect(body.storageQuota).toBe(DEFAULT_GB);
      // usagePercent = min(100, 100/10GB*100) ≈ 0
      expect(body.usagePercent).toBeCloseTo((100 / DEFAULT_GB) * 100, 10);
    });

    it("totalStorage 超过 quota → usagePercent 封顶 100；remainingStorage 封底 0", async () => {
      const quota = 1000;
      mockFileAggregate.mockResolvedValue({ _count: { id: 1 }, _sum: { fileSize: 5000 } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue({ storageQuota: quota, aiQuota: 0 });

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      // 原始 5000/1000*100 = 500，封顶 100
      expect(body.usagePercent).toBe(100);
      // 1000 - 5000 = -4000，封底 0
      expect(body.remainingStorage).toBe(0);
    });

    it("member 角色 → 仍可读自己的存储分析（role 未参与作用域，与 system-logs 不同）", async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: "member" });
      mockFileAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { fileSize: null } });
      mockFolderCount.mockResolvedValue(0);
      mockFileCount.mockResolvedValue(0);
      mockTenantFindUnique.mockResolvedValue(null);

      const res = (await GET(makeGetRequest())) as MockRes;

      // 核心契约：member 不被门控，仍以 (userId,tenantId) 双键读自己
      expect(res.status).toBe(200);
      expect(mockFileAggregate.mock.calls[0][0].where).toEqual({
        userId: "user-1",
        tenantId: "tenant-1",
        isDeleted: false,
      });
    });

    it("aggregate 抛错 → 500 { error: '存储分析失败' }", async () => {
      mockFileAggregate.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "存储分析失败" });
    });
  });

  describe("GET type=by-type", () => {
    it("file.findMany where 双键 + isDeleted:false，select fileType+fileSize；返回 data 按 size 降序 + countPercent/sizePercent + total", async () => {
      mockFileFindMany.mockResolvedValue([
        { fileType: "image", fileSize: 100 },
        { fileType: "image", fileSize: 300 },
        { fileType: "video", fileSize: 500 },
      ]);

      const res = (await GET(makeGetRequest("?type=by-type"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockFileFindMany.mock.calls[0][0]).toEqual({
        where: { userId: "user-1", tenantId: "tenant-1", isDeleted: false },
        select: { fileType: true, fileSize: true },
      });
      const body = res.body as {
        data: Array<{ type: string; count: number; size: number; countPercent: number; sizePercent: number }>;
        total: { count: number; size: number };
      };
      // 按 size 降序：video(500) > image(400)
      expect(body.data).toEqual([
        { type: "video", count: 1, size: 500, countPercent: (1 / 3) * 100, sizePercent: (500 / 900) * 100 },
        { type: "image", count: 2, size: 400, countPercent: (2 / 3) * 100, sizePercent: (400 / 900) * 100 },
      ]);
      expect(body.total).toEqual({ count: 3, size: 900 });
    });

    it("fileType 为 null → 归类 'other'（file.fileType || 'other' 锁定）", async () => {
      mockFileFindMany.mockResolvedValue([
        { fileType: null, fileSize: 100 },
        { fileType: "", fileSize: 50 },
      ]);

      const res = (await GET(makeGetRequest("?type=by-type"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { data: Array<{ type: string; count: number }> };
      // 两条 null/空 都归 'other'，合并为一条
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe("other");
      expect(body.data[0].count).toBe(2);
    });

    it("文件列表空 → data=[] / total.count=0 / total.size=0（reduce 不报错）", async () => {
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=by-type"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { data: unknown[]; total: { count: number; size: number } };
      expect(body.data).toEqual([]);
      expect(body.total).toEqual({ count: 0, size: 0 });
    });

    it("fileSize 为 null → size 累加按 0 处理（file.fileSize || 0 锁定）", async () => {
      mockFileFindMany.mockResolvedValue([
        { fileType: "doc", fileSize: null },
        { fileType: "doc", fileSize: 200 },
      ]);

      const res = (await GET(makeGetRequest("?type=by-type"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { data: Array<{ type: string; size: number }> };
      expect(body.data[0].type).toBe("doc");
      expect(body.data[0].size).toBe(200); // null+200=200
    });

    it("findMany 抛错 → 500 { error: '存储分析失败' }", async () => {
      mockFileFindMany.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest("?type=by-type"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "存储分析失败" });
    });
  });

  describe("GET type=large-files", () => {
    it("默认分页 → file.count + file.findMany where 双键+isDeleted:false；orderBy fileSize desc；skip=0/take=20；select 7 字段；totalPages/hasMore", async () => {
      mockFileCount.mockResolvedValue(5);
      mockFileFindMany.mockResolvedValue([{ id: "f1", fileName: "big.bin", fileSize: 9999 }]);

      const res = (await GET(makeGetRequest("?type=large-files"))) as MockRes;

      expect(res.status).toBe(200);
      const expectedWhere = { userId: "user-1", tenantId: "tenant-1", isDeleted: false };
      expect(mockFileCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      expect(mockFileFindMany.mock.calls[0][0]).toEqual({
        where: expectedWhere,
        orderBy: { fileSize: "desc" },
        skip: 0,
        take: 20,
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          createdAt: true,
          folderId: true,
          isFavorite: true,
        },
      });
      const body = res.body as {
        data: unknown[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.total).toBe(5);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(1); // ceil(5/20)=1
      expect(body.hasMore).toBe(false); // 1*20 < 5 → false
    });

    it("page=2&pageSize=2 → skip=2/take=2/totalPages=3/hasMore=true", async () => {
      mockFileCount.mockResolvedValue(5);
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=large-files&page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockFileFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as {
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3); // ceil(5/2)=3
      expect(body.hasMore).toBe(true); // 2*2 < 5 → true
    });

    it("pageSize 与 limit 上限 100 截断（pageSize=500→100, limit=500→100）", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileFindMany.mockResolvedValue([]);

      await GET(makeGetRequest("?type=large-files&pageSize=500&limit=500"));

      const findArg = mockFileFindMany.mock.calls[0][0] as { take: number };
      expect(findArg.take).toBe(100);
    });

    it("total=0 → totalPages=0 / hasMore=false（ceil(0/20)=0）", async () => {
      mockFileCount.mockResolvedValue(0);
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=large-files"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { totalPages: number; hasMore: boolean; data: unknown[] };
      expect(body.totalPages).toBe(0);
      expect(body.hasMore).toBe(false);
      expect(body.data).toEqual([]);
    });

    it("count 抛错 → 500 { error: '存储分析失败' }", async () => {
      mockFileCount.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest("?type=large-files"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "存储分析失败" });
    });
  });
});
