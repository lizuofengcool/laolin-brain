#!/usr/bin/env node
/**
 * 数据库迁移 CLI 工具
 * 
 * 使用方法：
 *   node scripts/migrate.js status    - 查看迁移状态
 *   node scripts/migrate.js run       - 运行所有迁移
 *   node scripts/migrate.js init      - 初始化默认租户和管理员
 */

import { runAllMigrations, checkMigrationStatus, initializeDefaultTenant, initializeDefaultAdmin } from '../src/lib/migrations/index.js';

async function main() {
  const command = process.argv[2] || 'status';

  console.log('='.repeat(60));
  console.log('  数据库迁移工具');
  console.log('='.repeat(60));
  console.log();

  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'run':
      await runMigrations();
      break;
    case 'init':
      await initializeSystem();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }

  console.log();
}

function showHelp() {
  console.log('使用方法:');
  console.log('  node scripts/migrate.js status    查看迁移状态');
  console.log('  node scripts/migrate.js run       运行所有迁移');
  console.log('  node scripts/migrate.js init      初始化默认租户和管理员');
  console.log('  node scripts/migrate.js help      显示帮助信息');
  console.log();
  console.log('环境变量:');
  console.log('  INIT_DEFAULT_ADMIN=true   初始化时创建默认管理员');
  console.log('  ADMIN_EMAIL=...          管理员邮箱');
  console.log('  ADMIN_PASSWORD=...       管理员密码');
}

async function showStatus() {
  console.log('📊 迁移状态检查');
  console.log('-'.repeat(40));

  const status = await checkMigrationStatus();

  console.log(`当前版本: ${status.currentVersion || '未迁移'}`);
  console.log(`是否已迁移: ${status.isMigrated ? '✅ 是' : '❌ 否'}`);
  console.log(`是否有租户数据: ${status.hasTenantData ? '✅ 是' : '❌ 否'}`);
  console.log(`是否有旧数据: ${status.hasLegacyData ? '⚠️ 是（需要迁移）' : '✅ 否'}`);

  if (status.hasLegacyData) {
    console.log();
    console.log('⚠️  检测到旧数据，建议运行迁移:');
    console.log('   node scripts/migrate.js run');
  }
}

async function runMigrations() {
  console.log('🚀 开始运行迁移');
  console.log('-'.repeat(40));

  const result = await runAllMigrations();

  console.log();
  console.log(result.success ? '✅ 迁移成功完成！' : '❌ 迁移部分失败');
  console.log();

  result.steps.forEach((step: any) => {
    const icon = step.success ? '✅' : '❌';
    console.log(`  ${icon} ${step.name}: ${step.message}`);
  });

  if (!result.success) {
    process.exit(1);
  }
}

async function initializeSystem() {
  console.log('🏗️  系统初始化');
  console.log('-'.repeat(40));

  // 初始化默认租户
  console.log('1. 初始化默认租户...');
  const tenantResult = await initializeDefaultTenant();
  console.log(`   ${tenantResult.success ? '✅' : '❌'} ${tenantResult.message}`);

  // 初始化默认管理员
  console.log('2. 初始化默认管理员...');
  const adminResult = await initializeDefaultAdmin();
  console.log(`   ${adminResult.success ? '✅' : '❌'} ${adminResult.message}`);

  console.log();
  console.log('🎉 系统初始化完成！');
}

main().catch((error) => {
  console.error('❌ 迁移工具执行失败:', error);
  process.exit(1);
});
