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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);

    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 权限检查：只有owner和admin可以管理API密钥
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.apiKey.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
    // 门控置于权限检查之后：member/viewer 的 403 优先于分页 400（不泄漏校验细节）。
    // 与 activity-logs/files/storage 等的 isNaN||<1 → 400 约定一致
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: 'pageSize 必须为正整数' }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { name, scopes = [], expiresInDays } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // tenantId / role 直接取自 authenticateRequest 的权威值（已按 joinedAt asc
    // 确定性选取租户），不再重复 tenantUser.findFirst 影子覆盖——后者无 orderBy，
    // 对多租户用户可能取到与 auth 不一致的租户，导致越权读写。
    // 权限检查：只有owner和admin可以管理API密钥
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理API密钥' },
        { status: 403 }
      );
    }

    // 校验 expiresInDays：提供时必须为 1-3650 的正整数（1 天 ~ 10 年）。
    // 防止非数字（'abc' → NaN）、布尔、对象等透传到 Date 算术产生 Invalid Date，
    // 以及负数/超大值导致 expiresAt 落在过去或过于遥远的未来。
    // 与 files/[id]/share/route.ts 的 expiresIn typeof+range 校验约定一致。
    // 未提供（undefined）→ 无过期（保持既有 truthy-check 语义）。
    if (expiresInDays !== undefined && expiresInDays !== null) {
      if (
        typeof expiresInDays !== 'number' ||
        !Number.isInteger(expiresInDays) ||
        expiresInDays < 1 ||
        expiresInDays > 3650
      ) {
        return NextResponse.json(
          { error: 'expiresInDays 必须为 1-3650 之间的正整数' },
          { status: 400 }
        );
      }
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
