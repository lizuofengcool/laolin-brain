import { NextRequest, NextResponse } from "next/server";
import { db, createTenantDb } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

import { authenticateRequest } from "@/lib/api-auth";
import { verifyShareSessionToken } from "@/lib/share-session";

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

      // Check password: 仅接受 ?session= 令牌（密码验证成功后签发，绑定到本 share token，
      // 下载是 window.open 导航无法带 header 故走 query）。不再接受 ?password= query——
      // 密码会泄漏到 URL/访问日志/Referer/浏览器历史，与 share GET 路由的安全模型保持一致
      // （后者已统一要求 X-Share-Session 令牌）。
      const sessionParam = searchParams.get("session");
      if (share.password && !verifyShareSessionToken(sessionParam, shareToken)) {
        return NextResponse.json({ error: "需要密码" }, { status: 403 });
      }

      const file = share.file;
      if (!file || !file.filePath) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const uploadDir = path.resolve(path.join(process.cwd(), 'upload'));
      const resolvedPath = path.resolve(file.filePath);
      if (!resolvedPath.startsWith(uploadDir + path.sep) && resolvedPath !== uploadDir) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
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
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // TenantDb 自动注入 tenantId 过滤，防止跨租户访问
    const tenantDb = createTenantDb(tenantId);
    const file = await tenantDb.file.findFirst({ where: { id } });

    if (!file || !file.filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Ownership check
    if (file.userId !== userId) {
      return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
    }

    const uploadDir = path.resolve(path.join(process.cwd(), 'upload'));
    const resolvedPath = path.resolve(file.filePath);
    if (!resolvedPath.startsWith(uploadDir + path.sep) && resolvedPath !== uploadDir) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
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
