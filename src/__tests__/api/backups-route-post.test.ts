/**
 * backups 路由 POST handler 级集成测试
 *
 * 此前 POST 为零覆盖（既有 backups-route.test.ts 仅测 GET）。本轮为 POST 补齐行为
 * 契约锁定，覆盖第一百四十九轮新增的"同步执行备份导出 + JSON 落盘"逻辑：
 *   - 未认证 → 401 透传 authenticateRequest 的响应，不触达 DB/fs。
 *   - 非 owner/admin 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst。
 *   - body 缺 name → 400 { error: 'name is required' }，不触达 findFirst。
 *   - findFirst 返回 running 备份 → 400 { error: '已有备份正在进行中，请稍后再试' }，
 *     不触达 create。
 *   - 成功 → create(pending) → update(running) → file/folder.findMany({ tenantId }) →
 *     mkdir(./backups/{tenantId}) + writeFile(filePath, jsonStr) →
 *     update(completed, size, fileCount, filePath, completedAt) →
 *     200 { success, data: { status: 'completed', size, fileCount, ... }, message: '备份已完成' }。
 *   - writeFile 抛错 → 内层 catch 将记录标记为 failed（status/error/completedAt），
 *     返回 500 { error: '备份执行失败' }（不向客户端泄漏 detail）。
 *   - create 抛错 → 外层 catch 500 { error: '创建备份失败' }，不触达 update/findMany。
 *
 * 隔离策略：vi.hoisted 共享 MockNextResponse / mockAuthenticate / mockBackupCreate /
 * mockBackupUpdate / mockBackupFindFirst / mockFileFindMany / mockFolderFindMany /
 * mockMkdir / mockWriteFile，复用 backups-route GET 与 files-id DELETE 的 mock 范式。
 * fs/promises 同时提供 named + default（ESM 互操作兜底，对齐 files-route-post 范式）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import path from "path";

const {
  MockNextResponse,
  mockAuthenticate,
  mockBackupCreate,
  mockBackupUpdate,
  mockBackupFindFirst,
  mockFileFindMany,
  mockFolderFindMany,
  mockMkdir,
  mockWriteFile,
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
    mockBackupCreate: vi.fn(),
    mockBackupUpdate: vi.fn(),
    mockBackupFindFirst: vi.fn(),
    mockFileFindMany: vi.fn(),
    mockFolderFindMany: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    backup: {
      create: (...args: unknown[]) => mockBackupCreate(...args),
      update: (...args: unknown[]) => mockBackupUpdate(...args),
      findFirst: (...args: unknown[]) => mockBackupFindFirst(...args),
    },
    file: {
      findMany: (...args: unknown[]) => mockFileFindMany(...args),
    },
    folder: {
      findMany: (...args: unknown[]) => mockFolderFindMany(...args),
    },
  },
}));
vi.mock("fs/promises", () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import { POST } from "@/app/api/backups/route";

const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

function makePostRequest(body: unknown): NextRequest {
  const url = "http://localhost/api/backups";
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const createdBackup = {
  id: "bk-1",
  tenantId: "tenant-1",
  userId: "user-1",
  name: "全量备份-20260713",
  type: "full",
  status: "pending",
  size: 0,
  fileCount: 0,
  error: null,
  filePath: null,
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
  completedAt: null,
};

// update 返回值模拟 Prisma 返回的更新后记录（含写入字段）
function makeCompletedBackup(overrides: Record<string, unknown> = {}) {
  return {
    ...createdBackup,
    status: "completed",
    size: 2048,
    fileCount: 2,
    filePath: path.resolve("./backups", "tenant-1", "bk-1.json"),
    completedAt: new Date("2026-07-13T00:01:00.000Z"),
    ...overrides,
  };
}

const sampleFiles = [
  { id: "file-1", tenantId: "tenant-1", fileName: "a.txt", fileSize: 1024 },
  { id: "file-2", tenantId: "tenant-1", fileName: "b.txt", fileSize: 1024 },
];
const sampleFolders = [
  { id: "folder-1", tenantId: "tenant-1", name: "docs" },
];

describe("/api/backups 路由 POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({ ...ownerAuth });
    mockBackupFindFirst.mockResolvedValue(null); // 无 running 备份
    mockBackupCreate.mockResolvedValue({ ...createdBackup });
    mockBackupUpdate.mockResolvedValue(makeCompletedBackup());
    mockFileFindMany.mockResolvedValue(sampleFiles);
    mockFolderFindMany.mockResolvedValue(sampleFolders);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it("未认证 → 401 透传 authenticateRequest 的响应，不触达 DB/fs", async () => {
    mockAuthenticate.mockResolvedValue(
      MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
    );

    const res = (await POST(makePostRequest({ name: "test" }))) as MockRes;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未提供身份认证令牌" });
    expect(mockBackupFindFirst).not.toHaveBeenCalled();
    expect(mockBackupCreate).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("member 角色 → 403 { error: '没有权限管理备份' }，不触达 findFirst", async () => {
    mockAuthenticate.mockResolvedValue({
      userId: "user-2",
      email: "member@example.com",
      tenantId: "tenant-1",
      role: "member",
    });

    const res = (await POST(makePostRequest({ name: "test" }))) as MockRes;

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "没有权限管理备份" });
    expect(mockBackupFindFirst).not.toHaveBeenCalled();
    expect(mockBackupCreate).not.toHaveBeenCalled();
  });

  it("body 缺 name → 400 { error: 'name is required' }，不触达 findFirst", async () => {
    const res = (await POST(makePostRequest({}))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "name is required" });
    expect(mockBackupFindFirst).not.toHaveBeenCalled();
    expect(mockBackupCreate).not.toHaveBeenCalled();
  });

  it("已有 running 备份 → 400 { error: '已有备份正在进行中，请稍后再试' }，不触达 create", async () => {
    mockBackupFindFirst.mockResolvedValue({ id: "bk-running", status: "running" });

    const res = (await POST(makePostRequest({ name: "test" }))) as MockRes;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "已有备份正在进行中，请稍后再试" });
    expect(mockBackupFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "running" },
    });
    expect(mockBackupCreate).not.toHaveBeenCalled();
  });

  it("成功 → create(pending) → update(running) → file/folder.findMany({ tenantId }) → mkdir+writeFile → update(completed)，200", async () => {
    const res = (await POST(makePostRequest({ name: "全量备份-20260713" }))) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { success: boolean; data: Record<string, unknown>; message: string };
    expect(body.success).toBe(true);
    expect(body.message).toBe("备份已完成");
    expect(body.data).toMatchObject({
      id: "bk-1",
      name: "全量备份-20260713",
      status: "completed",
      size: 2048,
      fileCount: 2,
    });

    // create 以 pending 状态创建
    expect(mockBackupCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        name: "全量备份-20260713",
        type: "full",
        status: "pending",
      },
    });

    // 第一次 update 标记为 running
    expect(mockBackupUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "bk-1" },
      data: { status: "running" },
    });

    // file/folder 以 { tenantId } 作用域查询
    expect(mockFileFindMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mockFolderFindMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });

    // mkdir + writeFile 落盘到 ./backups/{tenantId}/{backupId}.json
    const expectedDir = path.resolve("./backups", "tenant-1");
    const expectedPath = path.join(expectedDir, "bk-1.json");
    expect(mockMkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      "utf8"
    );

    // 第二次 update 标记为 completed，写入 size/fileCount/filePath/completedAt
    const secondCallArg = mockBackupUpdate.mock.calls[1][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(secondCallArg.where).toEqual({ id: "bk-1" });
    expect(secondCallArg.data.status).toBe("completed");
    expect(secondCallArg.data.size).toBeGreaterThan(0);
    expect(secondCallArg.data.fileCount).toBe(2);
    expect(secondCallArg.data.filePath).toBe(expectedPath);
    expect(secondCallArg.data.completedAt).toBeInstanceOf(Date);
  });

  it("type 默认 full（未传 type 时）", async () => {
    await POST(makePostRequest({ name: "test" }));

    const createArg = mockBackupCreate.mock.calls[0][0] as { data: { type: string } };
    expect(createArg.data.type).toBe("full");
  });

  it("type=incremental 透传到 create 记录", async () => {
    await POST(makePostRequest({ name: "增量", type: "incremental" }));

    const createArg = mockBackupCreate.mock.calls[0][0] as { data: { type: string } };
    expect(createArg.data.type).toBe("incremental");
  });

  it("空租户（file/folder 均为空数组）→ fileCount=0，仍 200 completed", async () => {
    mockFileFindMany.mockResolvedValue([]);
    mockFolderFindMany.mockResolvedValue([]);
    mockBackupUpdate.mockResolvedValue(makeCompletedBackup({ fileCount: 0, size: 100 }));

    const res = (await POST(makePostRequest({ name: "empty" }))) as MockRes;

    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(body.data.status).toBe("completed");

    // writeFile 仍被调用（即使数据为空，仍写入 JSON 元数据）
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const secondCallArg = mockBackupUpdate.mock.calls[1][0] as { data: { fileCount: number } };
    expect(secondCallArg.data.fileCount).toBe(0);
  });

  it("writeFile 抛错 → 内层 catch 标记记录为 failed，500 { error: '备份执行失败' }", async () => {
    mockWriteFile.mockRejectedValue(new Error("EACCES: permission denied"));

    const res = (await POST(makePostRequest({ name: "fail" }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "备份执行失败" });

    // 第一次 update（running）已执行
    expect(mockBackupUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "bk-1" },
      data: { status: "running" },
    });
    // 第二次 update 标记为 failed（含 error + completedAt）
    const failedCallArg = mockBackupUpdate.mock.calls[1][0] as {
      where: { id: string };
      data: { status: string; error: string; completedAt: Date };
    };
    expect(failedCallArg.where).toEqual({ id: "bk-1" });
    expect(failedCallArg.data.status).toBe("failed");
    expect(failedCallArg.data.error).toBe("EACCES: permission denied");
    expect(failedCallArg.data.completedAt).toBeInstanceOf(Date);
  });

  it("file.findMany 抛错 → 内层 catch 标记记录为 failed，500", async () => {
    mockFileFindMany.mockRejectedValue(new Error("db connection lost"));

    const res = (await POST(makePostRequest({ name: "fail" }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "备份执行失败" });
    // mkdir/writeFile 不触达（findMany 在其之前抛错）
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    // 第二次 update 标记为 failed
    const failedCallArg = mockBackupUpdate.mock.calls[1][0] as { data: { status: string } };
    expect(failedCallArg.data.status).toBe("failed");
  });

  it("内层 update(failed) 也抛错 → best-effort 仍返回 500（不阻断响应）", async () => {
    mockWriteFile.mockRejectedValue(new Error("disk full"));
    // 第一次 update(running) 成功，第二次 update(failed) 抛错
    mockBackupUpdate
      .mockResolvedValueOnce({ ...createdBackup, status: "running" })
      .mockRejectedValueOnce(new Error("db down"));

    const res = (await POST(makePostRequest({ name: "fail" }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "备份执行失败" });
    // update 被调用两次（running 成功 + failed 失败）
    expect(mockBackupUpdate).toHaveBeenCalledTimes(2);
  });

  it("create 抛错 → 外层 catch 500 { error: '创建备份失败' }，不触达 update/findMany(fs)", async () => {
    mockBackupCreate.mockRejectedValue(new Error("db down"));

    const res = (await POST(makePostRequest({ name: "fail" }))) as MockRes;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "创建备份失败" });
    expect(mockBackupUpdate).not.toHaveBeenCalled();
    expect(mockFileFindMany).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });
});
