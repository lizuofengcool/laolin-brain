/**
 * backup-tool 模块单测
 *
 * 锁定 src/lib/backup/backup-tool.ts 的行为契约（此前为零覆盖模块）：
 *   - createFullBackup：默认全量组装 files/folders/tags/settings/shares，tenantId 过滤，
 *     size/checksum 计算，Backup 表落库（表缺失走 catch 仍返回），file.findMany 抛错→status failed + rethrow。
 *   - createIncrementalBackup：基准备份 lookup（缺失/表缺失均降级为无 sinceDate），tenantId+sinceDate 过滤，
 *     file.findMany 抛错→status failed + rethrow。
 *   - restoreBackup：conflictStrategy skip/overwrite/rename 三分支 × folders/files，不存在→create，
 *     单项错误收集到 errors 不中断。
 *   - validateBackup：版本/创建时间/数据完整性/校验和/文件数量 五项检查，valid = 全通过。
 *   - getBackupList：分页 + where 过滤，异常降级空列表。
 *   - deleteBackup：update→deleted，tenantId 透传 where，异常→false。
 *   - cleanExpiredBackups：findMany + updateMany，freedSpace 聚合，异常→{0,0}。
 *   - getBackupStats：Promise.all 聚合计数/大小/首末时间，异常→全零。
 *
 * 隔离策略：vi.mock('@/lib/db') 暴露 file/folder/setting/fileShare/backup 五模型，不触达真实数据库。
 * backup-tool 仅用标准 prisma 模型方法（无 $queryRaw/$transaction），故 mock 边界清晰。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import type { BackupContent } from "@/lib/backup/backup-tool";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    file: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    folder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    setting: {
      findMany: vi.fn(),
    },
    fileShare: {
      findMany: vi.fn(),
    },
    backup: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

import {
  createFullBackup,
  createIncrementalBackup,
  restoreBackup,
  validateBackup,
  getBackupList,
  deleteBackup,
  cleanExpiredBackups,
  getBackupStats,
} from "@/lib/backup/backup-tool";

/** 与模块内 calculateChecksum 同算法（sha256 hex），用于 validateBackup 校验和用例 */
function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── createFullBackup ─────────────────────────────────────────────

describe("createFullBackup", () => {
  it("默认全量：组装 files/folders/tags/settings/shares，计算 size/checksum，落库 Backup 表，status=completed", async () => {
    const files = [
      { id: "f1", fileName: "a.pdf", fileSize: 100, tags: ["t1", "t2"] },
      { id: "f2", fileName: "b.pdf", fileSize: 50, tags: ["t2"] },
    ];
    const folders = [{ id: "fo1", name: "dir" }];
    const settings = [{ key: "theme", value: "dark" }];
    const shares = [{ id: "s1", fileId: "f1" }];

    mockDb.file.findMany.mockResolvedValue(files);
    mockDb.folder.findMany.mockResolvedValue(folders);
    mockDb.setting.findMany.mockResolvedValue(settings);
    mockDb.fileShare.findMany.mockResolvedValue(shares);
    mockDb.backup.create.mockResolvedValue({});

    const result = await createFullBackup({
      name: "my-backup",
      description: "desc",
      tenantId: "tenant-1",
      userId: "user-1",
    });

    // tenantId 过滤透传
    expect(mockDb.file.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mockDb.folder.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mockDb.setting.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    // fileShare 用关系过滤
    expect(mockDb.fileShare.findMany).toHaveBeenCalledWith({ where: { file: { tenantId: "tenant-1" } } });

    // 标签从文件数组去重提取
    // （tags 字段在 BackupContent.data.tags，不直接断言 result，通过落库前无法窥探；以 fileCount/size 为准）

    expect(result.id).toMatch(/^backup_\d+_[a-z0-9]+$/);
    expect(result.type).toBe("full");
    expect(result.name).toBe("my-backup");
    expect(result.description).toBe("desc");
    expect(result.status).toBe("completed");
    expect(result.tenantId).toBe("tenant-1");
    expect(result.createdBy).toBe("user-1");
    expect(result.fileCount).toBe(2);
    expect(result.size).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.encrypted).toBe(false);
    expect(result.compressed).toBe(true);

    // Backup 表落库携带全部字段
    expect(mockDb.backup.create).toHaveBeenCalledTimes(1);
    const createArg = mockDb.backup.create.mock.calls[0][0];
    expect(createArg.data.id).toBe(result.id);
    expect(createArg.data.type).toBe("full");
    expect(createArg.data.status).toBe("completed");
    expect(createArg.data.size).toBe(result.size);
    expect(createArg.data.fileCount).toBe(2);
    expect(createArg.data.checksum).toBe(result.checksum);
    expect(createArg.data.tenantId).toBe("tenant-1");
    expect(createArg.data.createdBy).toBe("user-1");
    expect(createArg.data.description).toBe("desc");
  });

  it("includeFiles=false → 不查 file，fileCount=0", async () => {
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockResolvedValue([]);
    mockDb.fileShare.findMany.mockResolvedValue([]);
    mockDb.backup.create.mockResolvedValue({});

    const result = await createFullBackup({ includeFiles: false });

    expect(mockDb.file.findMany).not.toHaveBeenCalled();
    expect(result.fileCount).toBe(0);
  });

  it("无 tenantId → where 为空对象", async () => {
    mockDb.file.findMany.mockResolvedValue([]);
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockResolvedValue([]);
    mockDb.fileShare.findMany.mockResolvedValue([]);
    mockDb.backup.create.mockResolvedValue({});

    await createFullBackup();

    expect(mockDb.file.findMany).toHaveBeenCalledWith({ where: {} });
    expect(mockDb.fileShare.findMany).toHaveBeenCalledWith({ where: {} });
  });

  it("setting.findMany 抛错（表缺失）→ 捕获并继续，仍 completed", async () => {
    mockDb.file.findMany.mockResolvedValue([]);
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockRejectedValue(new Error("no such table: Setting"));
    mockDb.fileShare.findMany.mockResolvedValue([]);
    mockDb.backup.create.mockResolvedValue({});

    const result = await createFullBackup();

    expect(result.status).toBe("completed");
    expect(console.error).not.toHaveBeenCalled(); // Setting 表缺失走静默 catch
  });

  it("fileShare.findMany 抛错（表缺失）→ 捕获并继续，仍 completed", async () => {
    mockDb.file.findMany.mockResolvedValue([]);
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockResolvedValue([]);
    mockDb.fileShare.findMany.mockRejectedValue(new Error("no such table: FileShare"));
    mockDb.backup.create.mockResolvedValue({});

    const result = await createFullBackup();

    expect(result.status).toBe("completed");
  });

  it("backup.create 抛错（表缺失）→ 捕获，仍返回 completed 的 backupInfo", async () => {
    mockDb.file.findMany.mockResolvedValue([]);
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockResolvedValue([]);
    mockDb.fileShare.findMany.mockResolvedValue([]);
    mockDb.backup.create.mockRejectedValue(new Error("no such table: Backup"));

    const result = await createFullBackup({ name: "x" });

    expect(result.status).toBe("completed");
    expect(result.name).toBe("x");
  });

  it("file.findMany 抛错 → status=failed 并 rethrow", async () => {
    const err = new Error("disk read error");
    mockDb.file.findMany.mockRejectedValue(err);

    await expect(createFullBackup()).rejects.toThrow("disk read error");
    expect(console.error).toHaveBeenCalledWith("创建备份失败:", err);
  });

  it("encrypted/compressed 选项透传", async () => {
    mockDb.file.findMany.mockResolvedValue([]);
    mockDb.folder.findMany.mockResolvedValue([]);
    mockDb.setting.findMany.mockResolvedValue([]);
    mockDb.fileShare.findMany.mockResolvedValue([]);
    mockDb.backup.create.mockResolvedValue({});

    const result = await createFullBackup({ encrypted: true, compressed: false });

    expect(result.encrypted).toBe(true);
    expect(result.compressed).toBe(false);
    const createArg = mockDb.backup.create.mock.calls[0][0];
    expect(createArg.data.encrypted).toBe(true);
    expect(createArg.data.compressed).toBe(false);
  });
});

// ─── createIncrementalBackup ──────────────────────────────────────

describe("createIncrementalBackup", () => {
  it("找到基准备份 → where 含 tenantId + updatedAt.gte(sinceDate)", async () => {
    const since = new Date("2026-07-01T00:00:00Z");
    mockDb.backup.findUnique.mockResolvedValue({ id: "base-1", createdAt: since });
    mockDb.file.findMany.mockResolvedValue([{ id: "f1" }, { id: "f2" }]);

    const result = await createIncrementalBackup("base-1", {
      tenantId: "tenant-1",
      name: "inc",
    });

    expect(mockDb.backup.findUnique).toHaveBeenCalledWith({ where: { id: "base-1" } });
    expect(mockDb.file.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", updatedAt: { gte: since } },
    });
    expect(result.type).toBe("incremental");
    expect(result.status).toBe("completed");
    expect(result.fileCount).toBe(2);
    expect(result.name).toBe("inc");
  });

  it("基准备份不存在 → where 仅含 tenantId（无 updatedAt）", async () => {
    mockDb.backup.findUnique.mockResolvedValue(null);
    mockDb.file.findMany.mockResolvedValue([]);

    await createIncrementalBackup("missing", { tenantId: "t1" });

    expect(mockDb.file.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1" } });
  });

  it("backup.findUnique 抛错（表缺失）→ 捕获降级为无 sinceDate", async () => {
    mockDb.backup.findUnique.mockRejectedValue(new Error("no such table: Backup"));
    mockDb.file.findMany.mockResolvedValue([]);

    await createIncrementalBackup("base-1", { tenantId: "t1" });

    expect(mockDb.file.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1" } });
  });

  it("无 tenantId 且无基准 → where 为空对象", async () => {
    mockDb.backup.findUnique.mockResolvedValue(null);
    mockDb.file.findMany.mockResolvedValue([]);

    await createIncrementalBackup("base-1");

    expect(mockDb.file.findMany).toHaveBeenCalledWith({ where: {} });
  });

  it("file.findMany 抛错 → status=failed 并 rethrow", async () => {
    mockDb.backup.findUnique.mockResolvedValue(null);
    const err = new Error("read fail");
    mockDb.file.findMany.mockRejectedValue(err);

    await expect(createIncrementalBackup("base-1")).rejects.toThrow("read fail");
    expect(console.error).toHaveBeenCalledWith("创建增量备份失败:", err);
  });
});

// ─── restoreBackup ────────────────────────────────────────────────

describe("restoreBackup", () => {
  function makeBackupData(overrides: Partial<BackupContent["data"]> = {}): BackupContent {
    return {
      version: "1.0.0",
      createdAt: "2026-07-01T00:00:00.000Z",
      type: "full",
      data: {
        folders: [{ id: "fo1", name: "dir", tenantId: "t1" }],
        files: [{ id: "f1", fileName: "a.pdf", tenantId: "t1" }],
        ...overrides,
      },
      metadata: { fileCount: 1, totalSize: 100, schemaVersion: "1.0.0" },
    };
  }

  it("skip 策略：已存在 → skipped++，不 create", async () => {
    mockDb.folder.findUnique.mockResolvedValue({ id: "fo1" });
    mockDb.file.findUnique.mockResolvedValue({ id: "f1" });

    const result = await restoreBackup(makeBackupData(), { conflictStrategy: "skip" });

    expect(mockDb.folder.create).not.toHaveBeenCalled();
    expect(mockDb.file.create).not.toHaveBeenCalled();
    expect(result.skipped).toBe(2);
    expect(result.restored.folders).toBe(0);
    expect(result.restored.files).toBe(0);
    expect(result.success).toBe(true);
  });

  it("overwrite 策略：已存在 → update，restored++", async () => {
    const folder = { id: "fo1", name: "dir", tenantId: "t1" };
    const file = { id: "f1", fileName: "a.pdf", tenantId: "t1" };
    mockDb.folder.findUnique.mockResolvedValue(folder);
    mockDb.file.findUnique.mockResolvedValue(file);
    mockDb.folder.update.mockResolvedValue({});
    mockDb.file.update.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData(), { conflictStrategy: "overwrite" });

    expect(mockDb.folder.update).toHaveBeenCalledWith({ where: { id: "fo1" }, data: folder });
    expect(mockDb.file.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: file });
    expect(result.restored.folders).toBe(1);
    expect(result.restored.files).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("rename 策略：已存在 → create 新 id/name（含时间戳后缀）", async () => {
    mockDb.folder.findUnique.mockResolvedValue({ id: "fo1" });
    mockDb.file.findUnique.mockResolvedValue({ id: "f1" });
    mockDb.folder.create.mockResolvedValue({});
    mockDb.file.create.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData(), { conflictStrategy: "rename" });

    expect(mockDb.folder.create).toHaveBeenCalledTimes(1);
    const folderCreateArg = mockDb.folder.create.mock.calls[0][0].data;
    expect(folderCreateArg.id).toMatch(/^fo1_restored_\d+$/);
    expect(folderCreateArg.name).toBe("dir (已恢复)");

    expect(mockDb.file.create).toHaveBeenCalledTimes(1);
    const fileCreateArg = mockDb.file.create.mock.calls[0][0].data;
    expect(fileCreateArg.id).toMatch(/^f1_restored_\d+$/);
    expect(fileCreateArg.fileName).toBe("a.pdf (已恢复)");

    expect(result.restored.folders).toBe(1);
    expect(result.restored.files).toBe(1);
  });

  it("不存在 → 直接 create，restored++", async () => {
    mockDb.folder.findUnique.mockResolvedValue(null);
    mockDb.file.findUnique.mockResolvedValue(null);
    mockDb.folder.create.mockResolvedValue({});
    mockDb.file.create.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData());

    expect(mockDb.folder.create).toHaveBeenCalledWith({ data: { id: "fo1", name: "dir", tenantId: "t1" } });
    expect(mockDb.file.create).toHaveBeenCalledWith({ data: { id: "f1", fileName: "a.pdf", tenantId: "t1" } });
    expect(result.restored.folders).toBe(1);
    expect(result.restored.files).toBe(1);
  });

  it("默认策略为 skip", async () => {
    mockDb.folder.findUnique.mockResolvedValue({ id: "fo1" });
    mockDb.file.findUnique.mockResolvedValue({ id: "f1" });

    const result = await restoreBackup(makeBackupData()); // 不传 conflictStrategy

    expect(result.skipped).toBe(2);
    expect(mockDb.folder.create).not.toHaveBeenCalled();
  });

  it("includeFiles=false → 跳过文件恢复（仅恢复文件夹）", async () => {
    mockDb.folder.findUnique.mockResolvedValue(null);
    mockDb.folder.create.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData(), { includeFiles: false });

    expect(mockDb.folder.create).toHaveBeenCalledTimes(1);
    expect(mockDb.file.findUnique).not.toHaveBeenCalled();
    expect(result.restored.folders).toBe(1);
    expect(result.restored.files).toBe(0);
  });

  it("includeFolders=false → 跳过文件夹恢复（仅恢复文件）", async () => {
    mockDb.file.findUnique.mockResolvedValue(null);
    mockDb.file.create.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData(), { includeFolders: false });

    expect(mockDb.folder.findUnique).not.toHaveBeenCalled();
    expect(mockDb.file.create).toHaveBeenCalledTimes(1);
    expect(result.restored.folders).toBe(0);
    expect(result.restored.files).toBe(1);
  });

  it("单项恢复抛错 → 收集到 errors 不中断其余项", async () => {
    mockDb.folder.findUnique.mockRejectedValue(new Error("folder db down"));
    mockDb.file.findUnique.mockResolvedValue(null);
    mockDb.file.create.mockResolvedValue({});

    const result = await restoreBackup(makeBackupData());

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("恢复文件夹失败");
    expect(result.errors[0]).toContain("dir");
    expect(result.restored.files).toBe(1); // 文件仍被恢复
  });
});

// ─── validateBackup ───────────────────────────────────────────────

describe("validateBackup", () => {
  function makeValidContent(): BackupContent {
    return {
      version: "1.0.0",
      createdAt: "2026-07-01T00:00:00.000Z",
      type: "full",
      data: {
        files: [{ id: "f1" }, { id: "f2" }],
        folders: [{ id: "fo1" }],
      },
      metadata: { fileCount: 2, totalSize: 100, schemaVersion: "1.0.0" },
    };
  }

  it("完整数据 → valid=true，4 项基础检查全通过", async () => {
    const content = makeValidContent();
    const result = await validateBackup(content);

    expect(result.valid).toBe(true);
    const names = result.checks.map((c) => c.name);
    expect(names).toContain("版本检查");
    expect(names).toContain("创建时间检查");
    expect(names).toContain("数据完整性检查");
    expect(names).toContain("文件数量验证");
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("缺版本 → 版本检查失败，valid=false", async () => {
    const content = makeValidContent();
    (content as any).version = "";
    const result = await validateBackup(content);

    expect(result.valid).toBe(false);
    const versionCheck = result.checks.find((c) => c.name === "版本检查");
    expect(versionCheck?.passed).toBe(false);
  });

  it("数据为空 → 数据完整性检查失败", async () => {
    const content: BackupContent = {
      version: "1.0.0",
      createdAt: "2026-07-01T00:00:00.000Z",
      type: "full",
      data: { files: [], folders: [], tags: [] },
      metadata: { fileCount: 0, totalSize: 0, schemaVersion: "1.0.0" },
    };
    const result = await validateBackup(content);

    const dataCheck = result.checks.find((c) => c.name === "数据完整性检查");
    expect(dataCheck?.passed).toBe(false);
  });

  it("校验和匹配 → 校验和验证通过", async () => {
    const content = makeValidContent();
    const expected = sha256Hex(JSON.stringify(content));
    const result = await validateBackup(content, expected);

    const checksumCheck = result.checks.find((c) => c.name === "校验和验证");
    expect(checksumCheck?.passed).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("校验和不匹配 → 校验和验证失败，valid=false", async () => {
    const content = makeValidContent();
    const result = await validateBackup(content, "wrong-checksum");

    const checksumCheck = result.checks.find((c) => c.name === "校验和验证");
    expect(checksumCheck?.passed).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("文件数量与 metadata.fileCount 不一致 → 文件数量验证失败", async () => {
    const content = makeValidContent();
    content.metadata!.fileCount = 99; // 实际 2 个文件
    const result = await validateBackup(content);

    const countCheck = result.checks.find((c) => c.name === "文件数量验证");
    expect(countCheck?.passed).toBe(false);
    expect(countCheck?.message).toContain("声明: 99");
    expect(countCheck?.message).toContain("实际: 2");
  });

  it("不传 expectedChecksum → 不进行校验和验证（该项检查不出现）", async () => {
    const content = makeValidContent();
    const result = await validateBackup(content);

    expect(result.checks.find((c) => c.name === "校验和验证")).toBeUndefined();
  });
});

// ─── getBackupList ────────────────────────────────────────────────

describe("getBackupList", () => {
  it("分页 + where 过滤透传，返回 data/total", async () => {
    const backups = [{ id: "b1" }, { id: "b2" }];
    mockDb.backup.findMany.mockResolvedValue(backups);
    mockDb.backup.count.mockResolvedValue(42);

    const result = await getBackupList({
      tenantId: "t1",
      type: "full",
      status: "completed",
      page: 2,
      pageSize: 5,
    });

    expect(mockDb.backup.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", type: "full", status: "completed" },
      orderBy: { createdAt: "desc" },
      skip: 5,
      take: 5,
    });
    expect(mockDb.backup.count).toHaveBeenCalledWith({
      where: { tenantId: "t1", type: "full", status: "completed" },
    });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
  });

  it("默认 page=1, pageSize=20", async () => {
    mockDb.backup.findMany.mockResolvedValue([]);
    mockDb.backup.count.mockResolvedValue(0);

    const result = await getBackupList();

    expect(mockDb.backup.findMany.mock.calls[0][0].skip).toBe(0);
    expect(mockDb.backup.findMany.mock.calls[0][0].take).toBe(20);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("异常降级 → 空列表", async () => {
    mockDb.backup.findMany.mockRejectedValue(new Error("no such table: Backup"));

    const result = await getBackupList({ tenantId: "t1" });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── deleteBackup ─────────────────────────────────────────────────

describe("deleteBackup", () => {
  it("成功 → update status=deleted，返回 true", async () => {
    mockDb.backup.update.mockResolvedValue({});

    const result = await deleteBackup("b1", "t1");

    expect(mockDb.backup.update).toHaveBeenCalledWith({
      where: { id: "b1", tenantId: "t1" },
      data: { status: "deleted" },
    });
    expect(result).toBe(true);
  });

  it("无 tenantId → where 仅含 id", async () => {
    mockDb.backup.update.mockResolvedValue({});

    await deleteBackup("b1");

    expect(mockDb.backup.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { status: "deleted" },
    });
  });

  it("update 抛错 → 返回 false 并 log", async () => {
    const err = new Error("update failed");
    mockDb.backup.update.mockRejectedValue(err);

    const result = await deleteBackup("b1");

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith("删除备份失败:", err);
  });
});

// ─── cleanExpiredBackups ──────────────────────────────────────────

describe("cleanExpiredBackups", () => {
  it("findMany + updateMany，cleaned 计数 + freedSpace 聚合", async () => {
    const expired = [
      { id: "b1", size: 100 },
      { id: "b2", size: 250 },
    ];
    mockDb.backup.findMany.mockResolvedValue(expired);
    mockDb.backup.updateMany.mockResolvedValue({ count: 2 });

    const result = await cleanExpiredBackups("t1");

    // where 含 expiresAt.lt + status.not deleted + tenantId
    const where = mockDb.backup.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t1");
    expect(where.expiresAt).toEqual({ lt: expect.any(Date) });
    expect(where.status).toEqual({ not: "deleted" });
    expect(mockDb.backup.updateMany).toHaveBeenCalled();
    expect(result.cleaned).toBe(2);
    expect(result.freedSpace).toBe(350);
  });

  it("无 tenantId → where 不含 tenantId", async () => {
    mockDb.backup.findMany.mockResolvedValue([]);
    mockDb.backup.updateMany.mockResolvedValue({ count: 0 });

    const result = await cleanExpiredBackups();

    expect(mockDb.backup.findMany.mock.calls[0][0].where).not.toHaveProperty("tenantId");
    expect(result.cleaned).toBe(0);
    expect(result.freedSpace).toBe(0);
  });

  it("findMany 抛错 → {0, 0}", async () => {
    mockDb.backup.findMany.mockRejectedValue(new Error("db down"));

    const result = await cleanExpiredBackups("t1");

    expect(result).toEqual({ cleaned: 0, freedSpace: 0 });
    expect(console.error).toHaveBeenCalledWith("清理过期备份失败:", expect.any(Error));
  });
});

// ─── getBackupStats ───────────────────────────────────────────────

describe("getBackupStats", () => {
  it("聚合计数/大小/首末时间", async () => {
    const oldest = new Date("2026-06-01T00:00:00Z");
    const newest = new Date("2026-07-09T00:00:00Z");
    mockDb.backup.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(7) // full
      .mockResolvedValueOnce(3); // incremental
    mockDb.backup.findMany.mockResolvedValue([
      { createdAt: oldest, size: 100 },
      { createdAt: newest, size: 200 },
    ]);

    const result = await getBackupStats("t1");

    expect(result.totalBackups).toBe(10);
    expect(result.fullBackups).toBe(7);
    expect(result.incrementalBackups).toBe(3);
    expect(result.totalSize).toBe(300);
    expect(result.oldestBackupAt).toEqual(oldest);
    expect(result.lastBackupAt).toEqual(newest);
  });

  it("无租户数据 → 全零（无异常）", async () => {
    mockDb.backup.count.mockResolvedValue(0);
    mockDb.backup.findMany.mockResolvedValue([]);

    const result = await getBackupStats();

    expect(result.totalBackups).toBe(0);
    expect(result.totalSize).toBe(0);
    expect(result.fullBackups).toBe(0);
    expect(result.incrementalBackups).toBe(0);
    expect(result.lastBackupAt).toBeUndefined();
    expect(result.oldestBackupAt).toBeUndefined();
  });

  it("异常降级 → 全零", async () => {
    mockDb.backup.count.mockRejectedValue(new Error("db down"));

    const result = await getBackupStats("t1");

    expect(result.totalBackups).toBe(0);
    expect(result.totalSize).toBe(0);
    expect(result.fullBackups).toBe(0);
    expect(result.incrementalBackups).toBe(0);
  });
});
