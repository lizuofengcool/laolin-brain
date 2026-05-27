import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

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
  try {
    const { id } = await params;

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
