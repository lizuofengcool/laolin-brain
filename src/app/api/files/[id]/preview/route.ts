import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * Serve image files inline (for <img> src) instead of as download
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);

  // Share token access: if ?token= is present, validate share link
  const shareToken = searchParams.get("token");
  if (shareToken) {
    try {
      const share = await db.fileShare.findUnique({
        where: { token: shareToken },
        include: { file: true },
      });

      if (!share) {
        return NextResponse.json({ error: "分享链接不存在" }, { status: 404 });
      }

      if (share.expiresAt && new Date() > share.expiresAt) {
        return NextResponse.json({ error: "链接已过期" }, { status: 410 });
      }

      const passwordParam = searchParams.get("password") || "";
      if (share.password) {
        if (!passwordParam) {
          return NextResponse.json({ error: "需要密码" }, { status: 403 });
        }
        if (passwordParam !== share.password) {
          return NextResponse.json({ error: "密码错误" }, { status: 403 });
        }
      }

      const file = share.file;
      if (!file || !file.filePath) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      if (file.fileType !== "image") {
        return NextResponse.json({ error: "Not an image file" }, { status: 400 });
      }

      const buffer = await readFile(file.filePath);
      const ext = path.extname(file.fileName).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".svg": "image/svg+xml",
      };
      const contentType = mimeTypes[ext] || "image/jpeg";

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json({ error: "Preview failed" }, { status: 500 });
    }
  }

  // Normal auth flow
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const file = await db.file.findUnique({ where: { id } });

    if (!file || !file.filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Ownership check
    if (file.userId !== userId) {
      return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
    }

    // Only allow image preview
    if (file.fileType !== "image") {
      return NextResponse.json({ error: "Not an image file" }, { status: 400 });
    }

    const buffer = await readFile(file.filePath);

    // Determine content type
    const ext = path.extname(file.fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
    };

    const contentType = mimeTypes[ext] || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
