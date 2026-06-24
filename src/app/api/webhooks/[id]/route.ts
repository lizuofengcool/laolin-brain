import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个Webhook管理API
 * PATCH /api/webhooks/[id] - 更新Webhook
 * DELETE /api/webhooks/[id] - 删除Webhook
 * POST /api/webhooks/[id]/test - 测试Webhook
 */

// ─── PATCH /api/webhooks/[id] — 更新Webhook ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id: webhookId } = await params;

  try {
    const body = await request.json();
    const { name, url, events, enabled } = body;

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

    // 权限检查：只有owner和admin可以管理Webhook
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理Webhook' },
        { status: 403 }
      );
    }

    // 检查Webhook是否存在
    const existingWebhook = await db.webhook.findFirst({
      where: {
        id: webhookId,
        tenantId,
      },
    });

    if (!existingWebhook) {
      return NextResponse.json(
        { error: 'Webhook不存在' },
        { status: 404 }
      );
    }

    // 验证URL格式
    if (url) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { error: '无效的URL格式' },
          { status: 400 }
        );
      }
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (enabled !== undefined) updateData.enabled = enabled;

    // 更新Webhook
    const webhook = await db.webhook.update({
      where: { id: webhookId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: JSON.parse(webhook.events || '[]'),
        hasSecret: !!webhook.secret,
        enabled: webhook.enabled,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to update webhook:', error);
    return NextResponse.json(
      { error: '更新Webhook失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/webhooks/[id] — 删除Webhook ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;
  const { id: webhookId } = await params;

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

    // 权限检查：只有owner和admin可以管理Webhook
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理Webhook' },
        { status: 403 }
      );
    }

    // 检查Webhook是否存在
    const existingWebhook = await db.webhook.findFirst({
      where: {
        id: webhookId,
        tenantId,
      },
    });

    if (!existingWebhook) {
      return NextResponse.json(
        { error: 'Webhook不存在' },
        { status: 404 }
      );
    }

    // 删除Webhook
    await db.webhook.delete({
      where: { id: webhookId },
    });

    return NextResponse.json({
      success: true,
      message: 'Webhook已删除',
    });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json(
      { error: '删除Webhook失败' },
      { status: 500 }
    );
  }
}
