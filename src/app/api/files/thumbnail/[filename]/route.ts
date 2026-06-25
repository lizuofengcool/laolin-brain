import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { authenticateRequest } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  // Auth check
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const { filename } = await params;
    // Store thumbnails in user-specific directory for ownership isolation
    const thumbDir = path.join(process.cwd(), "upload", userId, "thumbnails");
    const filePath = path.join(thumbDir, filename);

    // Path traversal validation: ensure resolved path starts with thumbDir
    const resolvedPath = path.resolve(filePath);
    const resolvedThumbDir = path.resolve(thumbDir);
    if (!resolvedPath.startsWith(resolvedThumbDir + path.sep) && resolvedPath !== resolvedThumbDir) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const buffer = await readFile(resolvedPath);

    // Determine content type
    const ext = filename.split(".").pop()?.toLowerCase();
    let contentType = "image/jpeg";
    if (ext === "png") contentType = "image/png";
    else if (ext === "webp") contentType = "image/webp";
    else if (ext === "gif") contentType = "image/gif";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
  }
}
