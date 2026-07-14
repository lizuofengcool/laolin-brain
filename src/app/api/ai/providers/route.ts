import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { encryptSecret, decryptSecret } from "@/lib/cloud-sync/config-crypto";

/**
 * 将落库的 apiKey（v1: 密文或历史明文）解密后做脱敏掩码返回。
 *
 * 解密失败（密钥轮换/数据损坏）时不抛错、不泄露密文，仅返回 "****" 占位——
 * 前端通过 hasKey 字段判断是否已配置 key，掩码仅用于展示。
 */
function maskApiKey(stored: string | null): string | null {
  if (!stored) return null;
  try {
    const plain = decryptSecret(stored);
    return `${plain.slice(0, 6)}****${plain.slice(-4)}`;
  } catch {
    return "****";
  }
}

/** GET /api/ai/providers - 获取用户的 AI 模型配置 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const configs = await db.aiProviderConfig.findMany({
    where: { userId, tenantId },
    select: {
      id: true,
      name: true,
      provider: true,
      apiKey: true,
      baseUrl: true,
      model: true,
      isDefault: true,
      updatedAt: true,
    },
  });

  const masked = configs.map((c) => ({
    ...c,
    apiKey: maskApiKey(c.apiKey),
    hasKey: !!c.apiKey,
  }));

  return NextResponse.json({ configs: masked });
}

/** POST /api/ai/providers - 保存 AI 模型配置 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  try {
    const body = await request.json();
    const { name, provider, apiKey, baseUrl, model } = body as {
      name?: string;
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };

    if (!provider) {
      return NextResponse.json({ error: "缺少 provider 参数" }, { status: 400 });
    }

    const configName = name || provider;

    // apiKey 落库前 AES-256-GCM 加密（与 storageConfig 同范式），避免数据库泄露时
    // 第三方 AI 凭据裸露。schema 已标注"加密存储"，此处补齐实现。
    // 仅在客户端显式传 apiKey 时加密（空值落库为 null）；未传时 update 不覆盖既有 key。
    // 加密使用随机 IV，故仅调用一次并复用，避免 update/create 产生两份不同密文。
    const encryptedApiKey =
      apiKey !== undefined ? (apiKey ? encryptSecret(apiKey) : null) : undefined;

    const config = await db.aiProviderConfig.upsert({
      where: { tenantId_name: { tenantId, name: configName } },
      update: {
        ...(encryptedApiKey !== undefined ? { apiKey: encryptedApiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(model !== undefined ? { model } : {}),
      },
      create: {
        tenantId,
        userId,
        name: configName,
        provider,
        apiKey: encryptedApiKey ?? null,
        baseUrl: baseUrl || null,
        model: model || null,
      },
    });

    return NextResponse.json({
      config: {
        ...config,
        apiKey: maskApiKey(config.apiKey),
        hasKey: !!config.apiKey,
      },
    });
  } catch {
    return NextResponse.json({ error: "保存配置失败" }, { status: 500 });
  }
}

/** DELETE /api/ai/providers?provider=xxx - 删除 AI 模型配置 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const provider = request.nextUrl.searchParams.get("provider");
  const name = request.nextUrl.searchParams.get("name");

  const whereCondition: { userId: string; tenantId: string; name?: string; provider?: string } = {
    userId,
    tenantId,
  };

  if (name) {
    whereCondition.name = name;
  } else if (provider) {
    whereCondition.provider = provider;
  } else {
    return NextResponse.json({ error: "缺少 provider 或 name 参数" }, { status: 400 });
  }

  await db.aiProviderConfig.deleteMany({
    where: whereCondition,
  });

  return NextResponse.json({ success: true });
}
