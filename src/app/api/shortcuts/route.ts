import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 快捷方式API
 * GET /api/shortcuts - 获取快捷方式列表
 * POST /api/shortcuts - 创建快捷方式
 */

// ─── GET /api/shortcuts — 获取快捷方式列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const isPinned = searchParams.get('isPinned');

    // 复用 authenticateRequest 已解析的 tenantId（auth 兜底建租户，无需再查 tenantUser）
    // 构建查询条件
    const where: any = {
      tenantId,
      userId,
    };

    if (isPinned !== null && isPinned !== undefined) {
      where.isPinned = isPinned === 'true';
    }

    // 查询快捷方式列表
    const shortcuts = await db.shortcut.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // 获取所有文件和文件夹ID
    const fileIds = shortcuts.filter(s => s.fileId).map(s => s.fileId!);
    const folderIds = shortcuts.filter(s => s.folderId).map(s => s.folderId!);

    // 批量查询文件和文件夹信息
    const [files, folders] = await Promise.all([
      fileIds.length > 0 ? db.file.findMany({
        where: { id: { in: fileIds }, tenantId },
        select: { id: true, fileName: true, fileType: true, fileSize: true, thumbnailUrl: true },
      }) : Promise.resolve([]),
      folderIds.length > 0 ? db.folder.findMany({
        where: { id: { in: folderIds }, tenantId },
        select: { id: true, name: true },
      }) : Promise.resolve([]),
    ]);

    // 创建映射
    const fileMap = new Map<string, any>(files.map(f => [f.id, f] as [string, any]));
    const folderMap = new Map<string, any>(folders.map(f => [f.id, f] as [string, any]));

    // 返回结果
    return NextResponse.json({
      data: shortcuts.map(shortcut => {
        const file = shortcut.fileId ? fileMap.get(shortcut.fileId) : null;
        const folder = shortcut.folderId ? folderMap.get(shortcut.folderId) : null;
        return {
          id: shortcut.id,
          name: shortcut.name,
          fileId: shortcut.fileId,
          folderId: shortcut.folderId,
          icon: shortcut.icon,
          sortOrder: shortcut.sortOrder,
          isPinned: shortcut.isPinned,
          fileInfo: file ? {
            fileName: file.fileName,
            fileType: file.fileType,
            fileSize: file.fileSize,
            thumbnailUrl: file.thumbnailUrl,
          } : null,
          folderInfo: folder ? {
            name: folder.name,
          } : null,
          createdAt: shortcut.createdAt,
        };
      }),
      total: shortcuts.length,
    });
  } catch (error) {
    console.error('Failed to fetch shortcuts:', error);
    return NextResponse.json(
      { error: '获取快捷方式列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/shortcuts — 创建快捷方式 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileId, folderId, name, icon, sortOrder = 0, isPinned = false } = body;

    if (!fileId && !folderId) {
      return NextResponse.json(
        { error: 'fileId or folderId is required' },
        { status: 400 }
      );
    }

    // 复用 authenticateRequest 已解析的 tenantId（auth 兜底建租户，无需再查 tenantUser）
    // 验证文件或文件夹存在
    if (fileId) {
      const file = await db.file.findFirst({
        where: { id: fileId, tenantId },
        select: { id: true, fileName: true },
      });
      if (!file) {
        return NextResponse.json(
          { error: '文件不存在' },
          { status: 404 }
        );
      }
      // 如果没有指定名称，使用文件名
      if (!name) {
        body.name = file.fileName;
      }
    }

    if (folderId) {
      const folder = await db.folder.findFirst({
        where: { id: folderId, tenantId },
        select: { id: true, name: true },
      });
      if (!folder) {
        return NextResponse.json(
          { error: '文件夹不存在' },
          { status: 404 }
        );
      }
      // 如果没有指定名称，使用文件夹名
      if (!name) {
        body.name = folder.name;
      }
    }

    // 检查是否已存在相同的快捷方式
    const existingShortcut = await db.shortcut.findFirst({
      where: {
        tenantId,
        userId,
        fileId: fileId || undefined,
        folderId: folderId || undefined,
      },
    });

    if (existingShortcut) {
      return NextResponse.json(
        { error: '该文件/文件夹已添加到快捷方式' },
        { status: 400 }
      );
    }

    // 创建快捷方式
    const shortcut = await db.shortcut.create({
      data: {
        tenantId,
        userId,
        fileId: fileId || null,
        folderId: folderId || null,
        name: body.name,
        icon: icon || null,
        sortOrder,
        isPinned,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: shortcut.id,
        name: shortcut.name,
        fileId: shortcut.fileId,
        folderId: shortcut.folderId,
        icon: shortcut.icon,
        sortOrder: shortcut.sortOrder,
        isPinned: shortcut.isPinned,
        createdAt: shortcut.createdAt,
      },
    });
  } catch (error) {
    console.error('Failed to create shortcut:', error);
    return NextResponse.json(
      { error: '创建快捷方式失败' },
      { status: 500 }
    );
  }
}
