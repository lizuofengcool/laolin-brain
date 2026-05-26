import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function generateThumbnail(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  try {
    const { default: imageCompression } = await import(
      "browser-image-compression"
    );

    // For server side, we just save the original and use it as thumbnail path
    const thumbDir = path.join(process.cwd(), "upload", "thumbnails");
    await mkdir(thumbDir, { recursive: true });

    const thumbName = `thumb_${Date.now()}_${fileName}`;
    const thumbPath = path.join(thumbDir, thumbName);
    await writeFile(thumbPath, buffer);

    return `/api/files/thumbnail/${encodeURIComponent(thumbName)}`;
  } catch {
    return "";
  }
}
