/**
 * access-history 路由 handler 级集成测试
 *
 * 锁定 /api/access-history 路由层（GET/POST/DELETE）的安全与权限契约：
 *
 * 核心安全契约（贯穿所有方法）：access-history 始终以 (tenantId, userId) 双键作用域，
 * 不区分角色——即便 admin/owner 也只能读写自己的访问历史。路由虽解构 role 但未使用，
 * 故所有 where 必须同时含 tenantId 与 userId（防多租户越权 + 防同租户内读他人历史）。
 *
 *   - GET：
 *     · 未认证 401 透传，不触达 DB。
 *     · type=recent（默认）/frequent：accessHistory.findMany 与 count 的 where 同时含
 *       tenantId+userId+accessType（默认 view）；recent 按 lastAccessedAt desc、frequent
 *       按 accessCount desc。file.findMany 的 where 含 `id:{in:fileIds}` 且以 tenantId
 *       作用域（防跨租户读文件元数据）；recent 分支过滤掉 fileMap 未命中的"未知文件"。
 *     · type=recent-uploaded / recent-modified：直接走 file.findMany/count，where 含
 *       tenantId+userId+isDeleted:false；uploaded 按 createdAt desc、modified 按 updatedAt desc。
 *     · accessType 过滤正确合并进 where；分页默认 page=1/pageSize=20、pageSize 上限 100；
 *       findMany 抛错 500 { error: '获取访问历史失败' }。
 *   - POST：
 *     · 未认证 401；缺 fileId 400 { error: 'fileId is required' }。
 *     · file.findFirst 以 { id:fileId, tenantId } 双键作用域（防跨租户文件登记），未命中 404。
 *     · 已有记录 → accessHistory.update increment accessCount；无记录 → create data 含
 *       tenantId+userId+fileId+accessType+accessCount:1。findFirst 查询以
 *       tenantId+userId+fileId+accessType 四键作用域（防串改他人记录）。
 *   - DELETE：
 *     · 带 fileId → deleteMany where 含 tenantId+userId+fileId；不带 → deleteMany where
 *       含 tenantId+userId（仅清自己的，绝不清租户全部他人历史）。
 *
 * 仅隔离 next/server / @/lib/api-auth / @/lib/db，复用第三十轮 cloud-sync-config-route 的
 * vi.hoisted 共享 MockNextResponse 范式（使路由 `auth instanceof NextResponse` 命中）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockAccessHistoryFindMany,
  mockAccessHistoryCount,
  mockAccessHistoryFindFirst,
  mockAccessHistoryUpdate,
  mockAccessHistoryCreate,
  mockAccessHistoryDeleteMany,
  mockFileFindMany,
  mockFileFindFirst,
  mockFileCount,
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
    mockAccessHistoryFindMany: vi.fn(),
    mockAccessHistoryCount: vi.fn(),
    mockAccessHistoryFindFirst: vi.fn(),
    mockAccessHistoryUpdate: vi.fn(),
    mockAccessHistoryCreate: vi.fn(),
    mockAccessHistoryDeleteMany: vi.fn(),
    mockFileFindMany: vi.fn(),
    mockFileFindFirst: vi.fn(),
    mockFileCount: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    accessHistory: {
      findMany: (...args: unknown[]) => mockAccessHistoryFindMany(...args),
      count: (...args: unknown[]) => mockAccessHistoryCount(...args),
      findFirst: (...args: unknown[]) => mockAccessHistoryFindFirst(...args),
      update: (...args: unknown[]) => mockAccessHistoryUpdate(...args),
      create: (...args: unknown[]) => mockAccessHistoryCreate(...args),
      deleteMany: (...args: unknown[]) => mockAccessHistoryDeleteMany(...args),
    },
    file: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
      findFirst: (...args: unknown[]) => mockFileFindFirst(...args),
      count: (...args: unknown[]) => mockFileCount(...args),
    },
  },
}));

import { GET, POST, DELETE } from "@/app/api/access-history/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makeGetRequest(query = ""): NextRequest {
  const url = `http://localhost/api/access-history${query}`;
  return new Request(url) as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/access-history", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as unknown as NextRequest;
}

function makeDeleteRequest(query = ""): NextRequest {
  const url = `http://localhost/api/access-history${query}`;
  return new Request(url, { method: "DELETE" }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

// 一条 accessHistory 记录 + 对应 file 元数据（供 recent/frequent 分支复用）
const historyRecord = {
  id: "ah-1",
  tenantId: "tenant-1",
  userId: "user-1",
  fileId: "file-1",
  accessType: "view",
  accessCount: 3,
  lastAccessedAt: "2026-06-29T00:00:00.000Z",
};
const fileMeta = {
  id: "file-1",
  fileName: "report.pdf",
  fileType: "pdf",
  fileSize: 1024,
  folderId: "folder-1",
  thumbnailUrl: "/thumb/file-1.png",
  updatedAt: "2026-06-28T00:00:00.000Z",
};

describe("/api/access-history 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  });

  describe("GET /api/access-history", () => {
    it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockAccessHistoryFindMany).not.toHaveBeenCalled();
      expect(mockAccessHistoryCount).not.toHaveBeenCalled();
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });

    it("type=recent（默认）→ findMany/count 的 where 同时含 tenantId+userId+accessType(view)，recent 按 lastAccessedAt desc", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([historyRecord]);
      mockAccessHistoryCount.mockResolvedValue(1);
      mockFileFindMany.mockResolvedValue([fileMeta]);

      const res = (await GET(makeGetRequest())) as MockRes;

      expect(res.status).toBe(200);
      const expectedWhere = {
        tenantId: "tenant-1",
        userId: "user-1",
        accessType: "view",
      };
      expect(mockAccessHistoryFindMany.mock.calls[0][0]).toEqual({
        where: expectedWhere,
        orderBy: { lastAccessedAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(mockAccessHistoryCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      // file.findMany 以 tenantId 作用域（防跨租户读文件元数据）
      const fileArg = mockFileFindMany.mock.calls[0][0] as {
        where: { id: { in: string[] }; tenantId: string };
        select: Record<string, boolean>;
      };
      expect(fileArg.where).toEqual({ id: { in: ["file-1"] }, tenantId: "tenant-1" });
      const body = res.body as { data: unknown[]; total: number };
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("type=frequent → orderBy accessCount desc（where 同 recent，仍双键作用域）", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([historyRecord]);
      mockAccessHistoryCount.mockResolvedValue(1);
      mockFileFindMany.mockResolvedValue([fileMeta]);

      const res = (await GET(makeGetRequest("?type=frequent"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockAccessHistoryFindMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: Record<string, string>;
      };
      expect(findArg.where).toEqual({
        tenantId: "tenant-1",
        userId: "user-1",
        accessType: "view",
      });
      expect(findArg.orderBy).toEqual({ accessCount: "desc" });
    });

    it("type=recent + accessType 过滤 → where 含自定义 accessType（与默认 view 不同）", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([]);
      mockAccessHistoryCount.mockResolvedValue(0);
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=recent&accessType=download"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockAccessHistoryFindMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: "tenant-1", userId: "user-1", accessType: "download" },
      });
      expect(mockAccessHistoryCount.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1", userId: "user-1", accessType: "download" },
      });
    });

    it("admin/owner 角色仍仅看自己历史 → where 恒含 userId（role 未参与作用域）", async () => {
      // 即便 owner，access-history 也只看自己：核心契约（role 解构但未使用）
      mockAccessHistoryFindMany.mockResolvedValue([]);
      mockAccessHistoryCount.mockResolvedValue(0);
      mockFileFindMany.mockResolvedValue([]);

      await GET(makeGetRequest());

      const findArg = mockAccessHistoryFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findArg.where).toHaveProperty("userId", "user-1");
      expect(findArg.where).toHaveProperty("tenantId", "tenant-1");
    });

    it("type=recent-uploaded → file.findMany/count 的 where 含 tenantId+userId+isDeleted:false，按 createdAt desc", async () => {
      mockFileFindMany.mockResolvedValue([
        {
          id: "file-2",
          fileName: "upload.png",
          fileType: "image",
          fileSize: 2048,
          folderId: null,
          thumbnailUrl: null,
          createdAt: "2026-06-29T00:00:00.000Z",
          updatedAt: "2026-06-29T00:00:00.000Z",
        },
      ]);
      mockFileCount.mockResolvedValue(1);

      const res = (await GET(makeGetRequest("?type=recent-uploaded"))) as MockRes;

      expect(res.status).toBe(200);
      const expectedWhere = {
        tenantId: "tenant-1",
        userId: "user-1",
        isDeleted: false,
      };
      expect(mockFileFindMany.mock.calls[0][0]).toMatchObject({
        where: expectedWhere,
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(mockFileCount.mock.calls[0][0]).toEqual({ where: expectedWhere });
      expect(mockAccessHistoryFindMany).not.toHaveBeenCalled();
      const body = res.body as { data: unknown[]; total: number };
      expect(body.data).toHaveLength(1);
    });

    it("type=recent-modified → file.findMany 的 where 含 tenantId+userId+isDeleted:false，按 updatedAt desc", async () => {
      mockFileFindMany.mockResolvedValue([]);
      mockFileCount.mockResolvedValue(0);

      const res = (await GET(makeGetRequest("?type=recent-modified"))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockFileFindMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: "tenant-1", userId: "user-1", isDeleted: false },
        orderBy: { updatedAt: "desc" },
      });
    });

    it("recent 分支：file 不在租户内（fileMap 未命中）→ 该记录被过滤为'未知文件'后剔除，data 为空", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([historyRecord]);
      mockAccessHistoryCount.mockResolvedValue(1);
      // file.findMany 返回空（文件已被删/不属于本租户）→ fileName 落为 '未知文件' 被过滤
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=recent"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as { data: unknown[]; total: number };
      expect(body.data).toEqual([]);
      // total 仍取 accessHistory.count（1），而非过滤后的 data 长度
      expect(body.total).toBe(1);
    });

    it("分页 page=2&pageSize=2 → skip=2/take=2；pageSize 超上限截断为 100", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([]);
      mockAccessHistoryCount.mockResolvedValue(5);
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=recent&page=2&pageSize=2"))) as MockRes;

      expect(res.status).toBe(200);
      const findArg = mockAccessHistoryFindMany.mock.calls[0][0] as { skip: number; take: number };
      expect(findArg.skip).toBe(2);
      expect(findArg.take).toBe(2);
      const body = res.body as { page: number; pageSize: number; totalPages: number; hasMore: boolean };
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(2);
      expect(body.totalPages).toBe(3);
      expect(body.hasMore).toBe(true);

      // pageSize 截断
      await GET(makeGetRequest("?type=recent&pageSize=500"));
      const cappedArg = mockAccessHistoryFindMany.mock.calls[1][0] as { take: number };
      expect(cappedArg.take).toBe(100);
    });

    it("默认分页 page=1/pageSize=20，total=0 → data 空 / totalPages=0 / hasMore=false", async () => {
      mockAccessHistoryFindMany.mockResolvedValue([]);
      mockAccessHistoryCount.mockResolvedValue(0);
      mockFileFindMany.mockResolvedValue([]);

      const res = (await GET(makeGetRequest("?type=recent"))) as MockRes;

      expect(res.status).toBe(200);
      const body = res.body as {
        data: unknown[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      expect(body.data).toEqual([]);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.totalPages).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it("findMany 抛错 → 500 { error: '获取访问历史失败' }", async () => {
      mockAccessHistoryFindMany.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeGetRequest("?type=recent"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取访问历史失败" });
    });
  });

  describe("POST /api/access-history", () => {
    it("未认证 → 401 透传，不触达 DB", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await POST(makePostRequest({ fileId: "file-1" }))) as MockRes;

      expect(res.status).toBe(401);
      expect(mockFileFindFirst).not.toHaveBeenCalled();
      expect(mockAccessHistoryFindFirst).not.toHaveBeenCalled();
    });

    it("缺 fileId → 400 { error: 'fileId is required' }，不触达 file.findFirst", async () => {
      const res = (await POST(makePostRequest({}))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "fileId is required" });
      expect(mockFileFindFirst).not.toHaveBeenCalled();
    });

    it("文件不存在（file.findFirst 未命中）→ 404 { error: '文件不存在' }；findFirst 以 { id, tenantId } 双键作用域", async () => {
      mockFileFindFirst.mockResolvedValue(null);

      const res = (await POST(makePostRequest({ fileId: "file-x" }))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "文件不存在" });
      expect(mockFileFindFirst.mock.calls[0][0]).toEqual({
        where: { id: "file-x", tenantId: "tenant-1" },
        select: { id: true },
      });
      expect(mockAccessHistoryFindFirst).not.toHaveBeenCalled();
    });

    it("已有记录 → update increment accessCount + lastAccessedAt；findFirst 以 tenantId+userId+fileId+accessType 四键作用域", async () => {
      mockFileFindFirst.mockResolvedValue({ id: "file-1" });
      mockAccessHistoryFindFirst.mockResolvedValue({ id: "ah-1" });
      mockAccessHistoryUpdate.mockResolvedValue({});

      const res = (await POST(makePostRequest({ fileId: "file-1", accessType: "download" }))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "访问已记录" });
      // 四键作用域防串改他人记录
      expect(mockAccessHistoryFindFirst.mock.calls[0][0]).toEqual({
        where: {
          tenantId: "tenant-1",
          userId: "user-1",
          fileId: "file-1",
          accessType: "download",
        },
      });
      expect(mockAccessHistoryUpdate.mock.calls[0][0]).toEqual({
        where: { id: "ah-1" },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: expect.any(Date),
        },
      });
      expect(mockAccessHistoryCreate).not.toHaveBeenCalled();
    });

    it("无记录 → create data 含 tenantId+userId+fileId+accessType+accessCount:1（默认 accessType=view）", async () => {
      mockFileFindFirst.mockResolvedValue({ id: "file-1" });
      mockAccessHistoryFindFirst.mockResolvedValue(null);
      mockAccessHistoryCreate.mockResolvedValue({});

      const res = (await POST(makePostRequest({ fileId: "file-1" }))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockAccessHistoryCreate.mock.calls[0][0]).toEqual({
        data: {
          tenantId: "tenant-1",
          userId: "user-1",
          fileId: "file-1",
          accessType: "view",
          accessCount: 1,
          lastAccessedAt: expect.any(Date),
        },
      });
      expect(mockAccessHistoryUpdate).not.toHaveBeenCalled();
    });

    it("create 抛错 → 500 { error: '记录访问失败' }", async () => {
      mockFileFindFirst.mockResolvedValue({ id: "file-1" });
      mockAccessHistoryFindFirst.mockResolvedValue(null);
      mockAccessHistoryCreate.mockRejectedValue(new Error("db down"));

      const res = (await POST(makePostRequest({ fileId: "file-1" }))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "记录访问失败" });
    });
  });

  describe("DELETE /api/access-history", () => {
    it("未认证 → 401 透传，不触达 deleteMany", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await DELETE(makeDeleteRequest())) as MockRes;

      expect(res.status).toBe(401);
      expect(mockAccessHistoryDeleteMany).not.toHaveBeenCalled();
    });

    it("带 fileId → deleteMany where 含 tenantId+userId+fileId（仅清该文件自己的记录）", async () => {
      mockAccessHistoryDeleteMany.mockResolvedValue({ count: 2 });

      const res = (await DELETE(makeDeleteRequest("?fileId=file-1"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "已清除该文件的访问记录" });
      expect(mockAccessHistoryDeleteMany.mock.calls[0][0]).toEqual({
        where: { tenantId: "tenant-1", userId: "user-1", fileId: "file-1" },
      });
    });

    it("不带 fileId → deleteMany where 仅含 tenantId+userId（仅清自己全部历史，不清租户全部他人历史）", async () => {
      mockAccessHistoryDeleteMany.mockResolvedValue({ count: 10 });

      const res = (await DELETE(makeDeleteRequest())) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: "已清除所有访问历史" });
      const where = mockAccessHistoryDeleteMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(where).toEqual({ tenantId: "tenant-1", userId: "user-1" });
      // 核心安全契约：绝不含他人 userId、绝不仅按 tenantId 清空整租户
      expect(where).not.toHaveProperty("fileId");
    });

    it("deleteMany 抛错 → 500 { error: '清除访问历史失败' }", async () => {
      mockAccessHistoryDeleteMany.mockRejectedValue(new Error("db down"));

      const res = (await DELETE(makeDeleteRequest())) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "清除访问历史失败" });
    });
  });
});
