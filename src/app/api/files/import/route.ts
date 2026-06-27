import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

const VALID_FILE_TYPES = ["image", "pdf", "word", "pptx", "markdown", "txt", "other"];

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser

    // Early reject requests over 50MB based on Content-Length
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Request body exceeds 50MB limit" },
        { status: 413 }
      );
    }

    const body = await request.json();
    const { files, folders } = body;

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "files 必须是一个数组" },
        { status: 400 }
      );
    }

    if (files.length > 500) {
      return NextResponse.json(
        { error: "单次最多导入500个文件" },
        { status: 400 }
      );
    }

    // Check storage quota before importing
    const [{ totalSize: currentTotal }] = await db.$queryRaw<Array<{ totalSize: bigint }>>`
      SELECT COALESCE(SUM("fileSize"), 0) as "totalSize" FROM "File" WHERE "userId" = ${userId} AND "tenantId" = ${tenantId} AND "isDeleted" = false
    `;
    const quotaBytes = 5 * 1024 * 1024 * 1024; // 5GB
    let totalImportSize = 0;

    let importedCount = 0;

    // Import folders (don't use client-supplied IDs)
    if (folders && Array.isArray(folders)) {
      for (const folder of folders) {
        if (!folder.name || typeof folder.name !== 'string' || folder.name.length > 255) continue;

        // Validate parentId ownership
        let parentId = folder.parentId || null;
        if (parentId) {
          const parentFolder = await db.folder.findUnique({ where: { id: parentId } });
          if (!parentFolder || parentFolder.userId !== userId || parentFolder.tenantId !== tenantId) {
            parentId = null;
          }
        }

        try {
          await db.folder.create({
            data: {
              tenantId,
              userId,
              name: folder.name,
              parentId,
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
      if (!file.fileName || typeof file.fileName !== 'string' || file.fileName.length > 255) continue;

      // Track import size for quota check
      if (file.fileSize) totalImportSize += file.fileSize;
      if (Number(currentTotal) + totalImportSize > quotaBytes) {
        console.error(`Storage quota exceeded during import, stopping`);
        break;
      }

      // Validate fileSize: must be a non-negative number and within 5GB limit
      if (file.fileSize !== undefined && file.fileSize !== null) {
        if (typeof file.fileSize !== 'number' || file.fileSize < 0 || file.fileSize > 5 * 1024 * 1024 * 1024) {
          console.error(`Skipping file ${file.fileName}: invalid fileSize ${file.fileSize}`);
          continue;
        }
      }

      // Validate textContent size (max 5MB)
      if (file.textContent && typeof file.textContent === 'string' && file.textContent.length > 5 * 1024 * 1024) {
        console.error(`Skipping file ${file.fileName}: textContent exceeds 5MB limit`);
        continue;
      }

      // Validate tags array (max 50 items, each max 100 chars)
      if (file.tags && Array.isArray(file.tags)) {
        if (file.tags.length > 50) {
          console.error(`Skipping file ${file.fileName}: tags array exceeds 50 items`);
          continue;
        }
        const invalidTag = file.tags.find((t: unknown) => typeof t !== 'string' || (t as string).length > 100);
        if (invalidTag !== undefined) {
          console.error(`Skipping file ${file.fileName}: a tag exceeds 100 chars`);
          continue;
        }
      }

      try {
        // Validate folderId ownership if provided
        let validFolderId = file.folderId || null;
        if (validFolderId) {
          const folderExists = await db.folder.findFirst({
            where: { id: validFolderId, userId, tenantId },
            select: { id: true },
          });
          if (!folderExists) {
            validFolderId = null; // Silently ignore invalid folder reference
          }
        }

        await db.file.create({
          data: {
            tenantId,
            userId,
            fileName: file.fileName,
            fileType: VALID_FILE_TYPES.includes(file.fileType) ? file.fileType : "other",
            fileSize: file.fileSize || 0,
            textContent: file.textContent || null,
            storageMode: "cloud",
            folderId: validFolderId,
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
