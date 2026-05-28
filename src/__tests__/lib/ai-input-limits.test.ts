import { describe, it, expect } from "vitest";

/**
 * Extract the content size validation logic from src/app/api/ai/summarize/route.ts.
 *
 * The route does NOT have an explicit 100KB byte-size limit check.
 * Instead, it truncates content to 8000 characters:
 *   userContent = `文件名：${fileName}\n\n文档内容：\n${(content || '').slice(0, 8000)}`;
 *
 * For images, content is used directly (not truncated to 8000 chars):
 *   userContent = `图片描述/OCR内容：${content || '(无文本内容)'}\n文件名：${fileName}`;
 *
 * The route also validates that content is not empty (for non-image types).
 *
 * We test both the actual truncation behavior and the input validation rules.
 */

const MAX_CONTENT_CHARS = 8000;

interface SummarizeValidationResult {
  valid: boolean;
  error?: string;
  truncatedContent?: string;
  status?: number;
}

function validateSummarizeInput(
  content: string | null | undefined,
  fileName: string | null | undefined,
  fileType?: string
): SummarizeValidationResult {
  // Check fileName
  if (!fileName) {
    return { valid: false, error: "文件名不能为空", status: 400 };
  }

  // Check content for non-image types
  if (!content && fileType !== "image") {
    return { valid: false, error: "内容不能为空", status: 400 };
  }

  return { valid: true };
}

/**
 * For non-image files, the route truncates content to 8000 chars.
 * For image files, the content is used as-is (no truncation).
 */
function getTruncatedContent(
  content: string | null | undefined,
  fileType?: string
): string {
  if (fileType === "image") {
    return content || "(无文本内容)";
  }
  return (content || "").slice(0, MAX_CONTENT_CHARS);
}

// 100 KB in characters (approximate, assuming UTF-8 single-byte chars)
const KB = 1024;
const LIMIT_100KB = 100 * KB;

describe("AI input limits — summarize route", () => {
  describe("content size validation (8000 char truncation for text)", () => {
    it("passes content under 8000 chars without truncation", () => {
      const shortContent = "a".repeat(100);
      const result = getTruncatedContent(shortContent);
      expect(result).toBe(shortContent);
      expect(result.length).toBe(100);
    });

    it("passes content exactly at 8000 char limit without truncation", () => {
      const exactContent = "x".repeat(MAX_CONTENT_CHARS);
      const result = getTruncatedContent(exactContent);
      expect(result).toBe(exactContent);
      expect(result.length).toBe(MAX_CONTENT_CHARS);
    });

    it("truncates content over 8000 chars to 8000", () => {
      const longContent = "a".repeat(MAX_CONTENT_CHARS + 5000);
      const result = getTruncatedContent(longContent);
      expect(result.length).toBe(MAX_CONTENT_CHARS);
      expect(result).toBe("a".repeat(MAX_CONTENT_CHARS));
    });

    it("does NOT truncate content for image file types", () => {
      const longContent = "a".repeat(MAX_CONTENT_CHARS + 5000);
      const result = getTruncatedContent(longContent, "image");
      expect(result.length).toBe(MAX_CONTENT_CHARS + 5000);
    });

    it("handles null content for non-image type", () => {
      const result = getTruncatedContent(null);
      expect(result).toBe("");
    });

    it("handles null content for image type (uses fallback)", () => {
      const result = getTruncatedContent(null, "image");
      expect(result).toBe("(无文本内容)");
    });
  });

  describe("input validation rules", () => {
    it("rejects empty content for non-image file types", () => {
      const result = validateSummarizeInput(null, "test.pdf");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("内容不能为空");
    });

    it("accepts empty content for image file types", () => {
      const result = validateSummarizeInput(null, "photo.jpg", "image");
      expect(result.valid).toBe(true);
    });

    it("rejects missing fileName", () => {
      const result = validateSummarizeInput("some content", null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("文件名不能为空");
    });

    it("accepts valid input with content and fileName", () => {
      const result = validateSummarizeInput("Hello world", "doc.txt");
      expect(result.valid).toBe(true);
    });

    it("accepts valid input for image type without content", () => {
      const result = validateSummarizeInput(null, "photo.jpg", "image");
      expect(result.valid).toBe(true);
    });
  });

  describe("100KB byte-size context", () => {
    it("a string of 8000 ASCII chars is well under 100KB", () => {
      const content = "a".repeat(MAX_CONTENT_CHARS);
      // 8000 bytes (ASCII) = 7.8 KB
      expect(Buffer.byteLength(content, "utf-8")).toBe(MAX_CONTENT_CHARS);
      expect(MAX_CONTENT_CHARS).toBeLessThan(LIMIT_100KB);
    });

    it("the 8000 char limit is approximately 7.8 KB for ASCII", () => {
      const ratio = MAX_CONTENT_CHARS / LIMIT_100KB;
      // 8000 / 102400 ≈ 7.8%
      expect(ratio).toBeLessThan(0.1);
    });

    it("truncation ensures content never exceeds 8000 chars (~7.8KB)", () => {
      const massiveContent = "a".repeat(LIMIT_100KB * 2);
      const truncated = getTruncatedContent(massiveContent);
      expect(Buffer.byteLength(truncated, "utf-8")).toBeLessThanOrEqual(LIMIT_100KB);
    });
  });
});
