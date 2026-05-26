import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function generateThumbnail(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  try {
    const thumbDir = path.join(process.cwd(), "upload", "thumbnails");
    await mkdir(thumbDir, { recursive: true });

    const thumbName = `thumb_${Date.now()}_${fileName}`;
    const thumbPath = path.join(thumbDir, thumbName);

    // Use sharp to resize to a small thumbnail
    await sharp(buffer)
      .resize(200, 200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);

    return `/api/files/thumbnail/${encodeURIComponent(thumbName)}`;
  } catch {
    return "";
  }
}
