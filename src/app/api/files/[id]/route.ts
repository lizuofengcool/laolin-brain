import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unlink } from "fs/promises";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const file = await db.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ ...file, tags: JSON.parse(file.tags || "[]") });
  } catch {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.tags !== undefined) data.tags = JSON.stringify(body.tags);
    if (body.isFavorite !== undefined) data.isFavorite = body.isFavorite;
    if (body.folderId !== undefined)
      data.folderId = body.folderId === "null" ? null : body.folderId;
    if (body.fileName !== undefined) data.fileName = body.fileName;

    const file = await db.file.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ...file, tags: JSON.parse(file.tags || "[]") });
  } catch {
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
  try {
    const { id } = await params;
    const file = await db.file.findUnique({ where: { id } });

    if (file?.filePath) {
      try {
        await unlink(file.filePath);
      } catch {
        // File may not exist on disk
      }
    }

    await db.file.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
