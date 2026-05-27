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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Verify group belongs to user
    const group = await db.faceGroup.findUnique({ where: { id } });
    if (!group || group.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    // Get all face instances in this group
    const faceInstances = await db.faceInstance.findMany({
      where: { groupId: id },
      select: { fileId: true },
    });

    // Deduplicate file IDs
    const uniqueFileIds = [...new Set(faceInstances.map((f) => f.fileId))];

    // Get files with pagination
    const files = await db.file.findMany({
      where: {
        id: { in: uniqueFileIds },
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
