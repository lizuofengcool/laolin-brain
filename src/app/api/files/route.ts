import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseWord } from "@/lib/parser/word";
import { parsePdf } from "@/lib/parser/pdf";
import { generateThumbnail } from "@/lib/parser/image";

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
    else if (
      file.type === "application/pdf" ||
      file.name.endsWith(".pdf")
    )
      fileType = "pdf";

    const buffer = Buffer.from(await file.arrayBuffer());
    const uniqueName = `${Date.now()}_${file.name}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

    // Extract text content
    let textContent: string | undefined;
    try {
      if (fileType === "word") {
        textContent = await parseWord(buffer);
      } else if (fileType === "pdf") {
        textContent = await parsePdf(buffer);
      }
    } catch (e) {
      console.error("Failed to extract text:", e);
    }

    // Generate thumbnail for images
    let thumbnailUrl: string | undefined;
    if (fileType === "image") {
      thumbnailUrl = await generateThumbnail(buffer, file.name);
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
      },
    });

    return NextResponse.json({
      id: fileRecord.id,
      fileName: fileRecord.fileName,
      fileType: fileRecord.fileType,
      fileSize: fileRecord.fileSize,
      filePath: fileRecord.filePath,
      textContent: fileRecord.textContent,
      thumbnailUrl: fileRecord.thumbnailUrl,
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
      files.map((f) => ({
        ...f,
        tags: JSON.parse(f.tags || "[]"),
      }))
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}
