import sharp from "sharp";
import { writeFile, mkdir, readdir, unlink } from "fs/promises";
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

/**
 * KNOWN ISSUE: Thumbnail Accumulation
 * 
 * Thumbnails are generated for every uploaded image but are never cleaned up when:
 * - The original file is deleted
 * - The file is replaced or updated
 * - Thumbnails for failed uploads remain orphaned
 * 
 * The cleanupOrphanedThumbnails function below should be called periodically
 * (e.g., via a cron job or startup routine) to remove orphaned thumbnails.
 * 
 * Note: A complete solution would require a reverse mapping from thumbnail name
 * to file ID in the database. The current implementation uses a best-effort
 * heuristic based on checking if any file references each thumbnail URL.
 */

/**
 * Clean up orphaned thumbnails from the thumbnails directory.
 * Removes thumbnails that are not referenced by any file in the database.
 * 
 * This function is safe to call periodically (e.g., daily) and will not
 * remove thumbnails that are still in use.
 * 
 * @param referencedThumbUrls - Set of thumbnail URLs currently in use by files
 * @returns Object with counts of cleaned and remaining thumbnails
 */
export async function cleanupOrphanedThumbnails(
  referencedThumbUrls?: Set<string>
): Promise<{ cleaned: number; remaining: number }> {
  try {
    const thumbDir = path.join(process.cwd(), "upload", "thumbnails");
    let files: string[];
    try {
      files = await readdir(thumbDir);
    } catch {
      // Directory doesn't exist yet
      return { cleaned: 0, remaining: 0 };
    }

    if (files.length === 0) return { cleaned: 0, remaining: 0 };

    // If no reference set provided, keep all thumbnails (safe default)
    if (!referencedThumbUrls) {
      return { cleaned: 0, remaining: files.length };
    }

    let cleaned = 0;
    for (const file of files) {
      const thumbUrl = `/api/files/thumbnail/${encodeURIComponent(file)}`;
      if (!referencedThumbUrls.has(thumbUrl)) {
        try {
          await unlink(path.join(thumbDir, file));
          cleaned++;
        } catch {
          // File may have been deleted concurrently, ignore
        }
      }
    }

    return { cleaned, remaining: files.length - cleaned };
  } catch (error) {
    console.error("Thumbnail cleanup failed:", error);
    return { cleaned: 0, remaining: 0 };
  }
}
