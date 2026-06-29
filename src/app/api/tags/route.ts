import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

/**
 * 标签管理API
 * GET /api/tags - 获取所有标签列表（带使用数量）
 * POST /api/tags - 创建新标签（批量添加到文件）
 * DELETE /api/tags - 删除标签（从所有文件中移除）
 */

// ─── GET /api/tags — 获取所有标签列表（带使用数量） ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'count'; // name, count
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // asc, desc
    const limitRaw = parseInt(searchParams.get('limit') || '50', 10);

    // 校验 limit：非数字（如 'abc' → NaN）或非正数拒绝。原 Math.min(100, NaN)=NaN
    // 透传给 tags.slice(0, NaN) → 静默返回空列表（hasMore: tags.length > NaN = false），
    // 误导调用方；负数 limit 经 slice(0, -N) 截断尾部亦非预期。与 faces/groups/[id]/photos/route.ts
    // 及 cloud-sync/queue/route.ts 的 isNaN||<1 → 400 约定一致
    if (isNaN(limitRaw) || limitRaw < 1) {
      return NextResponse.json(
        { error: 'limit 必须为正整数' },
        { status: 400 }
      );
    }
    const limit = Math.min(100, limitRaw);

    // 复用 authenticateRequest 已解析的 tenantId（auth 兜底建租户，无需再查 tenantUser）
    // 查询所有未删除的文件的标签
    const files = await db.file.findMany({
      where: {
        userId,
        tenantId,
        isDeleted: false,
      },
      select: { tags: true },
    });

    // 统计每个标签的使用数量
    const tagCountMap = new Map<string, number>();

    for (const file of files) {
      const tags = safeJsonParseArray(file.tags as any);
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
        }
      }
    }

    // 转换为数组
    let tags = Array.from(tagCountMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      tags = tags.filter(tag => tag.name.toLowerCase().includes(searchLower));
    }

    // 排序
    if (sortBy === 'name') {
      tags.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    } else {
      // 按使用数量排序
      tags.sort((a, b) => {
        return sortOrder === 'asc' ? a.count - b.count : b.count - a.count;
      });
    }

    // 限制返回数量
    const limitedTags = tags.slice(0, limit);

    return NextResponse.json({
      data: limitedTags,
      total: tags.length,
      hasMore: tags.length > limit,
    });
  } catch (error) {
    console.error('Failed to fetch tags:', error);
    return NextResponse.json(
      { error: '获取标签列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/tags — 批量添加标签到文件 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileIds, tags } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: 'fileIds is required' },
        { status: 400 }
      );
    }

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json(
        { error: 'tags is required' },
        { status: 400 }
      );
    }

    // 复用 authenticateRequest 已解析的 tenantId（auth 兜底建租户，无需再查 tenantUser）
    // 使用事务批量添加标签
    const result = await db.$transaction(async (tx) => {
      // 验证所有文件都属于当前用户和租户
      const files = await tx.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          tenantId,
          isDeleted: false,
        },
        select: { id: true, tags: true },
      });

      if (files.length !== fileIds.length) {
        throw new Error('部分文件不存在或无权访问');
      }

      let successCount = 0;

      // 逐个更新文件标签（where 补 tenantId 纵深防御，文件已由 findMany 闸门校验归属）
      for (const file of files) {
        try {
          const existingTags = safeJsonParseArray(file.tags as any);
          const newTags = [...new Set([...existingTags, ...tags])];
          await tx.file.updateMany({
            where: { id: file.id, tenantId },
            data: { tags: JSON.stringify(newTags) },
          });
          successCount++;
        } catch {
          // 忽略单个文件的错误
        }
      }

      return {
        success: true,
        total: fileIds.length,
        successCount,
        failedCount: fileIds.length - successCount,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to add tags:', error);
    return NextResponse.json(
      { error: error.message || '添加标签失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/tags — 删除标签（从所有文件中移除） ─────────────
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { tags } = body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json(
        { error: 'tags is required' },
        { status: 400 }
      );
    }

    // 复用 authenticateRequest 已解析的 tenantId（auth 兜底建租户，无需再查 tenantUser）
    const tagsToRemove = new Set(tags);

    // 使用事务批量移除标签
    const result = await db.$transaction(async (tx) => {
      // 查询所有包含这些标签的文件
      // 注意：由于tags是JSON字符串，我们需要查询所有文件然后过滤
      const files = await tx.file.findMany({
        where: {
          userId,
          tenantId,
          isDeleted: false,
        },
        select: { id: true, tags: true },
      });

      // 筛选出包含要删除标签的文件
      const filesToUpdate = files.filter(file => {
        const fileTags = safeJsonParseArray(file.tags as any);
        return fileTags.some(tag => tagsToRemove.has(tag));
      });

      let updatedCount = 0;

      // 逐个更新文件标签（where 补 tenantId 纵深防御，文件已由 findMany 闸门校验归属）
      for (const file of filesToUpdate) {
        try {
          const existingTags = safeJsonParseArray(file.tags as any);
          const newTags = existingTags.filter(tag => !tagsToRemove.has(tag));
          await tx.file.updateMany({
            where: { id: file.id, tenantId },
            data: { tags: JSON.stringify(newTags) },
          });
          updatedCount++;
        } catch {
          // 忽略单个文件的错误
        }
      }

      return {
        success: true,
        removedTags: tags.length,
        affectedFiles: updatedCount,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to delete tags:', error);
    return NextResponse.json(
      { error: error.message || '删除标签失败' },
      { status: 500 }
    );
  }
}
