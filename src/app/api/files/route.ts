import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseWord } from "@/lib/parser/word";
import { parsePdf } from "@/lib/parser/pdf";
import { parsePptx } from "@/lib/parser/ppt";
import { generateThumbnail } from "@/lib/parser/image";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;

    if (!file || !userId) {
      return NextResponse.json(
        { error: "File and userId are required" },
        { status: 400 }
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const uniqueName = `${Date.now()}_${file.name}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

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
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const folderId = searchParams.get("folderId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {
      userId,
      storageMode: "cloud",
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
          tags: JSON.parse(f.tags || "[]"),
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
