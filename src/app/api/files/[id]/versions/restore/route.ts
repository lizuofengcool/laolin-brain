import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

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

    // Backup current state before restoring (create a new FileVersion entry)
    try {
      const currentLatestVersion = await db.fileVersion.findFirst({
        where: { fileId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (currentLatestVersion?.version || 0) + 1;

      await db.fileVersion.create({
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
    } catch (backupErr) {
      console.error("Failed to backup current state before restore:", backupErr);
      // Continue with restore even if backup fails
    }

    // Update the file with version data
    const updatedFile = await db.file.update({
      where: { id: fileId },
      data: {
        fileName: version.fileName,
        fileSize: version.fileSize,
        filePath: version.filePath,
        textContent: version.textContent,
        thumbnailUrl: version.thumbnailUrl,
      },
    });

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
