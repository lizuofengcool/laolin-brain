/**
 * 数据库迁移工具
 * 
 * 功能：
 * 1. 从单租户到多租户的数据迁移
 * 2. 迁移状态管理
 * 3. 首次启动初始化
 */

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

// 迁移版本
export const MIGRATION_VERSION = '1.0.0';

// 迁移状态表名
const MIGRATION_TABLE = '_Migration';

/**
 * 检查迁移状态
 */
export async function checkMigrationStatus(): Promise<{
  isMigrated: boolean;
  currentVersion: string | null;
  hasTenantData: boolean;
  hasLegacyData: boolean;
}> {
  try {
    // 检查是否有迁移表
    const hasMigrationTable = await db.$queryRaw`
      SELECT name FROM sqlite_master WHERE type='table' AND name=${MIGRATION_TABLE}
    ` as any[];

    // 检查是否有租户数据
    const tenantCount = await db.tenant.count();
    const hasTenantData = tenantCount > 0;

    // 检查是否有旧数据（没有tenantId的文件）
    let hasLegacyData = false;
    try {
      const legacyFiles = await db.$queryRaw`
        SELECT COUNT(*) as count FROM File WHERE tenantId IS NULL OR tenantId = ''
      ` as any[];
      hasLegacyData = legacyFiles[0]?.count > 0;
    } catch (e) {
      // File表可能不存在，或者没有tenantId字段
      hasLegacyData = false;
    }

    let currentVersion: string | null = null;
    if (hasMigrationTable.length > 0) {
      try {
        const migrations = await db.$queryRaw`
          SELECT version FROM ${MIGRATION_TABLE} ORDER BY appliedAt DESC LIMIT 1
        ` as any[];
        currentVersion = migrations[0]?.version || null;
      } catch (e) {
        currentVersion = null;
      }
    }

    return {
      isMigrated: hasTenantData && !hasLegacyData,
      currentVersion,
      hasTenantData,
      hasLegacyData,
    };
  } catch (error) {
    console.error('检查迁移状态失败:', error);
    return {
      isMigrated: false,
      currentVersion: null,
      hasTenantData: false,
      hasLegacyData: false,
    };
  }
}

/**
 * 创建迁移表
 */
async function ensureMigrationTable(): Promise<void> {
  await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      appliedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

/**
 * 记录迁移
 */
async function recordMigration(version: string, name: string): Promise<void> {
  await db.$executeRaw`
    INSERT INTO ${MIGRATION_TABLE} (id, version, name)
    VALUES (${randomUUID()}, ${version}, ${name})
  `;
}

/**
 * 迁移1：初始化多租户架构
 * 
 * 为现有用户创建默认租户，并迁移所有数据到该租户
 */
export async function migrateToMultiTenant(): Promise<{
  success: boolean;
  tenantCreated: number;
  filesMigrated: number;
  foldersMigrated: number;
  message: string;
}> {
  const result = {
    success: false,
    tenantCreated: 0,
    filesMigrated: 0,
    foldersMigrated: 0,
    message: '',
  };

  try {
    await ensureMigrationTable();

    // 检查是否已经迁移过
    const status = await checkMigrationStatus();
    if (status.isMigrated) {
      result.success = true;
      result.message = '已经是多租户架构，无需迁移';
      return result;
    }

    // 使用事务执行迁移
    const migrationResult = await db.$transaction(async (tx) => {
      let tenantCreated = 0;
      let filesMigrated = 0;
      let foldersMigrated = 0;

      // 1. 获取所有用户
      const users = await tx.user.findMany();
      
      if (users.length === 0) {
        return { tenantCreated: 0, filesMigrated: 0, foldersMigrated: 0 };
      }

      // 2. 为每个用户创建默认租户
      for (const user of users) {
        // 检查用户是否已有租户
        const existingTenantUser = await tx.tenantUser.findFirst({
          where: { userId: user.id },
        });

        if (existingTenantUser) {
          continue;
        }

        // 创建默认租户
        const tenant = await tx.tenant.create({
          data: {
            name: `${user.name}的工作空间`,
            plan: 'free',
            status: 'active',
            storageQuota: BigInt(5368709120), // 5GB
            aiQuota: 200,
          },
        });

        // 创建租户-用户关联
        await tx.tenantUser.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'owner',
          },
        });

        tenantCreated++;

        // 3. 迁移该用户的文件到租户
        const filesUpdateResult = await tx.file.updateMany({
          where: {
            userId: user.id,
            OR: [
              { tenantId: null as any },
              { tenantId: '' },
            ],
          },
          data: {
            tenantId: tenant.id,
          },
        });
        filesMigrated += filesUpdateResult.count;

        // 4. 迁移该用户的文件夹到租户
        const foldersUpdateResult = await tx.folder.updateMany({
          where: {
            userId: user.id,
            OR: [
              { tenantId: null as any },
              { tenantId: '' },
            ],
          },
          data: {
            tenantId: tenant.id,
          },
        });
        foldersMigrated += foldersUpdateResult.count;

        console.log(`用户 ${user.email} 迁移完成：创建租户 ${tenant.name}，迁移 ${filesUpdateResult.count} 个文件，${foldersUpdateResult.count} 个文件夹`);
      }

      return { tenantCreated, filesMigrated, foldersMigrated };
    });

    result.tenantCreated = migrationResult.tenantCreated;
    result.filesMigrated = migrationResult.filesMigrated;
    result.foldersMigrated = migrationResult.foldersMigrated;
    result.success = true;
    result.message = `迁移完成：创建 ${migrationResult.tenantCreated} 个租户，迁移 ${migrationResult.filesMigrated} 个文件，${migrationResult.foldersMigrated} 个文件夹`;

    // 记录迁移
    await recordMigration(MIGRATION_VERSION, 'migrate-to-multi-tenant');

    console.log(result.message);
    return result;
  } catch (error) {
    console.error('迁移失败:', error);
    result.success = false;
    result.message = `迁移失败: ${error instanceof Error ? error.message : String(error)}`;
    return result;
  }
}

/**
 * 初始化默认租户（首次启动时）
 */
export async function initializeDefaultTenant(): Promise<{
  success: boolean;
  tenantId: string | null;
  message: string;
}> {
  try {
    // 检查是否已有租户
    const tenantCount = await db.tenant.count();
    if (tenantCount > 0) {
      return {
        success: true,
        tenantId: null,
        message: '已有租户，无需初始化',
      };
    }

    // 创建默认租户
    const defaultTenant = await db.tenant.create({
      data: {
        name: '默认工作空间',
        plan: 'free',
        status: 'active',
        storageQuota: BigInt(5368709120), // 5GB
        aiQuota: 200,
      },
    });

    console.log(`默认租户创建成功: ${defaultTenant.id}`);

    return {
      success: true,
      tenantId: defaultTenant.id,
      message: '默认租户初始化成功',
    };
  } catch (error) {
    console.error('初始化默认租户失败:', error);
    return {
      success: false,
      tenantId: null,
      message: `初始化失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 初始化默认管理员用户
 */
export async function initializeDefaultAdmin(): Promise<{
  success: boolean;
  userId: string | null;
  message: string;
}> {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';

    // 检查管理员是否已存在
    const existingAdmin = await db.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      return {
        success: true,
        userId: existingAdmin.id,
        message: '管理员用户已存在',
      };
    }

    // 创建管理员用户
    // 注意：实际使用时应该使用bcrypt加密密码
    const adminUser = await db.user.create({
      data: {
        name: '系统管理员',
        email: adminEmail,
        password: adminPassword, // 实际应该加密
        storageMode: 'cloud',
      },
    });

    // 为管理员创建租户
    const adminTenant = await db.tenant.create({
      data: {
        name: '管理员工作空间',
        plan: 'enterprise',
        status: 'active',
        storageQuota: BigInt(107374182400), // 100GB
        aiQuota: 1000,
      },
    });

    // 关联租户和用户
    await db.tenantUser.create({
      data: {
        tenantId: adminTenant.id,
        userId: adminUser.id,
        role: 'owner',
      },
    });

    console.log(`默认管理员创建成功: ${adminEmail}`);

    return {
      success: true,
      userId: adminUser.id,
      message: '默认管理员初始化成功',
    };
  } catch (error) {
    console.error('初始化默认管理员失败:', error);
    return {
      success: false,
      userId: null,
      message: `初始化失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 运行所有初始化
 */
export async function runAllMigrations(): Promise<{
  success: boolean;
  steps: Array<{ name: string; success: boolean; message: string }>;
}> {
  const steps: Array<{ name: string; success: boolean; message: string }> = [];

  console.log('开始运行数据库迁移和初始化...');

  // 步骤1：迁移到多租户
  const migrateResult = await migrateToMultiTenant();
  steps.push({
    name: '迁移到多租户',
    success: migrateResult.success,
    message: migrateResult.message,
  });

  // 步骤2：初始化默认租户
  const tenantResult = await initializeDefaultTenant();
  steps.push({
    name: '初始化默认租户',
    success: tenantResult.success,
    message: tenantResult.message,
  });

  // 步骤3：初始化默认管理员（如果配置了环境变量）
  if (process.env.INIT_DEFAULT_ADMIN === 'true') {
    const adminResult = await initializeDefaultAdmin();
    steps.push({
      name: '初始化默认管理员',
      success: adminResult.success,
      message: adminResult.message,
    });
  }

  const allSuccess = steps.every(s => s.success);

  console.log('迁移和初始化完成:', allSuccess ? '全部成功' : '部分失败');
  steps.forEach(step => {
    console.log(`  ${step.success ? '✅' : '❌'} ${step.name}: ${step.message}`);
  });

  return {
    success: allSuccess,
    steps,
  };
}

export default {
  checkMigrationStatus,
  migrateToMultiTenant,
  initializeDefaultTenant,
  initializeDefaultAdmin,
  runAllMigrations,
};
