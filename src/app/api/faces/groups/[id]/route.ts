import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db, createTenantDb } from '@/lib/db';

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

    // 走 TenantDb 租户隔离层：faceGroup.findFirst 自动注入 tenantId 过滤，防止跨租户
    // 按 id 越权访问/重命名他租户分组（原 db.faceGroup.findUnique 仅按 id+userId 校验，
    // 多租户用户可在任意租户上下文操作他租户分组）
    const tenantDb = createTenantDb(tenantId);
    const existingGroup = await tenantDb.faceGroup.findFirst({ where: { id } });
    if (!existingGroup || existingGroup.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    // id 已由 tenantDb 确认属当前租户，按 id update 取回更新后记录
    // （TenantDb.faceGroup.update 走 updateMany 仅返回 count，无法回传记录）
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

    // 走 TenantDb 租户隔离层：faceGroup.findFirst / deleteMany 自动注入 tenantId，
    // 防止跨租户按 id 越权删除他租户分组（原仅按 userId 校验，多租户用户可越权）
    const tenantDb = createTenantDb(tenantId);
    const existingGroup = await tenantDb.faceGroup.findFirst({ where: { id } });
    if (!existingGroup || existingGroup.userId !== userId) {
      return NextResponse.json({ error: "分组不存在" }, { status: 404 });
    }

    // Cascade delete will handle face instances
    await tenantDb.faceGroup.deleteMany({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Face group delete error:', e);
    return NextResponse.json(
      { error: '删除分组失败' },
      { status: 500 }
    );
  }
}
