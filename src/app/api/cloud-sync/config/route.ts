import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { isR2Configured, testR2Connection } from "@/lib/cloud-sync/r2-storage";
import { db } from "@/lib/db";
import { z } from "zod";

// 配置验证 schema
const configSchema = z.object({
  accountId: z.string().min(1, "Account ID 不能为空"),
  accessKeyId: z.string().min(1, "Access Key ID 不能为空"),
  secretAccessKey: z.string().min(1, "Secret Access Key 不能为空"),
  bucketName: z.string().min(1, "Bucket 名称不能为空"),
});

// 仅 owner/admin 可变更租户级存储配置，避免任意成员改写整租户的云存储目标
function canManageStorage(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

// ─── GET /api/cloud-sync/config — 获取云同步配置状态 ────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({
      // 按租户查询 DB，租户 A 的配置不再使租户 B 被误判为已配置
      configured: await isR2Configured(auth.tenantId),
      // 注意：出于安全考虑，不返回具体的配置信息（特别是密钥）
    });
  } catch (error) {
    console.error("获取云同步配置失败:", error);
    return NextResponse.json(
      { error: "获取云同步配置失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/cloud-sync/config — 配置云同步 ──────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  if (!canManageStorage(auth.role)) {
    return NextResponse.json(
      { error: "无权限变更云同步配置（仅 owner/admin）" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // 验证输入
    const validated = configSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "配置格式无效", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const config = validated.data;

    // 先用给定配置测试连接（不写入任何状态），失败则直接拒绝
    const connectionOk = await testR2Connection(config);
    if (!connectionOk) {
      return NextResponse.json(
        { error: "无法连接到 Cloudflare R2，请检查配置是否正确" },
        { status: 400 }
      );
    }

    // 配置有效，落库到该租户的 storageConfig（按 tenantId+provider 唯一约束 upsert），
    // 并切换租户存储提供商为 r2，使 sync-engine.getStorageProvider 命中该配置。
    // 此前仅在内存中保存（服务重启即丢失、且与 sync-engine 的 DB 数据源脱节），
    // 现与实际同步链路统一到 DB，配置后备份/同步方可真正生效。
    await db.$transaction([
      db.storageConfig.upsert({
        where: { tenantId_provider: { tenantId: auth.tenantId, provider: "r2" } },
        create: {
          tenantId: auth.tenantId,
          provider: "r2",
          config: JSON.stringify(config),
          isDefault: true,
        },
        update: {
          config: JSON.stringify(config),
          isDefault: true,
        },
      }),
      db.tenant.update({
        where: { id: auth.tenantId },
        data: { storageProvider: "r2" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "云同步配置成功，连接测试通过",
    });
  } catch (error) {
    console.error("配置云同步失败:", error);
    return NextResponse.json(
      { error: "配置云同步失败" },
      { status: 500 }
    );
  }
}
