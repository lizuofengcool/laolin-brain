import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { randomBytes } from "crypto";

/**
 * Webhook管理API
 * GET /api/webhooks - 获取Webhook列表
 * POST /api/webhooks - 创建Webhook
 */

// 生成Webhook密钥
function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

// ─── GET /api/webhooks — 获取Webhook列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));

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

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    // 计算总数
    const total = await db.webhook.count({ where });

    // 分页查询Webhook列表
    const webhooks = await db.webhook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果（不返回secret）
    return NextResponse.json({
      data: webhooks.map(webhook => ({
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: JSON.parse(webhook.events || '[]'),
        hasSecret: !!webhook.secret,
        enabled: webhook.enabled,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch webhooks:', error);
    return NextResponse.json(
      { error: '获取Webhook列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/webhooks — 创建Webhook ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { name, url, events = [], generateSecret = false } = body;

    if (!name || !url) {
      return NextResponse.json(
        { error: 'name and url are required' },
        { status: 400 }
      );
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: '无效的URL格式' },
        { status: 400 }
      );
    }

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

    // 生成密钥
    const secret = generateSecret ? generateWebhookSecret() : null;

    // 创建Webhook
    const webhook = await db.webhook.create({
      data: {
        tenantId,
        userId,
        name,
        url,
        events: JSON.stringify(events),
        secret,
      },
    });

    // 返回结果
    return NextResponse.json({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: JSON.parse(webhook.events || '[]'),
        secret: secret, // 只在创建时返回一次
        enabled: webhook.enabled,
        createdAt: webhook.createdAt,
      },
      message: secret ? '请妥善保存密钥，创建后无法再次查看' : undefined,
    });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    return NextResponse.json(
      { error: '创建Webhook失败' },
      { status: 500 }
    );
  }
}
