export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const result = await pdfParse(buffer);
    return result.text || "";
  } catch (e) {
    console.error("PDF parse error:", e);
    return "";
  }
}
