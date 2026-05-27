import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Get the version to restore
    const version = await db.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
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
      tags: JSON.parse(updatedFile.tags || "[]"),
    });
  } catch (error) {
    console.error("Failed to restore version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
