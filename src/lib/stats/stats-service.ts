/**
 * 统计数据服务
 *
 * 从 /api/stats 路由抽离的统计查询逻辑，供路由与报表数据 fetcher 复用。
 * 所有函数均为只读：接收 tenantId（+ 可选时间范围），返回纯数据对象，
 * 不构造 NextResponse，不写库。
 *
 * 复用此模块而非 HTTP 自调用，避免运行时端口依赖与重复鉴权开销。
 */
import { db, createTenantDb } from '@/lib/db';

// 数据访问约定：file / folder 查询经 TenantDb 隔离层（访问器自动注入 tenantId，
// 不再在 where 手动拼接），与 storage 路由（第二百一十四轮）保持一致的租户隔离契约。
// tenantUser / accessHistory / user / aiUsageLog / tenant（getAiStats）等 TenantDb
// 未覆盖的模型仍走 db，由调用方自行以 tenantId 作用域（这些表无 TenantDb 访问器）。

// ─── 概览统计 ─────────────
export async function getOverviewStats(tenantId: string) {
  const tenantDb = createTenantDb(tenantId);

  // 总文件数（tenantDb.file.count 自动注入 tenantId）
  const totalFiles = await tenantDb.file.count({
    where: { isDeleted: false },
  });

  // 总文件夹数（tenantDb.folder.count 自动注入 tenantId，无业务过滤）
  const totalFolders = await tenantDb.folder.count();

  // 总存储使用量（tenantDb.file.aggregate 泛型透传，_sum.fileSize 精确推断）
  const storageResult = await tenantDb.file.aggregate({
    where: { isDeleted: false },
    _sum: { fileSize: true },
  });
  const totalStorage = storageResult._sum.fileSize || 0;

  // 回收站文件数
  const trashFiles = await tenantDb.file.count({
    where: { isDeleted: true },
  });

  // 用户数（TenantDb 无 tenantUser 访问器，走 db 并以 tenantId 作用域）
  const totalUsers = await db.tenantUser.count({
    where: { tenantId },
  });

  // 今日上传数
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUploads = await tenantDb.file.count({
    where: {
      isDeleted: false,
      createdAt: { gte: today },
    },
  });

  // 存储配额（默认10GB）
  const storageQuota = 10 * 1024 * 1024 * 1024; // 10GB
  const storageUsagePercent = Math.min(100, (totalStorage / storageQuota) * 100);

  return {
    totalFiles,
    totalFolders,
    totalStorage,
    storageQuota,
    storageUsagePercent,
    remainingStorage: Math.max(0, storageQuota - totalStorage),
    trashFiles,
    totalUsers,
    todayUploads,
  };
}

// ─── 按文件类型统计 ─────────────
export async function getStatsByType(tenantId: string) {
  const tenantDb = createTenantDb(tenantId);

  // 获取所有文件（tenantDb.file.findMany 自动注入 tenantId）
  const files = await tenantDb.file.findMany({
    where: { isDeleted: false },
    select: { fileType: true, fileSize: true },
  });

  // 按类型分组统计
  const typeMap = new Map<string, { count: number; size: number }>();

  for (const file of files) {
    const type = file.fileType || 'other';
    if (!typeMap.has(type)) {
      typeMap.set(type, { count: 0, size: 0 });
    }
    const stats = typeMap.get(type)!;
    stats.count++;
    stats.size += file.fileSize;
  }

  // 转换为数组并排序
  const types = Array.from(typeMap.entries()).map(([type, stats]) => ({
    type,
    count: stats.count,
    size: stats.size,
    countPercent: (stats.count / files.length) * 100,
    sizePercent: (stats.size / (files.reduce((sum, f) => sum + f.fileSize, 0) || 1)) * 100,
  })).sort((a, b) => b.size - a.size);

  return {
    types,
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.fileSize, 0),
  };
}

// ─── 趋势统计 ─────────────
export async function getTrendStats(tenantId: string, dateFrom?: string | null, dateTo?: string | null) {
  const tenantDb = createTenantDb(tenantId);

  // 默认最近30天
  const endDate = dateTo ? new Date(dateTo) : new Date();
  const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 生成日期列表
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 查询每天的文件数和存储量（tenantDb.file.* 自动注入 tenantId）
  const dailyStats: any[] = [];

  for (const date of dates) {
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    // 当天新增文件数
    const newFiles = await tenantDb.file.count({
      where: {
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    // 当天新增存储量
    const newStorageResult = await tenantDb.file.aggregate({
      where: {
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      _sum: { fileSize: true },
    });
    const newStorage = newStorageResult._sum.fileSize || 0;

    // 累计文件数（截止到当天）
    const totalFiles = await tenantDb.file.count({
      where: {
        createdAt: { lte: dayEnd },
      },
    });

    // 累计存储量（截止到当天）
    const totalStorageResult = await tenantDb.file.aggregate({
      where: {
        createdAt: { lte: dayEnd },
      },
      _sum: { fileSize: true },
    });
    const totalStorage = totalStorageResult._sum.fileSize || 0;

    dailyStats.push({
      date,
      newFiles,
      newStorage,
      totalFiles,
      totalStorage,
    });
  }

  return {
    dateFrom: startDate.toISOString().split('T')[0],
    dateTo: endDate.toISOString().split('T')[0],
    dailyStats,
  };
}

// ─── 活动统计 ─────────────
export async function getActivityStats(tenantId: string, dateFrom?: string | null, dateTo?: string | null) {
  const tenantDb = createTenantDb(tenantId);

  // 默认最近7天
  const endDate = dateTo ? new Date(dateTo) : new Date();
  const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 上传次数（tenantDb.file.count 自动注入 tenantId）
  const uploadCount = await tenantDb.file.count({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 删除次数（软删除）
  const deleteCount = await tenantDb.file.count({
    where: {
      deletedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 访问次数（TenantDb 无 accessHistory 访问器，走 db 并以 tenantId 作用域）
  const accessCount = await db.accessHistory.count({
    where: {
      tenantId,
      lastAccessedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 用户活跃度排名
  const userActivity = await db.accessHistory.groupBy({
    by: ['userId'],
    where: {
      tenantId,
      lastAccessedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  // 获取用户信息
  const userIds = userActivity.map(u => u.userId);
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return {
    dateFrom: startDate.toISOString().split('T')[0],
    dateTo: endDate.toISOString().split('T')[0],
    uploadCount,
    deleteCount,
    accessCount,
    userActivity: userActivity.map(u => ({
      userId: u.userId,
      userName: userMap.get(u.userId)?.name || '未知用户',
      userEmail: userMap.get(u.userId)?.email,
      accessCount: u._count.id,
    })),
  };
}

// ─── AI 使用统计 ─────────────
export async function getAiStats(tenantId: string) {
  // 读取租户 AI 配额。Tenant.aiUsed / aiQuota 由 checkAiQuotaAndTenant 在每次 AI 调用时
  // 维护：summarize / ocr / describe / generate-tags 四类 AI 路由 + 文档问答 askQuestion
  // （经 recordAiQnAUsage）均经 incrementTenantAiUsage 计入租户用量，故 aiUsed 反映
  // 当前配额窗口内的全部 AI 调用。
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { aiQuota: true, aiUsed: true, aiResetDate: true },
  });

  const now = new Date();
  // 配额按日重置：重置日期已过期（或从未设置）时，当前窗口的已用计次按 0 口径报告
  // （实际清零由下一次 AI 调用的 checkAiQuotaAndTenant 写回，此处只读、不写）
  const windowActive = !!tenant?.aiResetDate && tenant.aiResetDate > now;
  const quotaTotal = tenant?.aiQuota ?? 0;
  const quotaUsed = windowActive ? tenant?.aiUsed ?? 0 : 0;
  const quotaPercent = quotaTotal > 0 ? Math.round((quotaUsed / quotaTotal) * 100) : 0;

  // 按类型(summary/ocr/describe/tags/qna)拆分：聚合当前配额窗口内的 AiUsageLog。
  // 窗口起点 = aiResetDate - 24h（与 checkAiQuotaAndTenant 的 24h 重置口径一致），
  // 窗口未激活时不查询，各类型计次随 quotaUsed 一并按 0 报告，保持口径一致。
  let summaryCalls = 0;
  let ocrCalls = 0;
  let describeCalls = 0;
  let tagCalls = 0;
  let qnaCalls = 0;
  if (windowActive && tenant?.aiResetDate) {
    const windowStart = new Date(tenant.aiResetDate.getTime() - 24 * 60 * 60 * 1000);
    const groups = await db.aiUsageLog.groupBy({
      by: ['operation'],
      where: { tenantId, createdAt: { gte: windowStart } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const count = g._count._all;
      switch (g.operation) {
        case 'summary':
          summaryCalls = count;
          break;
        case 'ocr':
          ocrCalls = count;
          break;
        case 'describe':
          describeCalls = count;
          break;
        case 'tags':
          tagCalls = count;
          break;
        case 'qna':
          qnaCalls = count;
          break;
      }
    }
  }

  return {
    // 今日 AI 调用总次数（= 当前配额窗口内已用计次，五类 AI 路由统一计入 Tenant.aiUsed）
    totalCalls: quotaUsed,
    // 按类型拆分：聚合 AiUsageLog 当前窗口内的明细
    summaryCalls,
    ocrCalls,
    describeCalls,
    tagCalls,
    qnaCalls,
    quotaUsed,
    quotaTotal,
    quotaPercent,
  };
}
