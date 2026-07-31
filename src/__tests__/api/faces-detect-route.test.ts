/**
 * faces/detect 路由 handler 级集成测试（POST 人脸检测）
 *
 * 锁定租户隔离契约（本轮修复重点）：原实现 `db.file.findUnique({ where: { id: fileId } })`
 * 仅按 id 取回文件行，再在 JS 层 `file.userId !== userId || file.tenantId !== tenantId`
 * 逐字段比对。修复后改走 `db.file.findFirst({ where: { id, tenantId, userId } })`，DB 层即
 * 作用域化，跨租户/跨用户 fileId 直接返回 null（不将他人文件行载入内存），与
 * faces/groups/[id] 路由 createTenantDb 收口同向。
 *
 * 覆盖：
 *   - 未认证 → 401 透传 authenticateRequest，不触达 DB。
 *   - 参数校验：缺 fileId/imageBase64 → 400 '缺少必要参数'；imageBase64 非字符串或
 *     超 26_600_000 字符 → 400 'imageBase64 无效或超过大小限制(20MB)'。
 *   - **租户隔离核心**：file.findFirst 返回 null（跨租户/跨用户 fileId）→ 403
 *     '文件不存在或无权访问'，断言 findFirst 以 { where: { id, tenantId, userId } }
 *     三键调用，且不触达 faceInstance.findMany / faceGroup.* （DB 层即拦截）。
 *   - 已有检测结果（existingFaces.length > 0）→ 200 '该图片已检测过人脸'，
 *     faceGroup.findMany 以 { userId, tenantId, faces: { some: { fileId } } } 作用域。
 *   - 未检测到人脸（detectFaces 返回 []）→ 200 '未检测到人脸'，faces/groups 为空数组。
 *   - 检测到人脸且匹配已有分组（cosineSimilarity >= 0.75）→ faceInstance.create
 *     写入已有 groupId，响应 face.groupId 指向该分组。
 *   - 检测到人脸无匹配 → faceGroup.create 新建分组（含 tenantId/userId/thumbnail=fileId），
 *     响应 message 含 '新建 1 个分组'。
 *   - DB 抛错（faceInstance.findMany reject）→ 500 '人脸检测失败'。
 *
 * 复用 faces-groups-merge-route.test.ts 的 vi.hoisted 共享 MockNextResponse 范式；
 * cosineSimilarity 经 mockReturnValue 控制 match/no-match 分支。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockFileFindFirst,
  mockInstanceFindMany,
  mockGroupFindMany,
  mockInstanceCreate,
  mockGroupCreate,
  mockDetectFaces,
  mockCosineSimilarity,
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
    mockFileFindFirst: vi.fn(),
    mockInstanceFindMany: vi.fn(),
    mockGroupFindMany: vi.fn(),
    mockInstanceCreate: vi.fn(),
    mockGroupCreate: vi.fn(),
    mockDetectFaces: vi.fn(),
    mockCosineSimilarity: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    file: {
      findFirst: (...args: unknown[]) => mockFileFindFirst(...args),
    },
    faceInstance: {
      findMany: (...args: unknown[]) => mockInstanceFindMany(...args),
      create: (...args: unknown[]) => mockInstanceCreate(...args),
    },
    faceGroup: {
      findMany: (...args: unknown[]) => mockGroupFindMany(...args),
      create: (...args: unknown[]) => mockGroupCreate(...args),
    },
  },
}));
vi.mock("@/lib/ai/face-detection", () => ({
  detectFaces: (...args: unknown[]) => mockDetectFaces(...args),
}));
vi.mock("@/lib/face-cluster", () => ({
  cosineSimilarity: (...args: unknown[]) => mockCosineSimilarity(...args),
}));

import { POST } from "@/app/api/faces/detect/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

// 当前租户/用户的文件（findFirst 命中）
const ownedFile = {
  id: "file-1",
  tenantId: "tenant-1",
  userId: "user-1",
};

// 一张检测到的人脸（detections 单元素）
const oneDetection = [
  {
    id: "det-1",
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    description: "男性,30岁",
    embedding: [0.1, 0.2, 0.3],
  },
];

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/faces/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("/api/faces/detect 路由 POST（人脸检测）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    // 默认：文件属当前租户/用户、无已存在检测结果、无已有分组、检测到一张人脸
    mockFileFindFirst.mockResolvedValue({ ...ownedFile });
    mockInstanceFindMany.mockResolvedValue([]);
    mockGroupFindMany.mockResolvedValue([]);
    mockInstanceCreate.mockResolvedValue(undefined);
    mockGroupCreate.mockResolvedValue(undefined);
    mockDetectFaces.mockResolvedValue(oneDetection);
    mockCosineSimilarity.mockReturnValue(0);
  });

  // ---- 认证 ----

  it("未认证 → 401 透传 authenticateRequest，不触达 DB", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
  });

  // ---- 参数校验 ----

  it("缺少 fileId → 400 '缺少必要参数'，不触达 DB", async () => {
    const res = (await POST(
      makeRequest({ imageBase64: "abc" })
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "缺少必要参数" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
  });

  it("缺少 imageBase64 → 400 '缺少必要参数'", async () => {
    const res = (await POST(
      makeRequest({ fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "缺少必要参数" });
  });

  it("imageBase64 非字符串 → 400 'imageBase64 无效或超过大小限制(20MB)'", async () => {
    const res = (await POST(
      makeRequest({ imageBase64: 12345, fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "imageBase64 无效或超过大小限制(20MB)" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
  });

  it("imageBase64 超 26_600_000 字符 → 400", async () => {
    const res = (await POST(
      makeRequest({ imageBase64: "x".repeat(26_600_001), fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "imageBase64 无效或超过大小限制(20MB)" });
    expect(mockFileFindFirst).not.toHaveBeenCalled();
  });

  // ---- 租户隔离核心 ----

  it("file.findFirst 返回 null（跨租户/跨用户 fileId）→ 403，DB 层三键作用域化", async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-other" })
    )) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "文件不存在或无权访问" });
    // 核心：findFirst 以 { id, tenantId, userId } 三键调用，DB 层即不返回跨租户/跨用户行
    expect(mockFileFindFirst).toHaveBeenCalledWith({
      where: { id: "file-other", tenantId: "tenant-1", userId: "user-1" },
    });
    // 403 后不触达后续 faceInstance / faceGroup 查询
    expect(mockInstanceFindMany).not.toHaveBeenCalled();
    expect(mockGroupFindMany).not.toHaveBeenCalled();
    expect(mockDetectFaces).not.toHaveBeenCalled();
  });

  // ---- 已有检测结果缓存 ----

  it("已有检测结果（existingFaces.length > 0）→ 200 '该图片已检测过人脸'，faceGroup.findMany 作用域化", async () => {
    mockInstanceFindMany.mockResolvedValue([
      {
        id: "face-existing",
        groupId: "grp-existing",
        fileId: "file-1",
        description: "男性,30岁",
        bboxX: 10,
        bboxY: 20,
        bboxW: 30,
        bboxH: 40,
      },
    ]);
    mockGroupFindMany.mockResolvedValue([
      { id: "grp-existing", name: "人物A", thumbnail: "file-1", faces: [] },
    ]);

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "该图片已检测过人脸" });
    // faceGroup.findMany 以 userId+tenantId+faces.some.fileId 作用域（防跨租户读取分组）
    expect(mockGroupFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        tenantId: "tenant-1",
        faces: { some: { fileId: "file-1" } },
      },
      include: { faces: true },
    });
    // 缓存命中后不重新调用 detectFaces / 不新建分组
    expect(mockDetectFaces).not.toHaveBeenCalled();
    expect(mockGroupCreate).not.toHaveBeenCalled();
  });

  // ---- 未检测到人脸 ----

  it("detectFaces 返回空数组 → 200 '未检测到人脸'，faces/groups 为空", async () => {
    mockDetectFaces.mockResolvedValue([]);

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "未检测到人脸",
      faces: [],
      groups: [],
    });
    // 无检测人脸时不新建分组
    expect(mockGroupCreate).not.toHaveBeenCalled();
    expect(mockInstanceCreate).not.toHaveBeenCalled();
  });

  // ---- 匹配已有分组 ----

  it("检测到人脸且 cosineSimilarity >= 0.75 → faceInstance.create 写入已有 groupId", async () => {
    const existingGroup = {
      id: "grp-existing",
      tenantId: "tenant-1",
      userId: "user-1",
      name: "人物A",
      thumbnail: "file-1",
      faces: [
        {
          id: "face-old",
          groupId: "grp-existing",
          fileId: "file-1",
          embedding: JSON.stringify([0.1, 0.2, 0.3]),
          description: "",
          bboxX: 0,
          bboxY: 0,
          bboxW: 0,
          bboxH: 0,
          createdAt: new Date("2026-06-29T00:00:00.000Z"),
        },
      ],
    };
    mockGroupFindMany.mockResolvedValue([existingGroup]);
    mockCosineSimilarity.mockReturnValue(0.9); // >= 0.75 命中匹配

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(200);
    // 匹配到已有分组 → faceInstance.create 写入 groupId=grp-existing，不新建分组
    expect(mockInstanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "grp-existing",
        fileId: "file-1",
        embedding: JSON.stringify(oneDetection[0].embedding),
      }),
    });
    expect(mockGroupCreate).not.toHaveBeenCalled();
    // 响应 faces[0].groupId 指向已匹配分组
    expect(res.body.faces[0].groupId).toBe("grp-existing");
  });

  // ---- 无匹配 → 新建分组 ----

  it("检测到人脸无匹配 → faceGroup.create 新建分组（含 tenantId/userId/thumbnail），message 含 '新建 1 个分组'", async () => {
    // existingGroups 为空 → 必然走新建分支
    mockGroupFindMany.mockResolvedValue([]);

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(200);
    expect(mockGroupCreate).toHaveBeenCalledTimes(1);
    expect(mockGroupCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-1",
        name: null,
        thumbnail: "file-1",
        faces: {
          create: expect.objectContaining({
            fileId: "file-1",
            embedding: JSON.stringify(oneDetection[0].embedding),
          }),
        },
      }),
    });
    expect(res.body.message).toContain("新建 1 个分组");
    expect(res.body.faces[0].groupId).toEqual(expect.any(String));
    expect(res.body.faces[0].groupId.length).toBeGreaterThan(0);
  });

  // ---- 错误兜底 ----

  it("faceInstance.findMany 抛错 → 500 '人脸检测失败'", async () => {
    mockInstanceFindMany.mockRejectedValue(new Error("db down"));

    const res = (await POST(
      makeRequest({ imageBase64: "abc", fileId: "file-1" })
    )) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "人脸检测失败" });
  });
});
