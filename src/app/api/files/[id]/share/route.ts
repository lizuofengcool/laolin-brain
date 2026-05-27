import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

// POST: Generate a share link for a file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { expiresIn = 168, password } = body;

    // Find the file
    const file = await db.file.findUnique({
      where: { id },
    });

    if (!file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
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
        password: password || null,
        expiresAt,
      },
    });

    const baseUrl = request.headers.get("origin") || process.env.NEXTAUTH_URL || "";
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

    // Check password
    if (share.password) {
      if (!passwordParam || passwordParam !== share.password) {
        return NextResponse.json(
          { error: "需要密码", passwordRequired: true },
          { status: 403 }
        );
      }
    }

    const file = share.file;
    const baseUrl = request.headers.get("origin") || process.env.NEXTAUTH_URL || "";
    const downloadUrl = `${baseUrl}/api/files/${file.id}/download`;

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
