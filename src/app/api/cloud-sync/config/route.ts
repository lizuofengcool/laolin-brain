import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { initR2Client, testR2Connection, isR2Configured } from "@/lib/cloud-sync/r2-storage";
import { z } from "zod";

// 配置验证 schema
const configSchema = z.object({
  accountId: z.string().min(1, "Account ID 不能为空"),
  accessKeyId: z.string().min(1, "Access Key ID 不能为空"),
  secretAccessKey: z.string().min(1, "Secret Access Key 不能为空"),
  bucketName: z.string().min(1, "Bucket 名称不能为空"),
});

// ─── GET /api/cloud-sync/config — 获取云同步配置状态 ────────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({
      configured: isR2Configured(),
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
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

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

    // 初始化 R2 客户端
    initR2Client(config);

    // 测试连接
    const connectionOk = await testR2Connection();
    if (!connectionOk) {
      return NextResponse.json(
        { error: "无法连接到 Cloudflare R2，请检查配置是否正确" },
        { status: 400 }
      );
    }

    // 注意：生产环境中应该将配置加密后存储到数据库
    // 这里简化处理，只在内存中保存（服务重启后会丢失）
    // 后续可以改进为存储到用户设置中

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
