import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTenantDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 备份管理API
 * GET /api/backups - 获取备份列表
 * POST /api/backups - 创建备份（同步导出租户文件/文件夹元数据为 JSON 落盘）
 *
 * 第二百零一轮：从 raw db.backup.* 收口至 TenantDb 隔离层（与 files 路由同范式）。
 *   - 所有 backup / file / folder CRUD 经 tenantDb.{model}.* 调用，prisma 调用前
 *     自动注入 tenantId 守卫，不再依赖调用方手动 where.tenantId。
 *   - tenantDb.backup.update 内部走 updateMany + tenantId 守卫，返回 { count }；
 *     completed 转换响应数据由 backup（created 记录）+ 本次写入字段直接构造，
 *     避免依赖 update 返回的完整记录（与 file.update 同范式契约）。
 */

// ─── GET /api/backups — 获取备份列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);
    const status = searchParams.get('status');

    // 权限检查：只有owner和admin可以管理备份
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 分页参数校验（defense-in-depth）：置于权限检查之后（403 优先于 400，不向无权
    // 用户泄漏校验细节），避免 ?page=abc 透传 Prisma skip/take（Math.min(100,NaN)=NaN
    // → 未定义行为，崩溃被 try/catch 吞为 500）。
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: 'pageSize 必须为正整数' }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);

    // 走 TenantDb 租户隔离层：tenantDb.backup.count / findMany 自动注入 tenantId
    // 过滤，跨租户查询恒返回空集（与 files GET 路由同范式，参见 198 轮）。
    const tenantDb = createTenantDb(tenantId);

    // 构建查询条件（status 过滤合并进 where，tenantId 由 wrapper 注入）
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // 计算总数
    const total = await tenantDb.backup.count({ where });

    // 分页查询备份列表
    const backups = await tenantDb.backup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: backups.map(backup => ({
        id: backup.id,
        name: backup.name,
        type: backup.type,
        size: backup.size,
        fileCount: backup.fileCount,
        status: backup.status,
        error: backup.error,
        createdAt: backup.createdAt,
        completedAt: backup.completedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch backups:', error);
    return NextResponse.json(
      { error: '获取备份列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/backups — 创建备份 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { name, type = 'full', baseBackupId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // 权限检查：只有owner和admin可以管理备份
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: '没有权限管理备份' },
        { status: 403 }
      );
    }

    // 走 TenantDb 租户隔离层：backup / file / folder 操作均自动注入 tenantId 守卫，
    // 不再依赖调用方手动 where.tenantId（与 files POST 路由同范式）。
    const tenantDb = createTenantDb(tenantId);

    // 增量备份需要基准备份：校验 baseBackupId 归属（租户隔离）与状态（须已完成），
    // 据其 createdAt 过滤 updatedAt >= sinceDate 的新增/变更文件。
    // 全量备份忽略 baseBackupId，sinceDate 保持 null（不过滤，与原全量行为一致）。
    let sinceDate: Date | null = null;
    if (type === 'incremental') {
      if (!baseBackupId) {
        return NextResponse.json(
          { error: '增量备份需要 baseBackupId' },
          { status: 400 }
        );
      }
      // tenantDb.backup.findFirst 自动注入 tenantId，跨租户 baseBackupId 返回 null
      // （等价于不存在，与原 raw db.backup.findFirst({ where: { id, tenantId } }) 行为一致）
      const baseBackup = await tenantDb.backup.findFirst({
        where: { id: baseBackupId },
      });
      if (!baseBackup) {
        return NextResponse.json(
          { error: '基准备份不存在或不属于当前租户' },
          { status: 400 }
        );
      }
      if (baseBackup.status !== 'completed') {
        return NextResponse.json(
          { error: '基准备份未完成，无法用于增量备份' },
          { status: 400 }
        );
      }
      sinceDate = baseBackup.createdAt;
    }

    // 检查是否有正在运行的备份（tenantDb.backup.findFirst 自动注入 tenantId）
    const runningBackup = await tenantDb.backup.findFirst({
      where: {
        status: 'running',
      },
    });

    if (runningBackup) {
      return NextResponse.json(
        { error: '已有备份正在进行中，请稍后再试' },
        { status: 400 }
      );
    }

    // 创建备份记录（tenantDb.backup.create 自动注入 tenantId 到 data）
    const backup = await tenantDb.backup.create({
      data: {
        userId,
        name,
        type,
        status: 'pending',
      },
    });

    // 标记为 running（保持与既有状态机一致：pending → running → completed/failed）
    // tenantDb.backup.update 走 updateMany + tenantId 守卫，返回 { count }，
    // 不需要返回值，仅状态推进。
    await tenantDb.backup.update({
      where: { id: backup.id },
      data: { status: 'running' },
    });

    // 实际执行备份：导出租户文件/文件夹元数据为 JSON 文件落盘。
    // 同步执行（SQLite 单服务器场景可接受；真正异步需 job queue，超出本轮范围）。
    // 物理文件落 ./backups/{tenantId}/{backupId}.json，与 backups/[id] DELETE 的
    // 路径遍历防护（path.resolve('./backups') 前缀校验）配套——DELETE 已为该桩
    // 落地做好前向准备（filePath 落 ./backups 即可被清理）。
    try {
      // 增量备份按 sinceDate 过滤 updatedAt >= sinceDate 的新增/变更记录；
      // 全量备份 sinceDate 为 null，where 仅含 tenantId（由 wrapper 注入）。
      // tenantDb.file / folder.findMany 自动注入 tenantId，此处 where 不再手写。
      const fileWhere: { updatedAt?: { gte: Date } } = {};
      const folderWhere: { updatedAt?: { gte: Date } } = {};
      if (sinceDate) {
        fileWhere.updatedAt = { gte: sinceDate };
        folderWhere.updatedAt = { gte: sinceDate };
      }

      const [files, folders] = await Promise.all([
        tenantDb.file.findMany({ where: fileWhere }),
        tenantDb.folder.findMany({ where: folderWhere }),
      ]);

      const completedAt = new Date();

      const backupContent = {
        version: '1.0.0',
        createdAt: completedAt.toISOString(),
        type,
        tenantId,
        data: { files, folders },
        metadata: {
          fileCount: files.length,
          folderCount: folders.length,
          totalSize: files.reduce((sum: number, f: any) => sum + (f.fileSize || 0), 0),
          schemaVersion: '1.0.0',
          // 增量备份溯源：记录基准备份 id 与过滤时间点，便于恢复/审计
          ...(sinceDate
            ? { baseBackupId, sinceDate: sinceDate.toISOString() }
            : {}),
        },
      };

      const jsonStr = JSON.stringify(backupContent);
      const size = Buffer.byteLength(jsonStr, 'utf8');

      const backupDir = path.resolve('./backups', tenantId);
      const filePath = path.join(backupDir, `${backup.id}.json`);
      await mkdir(backupDir, { recursive: true });
      await writeFile(filePath, jsonStr, 'utf8');

      // tenantDb.backup.update 走 updateMany + tenantId 守卫，返回 { count }。
      // 响应数据由 backup（created 记录）+ 本次写入字段（size/fileCount/filePath/
      // completedAt）直接构造，避免依赖 update 返回的完整记录（与 file.update
      // 同范式契约，参见 tenant-db.ts file getter 注释）。
      await tenantDb.backup.update({
        where: { id: backup.id },
        data: {
          status: 'completed',
          size,
          fileCount: files.length,
          filePath,
          completedAt,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          id: backup.id,
          name: backup.name,
          type: backup.type,
          status: 'completed',
          size,
          fileCount: files.length,
          createdAt: backup.createdAt,
          completedAt,
        },
        message: '备份已完成',
      });
    } catch (backupError) {
      // 备份执行失败：更新记录为 failed 并记录错误信息（best-effort，更新失败仅记日志）
      const errorMessage =
        backupError instanceof Error ? backupError.message : String(backupError);
      try {
        await tenantDb.backup.update({
          where: { id: backup.id },
          data: {
            status: 'failed',
            error: errorMessage,
            completedAt: new Date(),
          },
        });
      } catch (updateError) {
        console.error('Failed to mark backup as failed:', updateError);
      }
      console.error('Backup execution failed:', backupError);
      return NextResponse.json(
        { error: '备份执行失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to create backup:', error);
    return NextResponse.json(
      { error: '创建备份失败' },
      { status: 500 }
    );
  }
}
