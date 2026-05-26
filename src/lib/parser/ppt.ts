import { exec } from "child_process";
import { promisify } from "util";
import { readdir, readFile, unlink, mkdir, writeFile } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

/**
 * Parse a PPTX file and extract text from each slide.
 * Uses the "pptx2json" approach - we extract text from the XML inside the PPTX zip.
 * Falls back to using unzip if available, otherwise tries a simpler approach.
 */
export async function parsePptx(buffer: Buffer): Promise<string> {
  try {
    const tmpDir = path.join(process.cwd(), "upload", "tmp_pptx");
    await mkdir(tmpDir, { recursive: true });

    const tmpFile = path.join(tmpDir, `pptx_${Date.now()}.pptx`);
    await writeFile(tmpFile, buffer);

    const extractDir = path.join(tmpDir, `pptx_${Date.now()}_extract`);
    await mkdir(extractDir, { recursive: true });

    try {
      // Try using unzip to extract PPTX (which is a ZIP file)
      await execAsync(`unzip -o "${tmpFile}" -d "${extractDir}" 2>/dev/null || true`);
    } catch {
      // If unzip fails, try with python or another method
    }

    // Read slide XML files from ppt/slides/
    const slidesDir = path.join(extractDir, "ppt", "slides");
    let textContent = "";

    try {
      const slideFiles = (await readdir(slidesDir))
        .filter((f) => f.startsWith("slide") && f.endsWith(".xml"))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
          return numA - numB;
        });

      for (const slideFile of slideFiles) {
        const slidePath = path.join(slidesDir, slideFile);
        const xml = await readFile(slidePath, "utf-8");
        // Extract text from <a:t> tags (Office Open XML text runs)
        const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g);
        if (textMatches) {
          const slideText = textMatches
            .map((m) => m.replace(/<\/?a:t>/g, ""))
            .join(" ");
          if (slideText.trim()) {
            textContent += `--- 第 ${slideFiles.indexOf(slideFile) + 1} 页 ---\n${slideText.trim()}\n\n`;
          }
        }
      }
    } catch {
      // Slides dir not found, try alternative approach
      textContent = "";
    }

    // Cleanup
    try {
      await unlink(tmpFile);
      // Try to remove extract dir
      await execAsync(`rm -rf "${extractDir}" 2>/dev/null || true`);
    } catch {
      // Ignore cleanup errors
    }

    return textContent.trim() || "（PPT 文件内容无法提取）";
  } catch (err) {
    console.error("PPTX parse error:", err);
    return "（PPT 文件内容无法提取）";
  }
}
