import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { safeJsonParseArray } from '@/lib/safe-json-parse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Validate pagination parameters
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: 'limit 必须在 1-100 之间' }, { status: 400 });
    }

    // Verify group belongs to user
    const group = await db.faceGroup.findUnique({ where: { id } });
    if (!group || group.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    // Get face instances in this group (limit to prevent unbounded reads)
    const faceInstances = await db.faceInstance.findMany({
      where: { groupId: id },
      select: { fileId: true },
      take: 5000,
    });

    // Deduplicate file IDs
    const uniqueFileIds = [...new Set(faceInstances.map((f) => f.fileId))];

    // Get files with pagination (include userId check to prevent cross-user access)
    const files = await db.file.findMany({
      where: {
        id: { in: uniqueFileIds },
        userId: auth.userId,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Parse tags
    const result = files.map((file) => ({
      ...file,
      tags: safeJsonParseArray(file.tags),
    }));

    return NextResponse.json({
      photos: result,
      total: uniqueFileIds.length,
      page,
      limit,
      totalPages: Math.ceil(uniqueFileIds.length / limit),
    });
  } catch (e) {
    console.error('Face group photos error:', e);
    return NextResponse.json(
      { error: '获取照片失败' },
      { status: 500 }
    );
  }
}
