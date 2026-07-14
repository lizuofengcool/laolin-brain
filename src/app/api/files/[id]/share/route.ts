import { NextRequest, NextResponse } from "next/server";
import { db, createTenantDb } from "@/lib/db";
import { randomUUID, createHash, timingSafeEqual } from "crypto";
import { authenticateRequest } from "@/lib/api-auth";
import {
  checkSharePasswordLimit,
  recordSharePasswordFailure,
  clearSharePasswordLimit,
} from "@/lib/rate-limit";

/** Hash a share password with SHA-256 for secure storage */
function hashSharePassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// POST: Generate a share link for a file (authenticated) OR verify share password (unauthenticated)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Unauthenticated POST with password body = password verification
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) {
    // Not authenticated — treat as password verification request
    try {
      const body = await request.json();
      const { password } = body;

      if (typeof password !== 'string' || password.length === 0) {
        return NextResponse.json(
          { error: "密码不能为空", passwordRequired: true },
          { status: 400 }
        );
      }

      const share = await db.fileShare.findUnique({
        where: { token: id },
        include: { file: true },
      });

      if (!share) {
        return NextResponse.json({ error: "分享链接不存在" }, { status: 404 });
      }

      if (share.expiresAt && new Date() > share.expiresAt) {
        return NextResponse.json({ error: "链接已过期", expired: true }, { status: 410 });
      }

      if (!share.password) {
        return NextResponse.json({ error: "该链接不需要密码" }, { status: 400 });
      }

      // 按 token 维度的密码暴破防护：达失败阈值后锁定该 token 的验证
      const limit = checkSharePasswordLimit(id);
      if (!limit.success) {
        return NextResponse.json(
          { error: "密码错误次数过多，请稍后再试", passwordRequired: true },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((limit.resetTime - Date.now()) / 1000)),
            },
          }
        );
      }

      const hashedInput = hashSharePassword(password);
      const a = Buffer.from(hashedInput);
      const b = Buffer.from(share.password);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        recordSharePasswordFailure(id);
        return NextResponse.json(
          { error: "密码错误", passwordRequired: true },
          { status: 403 }
        );
      }

      // 验证成功，清除该 token 的失败计数，避免合法用户误输被累积
      clearSharePasswordLimit(id);

      const file = share.file;
      const allowedOrigin = request.headers.get("origin") || "";
      const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
      const baseUrl = ALLOWED_ORIGINS.includes(allowedOrigin) ? allowedOrigin : (process.env.APP_URL || "http://localhost:3000");
      const downloadUrl = `${baseUrl}/api/files/${file.id}/download?token=${id}`;

      return NextResponse.json({
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        textContent: file.textContent,
        thumbnailUrl: file.thumbnailUrl,
        createdAt: file.createdAt.toISOString(),
        downloadUrl,
      });
    } catch (error) {
      console.error("Share password verification failed:", error);
      return NextResponse.json({ error: "验证失败" }, { status: 500 });
    }
  }

  // Authenticated POST = create share link
  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { expiresIn = 168, password } = body;

    // Validate expiresIn
    if (typeof expiresIn !== 'number' || expiresIn < 1 || expiresIn > 8760) {
      return NextResponse.json(
        { error: 'expiresIn 必须为1-8760之间的数字' },
        { status: 400 }
      );
    }

    // Validate password minimum length
    if (typeof password === 'string' && password.length > 0 && password.length < 4) {
      return NextResponse.json(
        { error: '密码至少4个字符' },
        { status: 400 }
      );
    }

    // Treat empty string password as null; hash non-empty passwords before storage
    const sharePassword = (typeof password === 'string' && password.length > 0) ? hashSharePassword(password) : null;

    const tenantDb = createTenantDb(tenantId);

    // Find the file (TenantDb 自动注入 tenantId 过滤，防止跨租户访问)
    const file = await tenantDb.file.findFirst({
      where: { id },
    });

    if (!file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // Ownership check
    if (file.userId !== userId) {
      return NextResponse.json({ error: "无权操作此文件" }, { status: 403 });
    }

    // Generate unique token
    const token = randomUUID();
    const expiresAt = expiresIn > 0
      ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
      : null;

    // 通过 TenantDb 创建，自动写入 tenantId 归属
    const share = await tenantDb.fileShare.create({
      data: {
        fileId: id,
        token,
        password: sharePassword,
        expiresAt,
      },
    });

    const allowedOrigin = request.headers.get("origin") || "";
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
    const baseUrl = ALLOWED_ORIGINS.includes(allowedOrigin) ? allowedOrigin : (process.env.APP_URL || "http://localhost:3000");
    const shareUrl = `${baseUrl}/share/${token}`;

    return NextResponse.json({
      shareUrl,
      token: share.token,
      expiresAt: share.expiresAt?.toISOString() || null,
      id: share.id,
    });
  } catch (error) {
    console.error("Create share link failed:", error);
    return NextResponse.json({ error: "创建分享链接失败" }, { status: 500 });
  }
}

// GET: Access shared file via token
// 密码验证已移至 POST（避免密码出现在 URL/日志/Referer/历史记录）。
// GET 仅用于无密码分享；带密码的分享始终返回 passwordRequired，客户端须 POST 密码。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // id 即为分享 token，按 token 直接查询
    const share = await db.fileShare.findUnique({
      where: { token: id },
      include: { file: true },
    });

    if (!share) {
      return NextResponse.json({ error: "分享链接不存在" }, { status: 404 });
    }

    // Check expiry
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json(
        { error: "链接已过期", expired: true },
        { status: 410 }
      );
    }

    // 密码保护的分享：GET 不再接受 ?password= query param（密码会泄漏到
    // URL/访问日志/Referer/浏览器历史），统一要求 POST 密码验证。
    if (share.password) {
      return NextResponse.json(
        { error: "需要密码", passwordRequired: true },
        { status: 403 }
      );
    }

    const file = share.file;
    const allowedOrigin = request.headers.get("origin") || "";
    const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
    const baseUrl = ALLOWED_ORIGINS.includes(allowedOrigin) ? allowedOrigin : (process.env.APP_URL || "http://localhost:3000");
    const downloadUrl = `${baseUrl}/api/files/${file.id}/download?token=${id}`;

    return NextResponse.json({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      textContent: file.textContent,
      thumbnailUrl: file.thumbnailUrl,
      createdAt: file.createdAt.toISOString(),
      downloadUrl,
    });
  } catch (error) {
    console.error("Access share link failed:", error);
    return NextResponse.json({ error: "获取分享文件失败" }, { status: 500 });
  }
}
