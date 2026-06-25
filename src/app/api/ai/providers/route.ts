import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

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
    apiKey: c.apiKey ? `${c.apiKey.slice(0, 6)}****${c.apiKey.slice(-4)}` : null,
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

    const config = await db.aiProviderConfig.upsert({
      where: { tenantId_name: { tenantId, name: configName } },
      update: {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(model !== undefined ? { model } : {}),
      },
      create: {
        tenantId,
        userId,
        name: configName,
        provider,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
        model: model || null,
      },
    });

    return NextResponse.json({
      config: {
        ...config,
        apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}****${config.apiKey.slice(-4)}` : null,
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
