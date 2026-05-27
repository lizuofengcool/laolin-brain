export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text || "";
  } catch (_e) {
    console.error("PDF parse error:", _e);
    return "";
  }
}
