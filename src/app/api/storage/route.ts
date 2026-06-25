import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 存储分析API
 * GET /api/storage/overview - 存储概览
 * GET /api/storage/by-type - 按文件类型统计
 * GET /api/storage/large-files - 大文件列表
 */

// ─── GET /api/storage/overview — 存储概览 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview'; // overview, by-type, large-files

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    switch (type) {
      case 'by-type':
        return await getStorageByType(userId, tenantId);
      case 'large-files':
        return await getLargeFiles(userId, tenantId, searchParams);
      case 'overview':
      default:
        return await getStorageOverview(userId, tenantId);
    }
  } catch (error) {
    console.error('Storage analysis failed:', error);
    return NextResponse.json(
      { error: '存储分析失败' },
      { status: 500 }
    );
  }
}

// ─── 存储概览 ─────────────
async function getStorageOverview(userId: string, tenantId: string) {
  // 统计文件数量和总大小
  const fileStats = await db.file.aggregate({
    where: {
      userId,
      tenantId,
      isDeleted: false,
    },
    _count: {
      id: true,
    },
    _sum: {
      fileSize: true,
    },
  });

  // 统计文件夹数量
  const folderCount = await db.folder.count({
    where: {
      userId,
      tenantId,
    },
  });

  // 统计已删除文件数量（回收站）
  const deletedCount = await db.file.count({
    where: {
      userId,
      tenantId,
      isDeleted: true,
    },
  });

  // 获取租户配额信息
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      storageQuota: true,
      aiQuota: true,
    },
  });

  const totalStorage = Number(fileStats._sum.fileSize || 0);
  const storageQuota = Number(tenant?.storageQuota || 10 * 1024 * 1024 * 1024); // 默认10GB
  const usagePercent = storageQuota > 0 ? (totalStorage / storageQuota) * 100 : 0;

  return NextResponse.json({
    totalFiles: fileStats._count.id,
    totalFolders: folderCount,
    totalStorage,
    storageQuota,
    usagePercent: Math.min(100, usagePercent),
    remainingStorage: Math.max(0, storageQuota - totalStorage),
    deletedFiles: deletedCount,
  });
}

// ─── 按文件类型统计 ─────────────
async function getStorageByType(userId: string, tenantId: string) {
  // 查询所有未删除的文件
  const files = await db.file.findMany({
    where: {
      userId,
      tenantId,
      isDeleted: false,
    },
    select: {
      fileType: true,
      fileSize: true,
    },
  });

  // 按类型统计
  const typeStats = new Map<string, { count: number; size: number }>();

  for (const file of files) {
    const type = file.fileType || 'other';
    if (!typeStats.has(type)) {
      typeStats.set(type, { count: 0, size: 0 });
    }
    const stats = typeStats.get(type)!;
    stats.count++;
    stats.size += file.fileSize || 0;
  }

  // 转换为数组并按大小排序
  const result = Array.from(typeStats.entries())
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      size: stats.size,
    }))
    .sort((a, b) => b.size - a.size);

  // 计算总数和总大小
  const totalCount = result.reduce((sum, item) => sum + item.count, 0);
  const totalSize = result.reduce((sum, item) => sum + item.size, 0);

  // 计算占比
  const resultWithPercent = result.map(item => ({
    ...item,
    countPercent: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
    sizePercent: totalSize > 0 ? (item.size / totalSize) * 100 : 0,
  }));

  return NextResponse.json({
    data: resultWithPercent,
    total: {
      count: totalCount,
      size: totalSize,
    },
  });
}

// ─── 大文件列表 ─────────────
async function getLargeFiles(
  userId: string,
  tenantId: string,
  searchParams: URLSearchParams
) {
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '20', 10));
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));

  // 计算总数
  const total = await db.file.count({
    where: {
      userId,
      tenantId,
      isDeleted: false,
    },
  });

  // 查询大文件（按大小降序）
  const largeFiles = await db.file.findMany({
    where: {
      userId,
      tenantId,
      isDeleted: false,
    },
    orderBy: {
      fileSize: 'desc',
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      createdAt: true,
      folderId: true,
      isFavorite: true,
    },
  });

  return NextResponse.json({
    data: largeFiles,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasMore: page * pageSize < total,
  });
}
