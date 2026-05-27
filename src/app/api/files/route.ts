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

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
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
    if (fileType === "image") {
      thumbnailUrl = await generateThumbnail(buffer, file.name);

      // AI processing for images (OCR + description) - fire and forget
      try {
        const base64 = arrayBufferToBase64(new Uint8Array(buffer).buffer as ArrayBuffer);
        const aiRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/ai/process-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      });
    }

    const fileRecord = await db.file.create({
      data: {
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

    // For images, generate a preview URL (inline serving, not download)
    const previewUrl = fileType === "image"
      ? `/api/files/${fileRecord.id}/preview`
      : undefined;

    // Auto-generate AI summary for document files (fire-and-forget)
    const docTypes = ["word", "pdf", "pptx", "markdown", "txt"];
    if (docTypes.includes(fileType) && textContent) {
      // Run in background without blocking the response
      (async () => {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
          const summaryRes = await fetch(`${baseUrl}/api/ai/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
