import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: '缺少用户ID' },
        { status: 400 }
      );
    }

    const groups = await db.faceGroup.findMany({
      where: { userId },
      include: {
        faces: {
          select: { fileId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Count faces per group and deduplicate file IDs for photo count
    const result = groups.map((group) => {
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

    // Sort by photo count descending
    result.sort((a, b) => b.photoCount - a.photoCount);

    return NextResponse.json(result);
  } catch (e) {
    console.error('Face groups list error:', e);
    return NextResponse.json([], { status: 200 });
  }
}
