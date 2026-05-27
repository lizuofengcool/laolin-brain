import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { files, folders } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "files 必须是一个数组" },
        { status: 400 }
      );
    }

    let importedCount = 0;

    // Import folders (don't use client-supplied IDs)
    if (folders && Array.isArray(folders)) {
      for (const folder of folders) {
        if (!folder.name) continue;

        try {
          await db.folder.create({
            data: {
              userId,
              name: folder.name,
              parentId: folder.parentId || null,
              createdAt: folder.createdAt ? new Date(folder.createdAt) : new Date(),
            },
          });
        } catch (err) {
          console.error(`Failed to import folder ${folder.name}:`, err);
        }
      }
    }

    // Import files (don't use client-supplied IDs)
    for (const file of files) {
      if (!file.fileName) continue;

      try {
        await db.file.create({
          data: {
            userId,
            fileName: file.fileName,
            fileType: file.fileType || "other",
            fileSize: file.fileSize || 0,
            textContent: file.textContent || null,
            storageMode: "cloud",
            folderId: file.folderId || null,
            tags: JSON.stringify(file.tags || []),
            isFavorite: file.isFavorite || false,
            summary: file.summary || null,
            keyPoints: JSON.stringify(file.keyPoints || []),
            createdAt: file.createdAt ? new Date(file.createdAt) : new Date(),
          },
        });

        importedCount++;
      } catch (err) {
        console.error(`Failed to import file ${file.fileName}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      importedCount,
      skippedCount: files.length - importedCount,
      message: `成功导入 ${importedCount} 个文件`,
    });
  } catch (error) {
    console.error("Import API error:", error);
    return NextResponse.json(
      { error: "数据导入失败" },
      { status: 500 }
    );
  }
}
