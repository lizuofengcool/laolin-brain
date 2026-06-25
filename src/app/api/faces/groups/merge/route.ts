import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';

/**
 * 合并人脸分组
 * POST /api/faces/groups/merge
 * 
 * Body:
 * - sourceGroupIds: string[] - 源分组ID列表
 * - targetGroupId: string - 目标分组ID
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
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
    const body = await request.json();
    const { sourceGroupIds, targetGroupId } = body;

    // 验证参数
    if (!sourceGroupIds || !Array.isArray(sourceGroupIds) || sourceGroupIds.length === 0) {
      return NextResponse.json(
        { error: '源分组ID列表不能为空' },
        { status: 400 }
      );
    }

    if (!targetGroupId || typeof targetGroupId !== 'string') {
      return NextResponse.json(
        { error: '目标分组ID不能为空' },
        { status: 400 }
      );
    }

    if (sourceGroupIds.includes(targetGroupId)) {
      return NextResponse.json(
        { error: '目标分组不能在源分组列表中' },
        { status: 400 }
      );
    }

    // 验证目标分组存在且属于当前用户
    const targetGroup = await db.faceGroup.findUnique({
      where: { id: targetGroupId },
      include: { faces: true },
    });

    if (!targetGroup || targetGroup.userId !== userId || targetGroup.tenantId !== tenantId) {
      return NextResponse.json(
        { error: '目标分组不存在或无权访问' },
        { status: 404 }
      );
    }

    // 验证所有源分组存在且属于当前用户
    const sourceGroups = await db.faceGroup.findMany({
      where: {
        id: { in: sourceGroupIds },
        userId,
        tenantId,
      },
      include: { faces: true },
    });

    if (sourceGroups.length !== sourceGroupIds.length) {
      const foundIds = new Set(sourceGroups.map(g => g.id));
      const missingIds = sourceGroupIds.filter(id => !foundIds.has(id));
      return NextResponse.json(
        { error: `部分分组不存在或无权访问: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    // 使用事务执行合并
    const result = await db.$transaction(async (tx) => {
      let totalMovedFaces = 0;

      for (const sourceGroup of sourceGroups) {
        // 将源分组的所有人脸实例移动到目标分组
        const updateResult = await tx.faceInstance.updateMany({
          where: { groupId: sourceGroup.id },
          data: { groupId: targetGroupId },
        });

        totalMovedFaces += updateResult.count;

        // 删除源分组
        await tx.faceGroup.delete({
          where: { id: sourceGroup.id },
        });
      }

      // 如果目标分组没有名称，使用第一个源分组的名称或保持null
      if (!targetGroup.name && sourceGroups.length > 0) {
        const firstNamedGroup = sourceGroups.find(g => g.name);
        if (firstNamedGroup) {
          await tx.faceGroup.update({
            where: { id: targetGroupId },
            data: { name: firstNamedGroup.name },
          });
        }
      }

      // 更新目标分组的缩略图（选择人脸最多的图片）
      const allFaces = await tx.faceInstance.findMany({
        where: { groupId: targetGroupId },
        select: { fileId: true },
      });

      if (allFaces.length > 0) {
        // 统计每个文件的人脸数量
        const fileFaceCount = new Map<string, number>();
        for (const face of allFaces) {
          fileFaceCount.set(face.fileId, (fileFaceCount.get(face.fileId) || 0) + 1);
        }

        // 找到人脸最多的文件作为缩略图
        let maxCount = 0;
        let thumbnailFileId = targetGroup.thumbnail;
        for (const [fileId, count] of fileFaceCount.entries()) {
          if (count > maxCount) {
            maxCount = count;
            thumbnailFileId = fileId;
          }
        }

        if (thumbnailFileId && thumbnailFileId !== targetGroup.thumbnail) {
          await tx.faceGroup.update({
            where: { id: targetGroupId },
            data: { thumbnail: thumbnailFileId },
          });
        }
      }

      return {
        totalMovedFaces,
        mergedGroups: sourceGroups.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: `成功合并 ${result.mergedGroups} 个分组，移动 ${result.totalMovedFaces} 张人脸`,
      targetGroupId,
      mergedGroups: result.mergedGroups,
      movedFaces: result.totalMovedFaces,
    });
  } catch (e) {
    console.error('Merge face groups error:', e);
    return NextResponse.json(
      { error: '合并分组失败' },
      { status: 500 }
    );
  }
}
