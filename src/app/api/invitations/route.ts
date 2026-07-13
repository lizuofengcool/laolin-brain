import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { randomUUID } from "crypto";
import { sendInvitationEmail } from "@/lib/invitations";

/**
 * 邀请API
 * GET /api/invitations - 获取邀请列表
 * POST /api/invitations - 创建邀请
 */

// ─── GET /api/invitations — 获取邀请列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);
    const status = searchParams.get('status');

    // 权限检查：只有owner和admin可以查看邀请列表
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限查看邀请列表' },
        { status: 403 }
      );
    }

    // 校验分页参数：非数字（'abc' → NaN）或非正数拒绝，避免 NaN/负数透传给
    // db.invitation.findMany → Prisma skip/take 的未定义行为（Math.min(100, NaN) 仍为 NaN）。
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

    if (status) {
      where.status = status;
    }

    // 计算总数
    const total = await db.invitation.count({ where });

    // 分页查询邀请列表
    const invitations = await db.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: invitations,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    return NextResponse.json(
      { error: '获取邀请列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/invitations — 创建邀请 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role: authRole } = auth;

  try {
    const body = await request.json();
    const { email, role = 'member', expiresInHours = 72 } = body;

    if (!email) {
      return NextResponse.json(
        { error: '邮箱不能为空' },
        { status: 400 }
      );
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      return NextResponse.json(
        { error: '无效的角色' },
        { status: 400 }
      );
    }

    // 权限检查：只有owner和admin可以邀请用户
    if (authRole !== 'owner' && authRole !== 'admin') {
      return NextResponse.json(
        { error: '没有权限邀请用户' },
        { status: 403 }
      );
    }

    // 校验 expiresInHours：必须为 1-8760 的正整数（1 小时 ~ 1 年）。
    // 默认 72 小时（3 天）。防止非数字（'abc' → NaN）、布尔、对象等透传到 Date
    // 算术产生 Invalid Date，以及负数导致 expiresAt 落在过去（邀请立即过期）。
    // 与 files/[id]/share/route.ts 的 expiresIn typeof+range 校验约定一致
    //（同单位为小时，同上限 8760）。
    if (
      typeof expiresInHours !== 'number' ||
      !Number.isInteger(expiresInHours) ||
      expiresInHours < 1 ||
      expiresInHours > 8760
    ) {
      return NextResponse.json(
        { error: 'expiresInHours 必须为 1-8760 之间的正整数' },
        { status: 400 }
      );
    }

    // 检查邮箱是否已经在租户中
    const existingUser = await db.user.findFirst({
      where: { email },
      include: {
        tenantMemberships: {
          where: { tenantId },
        },
      },
    });

    if (existingUser && existingUser.tenantMemberships.length > 0) {
      return NextResponse.json(
        { error: '该用户已经在租户中' },
        { status: 400 }
      );
    }

    // 检查是否已经有未过期的邀请
    const existingInvitation = await db.invitation.findFirst({
      where: {
        tenantId,
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: '该邮箱已有未过期的邀请' },
        { status: 400 }
      );
    }

    // 生成邀请令牌
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // 创建邀请
    const invitation = await db.invitation.create({
      data: {
        tenantId,
        email,
        role,
        token,
        invitedBy: userId,
        expiresAt,
      },
    });

    // 发送邀请邮件（fire-and-forget：投递失败不影响邀请创建结果）
    // emailService.sendEmail 为队列式异步投递，未配置 SMTP 时内部 console.warn 后清空
    // 队列跳过，调用方无感。异常 console.error 记录，不外抛、不中断响应。
    await sendInvitationEmail(email, tenantId, userId, role, token, expiresAt);

    return NextResponse.json({
      success: true,
      data: invitation,
      message: '邀请已发送',
    });
  } catch (error) {
    console.error('Failed to create invitation:', error);
    return NextResponse.json(
      { error: '创建邀请失败' },
      { status: 500 }
    );
  }
}
