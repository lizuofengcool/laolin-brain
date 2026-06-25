import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: '名称不能为空' },
        { status: 400 }
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: '名称不能超过100个字符' },
        { status: 400 }
      );
    }

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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

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
