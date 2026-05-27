import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    // Verify group belongs to user
    const existingGroup = await db.faceGroup.findUnique({ where: { id } });
    if (!existingGroup || existingGroup.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    const group = await db.faceGroup.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      updatedAt: group.updatedAt,
    });
  } catch (e) {
    console.error('Face group update error:', e);
    return NextResponse.json(
      { error: '更新分组失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;

    // Verify group belongs to user
    const existingGroup = await db.faceGroup.findUnique({ where: { id } });
    if (!existingGroup || existingGroup.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    // Cascade delete will handle face instances
    await db.faceGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Face group delete error:', e);
    return NextResponse.json(
      { error: '删除分组失败' },
      { status: 500 }
    );
  }
}
