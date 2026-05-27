export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;

    // Wrap in a 30-second timeout to prevent hangs on corrupted files
    const result = await Promise.race([
      pdfParse(buffer),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PDF parse timed out after 30 seconds")), 30_000)
      ),
    ]);
    return result.text || "";
  } catch (_e) {
    console.error("PDF parse error:", _e);
    return "";
  }
}
