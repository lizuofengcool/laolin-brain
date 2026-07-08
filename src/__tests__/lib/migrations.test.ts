/**
 * migrations 模块单测
 *
 * 锁定 src/lib/migrations/index.ts 的行为契约（此前为零覆盖模块）：
 *   - checkMigrationStatus：迁移表/租户/遗留数据三段探测，内外层 try/catch 降级，
 *     isMigrated = hasTenantData && !hasLegacyData，currentVersion 仅在迁移表存在时查询。
 *   - migrateToMultiTenant：已迁移早返回（不进事务、不记录）/ 事务内逐用户建 free 租户
 *     + tenantUser(owner) + 迁文件/文件夹（OR: null|空 tenantId）/ 无用户 / 已有租户跳过 / 事务失败 catch。
 *   - initializeDefaultTenant：已有租户早返回 / 创建默认 free 租户(5GB) / 失败 catch。
 *   - initializeDefaultAdmin：已存在早返回 / 建 user + enterprise 租户(100GB) + tenantUser(owner)
 *     / 读取 ADMIN_EMAIL 覆盖默认 / 失败 catch。
 *   - runAllMigrations：编排迁移+初始化租户（+可选管理员），INIT_DEFAULT_ADMIN 门控，success = every。
 *
 * 隔离策略：vi.mock('@/lib/db') 暴露 $queryRaw/$executeRaw（tagged template，
 * vi.fn() 作为标签函数被调用，返回 Promise）+ $transaction（回调以 mockDb 为 tx）
 * + tenant/user/tenantUser/file/folder 模型方法，不触达真实数据库。
 * $transaction 默认实现于 beforeEach 重新注入（restoreAllMocks 后重建），保证事务成功路径默认可用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    tenant: { count: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    tenantUser: { create: vi.fn(), findFirst: vi.fn() },
    file: { updateMany: vi.fn() },
    folder: { updateMany: vi.fn() },
  };
  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

import {
  checkMigrationStatus,
  migrateToMultiTenant,
  initializeDefaultTenant,
  initializeDefaultAdmin,
  runAllMigrations,
  MIGRATION_VERSION,
} from "@/lib/migrations";

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction 默认把回调的 tx 参数指向 mockDb 自身（与实现中 tx 方法名一致故可复用），
  // 单测可覆盖为 reject 以走错误分支。restoreAllMocks 会清掉实现，故每轮重建。
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── checkMigrationStatus ─────────────────────────────────────────

describe("checkMigrationStatus", () => {
  it("迁移表存在 + 有版本 + 有租户 + 无遗留 → isMigrated=true，currentVersion 来自版本查询", async () => {
    // $queryRaw 调用顺序：① 迁移表探测 ② 遗留文件计数 ③ 版本
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ name: "_Migration" }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ version: "1.0.0" }]);
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result).toEqual({
      isMigrated: true,
      currentVersion: "1.0.0",
      hasTenantData: true,
      hasLegacyData: false,
    });
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(3);
    expect(mockDb.tenant.count).toHaveBeenCalledTimes(1);
  });

  it("迁移表不存在 → 跳过版本查询，currentVersion=null", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([]) // 迁移表
      .mockResolvedValueOnce([{ count: 0 }]); // 遗留文件
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result).toEqual({
      isMigrated: true,
      currentVersion: null,
      hasTenantData: true,
      hasLegacyData: false,
    });
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("存在遗留文件（tenantId 为空）→ hasLegacyData=true，isMigrated=false", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ name: "_Migration" }])
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([{ version: "1.0.0" }]);
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result.hasLegacyData).toBe(true);
    expect(result.isMigrated).toBe(false);
    expect(result.currentVersion).toBe("1.0.0");
  });

  it("遗留文件计数查询抛错 → 内层 catch 降级 hasLegacyData=false，版本查询仍执行", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ name: "_Migration" }])
      .mockRejectedValueOnce(new Error("no such column")) // 遗留文件查询抛错
      .mockResolvedValueOnce([{ version: "2.0.0" }]); // 版本查询
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result.hasLegacyData).toBe(false);
    expect(result.isMigrated).toBe(true);
    expect(result.currentVersion).toBe("2.0.0");
  });

  it("版本查询抛错 → 内层 catch 降级 currentVersion=null", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ name: "_Migration" }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockRejectedValueOnce(new Error("version table missing"));
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result.currentVersion).toBe(null);
    expect(result.isMigrated).toBe(true);
  });

  it("无租户数据 → hasTenantData=false，isMigrated=false", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([]) // 迁移表
      .mockResolvedValueOnce([{ count: 0 }]); // 遗留文件
    mockDb.tenant.count.mockResolvedValue(0);

    const result = await checkMigrationStatus();

    expect(result).toEqual({
      isMigrated: false,
      currentVersion: null,
      hasTenantData: false,
      hasLegacyData: false,
    });
  });

  it("首次 $queryRaw（迁移表探测）抛错 → 外层 catch 返回全 false 兜底", async () => {
    mockDb.$queryRaw.mockRejectedValueOnce(new Error("db offline"));
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await checkMigrationStatus();

    expect(result).toEqual({
      isMigrated: false,
      currentVersion: null,
      hasTenantData: false,
      hasLegacyData: false,
    });
    // tenant.count 在首次 $queryRaw 之后，外层 catch 时未执行
    expect(mockDb.tenant.count).not.toHaveBeenCalled();
  });
});

// ─── migrateToMultiTenant ─────────────────────────────────────────

describe("migrateToMultiTenant", () => {
  it("已迁移（isMigrated=true）→ 早返回，不进入事务，不记录迁移", async () => {
    // checkMigrationStatus：迁移表存在 + 版本 + 有租户 + 无遗留 → isMigrated=true
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ name: "_Migration" }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ version: "1.0.0" }]);
    mockDb.tenant.count.mockResolvedValue(1);
    mockDb.$executeRaw.mockResolvedValue(1);

    const result = await migrateToMultiTenant();

    expect(result.success).toBe(true);
    expect(result.message).toBe("已经是多租户架构，无需迁移");
    expect(result.tenantCreated).toBe(0);
    // ensureMigrationTable 在 checkMigrationStatus 之前执行（1 次），recordMigration 未执行
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("无用户 → 事务返回 {0,0,0}，记录迁移，success=true", async () => {
    // isMigrated=false：无租户 + 无迁移表
    mockDb.$queryRaw
      .mockResolvedValueOnce([]) // 迁移表
      .mockResolvedValueOnce([{ count: 0 }]); // 遗留文件
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([]);

    const result = await migrateToMultiTenant();

    expect(result.success).toBe(true);
    expect(result.tenantCreated).toBe(0);
    expect(result.filesMigrated).toBe(0);
    expect(result.foldersMigrated).toBe(0);
    expect(result.message).toContain("迁移完成");
    // ensureMigrationTable + recordMigration
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);

    // recordMigration 落库契约：迁移表名 + MIGRATION_VERSION + 'migrate-to-multi-tenant'
    // $executeRaw 作为 tagged template 调用，args = [strings, MIGRATION_TABLE, randomUUID(), version, name]
    const recordCall = mockDb.$executeRaw.mock.calls[1];
    expect(recordCall[1]).toBe("_Migration");
    expect(recordCall[3]).toBe(MIGRATION_VERSION);
    expect(recordCall[4]).toBe("migrate-to-multi-tenant");
    // ensureMigrationTable 的 $executeRaw 也用 _Migration 表名
    expect(mockDb.$executeRaw.mock.calls[0][1]).toBe("_Migration");
  });

  it("用户无租户 → 建 free 租户(5GB)+tenantUser(owner)+迁文件+迁文件夹，计数累加", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", email: "a@x.com" },
    ]);
    mockDb.tenantUser.findFirst.mockResolvedValue(null);
    mockDb.tenant.create.mockResolvedValue({ id: "t1", name: "Alice的工作空间" });
    mockDb.tenantUser.create.mockResolvedValue({});
    mockDb.file.updateMany.mockResolvedValue({ count: 3 });
    mockDb.folder.updateMany.mockResolvedValue({ count: 2 });

    const result = await migrateToMultiTenant();

    expect(result.success).toBe(true);
    expect(result.tenantCreated).toBe(1);
    expect(result.filesMigrated).toBe(3);
    expect(result.foldersMigrated).toBe(2);

    // 默认租户契约：free / active / 5GB / aiQuota 200
    expect(mockDb.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Alice的工作空间",
        plan: "free",
        status: "active",
        storageQuota: BigInt(5368709120),
        aiQuota: 200,
      }),
    });
    expect(mockDb.tenantUser.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", userId: "u1", role: "owner" },
    });
    // 文件迁移 where：userId + (tenantId 为空 OR 空串)
    expect(mockDb.file.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        OR: [{ tenantId: null }, { tenantId: "" }],
      },
      data: { tenantId: "t1" },
    });
    expect(mockDb.folder.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        OR: [{ tenantId: null }, { tenantId: "" }],
      },
      data: { tenantId: "t1" },
    });
    // 记录迁移
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("用户已存在 tenantUser → 跳过该用户，不建租户不迁文件", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([{ id: "u1", name: "A", email: "a@x.com" }]);
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: "t-exist" });

    const result = await migrateToMultiTenant();

    expect(result.success).toBe(true);
    expect(result.tenantCreated).toBe(0);
    expect(result.filesMigrated).toBe(0);
    expect(mockDb.tenant.create).not.toHaveBeenCalled();
    expect(mockDb.file.updateMany).not.toHaveBeenCalled();
    expect(mockDb.folder.updateMany).not.toHaveBeenCalled();
  });

  it("事务抛错 → catch 返回 success=false，message 含「迁移失败」，不记录迁移", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.$transaction.mockRejectedValueOnce(new Error("tx boom"));

    const result = await migrateToMultiTenant();

    expect(result.success).toBe(false);
    expect(result.message).toContain("迁移失败");
    // recordMigration 在事务之后，事务失败时不执行；仅 ensureMigrationTable 1 次
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

// ─── initializeDefaultTenant ──────────────────────────────────────

describe("initializeDefaultTenant", () => {
  it("已有租户 → 早返回，tenantId=null，不创建", async () => {
    mockDb.tenant.count.mockResolvedValue(1);

    const result = await initializeDefaultTenant();

    expect(result).toEqual({
      success: true,
      tenantId: null,
      message: "已有租户，无需初始化",
    });
    expect(mockDb.tenant.create).not.toHaveBeenCalled();
  });

  it("无租户 → 创建默认 free 租户(5GB)，返回 tenantId", async () => {
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.tenant.create.mockResolvedValue({ id: "t-default" });

    const result = await initializeDefaultTenant();

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe("t-default");
    expect(result.message).toBe("默认租户初始化成功");
    expect(mockDb.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "默认工作空间",
        plan: "free",
        status: "active",
        storageQuota: BigInt(5368709120),
        aiQuota: 200,
      }),
    });
  });

  it("创建抛错 → catch 返回 success=false，tenantId=null", async () => {
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.tenant.create.mockRejectedValue(new Error("create failed"));

    const result = await initializeDefaultTenant();

    expect(result.success).toBe(false);
    expect(result.tenantId).toBe(null);
    expect(result.message).toContain("初始化失败");
  });
});

// ─── initializeDefaultAdmin ───────────────────────────────────────

describe("initializeDefaultAdmin", () => {
  const origAdminEmail = process.env.ADMIN_EMAIL;
  const origAdminPassword = process.env.ADMIN_PASSWORD;

  afterEach(() => {
    // 恢复 env，避免污染后续 runAllMigrations 测试
    if (origAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = origAdminEmail;
    if (origAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = origAdminPassword;
  });

  it("管理员已存在 → 早返回，不创建", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    mockDb.user.findUnique.mockResolvedValue({ id: "u-admin", email: "admin@example.com" });

    const result = await initializeDefaultAdmin();

    expect(result).toEqual({
      success: true,
      userId: "u-admin",
      message: "管理员用户已存在",
    });
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.tenant.create).not.toHaveBeenCalled();
  });

  it("管理员不存在 → 创建 user + enterprise 租户(100GB) + tenantUser(owner)", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "admin123456";
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({ id: "u-admin", email: "admin@example.com" });
    mockDb.tenant.create.mockResolvedValue({ id: "t-admin" });
    mockDb.tenantUser.create.mockResolvedValue({});

    const result = await initializeDefaultAdmin();

    expect(result.success).toBe(true);
    expect(result.userId).toBe("u-admin");
    expect(result.message).toBe("默认管理员初始化成功");
    // 管理员租户契约：enterprise / 100GB / aiQuota 1000
    expect(mockDb.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plan: "enterprise",
        storageQuota: BigInt(107374182400),
        aiQuota: 1000,
      }),
    });
    expect(mockDb.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "系统管理员",
        email: "admin@example.com",
        password: "admin123456",
        storageMode: "cloud",
      }),
    });
    expect(mockDb.tenantUser.create).toHaveBeenCalledWith({
      data: { tenantId: "t-admin", userId: "u-admin", role: "owner" },
    });
  });

  it("读取 ADMIN_EMAIL 环境变量覆盖默认 admin@example.com", async () => {
    process.env.ADMIN_EMAIL = "custom@x.com";
    mockDb.user.findUnique.mockResolvedValue({ id: "u-c", email: "custom@x.com" });

    await initializeDefaultAdmin();

    expect(mockDb.user.findUnique).toHaveBeenCalledWith({
      where: { email: "custom@x.com" },
    });
  });

  it("user.create 抛错 → catch 返回 success=false，userId=null", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockRejectedValue(new Error("dup email"));

    const result = await initializeDefaultAdmin();

    expect(result.success).toBe(false);
    expect(result.userId).toBe(null);
    expect(result.message).toContain("初始化失败");
  });
});

// ─── runAllMigrations ─────────────────────────────────────────────

describe("runAllMigrations", () => {
  const origInitAdmin = process.env.INIT_DEFAULT_ADMIN;

  afterEach(() => {
    if (origInitAdmin === undefined) delete process.env.INIT_DEFAULT_ADMIN;
    else process.env.INIT_DEFAULT_ADMIN = origInitAdmin;
  });

  it("默认（INIT_DEFAULT_ADMIN 未设）→ 仅迁移+初始化租户两步，跳过管理员，success=true", async () => {
    delete process.env.INIT_DEFAULT_ADMIN;
    // migrateToMultiTenant: isMigrated=false（无租户 + 无迁移表），无用户 → {0,0,0}
    // $queryRaw 迁移表/遗留均返回空数组（遗留 [0]?.count = undefined → hasLegacyData=false）
    mockDb.$queryRaw.mockResolvedValue([]);
    // checkMigrationStatus 与 initializeDefaultTenant 各调一次 tenant.count，均 0
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1); // ensureMigrationTable + recordMigration
    mockDb.user.findMany.mockResolvedValue([]);
    // initializeDefaultTenant: tenant.count=0 → 创建默认租户
    mockDb.tenant.create.mockResolvedValue({ id: "t-default" });

    const result = await runAllMigrations();

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].name).toBe("迁移到多租户");
    expect(result.steps[1].name).toBe("初始化默认租户");
    expect(result.steps.every((s) => s.success)).toBe(true);
  });

  it("INIT_DEFAULT_ADMIN=true → 三步全跑，含初始化管理员", async () => {
    process.env.INIT_DEFAULT_ADMIN = "true";
    mockDb.$queryRaw.mockResolvedValue([]);
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([]);
    // 默认租户 + 管理员租户均经 tenant.create，返回同 id 不影响断言
    mockDb.tenant.create.mockResolvedValue({ id: "t-x" });
    // initializeDefaultAdmin: 管理员不存在 → 创建
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.user.create.mockResolvedValue({ id: "u-admin" });
    mockDb.tenantUser.create.mockResolvedValue({});

    const result = await runAllMigrations();

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[2].name).toBe("初始化默认管理员");
    expect(mockDb.user.create).toHaveBeenCalled();
  });

  it("某步失败 → 该步 success=false，整体 success=false，但仍跑完所有步", async () => {
    delete process.env.INIT_DEFAULT_ADMIN;
    mockDb.$queryRaw.mockResolvedValue([]);
    mockDb.tenant.count.mockResolvedValue(0);
    mockDb.$executeRaw.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([]);
    // migrateToMultiTenant 无用户不调 tenant.create；initializeDefaultTenant 调 → 失败
    mockDb.tenant.create.mockRejectedValue(new Error("create boom"));

    const result = await runAllMigrations();

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].success).toBe(true); // 迁移到多租户成功
    expect(result.steps[1].success).toBe(false); // 初始化默认租户失败
    expect(result.success).toBe(false);
  });
});
