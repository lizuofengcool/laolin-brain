import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { restoreBackup, type RestoreOptions } from "@/lib/backup/backup-tool";

/**
 * 单个备份恢复 API
 * POST /api/backups/[id]/restore - 从备份 JSON 文件恢复数据
 *
 * 流程：auth → 租户隔离 findFirst → 状态/路径校验 → 读盘 → 委托 restoreBackup。
 * 路径遍历防护与 backups/[id] DELETE 同范式（前置阻断，不读盘越界路径）。
 * 冲突策略默认 skip（安全：已存在记录跳过，不覆盖线上数据），可在 body 中传
 * overwrite/rename。
 */

const VALID_CONFLICT_STRATEGIES = ["skip", "overwrite", "rename"] as const;
type ConflictStrategy = (typeof VALID_CONFLICT_STRATEGIES)[number];

function isConflictStrategy(v: unknown): v is ConflictStrategy {
  return (
    typeof v === "string" &&
    (VALID_CONFLICT_STRATEGIES as readonly string[]).includes(v)
  );
}

// ─── POST /api/backups/[id]/restore — 恢复备份 ─────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;
  const { id: backupId } = await params;

  try {
    // 权限检查：只有 owner 和 admin 可以恢复备份
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "没有权限管理备份" },
        { status: 403 }
      );
    }

    // 解析 body（允许空 body，冲突策略默认 skip）
    let conflictStrategy: ConflictStrategy = "skip";
    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        const requested = (body as { conflictStrategy?: unknown }).conflictStrategy;
        if (requested !== undefined) {
          if (!isConflictStrategy(requested)) {
            return NextResponse.json(
              {
                error:
                  "conflictStrategy 必须为 skip / overwrite / rename 之一",
              },
              { status: 400 }
            );
          }
          conflictStrategy = requested;
        }
      }
    } catch {
      // body 为空或非 JSON：使用默认 skip，不阻断流程
    }

    // 查询备份记录（租户隔离）
    const backup = await db.backup.findFirst({
      where: {
        id: backupId,
        tenantId,
      },
    });

    if (!backup) {
      return NextResponse.json(
        { error: "备份不存在" },
        { status: 404 }
      );
    }

    // 状态校验：仅 completed 备份可恢复（pending/running 未完成；failed 不可信）
    if (backup.status !== "completed") {
      return NextResponse.json(
        { error: "仅已完成的备份可恢复" },
        { status: 400 }
      );
    }

    // filePath 必须存在（POST 路由落盘时写入；旧记录可能为 null）
    if (!backup.filePath) {
      return NextResponse.json(
        { error: "备份文件路径缺失，无法恢复" },
        { status: 400 }
      );
    }

    // 路径遍历防护：filePath 必须位于 ./backups 目录下（与 DELETE 同范式，
    // 前置阻断优于事后清理，避免读取任意磁盘文件）
    const backupDir = path.resolve("./backups");
    const resolvedPath = path.resolve(backup.filePath);
    if (!resolvedPath.startsWith(backupDir)) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 400 }
      );
    }

    // 读取并解析备份 JSON
    const fileContent = await readFile(resolvedPath, "utf8");
    let backupData;
    try {
      backupData = JSON.parse(fileContent);
    } catch {
      return NextResponse.json(
        { error: "备份文件已损坏或格式无效" },
        { status: 500 }
      );
    }

    // 委托 restoreBackup 执行实际恢复（数据已在备份时按 tenantId 作用域导出，
    // 恢复时按 conflictStrategy 处理冲突）
    const options: RestoreOptions = {
      conflictStrategy,
      includeFiles: true,
      includeFolders: true,
    };

    const result = await restoreBackup(backupData, options);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "恢复过程中发生错误",
          details: result.errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: "备份恢复已完成",
    });
  } catch (error) {
    console.error("Failed to restore backup:", error);
    return NextResponse.json(
      { error: "恢复备份失败" },
      { status: 500 }
    );
  }
}
