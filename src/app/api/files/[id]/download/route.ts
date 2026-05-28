import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";
import { createHash, timingSafeEqual } from "crypto";

/** Hash a share password with SHA-256 for verification */
function hashSharePassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

import { authenticateRequest } from "@/lib/api-auth";

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

      // Check expiry
      if (share.expiresAt && new Date() > share.expiresAt) {
        return NextResponse.json({ error: "链接已过期" }, { status: 410 });
      }

      // Check password
      const passwordParam = searchParams.get("password") || "";
      if (share.password) {
        if (!passwordParam) {
          return NextResponse.json({ error: "需要密码" }, { status: 403 });
        }
        const hashedInput = hashSharePassword(passwordParam);
        const a = Buffer.from(hashedInput);
        const b = Buffer.from(share.password);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return NextResponse.json({ error: "密码错误" }, { status: 403 });
        }
      }

      const file = share.file;
      if (!file || !file.filePath) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const buffer = await readFile(file.filePath);
      const ext = path.extname(file.fileName).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        },
      });
    } catch {
      return NextResponse.json({ error: "Download failed" }, { status: 500 });
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

    const buffer = await readFile(file.filePath);

    // Determine content type
    const ext = path.extname(file.fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
