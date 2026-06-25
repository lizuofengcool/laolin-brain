import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { randomBytes, createHash } from "crypto";

/**
 * 单个API密钥管理API
 * PATCH /api/api-keys/[id] - 更新API密钥
 * DELETE /api/api-keys/[id] - 删除API密钥
 * POST /api/api-keys/[id]/reset - 重置密钥
 */

// 生成API密钥密钥
function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}

// 哈希密钥
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// ─── PATCH /api/api-keys/[id] — 更新API密钥 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: keyId } = await params;

  try {
    const body = await request.json();
    const { name, scopes, enabled, expiresAt } = body;

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true, role: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId, role: userRole } = tenantUser;

    // 权限检查：只有owner和admin可以管理API密钥
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 检查密钥是否存在
    const existingKey = await db.apiKey.findFirst({
      where: {
        id: keyId,
        tenantId,
      },
    });

    if (!existingKey) {
      return NextResponse.json(
        { error: 'API密钥不存在' },
        { status: 404 }
      );
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (scopes !== undefined) updateData.scopes = JSON.stringify(scopes);
    if (enabled !== undefined) updateData.enabled = enabled;
    if (expiresAt !== undefined) updateData.expiresAt = expiresAt;

    // 更新密钥
    const apiKey = await db.apiKey.update({
      where: { id: keyId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        scopes: JSON.parse(apiKey.scopes || '[]'),
        expiresAt: apiKey.expiresAt,
        lastUsedAt: apiKey.lastUsedAt,
        enabled: apiKey.enabled,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to update API key:', error);
    return NextResponse.json(
      { error: '更新API密钥失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/api-keys/[id] — 删除API密钥 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: keyId } = await params;

  try {
    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true, role: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId, role: userRole } = tenantUser;

    // 权限检查：只有owner和admin可以管理API密钥
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 检查密钥是否存在
    const existingKey = await db.apiKey.findFirst({
      where: {
        id: keyId,
        tenantId,
      },
    });

    if (!existingKey) {
      return NextResponse.json(
        { error: 'API密钥不存在' },
        { status: 404 }
      );
    }

    // 删除密钥
    await db.apiKey.delete({
      where: { id: keyId },
    });

    return NextResponse.json({
      success: true,
      message: 'API密钥已删除',
    });
  } catch (error) {
    console.error('Failed to delete API key:', error);
    return NextResponse.json(
      { error: '删除API密钥失败' },
      { status: 500 }
    );
  }
}
