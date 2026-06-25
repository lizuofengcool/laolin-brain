import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { isR2Configured } from "@/lib/cloud-sync/r2-storage";
import { downloadAndRestoreBackup, deleteBackup } from "@/lib/cloud-sync/sync-engine";
import { db } from "@/lib/db";
import { z } from "zod";

// 恢复备份请求验证
const restoreBackupSchema = z.object({
  password: z.string().min(1, "加密密码不能为空"),
});

// ─── POST /api/cloud-sync/backups/[id] — 恢复指定备份 ─────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { userId, tenantId, role } = auth;
  const backupId = id;

  try {
    // 获取用户的默认租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      include: { tenant: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "用户未关联任何租户" },
        { status: 400 }
      );
    }

    const tenantId = tenantUser.tenantId;

    // 检查是否已配置 R2
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "云同步未配置，请先配置 Cloudflare R2" },
        { status: 400 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const validated = restoreBackupSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "请求格式无效", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { password } = validated.data;

    // 恢复备份
    const result = await downloadAndRestoreBackup(tenantId, userId, backupId, password);

    return NextResponse.json({
      success: true,
      message: "备份恢复成功",
      restored: result.restored,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("恢复备份失败:", error);
    return NextResponse.json(
      { error: "恢复备份失败：" + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/cloud-sync/backups/[id] — 删除指定备份 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { userId, tenantId, role } = auth;
  const backupId = id;

  try {
    // 获取用户的默认租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      include: { tenant: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "用户未关联任何租户" },
        { status: 400 }
      );
    }

    const tenantId = tenantUser.tenantId;

    // 检查是否已配置 R2
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "云同步未配置，请先配置 Cloudflare R2" },
        { status: 400 }
      );
    }

    // 删除备份
    await deleteBackup(tenantId, backupId);

    return NextResponse.json({
      success: true,
      message: "备份删除成功",
    });
  } catch (error) {
    console.error("删除备份失败:", error);
    return NextResponse.json(
      { error: "删除备份失败：" + (error as Error).message },
      { status: 500 }
    );
  }
}
