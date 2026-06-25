import { NextRequest, NextResponse } from "next/server";
import { parseWord } from "@/lib/parser/word";
import { parsePdf } from "@/lib/parser/pdf";
import { parsePptx } from "@/lib/parser/ppt";

/**
 * POST /api/files/extract-text
 * 本地模式下，前端上传文件后调用此接口提取文档文本内容
 * 请求体为 multipart/form-data，包含一个 file 字段
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Valid file is required" }, { status: 400 });
    }

    // 限制文件大小（50MB）
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 判断文件类型
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    let fileType = "other";
    if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      fileType = "word";
    } else if (file.type === "application/pdf" || ext === "pdf") {
      fileType = "pdf";
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      ext === "pptx"
    ) {
      fileType = "pptx";
    } else if (ext === "md" || ext === "markdown") {
      fileType = "markdown";
    } else if (ext === "txt") {
      fileType = "txt";
    }

    // 提取文本
    let textContent: string | undefined;

    try {
      switch (fileType) {
        case "word":
          textContent = await parseWord(buffer);
          break;
        case "pdf":
          textContent = await parsePdf(buffer);
          break;
        case "pptx":
          textContent = await parsePptx(buffer);
          break;
        case "markdown":
        case "txt":
          textContent = buffer.toString("utf-8");
          break;
      }
    } catch (e) {
      console.error("Text extraction failed:", e);
    }

    return NextResponse.json({
      fileType,
      textContent: textContent || null,
    });
  } catch {
    return NextResponse.json({ error: "Text extraction failed" }, { status: 500 });
  }
}
