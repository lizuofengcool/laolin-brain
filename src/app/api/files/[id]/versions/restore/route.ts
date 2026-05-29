import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";
import { unlink } from "fs/promises";
import { join } from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { id: versionId } = await params;
    const body = await request.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      );
    }

    // Verify file belongs to user
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || file.userId !== userId) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // Get the version to restore
    const version = await db.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Backup current state and update file atomically in a transaction
    const updatedFile = await db.$transaction(async (tx) => {
      // Backup current state before restoring (create a new FileVersion entry)
      const currentLatestVersion = await tx.fileVersion.findFirst({
        where: { fileId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (currentLatestVersion?.version || 0) + 1;

      await tx.fileVersion.create({
        data: {
          fileId,
          fileName: file.fileName,
          fileSize: file.fileSize,
          filePath: file.filePath,
          textContent: file.textContent,
          thumbnailUrl: file.thumbnailUrl,
          version: nextVersion,
        },
      });

      // Update the file with version data
      return tx.file.update({
        where: { id: fileId },
        data: {
          fileName: version.fileName,
          fileSize: version.fileSize,
          filePath: version.filePath,
          textContent: version.textContent,
          thumbnailUrl: version.thumbnailUrl,
        },
      });
    });

    // Clean up orphaned physical file (old file on disk is superseded)
    // Do this outside the transaction so it doesn't block the DB response
    if (file.filePath && file.filePath !== version.filePath) {
      const uploadsDir = join(process.cwd(), 'db', 'uploads');
      const oldFilePath = join(uploadsDir, file.filePath);
      unlink(oldFilePath).catch(() => {
        // Ignore if file doesn't exist (expected for cloud-stored or virtual files)
      });
    }

    return NextResponse.json({
      ...updatedFile,
      tags: safeJsonParseArray(updatedFile.tags),
    });
  } catch (error) {
    console.error("Failed to restore version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
