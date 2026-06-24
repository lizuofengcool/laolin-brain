import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 访问历史和最近文件API
 * GET /api/access-history - 获取访问历史
 * POST /api/access-history - 记录访问
 * DELETE /api/access-history - 清除历史
 */

// ─── GET /api/access-history — 获取访问历史 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recent'; // recent / frequent / history
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));
    const accessType = searchParams.get('accessType') || 'view';

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

    let files: any[] = [];
    let total = 0;

    if (type === 'recent') {
      // 最近访问的文件
      const historyRecords = await db.accessHistory.findMany({
        where: {
          tenantId,
          userId,
          accessType,
        },
        orderBy: { lastAccessedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      total = await db.accessHistory.count({
        where: {
          tenantId,
          userId,
          accessType,
        },
      });

      // 获取文件信息
      const fileIds = historyRecords.map(h => h.fileId);
      const fileRecords = await db.file.findMany({
        where: { id: { in: fileIds }, tenantId },
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          folderId: true,
          thumbnailUrl: true,
          updatedAt: true,
        },
      });

      const fileMap = new Map(fileRecords.map(f => [f.id, f]));

      files = historyRecords.map(h => {
        const file = fileMap.get(h.fileId);
        return {
          id: h.fileId,
          fileName: file?.fileName || '未知文件',
          fileType: file?.fileType || 'other',
          fileSize: file?.fileSize || 0,
          folderId: file?.folderId,
          thumbnailUrl: file?.thumbnailUrl,
          accessCount: h.accessCount,
          lastAccessedAt: h.lastAccessedAt,
          updatedAt: file?.updatedAt,
        };
      }).filter(f => f.fileName !== '未知文件');

    } else if (type === 'frequent') {
      // 常用文件（按访问次数排序）
      const historyRecords = await db.accessHistory.findMany({
        where: {
          tenantId,
          userId,
          accessType,
        },
        orderBy: { accessCount: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      total = await db.accessHistory.count({
        where: {
          tenantId,
          userId,
          accessType,
        },
      });

      // 获取文件信息
      const fileIds = historyRecords.map(h => h.fileId);
      const fileRecords = await db.file.findMany({
        where: { id: { in: fileIds }, tenantId },
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          folderId: true,
          thumbnailUrl: true,
          updatedAt: true,
        },
      });

      const fileMap = new Map(fileRecords.map(f => [f.id, f]));

      files = historyRecords.map(h => {
        const file = fileMap.get(h.fileId);
        return {
          id: h.fileId,
          fileName: file?.fileName || '未知文件',
          fileType: file?.fileType || 'other',
          fileSize: file?.fileSize || 0,
          folderId: file?.folderId,
          thumbnailUrl: file?.thumbnailUrl,
          accessCount: h.accessCount,
          lastAccessedAt: h.lastAccessedAt,
          updatedAt: file?.updatedAt,
        };
      }).filter(f => f.fileName !== '未知文件');

    } else if (type === 'recent-uploaded') {
      // 最近上传的文件
      const fileRecords = await db.file.findMany({
        where: {
          tenantId,
          userId,
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          folderId: true,
          thumbnailUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      total = await db.file.count({
        where: {
          tenantId,
          userId,
          isDeleted: false,
        },
      });

      files = fileRecords.map(f => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        folderId: f.folderId,
        thumbnailUrl: f.thumbnailUrl,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));

    } else if (type === 'recent-modified') {
      // 最近修改的文件
      const fileRecords = await db.file.findMany({
        where: {
          tenantId,
          userId,
          isDeleted: false,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          folderId: true,
          thumbnailUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      total = await db.file.count({
        where: {
          tenantId,
          userId,
          isDeleted: false,
        },
      });

      files = fileRecords.map(f => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        folderId: f.folderId,
        thumbnailUrl: f.thumbnailUrl,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
    }

    // 返回分页结果
    return NextResponse.json({
      data: files,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch access history:', error);
    return NextResponse.json(
      { error: '获取访问历史失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/access-history — 记录访问 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { fileId, accessType = 'view' } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId is required' },
        { status: 400 }
      );
    }

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

    // 验证文件存在
    const file = await db.file.findFirst({
      where: { id: fileId, tenantId },
      select: { id: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // 检查是否已有访问记录
    const existingRecord = await db.accessHistory.findFirst({
      where: {
        tenantId,
        userId,
        fileId,
        accessType,
      },
    });

    if (existingRecord) {
      // 更新访问次数和时间
      await db.accessHistory.update({
        where: { id: existingRecord.id },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });
    } else {
      // 创建新的访问记录
      await db.accessHistory.create({
        data: {
          tenantId,
          userId,
          fileId,
          accessType,
          accessCount: 1,
          lastAccessedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: '访问已记录',
    });
  } catch (error) {
    console.error('Failed to record access:', error);
    return NextResponse.json(
      { error: '记录访问失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/access-history — 清除历史 ─────────────
export async function DELETE(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

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

    if (fileId) {
      // 删除单个文件的访问记录
      await db.accessHistory.deleteMany({
        where: {
          tenantId,
          userId,
          fileId,
        },
      });
    } else {
      // 清除所有访问历史
      await db.accessHistory.deleteMany({
        where: {
          tenantId,
          userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: fileId ? '已清除该文件的访问记录' : '已清除所有访问历史',
    });
  } catch (error) {
    console.error('Failed to clear access history:', error);
    return NextResponse.json(
      { error: '清除访问历史失败' },
      { status: 500 }
    );
  }
}
