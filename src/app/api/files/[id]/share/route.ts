import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID, createHash, timingSafeEqual } from "crypto";
import { authenticateRequest } from "@/lib/api-auth";

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
  const auth = authenticateRequest(request);
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

      const hashedInput = hashSharePassword(password);
      const a = Buffer.from(hashedInput);
      const b = Buffer.from(share.password);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json(
          { error: "密码错误", passwordRequired: true },
          { status: 403 }
        );
      }

      const file = share.file;
      const allowedOrigin = request.headers.get("origin") || "";
      const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(",").map(s => s.trim());
      const baseUrl = ALLOWED_ORIGINS.includes(allowedOrigin) ? allowedOrigin : (process.env.APP_URL || "http://localhost:3000");
      const downloadUrl = `${baseUrl}/api/files/${file.id}/download?token=${id}&password=${encodeURIComponent(password)}`;

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
  const { userId } = auth;

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

    // Find the file
    const file = await db.file.findUnique({
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

    const share = await db.fileShare.create({
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
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const passwordParam = searchParams.get("password") || "";

    // Actually id here is the token, but the route is /api/files/[id]/share
    // Let's look up by token directly
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

    // Check password using timing-safe comparison
    if (share.password) {
      if (!passwordParam) {
        return NextResponse.json(
          { error: "需要密码", passwordRequired: true },
          { status: 403 }
        );
      }
      const hashedInput = hashSharePassword(passwordParam);
      const a = Buffer.from(hashedInput);
      const b = Buffer.from(share.password);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return NextResponse.json(
          { error: "密码错误", passwordRequired: true },
          { status: 403 }
        );
      }
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
