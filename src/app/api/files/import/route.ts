import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, folders, userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId 参数不能为空" },
        { status: 400 }
      );
    }

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "files 必须是一个数组" },
        { status: 400 }
      );
    }

    let importedCount = 0;

    // Import folders first
    if (folders && Array.isArray(folders)) {
      for (const folder of folders) {
        if (!folder.id || !folder.name) continue;

        try {
          // Check if folder already exists
          const existing = await db.folder.findUnique({
            where: { id: folder.id },
          });

          if (!existing) {
            await db.folder.create({
              data: {
                id: folder.id,
                userId,
                name: folder.name,
                parentId: folder.parentId || null,
                createdAt: folder.createdAt ? new Date(folder.createdAt) : new Date(),
              },
            });
          }
        } catch (err) {
          console.error(`Failed to import folder ${folder.id}:`, err);
        }
      }
    }

    // Import files
    for (const file of files) {
      if (!file.fileName) continue;

      try {
        // Check if file already exists (by ID or fileName + userId)
        let existing: Awaited<ReturnType<typeof db.file.findUnique>> = null;
        if (file.id) {
          existing = await db.file.findUnique({
            where: { id: file.id },
          });
        }

        if (existing) {
          // Skip existing files
          continue;
        }

        await db.file.create({
          data: {
            id: file.id || undefined,
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
