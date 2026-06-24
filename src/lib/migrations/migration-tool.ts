/**
 * 数据库迁移工具
 * 支持版本管理、增量迁移、回滚等功能
 */

import prisma from "@/lib/db/prisma";

// 迁移版本信息
export interface MigrationInfo {
  version: string;
  name: string;
  description: string;
  appliedAt: Date;
  status: "applied" | "pending" | "failed";
  duration: number; // 毫秒
}

// 迁移脚本定义
export interface MigrationScript {
  version: string;
  name: string;
  description: string;
  up: () => Promise<void>;
  down?: () => Promise<void>;
}

// 迁移状态
export interface MigrationStatus {
  currentVersion: string;
  latestVersion: string;
  pendingMigrations: MigrationScript[];
  appliedMigrations: MigrationInfo[];
  isLatest: boolean;
}

/**
 * 迁移脚本列表（按版本号排序）
 */
const MIGRATION_SCRIPTS: MigrationScript[] = [
  {
    version: "1.0.0",
    name: "initial_schema",
    description: "初始数据库Schema",
    up: async () => {
      // Prisma schema已经定义了初始结构
      // 这里可以执行额外的初始化操作
    },
    down: async () => {
      // 回滚操作
    },
  },
  {
    version: "1.1.0",
    name: "multi_tenant",
    description: "多租户架构升级",
    up: async () => {
      // 多租户迁移逻辑
      // 为现有数据填充tenantId
    },
    down: async () => {
      // 回滚多租户
    },
  },
  {
    version: "1.2.0",
    name: "ai_features",
    description: "AI功能相关字段",
    up: async () => {
      // AI功能迁移
    },
    down: async () => {
      // 回滚AI功能
    },
  },
  {
    version: "1.3.0",
    name: "sharing_collaboration",
    description: "分享和协作功能",
    up: async () => {
      // 分享协作迁移
    },
    down: async () => {
      // 回滚分享协作
    },
  },
  {
    version: "1.4.0",
    name: "notifications_audit",
    description: "通知和审计日志",
    up: async () => {
      // 通知和审计迁移
    },
    down: async () => {
      // 回滚通知和审计
    },
  },
  {
    version: "1.5.0",
    name: "team_collaboration",
    description: "团队协作功能",
    up: async () => {
      // 团队协作迁移
    },
    down: async () => {
      // 回滚团队协作
    },
  },
  {
    version: "1.6.0",
    name: "advanced_features",
    description: "高级功能（自动化规则、快捷方式等）",
    up: async () => {
      // 高级功能迁移
    },
    down: async () => {
      // 回滚高级功能
    },
  },
  {
    version: "1.7.0",
    name: "open_platform",
    description: "开放平台（API密钥、Webhook）",
    up: async () => {
      // 开放平台迁移
    },
    down: async () => {
      // 回滚开放平台
    },
  },
];

/**
 * 确保迁移表存在
 */
async function ensureMigrationTable(): Promise<void> {
  try {
    // 检查迁移表是否存在
    await prisma.$queryRaw`
      CREATE TABLE IF NOT EXISTS "_Migration" (
        "version" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'applied',
        "duration" INTEGER DEFAULT 0
      )
    `;
  } catch (error) {
    console.error("创建迁移表失败:", error);
    throw error;
  }
}

/**
 * 获取已应用的迁移列表
 */
async function getAppliedMigrations(): Promise<MigrationInfo[]> {
  try {
    await ensureMigrationTable();

    const result = await prisma.$queryRaw<
      {
        version: string;
        name: string;
        description: string | null;
        appliedAt: Date;
        status: string;
        duration: number | null;
      }[]
    >`
      SELECT * FROM "_Migration" ORDER BY "appliedAt" DESC
    `;

    return result.map((m) => ({
      version: m.version,
      name: m.name,
      description: m.description || "",
      appliedAt: new Date(m.appliedAt),
      status: m.status as "applied" | "pending" | "failed",
      duration: m.duration || 0,
    }));
  } catch (error) {
    console.error("获取已应用迁移失败:", error);
    return [];
  }
}

/**
 * 记录迁移执行
 */
async function recordMigration(
  version: string,
  name: string,
  description: string,
  duration: number,
  status: "applied" | "failed" = "applied"
): Promise<void> {
  try {
    await prisma.$queryRaw`
      INSERT OR REPLACE INTO "_Migration" ("version", "name", "description", "appliedAt", "status", "duration")
      VALUES (${version}, ${name}, ${description}, CURRENT_TIMESTAMP, ${status}, ${duration})
    `;
  } catch (error) {
    console.error("记录迁移失败:", error);
    throw error;
  }
}

/**
 * 删除迁移记录（回滚时）
 */
async function removeMigrationRecord(version: string): Promise<void> {
  try {
    await prisma.$queryRaw`
      DELETE FROM "_Migration" WHERE "version" = ${version}
    `;
  } catch (error) {
    console.error("删除迁移记录失败:", error);
    throw error;
  }
}

/**
 * 获取迁移状态
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const appliedMigrations = await getAppliedMigrations();
  const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

  const pendingMigrations = MIGRATION_SCRIPTS.filter(
    (m) => !appliedVersions.has(m.version)
  );

  const latestVersion =
    MIGRATION_SCRIPTS[MIGRATION_SCRIPTS.length - 1]?.version || "0.0.0";
  const currentVersion = appliedMigrations[0]?.version || "0.0.0";

  return {
    currentVersion,
    latestVersion,
    pendingMigrations,
    appliedMigrations,
    isLatest: pendingMigrations.length === 0,
  };
}

/**
 * 执行迁移
 */
export async function runMigrations(
  targetVersion?: string
): Promise<{
  success: boolean;
  applied: string[];
  failed: string[];
  totalDuration: number;
}> {
  const status = await getMigrationStatus();
  const applied: string[] = [];
  const failed: string[] = [];
  let totalDuration = 0;

  // 确定需要执行的迁移
  let migrationsToRun = status.pendingMigrations;

  // 如果指定了目标版本，只执行到该版本
  if (targetVersion) {
    const targetIndex = MIGRATION_SCRIPTS.findIndex(
      (m) => m.version === targetVersion
    );
    if (targetIndex === -1) {
      throw new Error(`目标版本 ${targetVersion} 不存在`);
    }
    migrationsToRun = migrationsToRun.filter((_, index) => {
      const scriptIndex = MIGRATION_SCRIPTS.findIndex(
        (m) => m.version === migrationsToRun[index].version
      );
      return scriptIndex <= targetIndex;
    });
  }

  // 按顺序执行迁移
  for (const migration of migrationsToRun) {
    const startTime = Date.now();
    console.log(`执行迁移: ${migration.version} - ${migration.name}`);

    try {
      await migration.up();
      const duration = Date.now() - startTime;
      totalDuration += duration;

      await recordMigration(
        migration.version,
        migration.name,
        migration.description,
        duration,
        "applied"
      );

      applied.push(migration.version);
      console.log(`迁移完成: ${migration.version} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      totalDuration += duration;

      await recordMigration(
        migration.version,
        migration.name,
        migration.description,
        duration,
        "failed"
      );

      failed.push(migration.version);
      console.error(`迁移失败: ${migration.version}`, error);

      // 遇到失败停止执行
      break;
    }
  }

  return {
    success: failed.length === 0,
    applied,
    failed,
    totalDuration,
  };
}

/**
 * 回滚迁移
 */
export async function rollbackMigration(
  version: string
): Promise<{
  success: boolean;
  rolledBack: string;
  duration: number;
}> {
  const migration = MIGRATION_SCRIPTS.find((m) => m.version === version);
  if (!migration) {
    throw new Error(`迁移版本 ${version} 不存在`);
  }

  if (!migration.down) {
    throw new Error(`迁移版本 ${version} 不支持回滚`);
  }

  const startTime = Date.now();
  console.log(`回滚迁移: ${version} - ${migration.name}`);

  try {
    await migration.down();
    const duration = Date.now() - startTime;

    await removeMigrationRecord(version);

    console.log(`回滚完成: ${version} (${duration}ms)`);

    return {
      success: true,
      rolledBack: version,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`回滚失败: ${version}`, error);
    throw error;
  }
}

/**
 * 回滚到指定版本
 */
export async function rollbackToVersion(
  targetVersion: string
): Promise<{
  success: boolean;
  rolledBack: string[];
  totalDuration: number;
}> {
  const appliedMigrations = await getAppliedMigrations();
  const targetIndex = MIGRATION_SCRIPTS.findIndex(
    (m) => m.version === targetVersion
  );

  if (targetIndex === -1) {
    throw new Error(`目标版本 ${targetVersion} 不存在`);
  }

  // 需要回滚的迁移（从新到旧）
  const migrationsToRollback = appliedMigrations.filter((m) => {
    const index = MIGRATION_SCRIPTS.findIndex((s) => s.version === m.version);
    return index > targetIndex;
  });

  const rolledBack: string[] = [];
  let totalDuration = 0;

  for (const migration of migrationsToRollback) {
    try {
      const result = await rollbackMigration(migration.version);
      rolledBack.push(migration.version);
      totalDuration += result.duration;
    } catch (error) {
      console.error(`回滚失败，停止: ${migration.version}`, error);
      break;
    }
  }

  return {
    success: true,
    rolledBack,
    totalDuration,
  };
}

/**
 * 迁移前检查
 */
export async function preMigrationCheck(): Promise<{
  canMigrate: boolean;
  issues: string[];
  warnings: string[];
}> {
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // 检查数据库连接
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      issues.push("数据库连接失败");
    }

    // 检查是否有未完成的迁移
    const appliedMigrations = await getAppliedMigrations();
    const failedMigrations = appliedMigrations.filter(
      (m) => m.status === "failed"
    );

    if (failedMigrations.length > 0) {
      issues.push(
        `存在 ${failedMigrations.length} 个失败的迁移，请先处理: ${failedMigrations
          .map((m) => m.version)
          .join(", ")}`
      );
    }

    // 检查磁盘空间（简单检查）
    // 实际项目中可以检查数据库文件大小等

    // 警告：建议备份
    warnings.push("迁移前建议先备份数据库");

    return {
      canMigrate: issues.length === 0,
      issues,
      warnings,
    };
  } catch (error) {
    return {
      canMigrate: false,
      issues: [`迁移检查失败: ${error}`],
      warnings: [],
    };
  }
}

/**
 * 迁移后验证
 */
export async function postMigrationValidation(): Promise<{
  valid: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}> {
  const checks: {
    name: string;
    passed: boolean;
    message: string;
  }[] = [];

  try {
    // 检查所有表是否存在
    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    `;

    checks.push({
      name: "表存在性检查",
      passed: tables.length > 0,
      message: `找到 ${tables.length} 个表`,
    });

    // 检查迁移表
    const migrationTable = tables.find((t) => t.name === "_Migration");
    checks.push({
      name: "迁移表检查",
      passed: !!migrationTable,
      message: migrationTable ? "迁移表存在" : "迁移表不存在",
    });

    // 检查多租户字段
    try {
      const files = await prisma.$queryRaw`
        SELECT "tenantId" FROM "File" LIMIT 1
      `;
      checks.push({
        name: "多租户字段检查",
        passed: true,
        message: "File表包含tenantId字段",
      });
    } catch (error) {
      checks.push({
        name: "多租户字段检查",
        passed: false,
        message: "File表缺少tenantId字段",
      });
    }

    const valid = checks.every((c) => c.passed);

    return {
      valid,
      checks,
    };
  } catch (error) {
    return {
      valid: false,
      checks: [
        {
          name: "验证异常",
          passed: false,
          message: `验证失败: ${error}`,
        },
      ],
    };
  }
}

/**
 * 获取迁移脚本列表
 */
export function getMigrationScripts(): MigrationScript[] {
  return MIGRATION_SCRIPTS;
}

/**
 * 获取最新版本号
 */
export function getLatestVersion(): string {
  return MIGRATION_SCRIPTS[MIGRATION_SCRIPTS.length - 1]?.version || "0.0.0";
}
