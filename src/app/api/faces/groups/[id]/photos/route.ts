import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

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
      tags: JSON.parse(file.tags || '[]'),
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
