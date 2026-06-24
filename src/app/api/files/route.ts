import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseWord } from "@/lib/parser/word";
import { parsePdf } from "@/lib/parser/pdf";
import { parsePptx } from "@/lib/parser/ppt";
import { generateThumbnail } from "@/lib/parser/image";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

// Magic bytes for common file types (security: validate actual content matches declared type)
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
  'image/svg+xml': [], // SVG is text-based, skip magic check
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04], // ZIP-based
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [0x50, 0x4B, 0x03, 0x04],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [0x50, 0x4B, 0x03, 0x04],
  'application/zip': [0x50, 0x4B, 0x03, 0x04],
  'text/plain': [], // Text files have no reliable magic bytes
  'text/markdown': [], // Text files have no reliable magic bytes
};

function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  const expected = MAGIC_BYTES[declaredMimeType];
  if (!expected || expected.length === 0) return true; // Skip text-based types
  if (buffer.length < expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buffer[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * 检查请求体大小是否超过限制（纵深防御）
 * 基于 Content-Length 头部进行预检，避免接收超大请求体
 * @returns 如果超限返回 413 响应，否则返回 null（允许继续）
 */
function checkBodySize(request: NextRequest, maxSizeMB: number): NextResponse | null {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > maxSizeMB * 1024 * 1024) {
      return NextResponse.json(
        { error: `请求体过大，最大允许 ${maxSizeMB}MB` },
        { status: 413 },
      );
    }
  }
  // Content-Length 缺失时不拒绝——解析 formData 后通过 file.size 做精确校验
  return null;
}

// AI processing rate limit: max 10 files per user per 5 minutes
const aiProcessingTimestamps = new Map<string, number[]>();
function checkAiRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = 5 * 60 * 1000; // 5 minutes
  const timestamps = aiProcessingTimestamps.get(userId) || [];
  const recent = timestamps.filter(t => now - t < window);
  aiProcessingTimestamps.set(userId, recent);
  return recent.length < 10;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function POST(request: NextRequest) {
  // Authenticate request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId: authenticatedUserId } = auth;

  try {
    // Cleanup stale aiProcessingTimestamps (older than 1 hour)
    const AI_TS_MAX_AGE = 60 * 60 * 1000; // 1 hour
    if (aiProcessingTimestamps.size > 0) {
      for (const [uid, timestamps] of aiProcessingTimestamps) {
        const now = Date.now();
        const filtered = timestamps.filter((ts: number) => now - ts < AI_TS_MAX_AGE);
        if (filtered.length === 0) {
          aiProcessingTimestamps.delete(uid);
        } else if (filtered.length < timestamps.length) {
          aiProcessingTimestamps.set(uid, filtered);
        }
      }
    }

    // 纵深防御：在接收请求体之前，基于 Content-Length 预检请求体大小
    // middleware 已做第一层拦截（100MB），此处作为第二层防护
    const bodySizeResponse = checkBodySize(request, 100);
    if (bodySizeResponse) return bodySizeResponse;

    // Check content-type is multipart/form-data
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: '请求必须是 multipart/form-data 格式' },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    // Validate file is actually a File instance
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Valid file is required" },
        { status: 400 }
      );
    }

    // Use authenticated userId instead of client-sent userId
    const userId = authenticatedUserId;

    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });

    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { tenantId } = tenantUser;

    // Parse query params for AI skip control
    const searchParams = new URL(request.url).searchParams;

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 413 }
      );
    }

    // Per-user storage quota check (5GB) - early check for fast rejection
    const [{ totalSize: earlyTotalSize }] = await db.$queryRaw<Array<{ totalSize: bigint }>>`
      SELECT COALESCE(SUM("fileSize"), 0) as "totalSize" FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
    `;
    const earlyTotalUsed = Number(earlyTotalSize);
    const quotaBytes = 5 * 1024 * 1024 * 1024; // 5GB
    if (earlyTotalUsed + file.size > quotaBytes) {
      const usedMB = Math.round(earlyTotalUsed / (1024 * 1024));
      const quotaMB = Math.round(quotaBytes / (1024 * 1024));
      return NextResponse.json(
        { error: `Storage quota exceeded (${usedMB}MB / ${quotaMB}MB used)` },
        { status: 413 }
      );
    }

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "upload", userId);
    await mkdir(uploadDir, { recursive: true });

    // Determine file type
    let fileType = "other";
    if (file.type.startsWith("image/")) fileType = "image";
    else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    )
      fileType = "word";
    else if (file.type === "application/pdf" || file.name.endsWith(".pdf"))
      fileType = "pdf";
    else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      file.name.endsWith(".pptx")
    )
      fileType = "pptx";
    else if (file.name.endsWith(".md") || file.name.endsWith(".markdown") || file.type === "text/markdown")
      fileType = "markdown";
    else if (file.name.endsWith(".txt") || file.type === "text/plain")
      fileType = "txt";

    const buffer = Buffer.from(await file.arrayBuffer());
    // Validate magic bytes to prevent MIME type spoofing
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json({ error: '文件内容与声明的类型不匹配' }, { status: 400 });
    }
    // Sanitize filename to prevent path traversal
    const safeName = path.basename(file.name);
    const uniqueName = `${Date.now()}_${safeName}`;
    const filePath = path.join(uploadDir, uniqueName);

    // Validate the resolved path stays within the upload directory
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(uploadDir);
    if (!resolvedPath.startsWith(resolvedUploadDir + path.sep) && resolvedPath !== resolvedUploadDir) {
      return NextResponse.json(
        { error: "Invalid file path" },
        { status: 400 }
      );
    }

    await writeFile(resolvedPath, buffer);

    // Extract text content
    let textContent: string | undefined;
    let tags: string[] = [];

    try {
      if (fileType === "word") {
        textContent = await parseWord(buffer);
      } else if (fileType === "pdf") {
        textContent = await parsePdf(buffer);
      } else if (fileType === "pptx") {
        textContent = await parsePptx(buffer);
      } else if (fileType === "markdown" || fileType === "txt") {
        textContent = buffer.toString("utf-8");
      }
    } catch (e) {
      console.error("Failed to extract text:", e);
    }

    // Generate thumbnail for images
    let thumbnailUrl: string | undefined;
    let aiSkipped = false;
    const skipAiParam = searchParams.get("skipAi") === "true";
    if (fileType === "image") {
      thumbnailUrl = await generateThumbnail(buffer, file.name, userId);

      // Check if AI processing should be skipped
      const skipAiDueToRateLimit = !checkAiRateLimit(userId);
      if (skipAiDueToRateLimit) aiSkipped = true;

      if (skipAiParam) {
        console.log(`AI processing skipped for user ${userId} (skipAi=true)`);
      } else if (skipAiDueToRateLimit) {
        console.log(`AI processing rate limit reached for user ${userId}, skipping auto-processing`);
      }

      // AI processing for images (OCR + description) - fire and forget
      if (!skipAiParam && !skipAiDueToRateLimit) {
        try {
          aiProcessingTimestamps.get(userId)?.push(Date.now());
          const base64 = arrayBufferToBase64(new Uint8Array(buffer).buffer as ArrayBuffer);
          const aiRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/ai/process-image`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(request.headers.get("authorization") ? { Authorization: request.headers.get("authorization")! } : {}),
            },
            body: JSON.stringify({ imageBase64: base64 }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (aiData.ocrText) {
              textContent = aiData.ocrText;
            }
            if (aiData.tags && aiData.tags.length > 0) {
              tags = aiData.tags;
            }
          }
        } catch (e) {
          console.error("AI image processing failed:", e);
        }
      }
    }

    // Check if a file with the same name already exists for this user (versioning)
    const existingFile = await db.file.findFirst({
      where: {
        userId,
        fileName: file.name,
        isDeleted: false,
      },
    });

    if (existingFile) {
      // Create version + update file atomically in a transaction
      const fileRecord = await db.$transaction(async (tx) => {
        // Create a version of the existing file before updating
        const versionCount = await tx.fileVersion.count({ where: { fileId: existingFile.id } });
        await tx.fileVersion.create({
          data: {
            fileId: existingFile.id,
            fileName: existingFile.fileName,
            fileSize: existingFile.fileSize,
            filePath: existingFile.filePath,
            textContent: existingFile.textContent,
            thumbnailUrl: existingFile.thumbnailUrl,
            version: versionCount + 1,
          },
        });

        // Update the existing file
        return tx.file.update({
          where: { id: existingFile.id },
          data: {
            fileName: file.name,
            fileType,
            fileSize: file.size,
            filePath,
            textContent,
            thumbnailUrl,
            tags: tags.length > 0 ? JSON.stringify(tags) : existingFile.tags,
          },
        });
      });

      const previewUrl = fileType === "image"
        ? `/api/files/${fileRecord.id}/preview`
        : undefined;

      // Clean up old file from disk after versioning
      try {
        const { unlink } = await import('fs/promises');
        if (existingFile.filePath) {
          await unlink(existingFile.filePath).catch(() => {});
        }
      } catch {}

      return NextResponse.json({
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        fileType: fileRecord.fileType,
        fileSize: fileRecord.fileSize,
        filePath: fileRecord.filePath,
        textContent: fileRecord.textContent,
        thumbnailUrl: fileRecord.thumbnailUrl || previewUrl,
        previewUrl,
        tags: tags.length > 0 ? tags : safeJsonParseArray(existingFile.tags),
        isVersionUpdate: true,
        aiSkipped,
      });
    }

    // Create new file inside a transaction that re-checks quota to prevent TOCTOU race
    const fileRecord = await db.$transaction(async (tx) => {
      // Authoritative quota check inside transaction
      const [{ totalSize: txTotalSize }] = await tx.$queryRaw<Array<{ totalSize: bigint }>>`
        SELECT COALESCE(SUM("fileSize"), 0) as "totalSize" FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      `;
      if (Number(txTotalSize) + file.size > quotaBytes) {
        throw new Error("Storage quota exceeded (concurrent upload detected)");
      }

      return tx.file.create({
        data: {
          tenantId,
          userId,
          fileName: file.name,
          fileType,
          fileSize: file.size,
          filePath,
          textContent,
          thumbnailUrl,
          storageMode: "cloud",
          tags: JSON.stringify(tags),
        },
      });
    });

    // For images, generate a preview URL (inline serving, not download)
    const previewUrl = fileType === "image"
      ? `/api/files/${fileRecord.id}/preview`
      : undefined;

    // Auto-generate AI summary for document files (fire-and-forget)
    const docTypes = ["word", "pdf", "pptx", "markdown", "txt"];
    const skipDocAiDueToRateLimit = !checkAiRateLimit(userId);
    if (skipDocAiDueToRateLimit) aiSkipped = true;

    if (docTypes.includes(fileType) && textContent && !skipAiParam && !skipDocAiDueToRateLimit) {
      // Run in background without blocking the response
      (async () => {
        try {
          aiProcessingTimestamps.get(userId)?.push(Date.now());
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
          const summaryRes = await fetch(`${baseUrl}/api/ai/summarize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(request.headers.get("authorization") ? { Authorization: request.headers.get("authorization")! } : {}),
            },
            body: JSON.stringify({
              content: textContent,
              fileName: file.name,
              fileType,
            }),
          });

          if (summaryRes.ok) {
            const summaryData = await summaryRes.json();
            if (summaryData.summary) {
              await db.file.update({
                where: { id: fileRecord.id },
                data: {
                  summary: summaryData.summary,
                  keyPoints: JSON.stringify(summaryData.keyPoints || []),
                  tags: summaryData.suggestedTags?.length > 0
                    ? JSON.stringify([...tags, ...summaryData.suggestedTags])
                    : JSON.stringify(tags),
                },
              });
            }
          }
        } catch (e) {
          console.error("Auto-summary failed for", file.name, ":", e);
        }
      })();
    } else if (skipAiParam) {
      console.log(`AI summary skipped for user ${userId} (skipAi=true)`);
    } else if (skipDocAiDueToRateLimit) {
      console.log(`AI summary rate limit reached for user ${userId}, skipping auto-processing`);
    }

    return NextResponse.json({
      id: fileRecord.id,
      fileName: fileRecord.fileName,
      fileType: fileRecord.fileType,
      fileSize: fileRecord.fileSize,
      filePath: fileRecord.filePath,
      textContent: fileRecord.textContent,
      thumbnailUrl: fileRecord.thumbnailUrl || previewUrl,
      previewUrl,
      tags: tags,
      aiSkipped: aiSkipped ? true : undefined,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Authenticate request
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId: authenticatedUserId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");

    // Pagination support
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const skip = (page - 1) * limit;

    // Use authenticated userId
    const userId = authenticatedUserId;

    const where: Record<string, unknown> = {
      userId,
      storageMode: "cloud",
      isDeleted: false,
    };

    if (folderId === "null" || !folderId) {
      where.folderId = null;
    } else {
      where.folderId = folderId;
    }

    const files = await db.file.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    });

    return NextResponse.json(
      files.map((f) => {
        const parsed = {
          ...f,
          tags: safeJsonParseArray(f.tags),
          keyPoints: safeJsonParseArray(f.keyPoints),
        };
        // For image files, convert thumbnailUrl to full API URL
        // and generate a preview URL for the original image
        if (f.fileType === "image" && f.thumbnailUrl) {
          parsed.thumbnailUrl = f.thumbnailUrl; // already a relative URL like /api/files/thumbnail/...
        }
        return parsed;
      })
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}
