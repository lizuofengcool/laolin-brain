import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import fs from "fs";

/**
 * 文件信息API
 * GET /api/files/[id]/info - 获取文件详细信息
 * GET /api/files/[id]/text - 获取文本文件内容
 */

// 支持的文本文件类型
const TEXT_FILE_TYPES = [
  "txt", "md", "markdown", "json", "xml", "csv",
  "js", "ts", "jsx", "tsx", "css", "scss", "less",
  "html", "htm", "py", "java", "c", "cpp", "h",
  "go", "rs", "rb", "php", "sql", "sh", "bash",
  "yaml", "yml", "toml", "ini", "conf", "log",
];

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 获取文件扩展名
function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

// 判断是否是文本文件
function isTextFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return TEXT_FILE_TYPES.includes(ext);
}

// ─── GET /api/files/[id]/info — 获取文件详细信息 ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const includeContent = searchParams.get("includeContent") === "true";

    // 查询文件
    const file = await db.file.findFirst({
      where: {
        id,
        tenantId,
        userId,
        isDeleted: false,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      );
    }

    const extension = getFileExtension(file.fileName);
    const isText = isTextFile(file.fileName);

    // 构建文件信息
    const fileInfo: any = {
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      fileSizeFormatted: formatFileSize(file.fileSize),
      extension,
      isTextFile: isText,
      canPreview: isText || file.fileType === "image",
      folderId: file.folderId,
      isFavorite: file.isFavorite,
      tags: file.tags ? JSON.parse(file.tags) : [],
      summary: file.summary,
      keyPoints: file.keyPoints ? JSON.parse(file.keyPoints) : [],
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      storageMode: file.storageMode,
      syncStatus: file.syncStatus,
      lastSyncAt: file.lastSyncAt,
    };

    // 如果需要包含文本内容
    if (includeContent && isText) {
      try {
        // 优先使用数据库中的textContent
        if (file.textContent) {
          fileInfo.textContent = file.textContent;
          fileInfo.textLineCount = file.textContent.split("\n").length;
          fileInfo.textCharCount = file.textContent.length;
        } else if (file.filePath && fs.existsSync(file.filePath)) {
          // 从文件系统读取
          const content = fs.readFileSync(file.filePath, "utf-8");
          // 限制返回大小，最大1MB
          const maxSize = 1024 * 1024;
          const truncated = content.length > maxSize;
          fileInfo.textContent = truncated
            ? content.substring(0, maxSize)
            : content;
          fileInfo.textLineCount = content.split("\n").length;
          fileInfo.textCharCount = content.length;
          fileInfo.textTruncated = truncated;
        }
      } catch (readError) {
        console.error("Failed to read file content:", readError);
        fileInfo.textContent = null;
        fileInfo.textReadError = "读取文件内容失败";
      }
    }

    return NextResponse.json({
      success: true,
      data: fileInfo,
    });
  } catch (error) {
    console.error("Failed to get file info:", error);
    return NextResponse.json(
      { error: "获取文件信息失败" },
      { status: 500 }
    );
  }
}
