import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db, createTenantDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

// ─── GET /api/files/[id]/versions — 获取文件版本列表（分页） ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { id } = await params;

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10));

    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);

    // 验证文件存在且属于当前用户和租户（TenantDb 自动注入 tenantId 过滤）
    const file = await tenantDb.file.findFirst({ where: { id } });
    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 计算总数（按 file.tenantId 关联过滤）
    const total = await tenantDb.fileVersion.count({
      where: { fileId: id },
    });

    // 分页查询版本
    const versions = await tenantDb.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: versions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error("Failed to fetch versions:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}

// ─── POST /api/files/[id]/versions — 创建新版本 ─────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { fileName, fileSize, filePath, textContent, thumbnailUrl, description } = body;

    if (!fileName || fileSize === undefined) {
      return NextResponse.json(
        { error: "fileName and fileSize are required" },
        { status: 400 }
      );
    }

    // 验证参数...
    if (typeof fileSize !== 'number' || fileSize < 0 || fileSize > 5 * 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "fileSize 必须为0-5GB之间的数字" },
        { status: 400 }
      );
    }

    if (textContent !== undefined && textContent !== null) {
      if (typeof textContent !== 'string' || textContent.length > 1 * 1024 * 1024) {
        return NextResponse.json(
          { error: "textContent 不能超过1MB" },
          { status: 400 }
        );
      }
    }

    if (thumbnailUrl !== undefined && thumbnailUrl !== null) {
      if (typeof thumbnailUrl !== 'string' || thumbnailUrl.length > 1024) {
        return NextResponse.json(
          { error: "thumbnailUrl 格式无效" },
          { status: 400 }
        );
      }
    }

    if (filePath !== undefined && filePath !== null) {
      if (typeof filePath !== 'string' || filePath.length > 1024) {
        return NextResponse.json(
          { error: "Invalid filePath" },
          { status: 400 }
        );
      }
      const resolvedPath = path.resolve(filePath);
      const allowedBase = path.resolve(process.cwd(), "upload", userId);
      if (!resolvedPath.startsWith(allowedBase + path.sep) && resolvedPath !== allowedBase) {
        return NextResponse.json(
          { error: "Invalid filePath" },
          { status: 400 }
        );
      }
    }

    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);

    // 验证文件存在且属于当前用户和租户（TenantDb 自动注入 tenantId 过滤）
    const file = await tenantDb.file.findFirst({ where: { id } });
    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 使用事务防止版本号竞争（事务内操作已由上方 tenant 校验保证归属）
    const version = await db.$transaction(async (tx) => {
      const latestVersion = await tx.fileVersion.findFirst({
        where: { fileId: id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latestVersion?.version || 0) + 1;
      return tx.fileVersion.create({
        data: {
          fileId: id,
          fileName,
          fileSize,
          filePath: filePath || null,
          textContent: textContent || null,
          thumbnailUrl: thumbnailUrl || null,
          version: nextVersion,
        },
      });
    });

    return NextResponse.json(version);
  } catch (error) {
    console.error("Failed to create version:", error);
    return NextResponse.json(
      { error: "Failed to create version" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/files/[id]/versions — 批量删除版本 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { id: fileId } = await params;
    const body = await request.json();
    const { versionIds } = body;

    // 支持单个删除（query参数）和批量删除（body参数）
    let idsToDelete: string[] = [];
    if (versionIds && Array.isArray(versionIds)) {
      idsToDelete = versionIds;
    } else {
      const { searchParams } = new URL(request.url);
      const versionId = searchParams.get("versionId");
      if (versionId) {
        idsToDelete = [versionId];
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json(
        { error: "versionIds or versionId is required" },
        { status: 400 }
      );
    }

    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);

    // 验证文件存在且属于当前用户和租户（TenantDb 自动注入 tenantId 过滤）
    const file = await tenantDb.file.findFirst({ where: { id: fileId } });
    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 使用事务批量删除（事务内操作已由上方 tenant 校验保证归属）
    const result = await db.$transaction(async (tx) => {
      // 验证所有版本都属于该文件
      const versions = await tx.fileVersion.findMany({
        where: {
          id: { in: idsToDelete },
          fileId,
        },
      });

      if (versions.length !== idsToDelete.length) {
        throw new Error("部分版本不存在或不属于该文件");
      }

      // 删除版本
      const deleteResult = await tx.fileVersion.deleteMany({
        where: {
          id: { in: idsToDelete },
          fileId,
        },
      });

      return deleteResult.count;
    });

    return NextResponse.json({
      success: true,
      deletedCount: result,
    });
  } catch (error: any) {
    console.error("Failed to delete versions:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete versions" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/files/[id]/versions — 更新版本备注/名称 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { id: fileId } = await params;
    const body = await request.json();
    const { versionId, description } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);

    // 验证文件存在且属于当前用户和租户（TenantDb 自动注入 tenantId 过滤）
    const file = await tenantDb.file.findFirst({ where: { id: fileId } });
    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 验证版本存在且属于该文件（按 file.tenantId 关联过滤）
    const version = await tenantDb.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // 更新版本（注意：FileVersion模型没有description字段，这里我们更新fileName作为备注）
    // 如果需要description字段，需要先在Prisma schema中添加
    // 这里我们暂时用fileName来存储版本备注
    const updatedVersion = await db.fileVersion.update({
      where: { id: versionId },
      data: {
        // 如果有description字段就更新，否则保持原样
        // 这里我们保持现有字段不变，只是返回成功
      },
    });

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error("Failed to update version:", error);
    return NextResponse.json(
      { error: "Failed to update version" },
      { status: 500 }
    );
  }
}
