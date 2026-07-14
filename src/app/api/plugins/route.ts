import { NextRequest, NextResponse } from "next/server";
import { getTenantIdOr401 } from "@/lib/db/tenant-context";
import { pluginManager } from "@/lib/plugins/plugin-manager";
import { validateInput } from "@/lib/utils/security";

/**
 * 插件列表API
 * GET /api/plugins - 获取插件列表
 * POST /api/plugins/install - 安装插件
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantIdOr401(request);
    if (tenantId instanceof NextResponse) return tenantId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // 获取可用插件
    let availablePlugins = pluginManager.getAvailablePlugins();

    // 按类型筛选
    if (type) {
      availablePlugins = availablePlugins.filter(
        (p) => p.meta.type === type
      );
    }

    // 搜索
    if (search) {
      const searchLower = search.toLowerCase();
      availablePlugins = availablePlugins.filter(
        (p) =>
          p.meta.name.toLowerCase().includes(searchLower) ||
          p.meta.description.toLowerCase().includes(searchLower) ||
          p.meta.keywords?.some((k) => k.toLowerCase().includes(searchLower))
      );
    }

    // 获取已安装的插件
    const installedPlugins = pluginManager.getInstalledPlugins(tenantId);

    // 合并信息
    const plugins = availablePlugins.map((plugin) => {
      const installed = installedPlugins.find(
        (ip) => ip.pluginId === plugin.meta.id
      );

      return {
        ...plugin.meta,
        permissions: plugin.permissions,
        defaultConfig: plugin.defaultConfig,
        isInstalled: !!installed,
        status: installed?.status || "not-installed",
        config: installed?.config,
        installedAt: installed?.installedAt,
        updatedAt: installed?.updatedAt,
        enabledAt: installed?.enabledAt,
        errorMessage: installed?.errorMessage,
      };
    });

    // 按状态筛选
    if (status) {
      if (status === "installed") {
        return NextResponse.json({
          data: plugins.filter((p) => p.isInstalled),
          total: plugins.filter((p) => p.isInstalled).length,
        });
      }
      if (status === "enabled") {
        return NextResponse.json({
          data: plugins.filter((p) => p.status === "enabled"),
          total: plugins.filter((p) => p.status === "enabled").length,
        });
      }
      if (status === "available") {
        return NextResponse.json({
          data: plugins.filter((p) => !p.isInstalled),
          total: plugins.filter((p) => !p.isInstalled).length,
        });
      }
    }

    return NextResponse.json({
      data: plugins,
      total: plugins.length,
    });
  } catch (error: any) {
    console.error("获取插件列表失败:", error);
    return NextResponse.json(
      { error: "获取插件列表失败" },
      { status: 500 }
    );
  }
}

/**
 * 安装插件
 * POST /api/plugins
 * Body: { pluginId, config? }
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = await getTenantIdOr401(request);
    if (tenantId instanceof NextResponse) return tenantId;

    const body = await request.json();
    const { pluginId, config } = body;

    if (!pluginId) {
      return NextResponse.json(
        { error: "插件ID不能为空" },
        { status: 400 }
      );
    }

    // 验证插件ID
    const validation = validateInput(pluginId, {
      maxLength: 100,
      pattern: /^[a-zA-Z0-9_-]+$/,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: "插件ID格式不正确" },
        { status: 400 }
      );
    }

    const installedPlugin = await pluginManager.installPlugin(
      pluginId,
      tenantId,
      "system",
      config
    );

    return NextResponse.json({
      data: installedPlugin,
      message: "插件安装成功",
    });
  } catch (error: any) {
    console.error("安装插件失败:", error);
    return NextResponse.json(
      { error: error.message || "安装插件失败" },
      { status: 500 }
    );
  }
}
