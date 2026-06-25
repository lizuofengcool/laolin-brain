import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const { id } = await params;

    // Verify folder belongs to user
    const folder = await db.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
    }

    // Move files out of this folder before deleting to prevent orphaning
    await db.file.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    await db.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
