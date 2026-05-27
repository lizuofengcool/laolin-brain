import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify file exists
    const file = await db.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const versions = await db.fileVersion.findMany({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });

    return NextResponse.json(versions);
  } catch (error) {
    console.error("Failed to fetch versions:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { fileName, fileSize, filePath, textContent, thumbnailUrl } = body;

    if (!fileName || fileSize === undefined) {
      return NextResponse.json(
        { error: "fileName and fileSize are required" },
        { status: 400 }
      );
    }

    // Verify file exists
    const file = await db.file.findUnique({ where: { id } });
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Get latest version number
    const latestVersion = await db.fileVersion.findFirst({
      where: { fileId: id },
      orderBy: { version: "desc" },
    });

    const nextVersion = (latestVersion?.version || 0) + 1;

    const version = await db.fileVersion.create({
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

    return NextResponse.json(version);
  } catch (error) {
    console.error("Failed to create version:", error);
    return NextResponse.json(
      { error: "Failed to create version" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await params;
    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get("versionId");

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    // Verify version belongs to this file
    const version = await db.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    await db.fileVersion.delete({ where: { id: versionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete version:", error);
    return NextResponse.json(
      { error: "Failed to delete version" },
      { status: 500 }
    );
  }
}
