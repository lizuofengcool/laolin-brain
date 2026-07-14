import { NextRequest, NextResponse } from "next/server";
import { db, createTenantDb } from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);
    const { id } = await params;
    // TenantDb 自动注入 tenantId 过滤，防止跨租户访问
    const file = await tenantDb.file.findFirst({
      where: { id }
    });
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    // Ownership check
    if (file.userId !== userId) {
      return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
    }
    return NextResponse.json({ ...file, tags: safeJsonParseArray(file.tags) });
  } catch (error) {
    console.error('Failed to fetch file:', error);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);
    const { id } = await params;

    // Ownership + tenant check via TenantDb (auto-injects tenantId)
    const existingFile = await tenantDb.file.findFirst({
      where: { id }
    });
    if (!existingFile || existingFile.userId !== userId) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) {
        return NextResponse.json({ error: 'tags 必须是数组' }, { status: 400 });
      }
      data.tags = JSON.stringify(body.tags);
    }
    if (body.isFavorite !== undefined) {
      if (typeof body.isFavorite !== 'boolean') {
        return NextResponse.json({ error: 'isFavorite 必须是布尔值' }, { status: 400 });
      }
      data.isFavorite = body.isFavorite;
    }
    if (body.isDeleted !== undefined) {
      if (typeof body.isDeleted !== 'boolean') {
        return NextResponse.json({ error: 'isDeleted 必须是布尔值' }, { status: 400 });
      }
      data.isDeleted = body.isDeleted;
    }
    if (body.deletedAt !== undefined) {
      if (body.deletedAt !== null) {
        const d = new Date(body.deletedAt);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'deletedAt 必须是有效日期或 null' }, { status: 400 });
        }
        data.deletedAt = d;
      } else {
        data.deletedAt = null;
      }
    }
    if (body.fileHash !== undefined) {
      if (body.fileHash !== null) {
        if (typeof body.fileHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(body.fileHash)) {
          return NextResponse.json({ error: 'fileHash must be a 64-character hex string or null' }, { status: 400 });
        }
      }
      data.fileHash = body.fileHash;
    }
    if (body.folderId !== undefined) {
      const folderIdValue = body.folderId === "null" ? null : body.folderId;
      if (folderIdValue !== null) {
        if (typeof folderIdValue !== 'string') {
          return NextResponse.json({ error: 'folderId must be a string or null' }, { status: 400 });
        }
        // Verify folder belongs to the same user and tenant (TenantDb auto-injects tenantId)
        const folder = await tenantDb.folder.findFirst({ where: { id: folderIdValue } });
        if (!folder || folder.userId !== userId) {
          return NextResponse.json({ error: '目标文件夹不存在' }, { status: 400 });
        }
      }
      data.folderId = folderIdValue;
    }
    if (body.fileName !== undefined) {
      if (typeof body.fileName !== 'string' || body.fileName.length > 255) {
        return NextResponse.json({ error: 'fileName 必须为字符串且不超过255个字符' }, { status: 400 });
      }
      data.fileName = body.fileName;
    }
    if (body.textContent !== undefined) {
      if (typeof body.textContent === 'string' && body.textContent.length > 1 * 1024 * 1024) {
        return NextResponse.json({ error: 'textContent 不能超过1MB' }, { status: 400 });
      }
      data.textContent = body.textContent;
    }

    // 写入走 TenantDb（内部 updateMany 注入 tenantId），对写入本身范围化，
    // 杜绝越权写入其他租户文件（前置 findFirst 已校验归属，此处为防御性二次范围化）
    await tenantDb.file.update({ where: { id }, data });
    const file = await tenantDb.file.findFirst({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    return NextResponse.json({ ...file, tags: safeJsonParseArray(file.tags) });
  } catch (error) {
    console.error('Failed to update file:', error);
    return NextResponse.json(
      { error: "Failed to update file" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);
    const { id } = await params;
    // TenantDb 自动注入 tenantId 过滤，防止跨租户访问
    const file = await tenantDb.file.findFirst({
      where: { id }
    });

    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    if (file.filePath) {
      const uploadDir = path.resolve(path.join(process.cwd(), 'upload'));
      const resolvedPath = path.resolve(file.filePath);
      if (!resolvedPath.startsWith(uploadDir + path.sep) && resolvedPath !== uploadDir) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }
      try {
        await unlink(file.filePath);
      } catch {
        // File may not exist on disk
      }
    }

    // Clean up version file paths from disk (TenantDb 按 file.tenantId 关联过滤)
    const versions = await tenantDb.fileVersion.findMany({
      where: { fileId: id },
      select: { filePath: true },
    });
    const versionUploadDir = path.resolve(path.join(process.cwd(), 'upload'));
    for (const v of versions) {
      if (v.filePath) {
        const resolvedVPath = path.resolve(v.filePath);
        if (
          resolvedVPath !== versionUploadDir &&
          !resolvedVPath.startsWith(versionUploadDir + path.sep)
        ) {
          continue;
        }
        try { await unlink(v.filePath); } catch { /* file may not exist */ }
      }
    }

    // 级联删除：每条 deleteMany 均注入 tenantId / file.tenantId 过滤，对写入本身范围化，
    // 杜绝越权删除其他租户数据（前置 findFirst 已校验文件归属，此处为防御性二次范围化）
    // Note: FileVersion and FileShare have onDelete: Cascade in Prisma schema
    // FileEmbedding and FaceInstance are not related via Prisma, so we delete manually
    await db.$transaction([
      db.fileEmbedding.deleteMany({ where: { fileId: id, tenantId } }),
      db.faceInstance.deleteMany({ where: { fileId: id, file: { tenantId } } }),
      db.file.deleteMany({ where: { id, tenantId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete file:', error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
