/**
 * 数据库迁移API
 * 支持检查迁移状态、执行迁移、回滚等操作
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getMigrationStatus,
  runMigrations,
  rollbackMigration,
  rollbackToVersion,
  preMigrationCheck,
  postMigrationValidation,
  getMigrationScripts,
} from "@/lib/migrations/migration-tool";

/**
 * GET - 获取迁移状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // 获取迁移状态
    if (!action || action === "status") {
      const status = await getMigrationStatus();
      return NextResponse.json({
        success: true,
        data: status,
      });
    }

    // 获取迁移脚本列表
    if (action === "scripts") {
      const scripts = getMigrationScripts();
      return NextResponse.json({
        success: true,
        data: scripts.map((s) => ({
          version: s.version,
          name: s.name,
          description: s.description,
          hasRollback: !!s.down,
        })),
      });
    }

    // 迁移前检查
    if (action === "pre-check") {
      const result = await preMigrationCheck();
      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    // 迁移后验证
    if (action === "validate") {
      const result = await postMigrationValidation();
      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "未知的操作类型",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("获取迁移状态失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: "获取迁移状态失败",
      },
      { status: 500 }
    );
  }
}

/**
 * POST - 执行迁移
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, targetVersion, version } = body;

    // 执行迁移
    if (action === "migrate" || !action) {
      // 先检查
      const checkResult = await preMigrationCheck();
      if (!checkResult.canMigrate) {
        return NextResponse.json(
          {
            success: false,
            error: "迁移前检查失败",
            issues: checkResult.issues,
          },
          { status: 400 }
        );
      }

      // 执行迁移
      const result = await runMigrations(targetVersion);

      // 迁移后验证
      const validation = await postMigrationValidation();

      return NextResponse.json({
        success: result.success,
        data: {
          ...result,
          validation,
        },
      });
    }

    // 回滚单个迁移
    if (action === "rollback" && version) {
      const result = await rollbackMigration(version);
      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    // 回滚到指定版本
    if (action === "rollback-to" && targetVersion) {
      const result = await rollbackToVersion(targetVersion);
      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "未知的操作类型或缺少参数",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("执行迁移失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: "执行迁移失败",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
