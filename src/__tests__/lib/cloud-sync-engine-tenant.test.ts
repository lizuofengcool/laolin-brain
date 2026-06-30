/**
 * sync-engine resolveConflict 跨租户隔离回归测试
 *
 * 锁定第六十九轮修复的安全缺陷：conflicts 路由透传 body.fileId 不可信，
 * resolveConflict 原 keep_both 分支与函数末尾 syncStatus 更新均按裸 id 操作，
 * cloud_wins 经 downloadFileFromCloud 亦按裸 id findUnique → 跨租户 fileId 会
 * rename/overwrite 他租户文件。修复后在函数入口前置 tenantId 归属校验。
 *
 * Mock 策略：隔离 @/lib/db 与 cloud-sync 子模块（crypto / config-crypto /
 * r2-storage-class / aliyun-oss），不触达真实数据库与对象存储。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockDb, mockAliyunOssInstance, mockEncrypt, mockDecrypt, mockDecryptConfig } =
  vi.hoisted(() => ({
    mockDb: {
      file: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn(),
      },
    },
    mockAliyunOssInstance: {
      uploadObject: vi.fn(),
      downloadObject: vi.fn(),
      deleteObject: vi.fn(),
      listObjects: vi.fn(),
      headObject: vi.fn(),
    },
    mockEncrypt: vi.fn(),
    mockDecrypt: vi.fn(),
    mockDecryptConfig: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/cloud-sync/crypto", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...(args as [Buffer, string])),
  decrypt: (...args: unknown[]) => mockDecrypt(...(args as [Buffer, string])),
  hashFileContent: vi.fn(),
}));
vi.mock("@/lib/cloud-sync/config-crypto", () => ({
  decryptConfig: (...args: unknown[]) => mockDecryptConfig(...(args as [string])),
}));
vi.mock("@/lib/cloud-sync/r2-storage-class", () => ({
  R2Storage: vi.fn(),
}));
vi.mock("@/lib/cloud-sync/aliyun-oss", () => ({
  // createAliyunProvider 以 `new AliyunOSSStorage(config)` 调用，须为可 new 的构造器。
  // 将 mock 实例方法挂到 this，使 `oss.uploadObject(...)` 等调用落到 vi.fn。
  AliyunOSSStorage: class {
    constructor() {
      Object.assign(this, mockAliyunOssInstance);
    }
  },
}));

import { resolveConflict } from "@/lib/cloud-sync/sync-engine";

const TENANT_A = "tenant-A";
const USER_A = "user-A";
const FILE_OWNED = "file-owned-by-A";

/** 构造一个同租户 File 记录（含 uploadFileToCloud 读取的字段） */
function ownedFileRecord() {
  return {
    id: FILE_OWNED,
    tenantId: TENANT_A,
    userId: USER_A,
    fileName: "doc.pdf",
    fileType: "pdf",
    fileSize: 1024,
    filePath: "/upload/user-A/doc.pdf",
    textContent: "hello",
    thumbnailUrl: null,
    fileHash: "hash-1",
    updatedAt: new Date("2026-06-29T00:00:00Z"),
    tags: "",
    summary: null,
    keyPoints: "",
    isFavorite: false,
    folderId: null,
  };
}

/** 构造 getStorageProvider 所需的 tenant 记录 */
function tenantRecord() {
  return {
    id: TENANT_A,
    storageProvider: "aliyun",
    storageConfigs: [{ provider: "aliyun", config: "encrypted-config-blob" }],
  };
}

describe("resolveConflict 跨租户隔离", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncrypt.mockReturnValue(Buffer.from("enc"));
    mockDecrypt.mockReturnValue(Buffer.from("dec"));
    mockDecryptConfig.mockReturnValue({ bucket: "b", region: "r", accessKeyId: "k", accessKeySecret: "s" });
    mockAliyunOssInstance.uploadObject.mockResolvedValue(undefined);
    mockDb.file.update.mockResolvedValue({});
    mockDb.file.create.mockResolvedValue({});
  });

  it("fileId 不属当前租户 → 抛错且不触达任何 file 写操作（不进入 getStorageProvider）", async () => {
    // 跨租户：带 tenantId 的 findUnique 返回 null
    mockDb.file.findUnique.mockResolvedValue(null);

    await expect(
      resolveConflict(TENANT_A, USER_A, "file-from-tenant-B", "keep_both", "pwd")
    ).rejects.toThrow(/File not found in tenant/);

    // 关键：未触达任何写操作
    expect(mockDb.file.update).not.toHaveBeenCalled();
    expect(mockDb.file.create).not.toHaveBeenCalled();
    // 未进入 getStorageProvider（不查 tenant / 不解密 config）
    expect(mockDb.tenant.findUnique).not.toHaveBeenCalled();
    expect(mockDecryptConfig).not.toHaveBeenCalled();
  });

  it("fileId 属当前租户 → 通过归属校验，进入 local_wins 上传流程", async () => {
    // 守卫 + uploadFileToCloud 各 findUnique 一次，均返回同租户文件
    mockDb.file.findUnique.mockResolvedValue(ownedFileRecord());
    mockDb.tenant.findUnique.mockResolvedValue(tenantRecord());

    await resolveConflict(TENANT_A, USER_A, FILE_OWNED, "local_wins", "pwd");

    // 守卫的 findUnique 带 tenantId
    expect(mockDb.file.findUnique).toHaveBeenCalledWith({
      where: { id: FILE_OWNED, tenantId: TENANT_A },
    });
    // 进入 getStorageProvider
    expect(mockDb.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: TENANT_A },
      include: { storageConfigs: true },
    });
    // uploadFileToCloud 上传两个对象（data + meta）
    expect(mockAliyunOssInstance.uploadObject).toHaveBeenCalledTimes(2);
    // 写操作发生（uploadFileToCloud 内 + 函数末尾 syncStatus 更新）
    expect(mockDb.file.update).toHaveBeenCalled();
    expect(mockEncrypt).toHaveBeenCalled();
  });

  it("keep_both 分支：同租户 fileId 重命名本地为冲突副本并为云端版本创建新文件", async () => {
    mockDb.file.findUnique.mockResolvedValue(ownedFileRecord());
    mockDb.tenant.findUnique.mockResolvedValue(tenantRecord());
    // fetchCloudFileData 解密返回的云端文件数据
    mockDecrypt.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          fileName: "cloud-doc.pdf",
          fileType: "pdf",
          fileSize: 2048,
          textContent: "cloud",
        })
      )
    );

    await resolveConflict(TENANT_A, USER_A, FILE_OWNED, "keep_both", "pwd");

    // findUnique 调用 2 次：守卫 1 次 + keep_both 内 1 次（原 line 677，仍按裸 id）
    expect(mockDb.file.findUnique).toHaveBeenCalledTimes(2);
    // 第一调用为守卫（带 tenantId）
    expect(mockDb.file.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: FILE_OWNED, tenantId: TENANT_A },
    });

    // 重命名本地文件为冲突副本（update 单参对象：call[0] = { where, data }）
    const renameCall = mockDb.file.update.mock.calls.find(
      (call) =>
        typeof (call as any[])[0]?.data?.fileName === "string" &&
        ((call as any[])[0].data.fileName as string).startsWith("[冲突副本]")
    );
    expect(renameCall).toBeDefined();
    expect((renameCall as any[])[0].data.fileName).toBe("[冲突副本] doc.pdf");

    // 为云端版本创建新文件，且带 tenantId
    expect(mockDb.file.create).toHaveBeenCalledTimes(1);
    const createArgs = (mockDb.file.create.mock.calls[0] as any[])[0];
    expect(createArgs.data.tenantId).toBe(TENANT_A);
    expect(createArgs.data.fileName).toBe("cloud-doc.pdf");
    expect(createArgs.data.userId).toBe(USER_A);
  });
});
