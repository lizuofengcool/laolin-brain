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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;
  const { id: webhookId } = await params;

  try {
    const body = await request.json();
    const { name, url, events, enabled } = body;

    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 权限检查：只有owner和admin可以管理Webhook
    if (role !== 'owner' && role !== 'admin') {
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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;
  const { id: webhookId } = await params;

  try {
    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 权限检查：只有owner和admin可以管理Webhook
    if (role !== 'owner' && role !== 'admin') {
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
