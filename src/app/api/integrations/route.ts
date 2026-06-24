import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId, getCurrentUserId } from "@/lib/tenant-context";
import {
  integrationManager,
  BUILTIN_INTEGRATIONS,
} from "@/lib/integrations/integration-manager";
import { validateInput } from "@/lib/utils/security";

/**
 * 集成列表API
 * GET /api/integrations - 获取集成列表
 * POST /api/integrations - 连接集成
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId();

    if (!tenantId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // 获取可用集成
    let availableIntegrations = BUILTIN_INTEGRATIONS;

    // 按分类筛选
    if (category) {
      availableIntegrations = availableIntegrations.filter(
        (i) => i.category === category
      );
    }

    // 搜索
    if (search) {
      const searchLower = search.toLowerCase();
      availableIntegrations = availableIntegrations.filter(
        (i) =>
          i.name.toLowerCase().includes(searchLower) ||
          i.description.toLowerCase().includes(searchLower)
      );
    }

    // 获取已连接的集成
    const connectedIntegrations =
      integrationManager.getConnectedIntegrations(tenantId);

    // 合并信息
    const integrations = availableIntegrations.map((integration) => {
      const connected = connectedIntegrations.find(
        (ci) => ci.integrationId === integration.id
      );

      return {
        ...integration,
        isConnected: !!connected,
        status: connected?.status || "disconnected",
        config: connected?.config,
        connectedAt: connected?.connectedAt,
        updatedAt: connected?.updatedAt,
        lastSyncAt: connected?.lastSyncAt,
        errorMessage: connected?.errorMessage,
      };
    });

    // 按状态筛选
    if (status) {
      if (status === "connected") {
        return NextResponse.json({
          data: integrations.filter((i) => i.isConnected),
          total: integrations.filter((i) => i.isConnected).length,
        });
      }
      if (status === "available") {
        return NextResponse.json({
          data: integrations.filter((i) => !i.isConnected),
          total: integrations.filter((i) => !i.isConnected).length,
        });
      }
    }

    return NextResponse.json({
      data: integrations,
      total: integrations.length,
    });
  } catch (error: any) {
    console.error("获取集成列表失败:", error);
    return NextResponse.json(
      { error: "获取集成列表失败" },
      { status: 500 }
    );
  }
}

/**
 * 连接集成
 * POST /api/integrations
 * Body: { integrationId, config }
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId();
    const userId = await getCurrentUserId();

    if (!tenantId || !userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { integrationId, config } = body;

    if (!integrationId) {
      return NextResponse.json(
        { error: "集成ID不能为空" },
        { status: 400 }
      );
    }

    // 验证集成ID
    const validation = validateInput(integrationId, {
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: "集成ID格式不正确" },
        { status: 400 }
      );
    }

    // 检查是否是内置集成
    const isBuiltin = BUILTIN_INTEGRATIONS.some((i) => i.id === integrationId);
    if (!isBuiltin) {
      return NextResponse.json(
        { error: "集成不存在" },
        { status: 404 }
      );
    }

    // 连接集成（目前只是模拟，实际需要实现具体的provider）
    const connectedIntegration = {
      id: `${tenantId}-${integrationId}`,
      integrationId,
      tenantId,
      userId,
      name: BUILTIN_INTEGRATIONS.find((i) => i.id === integrationId)?.name,
      status: "connected" as const,
      config: config || {},
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    return NextResponse.json({
      data: connectedIntegration,
      message: "集成连接成功（框架已就绪，具体实现待后续完善）",
    });
  } catch (error: any) {
    console.error("连接集成失败:", error);
    return NextResponse.json(
      { error: error.message || "连接集成失败" },
      { status: 500 }
    );
  }
}
