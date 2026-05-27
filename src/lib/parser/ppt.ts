/**
 * Parse a PPTX file and extract text from each slide.
 * Uses JSZip-free Buffer-based approach to avoid command injection risks
 * from shell commands like `unzip` or `rm -rf`.
 */

/**
 * Minimal ZIP local file header parser to extract files from a ZIP archive (PPTX).
 * PPTX files are ZIP archives containing XML slide files.
 * We scan for Local File Headers (LFH) and extract the content of slide XML files.
 *
 * ZIP Local File Header:
 *   0-3:   Signature (PK\x03\x04)
 *   4-5:   Version needed
 *   6-7:   General purpose bit flag
 *   8-9:   Compression method (0=stored, 8=deflate)
 *   10-13: Last mod file time/date
 *   14-17: CRC-32
 *   18-21: Compressed size
 *   22-25: Uncompressed size
 *   26-27: File name length
 *   28-29: Extra field length
 *   30-..: File name + extra field + data
 */
function extractFileNamesFromZip(buffer: Buffer): Array<{
  name: string;
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}> {
  const files: Array<{
    name: string;
    offset: number;
    compressedSize: number;
    uncompressedSize: number;
    compressionMethod: number;
    dataOffset: number;
  }> = [];

  const lfhSignature = 0x04034b50; // PK\x03\x04
  let pos = 0;

  while (pos < buffer.length - 30) {
    const sig = buffer.readUInt32LE(pos);
    if (sig !== lfhSignature) {
      pos++;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(pos + 8);
    const compressedSize = buffer.readUInt32LE(pos + 18);
    const uncompressedSize = buffer.readUInt32LE(pos + 22);
    const fileNameLength = buffer.readUInt16LE(pos + 26);
    const extraFieldLength = buffer.readUInt16LE(pos + 28);

    const fileName = buffer.toString("utf-8", pos + 30, pos + 30 + fileNameLength);
    const dataOffset = pos + 30 + fileNameLength + extraFieldLength;

    files.push({
      name: fileName,
      offset: pos,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      dataOffset,
    });

    // Move to next entry: skip past data
    if (compressedSize > 0) {
      pos = dataOffset + compressedSize;
    } else {
      pos = dataOffset;
    }
  }

  return files;
}

/**
 * Extract text from PPTX buffer without using shell commands.
 * Parses the ZIP structure to find slide XML files and extracts <a:t> text content.
 */
export async function parsePptx(buffer: Buffer): Promise<string> {
  try {
    const zipEntries = extractFileNamesFromZip(buffer);

    // Find slide XML files and sort by slide number
    const slideFiles = zipEntries
      .filter((e) => e.name.match(/^ppt\/slides\/slide\d+\.xml$/i))
      .sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });

    if (slideFiles.length === 0) {
      return "（PPT 文件内容无法提取）";
    }

    // Dynamic import of zlib for decompression (available in Node.js)
    const { inflateRawSync } = await import("zlib");

    let textContent = "";
    let slideNum = 1;

    for (const entry of slideFiles) {
      try {
        let xmlContent: string;

        if (entry.compressionMethod === 0) {
          // Stored (no compression)
          xmlContent = buffer.toString("utf-8", entry.dataOffset, entry.dataOffset + entry.uncompressedSize);
        } else if (entry.compressionMethod === 8) {
          // Deflate
          const compressedData = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
          const decompressed = inflateRawSync(compressedData);
          xmlContent = decompressed.toString("utf-8");
        } else {
          // Unknown compression method, skip
          continue;
        }

        // Extract text from <a:t> tags (Office Open XML text runs)
        const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g);
        if (textMatches) {
          const slideText = textMatches
            .map((m) => m.replace(/<\/?a:t>/g, ""))
            .join(" ");
          if (slideText.trim()) {
            textContent += `--- 第 ${slideNum} 页 ---\n${slideText.trim()}\n\n`;
          }
        }
      } catch {
        // Skip individual slide errors
      }
      slideNum++;
    }

    return textContent.trim() || "（PPT 文件内容无法提取）";
  } catch (err) {
    console.error("PPTX parse error:", err);
    return "（PPT 文件内容无法提取）";
  }
}
