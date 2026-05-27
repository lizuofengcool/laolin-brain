import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unlink } from "fs/promises";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;
    const file = await db.file.findUnique({ where: { id } });
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
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;

    // Ownership check
    const existingFile = await db.file.findUnique({ where: { id } });
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
    if (body.fileHash !== undefined) data.fileHash = body.fileHash;
    if (body.folderId !== undefined)
      data.folderId = body.folderId === "null" ? null : body.folderId;
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

    const file = await db.file.update({
      where: { id },
      data,
    });

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
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id } = await params;
    const file = await db.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    if (file.filePath) {
      try {
        await unlink(file.filePath);
      } catch {
        // File may not exist on disk
      }
    }

    await db.file.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete file:', error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
