import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'photoCount'; // photoCount, faceCount, createdAt, name
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // asc, desc

    // 构建查询条件
    const where: any = {
      tenantId,
      userId,
    };

    // 搜索条件
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 计算总数
    const total = await db.faceGroup.count({ where });

    // 构建排序
    let orderBy: any = {};
    if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    } else if (sortBy === 'name') {
      orderBy = { name: sortOrder };
    }

    // 查询分组
    const groups = await db.faceGroup.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        faces: {
          select: { fileId: true },
          take: 100,
        },
      },
      orderBy: Object.keys(orderBy).length > 0 ? orderBy : { createdAt: 'desc' },
    });

    // 处理结果：计算人脸数和照片数
    let result = groups.map((group) => {
      const uniqueFileIds = new Set(group.faces.map((f) => f.fileId));
      return {
        id: group.id,
        name: group.name,
        thumbnail: group.thumbnail,
        faceCount: group.faces.length,
        photoCount: uniqueFileIds.size,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      };
    });

    // 按照片数或人脸数排序（如果是这些排序方式）
    if (sortBy === 'photoCount') {
      result.sort((a, b) => sortOrder === 'asc' ? a.photoCount - b.photoCount : b.photoCount - a.photoCount);
    } else if (sortBy === 'faceCount') {
      result.sort((a, b) => sortOrder === 'asc' ? a.faceCount - b.faceCount : b.faceCount - a.faceCount);
    }

    // 返回分页结果
    return NextResponse.json({
      data: result,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (e) {
    console.error('Face groups list error:', e);
    return NextResponse.json(
      { error: '获取人脸分组失败' },
      { status: 500 }
    );
  }
}
