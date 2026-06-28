import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 统计报表API
 * GET /api/stats - 获取统计数据
 * type: overview / by-type / trend / activity / ai
 */

// ─── GET /api/stats — 获取统计数据 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 检查权限：只有owner和admin可以查看统计
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看统计数据' },
        { status: 403 }
      );
    }

    let result: any = {};

    switch (type) {
      case 'overview':
        result = await getOverviewStats(tenantId);
        break;
      case 'by-type':
        result = await getStatsByType(tenantId);
        break;
      case 'trend':
        result = await getTrendStats(tenantId, dateFrom, dateTo);
        break;
      case 'activity':
        result = await getActivityStats(tenantId, dateFrom, dateTo);
        break;
      case 'ai':
        result = await getAiStats(tenantId);
        break;
      default:
        result = await getOverviewStats(tenantId);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}

// ─── 获取概览统计 ─────────────
async function getOverviewStats(tenantId: string) {
  // 总文件数
  const totalFiles = await db.file.count({
    where: { tenantId, isDeleted: false },
  });

  // 总文件夹数
  const totalFolders = await db.folder.count({
    where: { tenantId },
  });

  // 总存储使用量
  const storageResult = await db.file.aggregate({
    where: { tenantId, isDeleted: false },
    _sum: { fileSize: true },
  });
  const totalStorage = storageResult._sum.fileSize || 0;

  // 回收站文件数
  const trashFiles = await db.file.count({
    where: { tenantId, isDeleted: true },
  });

  // 用户数
  const totalUsers = await db.tenantUser.count({
    where: { tenantId },
  });

  // 今日上传数
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUploads = await db.file.count({
    where: {
      tenantId,
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
async function getStatsByType(tenantId: string) {
  // 获取所有文件
  const files = await db.file.findMany({
    where: { tenantId, isDeleted: false },
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

// ─── 获取趋势统计 ─────────────
async function getTrendStats(tenantId: string, dateFrom?: string | null, dateTo?: string | null) {
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

  // 查询每天的文件数和存储量
  const dailyStats: any[] = [];

  for (const date of dates) {
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    // 当天新增文件数
    const newFiles = await db.file.count({
      where: {
        tenantId,
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    // 当天新增存储量
    const newStorageResult = await db.file.aggregate({
      where: {
        tenantId,
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      _sum: { fileSize: true },
    });
    const newStorage = newStorageResult._sum.fileSize || 0;

    // 累计文件数（截止到当天）
    const totalFiles = await db.file.count({
      where: {
        tenantId,
        createdAt: { lte: dayEnd },
      },
    });

    // 累计存储量（截止到当天）
    const totalStorageResult = await db.file.aggregate({
      where: {
        tenantId,
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

// ─── 获取活动统计 ─────────────
async function getActivityStats(tenantId: string, dateFrom?: string | null, dateTo?: string | null) {
  // 默认最近7天
  const endDate = dateTo ? new Date(dateTo) : new Date();
  const startDate = dateFrom ? new Date(dateFrom) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 上传次数
  const uploadCount = await db.file.count({
    where: {
      tenantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 删除次数（软删除）
  const deleteCount = await db.file.count({
    where: {
      tenantId,
      deletedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // 访问次数
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

// ─── 获取AI使用统计 ─────────────
async function getAiStats(tenantId: string) {
  // 读取租户 AI 配额。Tenant.aiUsed / aiQuota 由 checkAiQuotaAndTenant 在每次 AI 调用时
  // 维护：summarize / ocr / describe / generate-tags 四类 AI 路由均经 incrementTenantAiUsage
  // 计入租户用量，故 aiUsed 反映当前配额窗口内的全部 AI 调用。
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

  return {
    // 今日 AI 调用总次数（= 当前配额窗口内已用计次，四类 AI 路由统一计入 Tenant.aiUsed）
    totalCalls: quotaUsed,
    // 按类型(summary/ocr/describe/tags)拆分需独立的 AiUsageLog 表记录，当前尚未落地，如实返回 0
    summaryCalls: 0,
    ocrCalls: 0,
    describeCalls: 0,
    tagCalls: 0,
    quotaUsed,
    quotaTotal,
    quotaPercent,
  };
}
