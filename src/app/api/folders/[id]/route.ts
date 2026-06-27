import { NextRequest, NextResponse } from "next/server";
import { createTenantDb } from "@/lib/db";
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
    // TenantDb 自动注入 tenantId 过滤，防止跨租户访问/删除他人目录
    const tenantDb = createTenantDb(tenantId);

    // Verify folder belongs to user
    const folder = await tenantDb.folder.findFirst({ where: { id } });
    if (!folder || folder.userId !== userId) {
      return NextResponse.json({ error: "文件夹不存在" }, { status: 404 });
    }

    // Move files out of this folder before deleting to prevent orphaning
    // 走 TenantDb 确保仅作用于当前租户的文件（原 db.file.updateMany 仅按 folderId 无隔离）
    await tenantDb.file.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    await tenantDb.folder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
