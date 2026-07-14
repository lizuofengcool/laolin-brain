import { NextRequest, NextResponse } from "next/server";
import { getTenantIdOr401 } from "@/lib/db/tenant-context";
import { pluginManager } from "@/lib/plugins/plugin-manager";

/**
 * 单个插件管理API
 * GET /api/plugins/[id] - 获取插件详情
 * PATCH /api/plugins/[id] - 更新插件配置
 * DELETE /api/plugins/[id] - 卸载插件
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdOr401(request);
    if (tenantId instanceof NextResponse) return tenantId;

    const { id } = await params;

    // 获取插件定义
    const pluginDef = pluginManager.getPluginDefinition(id);

    if (!pluginDef) {
      return NextResponse.json(
        { error: "插件不存在" },
        { status: 404 }
      );
    }

    // 获取已安装的插件信息
    const installed = pluginManager.getInstalledPlugin(id, tenantId);

    return NextResponse.json({
      data: {
        ...pluginDef.meta,
        permissions: pluginDef.permissions,
        configSchema: pluginDef.configSchema,
        defaultConfig: pluginDef.defaultConfig,
        isInstalled: !!installed,
        status: installed?.status || "not-installed",
        config: installed?.config,
        installedAt: installed?.installedAt,
        updatedAt: installed?.updatedAt,
        enabledAt: installed?.enabledAt,
        errorMessage: installed?.errorMessage,
      },
    });
  } catch (error: any) {
    console.error("获取插件详情失败:", error);
    return NextResponse.json(
      { error: "获取插件详情失败" },
      { status: 500 }
    );
  }
}

/**
 * 更新插件配置
 * PATCH /api/plugins/[id]
 * Body: { config }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdOr401(request);
    if (tenantId instanceof NextResponse) return tenantId;

    const { id } = await params;
    const body = await request.json();
    const { config, action } = body;

    // 检查插件是否已安装
    const installed = pluginManager.getInstalledPlugin(id, tenantId);

    if (!installed) {
      return NextResponse.json(
        { error: "插件未安装" },
        { status: 404 }
      );
    }

    // 处理不同的动作
    if (action === "enable") {
      const result = await pluginManager.enablePlugin(id, tenantId);
      return NextResponse.json({
        data: result,
        message: "插件已启用",
      });
    }

    if (action === "disable") {
      const result = await pluginManager.disablePlugin(id, tenantId);
      return NextResponse.json({
        data: result,
        message: "插件已禁用",
      });
    }

    // 更新配置
    if (config) {
      const result = await pluginManager.updatePluginConfig(
        id,
        tenantId,
        config
      );
      return NextResponse.json({
        data: result,
        message: "配置已更新",
      });
    }

    return NextResponse.json(
      { error: "无效的操作" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("更新插件失败:", error);
    return NextResponse.json(
      { error: error.message || "更新插件失败" },
      { status: 500 }
    );
  }
}

/**
 * 卸载插件
 * DELETE /api/plugins/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdOr401(request);
    if (tenantId instanceof NextResponse) return tenantId;

    const { id } = await params;

    // 检查插件是否已安装
    const installed = pluginManager.getInstalledPlugin(id, tenantId);

    if (!installed) {
      return NextResponse.json(
        { error: "插件未安装" },
        { status: 404 }
      );
    }

    await pluginManager.uninstallPlugin(id, tenantId);

    return NextResponse.json({
      message: "插件已卸载",
    });
  } catch (error: any) {
    console.error("卸载插件失败:", error);
    return NextResponse.json(
      { error: error.message || "卸载插件失败" },
      { status: 500 }
    );
  }
}
