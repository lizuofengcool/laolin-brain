import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

/**
 * 批量操作API
 * POST /api/files/batch
 * 
 * 支持的操作：
 * - delete: 批量删除（软删除）
 * - restore: 批量恢复（从回收站恢复）
 * - move: 批量移动到文件夹
 * - addTags: 批量添加标签
 * - removeTags: 批量移除标签
 * - favorite: 批量收藏
 * - unfavorite: 批量取消收藏
 */

interface BatchOperation {
  type: 'delete' | 'restore' | 'move' | 'addTags' | 'removeTags' | 'favorite' | 'unfavorite';
  fileIds: string[];
  folderId?: string;
  tags?: string[];
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { type, fileIds, folderId, tags } = body as BatchOperation;

    // 验证参数
    if (!type || !fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'type and fileIds are required' },
        { status: 400 }
      );
    }

    if (fileIds.length > 100) {
      return NextResponse.json(
        { error: '批量操作最多支持100个文件' },
        { status: 400 }
      );
    }

    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    // 使用事务执行批量操作
    const result = await db.$transaction(async (tx) => {
      // 验证所有文件都属于当前用户和租户
      const files = await tx.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
        },
        select: { id: true, isDeleted: true, isFavorite: true, tags: true },
      });

      if (files.length !== fileIds.length) {
        const foundIds = new Set(files.map(f => f.id));
        const missingIds = fileIds.filter(id => !foundIds.has(id));
        throw new Error(`部分文件不存在或无权访问: ${missingIds.length}个文件`);
      }

      let successCount = 0;
      let failedCount = 0;
      let failedFiles: string[] = [];

      switch (type) {
        case 'delete':
          // 批量软删除
          const deleteResult = await tx.file.updateMany({
            where: {
              id: { in: fileIds },
              userId,
              tenantId,
              isDeleted: false,
            },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
            },
          });
          successCount = deleteResult.count;
          failedCount = fileIds.length - successCount;
          break;

        case 'restore':
          // 批量恢复
          const restoreResult = await tx.file.updateMany({
            where: {
              id: { in: fileIds },
              userId,
              tenantId,
              isDeleted: true,
            },
            data: {
              isDeleted: false,
              deletedAt: null,
            },
          });
          successCount = restoreResult.count;
          failedCount = fileIds.length - successCount;
          break;

        case 'move':
          // 批量移动到文件夹
          if (!folderId) {
            throw new Error('folderId is required for move operation');
          }

          // 验证目标文件夹存在且属于当前用户
          const targetFolder = await tx.folder.findUnique({
            where: { id: folderId },
            select: { id: true, userId: true, tenantId: true },
          });

          if (!targetFolder || targetFolder.userId !== userId || targetFolder.tenantId !== tenantId) {
            throw new Error('目标文件夹不存在或无权访问');
          }

          const moveResult = await tx.file.updateMany({
            where: {
              id: { in: fileIds },
              userId,
              tenantId,
            },
            data: {
              folderId,
            },
          });
          successCount = moveResult.count;
          failedCount = fileIds.length - successCount;
          break;

        case 'addTags':
          // 批量添加标签
          if (!tags || !Array.isArray(tags) || tags.length === 0) {
            throw new Error('tags is required for addTags operation');
          }

          // 逐个更新文件标签（因为需要合并现有标签）
          for (const file of files) {
            try {
              const existingTags = safeJsonParseArray(file.tags as any);
              const newTags = [...new Set([...existingTags, ...tags])];
              await tx.file.update({
                where: { id: file.id },
                data: { tags: JSON.stringify(newTags) },
              });
              successCount++;
            } catch {
              failedCount++;
              failedFiles.push(file.id);
            }
          }
          break;

        case 'removeTags':
          // 批量移除标签
          if (!tags || !Array.isArray(tags) || tags.length === 0) {
            throw new Error('tags is required for removeTags operation');
          }

          const tagsToRemove = new Set(tags);

          // 逐个更新文件标签
          for (const file of files) {
            try {
              const existingTags = safeJsonParseArray(file.tags as any) as string[];
              const newTags = existingTags.filter(tag => !tagsToRemove.has(tag));
              await tx.file.update({
                where: { id: file.id },
                data: { tags: JSON.stringify(newTags) },
              });
              successCount++;
            } catch {
              failedCount++;
              failedFiles.push(file.id);
            }
          }
          break;

        case 'favorite':
          // 批量收藏
          const favoriteResult = await tx.file.updateMany({
            where: {
              id: { in: fileIds },
              userId,
              tenantId,
              isFavorite: false,
            },
            data: {
              isFavorite: true,
            },
          });
          successCount = favoriteResult.count;
          failedCount = fileIds.length - successCount;
          break;

        case 'unfavorite':
          // 批量取消收藏
          const unfavoriteResult = await tx.file.updateMany({
            where: {
              id: { in: fileIds },
              userId,
              tenantId,
              isFavorite: true,
            },
            data: {
              isFavorite: false,
            },
          });
          successCount = unfavoriteResult.count;
          failedCount = fileIds.length - successCount;
          break;

        default:
          throw new Error(`不支持的操作类型: ${type}`);
      }

      return {
        success: true,
        operation: type,
        total: fileIds.length,
        successCount,
        failedCount,
        failedFiles,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Batch operation failed:', error);
    return NextResponse.json(
      { error: error.message || '批量操作失败' },
      { status: 500 }
    );
  }
}
