import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { isR2Configured } from "@/lib/cloud-sync/r2-storage";
import { uploadBackup, listBackups } from "@/lib/cloud-sync/sync-engine";
import { db } from "@/lib/db";
import { z } from "zod";

// 创建备份请求验证
const createBackupSchema = z.object({
  password: z.string().min(6, "加密密码至少 6 位"),
});

// ─── GET /api/cloud-sync/backups — 列出所有云端备份 ────────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

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

    const backups = await listBackups(tenantId);

    return NextResponse.json({
      backups,
      total: backups.length,
    });
  } catch (error) {
    console.error("获取备份列表失败:", error);
    return NextResponse.json(
      { error: "获取备份列表失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/cloud-sync/backups — 创建新的云端备份 ────────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

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
    const validated = createBackupSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "请求格式无效", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { password } = validated.data;

    // 创建备份
    const backup = await uploadBackup(tenantId, userId, password);

    return NextResponse.json({
      success: true,
      message: "备份上传成功",
      backup,
    });
  } catch (error) {
    console.error("创建备份失败:", error);
    return NextResponse.json(
      { error: "创建备份失败：" + (error as Error).message },
      { status: 500 }
    );
  }
}
