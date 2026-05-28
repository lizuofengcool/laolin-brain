import mammoth from "mammoth";

export async function parseWord(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch {
    return "";
  }
}
