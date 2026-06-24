import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { randomBytes, createHash } from "crypto";

/**
 * API密钥管理API
 * GET /api/api-keys - 获取API密钥列表
 * POST /api/api-keys - 创建API密钥
 */

// 生成API密钥
function generateApiKey(): string {
  return 'ak_' + randomBytes(24).toString('hex');
}

// 生成API密钥密钥
function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}

// 哈希密钥
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// ─── GET /api/api-keys — 获取API密钥列表 ─────────────
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

    // 权限检查：只有owner和admin可以管理API密钥
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 构建查询条件
    const where: any = {
      tenantId,
    };

    // 计算总数
    const total = await db.apiKey.count({ where });

    // 分页查询密钥列表
    const apiKeys = await db.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果（不返回secret）
    return NextResponse.json({
      data: apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        key: key.key,
        scopes: JSON.parse(key.scopes || '[]'),
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        enabled: key.enabled,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch API keys:', error);
    return NextResponse.json(
      { error: '获取API密钥列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/api-keys — 创建API密钥 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { name, scopes = [], expiresInDays } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
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

    // 权限检查：只有owner和admin可以管理API密钥
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 生成密钥
    const apiKey = generateApiKey();
    const apiSecret = generateApiSecret();
    const hashedSecret = hashSecret(apiSecret);

    // 计算过期时间
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // 创建API密钥
    const newApiKey = await db.apiKey.create({
      data: {
        tenantId,
        userId,
        name,
        key: apiKey,
        secret: hashedSecret,
        scopes: JSON.stringify(scopes),
        expiresAt,
      },
    });

    // 返回结果（只在创建时返回一次明文secret）
    return NextResponse.json({
      success: true,
      data: {
        id: newApiKey.id,
        name: newApiKey.name,
        key: newApiKey.key,
        secret: apiSecret, // 明文，只返回一次
        scopes: JSON.parse(newApiKey.scopes || '[]'),
        expiresAt: newApiKey.expiresAt,
        enabled: newApiKey.enabled,
        createdAt: newApiKey.createdAt,
      },
      message: '请妥善保存密钥，创建后无法再次查看',
    });
  } catch (error) {
    console.error('Failed to create API key:', error);
    return NextResponse.json(
      { error: '创建API密钥失败' },
      { status: 500 }
    );
  }
}
