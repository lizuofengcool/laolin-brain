import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  formatSize,
  getFileIcon,
  getFileColor,
  FileIconDisplay,
  getFileTypeBadge,
  isDocumentType,
  formatTime,
} from "@/lib/file-utils";
import { FileText, Image as ImageIcon, File, Presentation, FileCode } from "lucide-react";

describe("formatSize (extended)", () => {
  it("returns '0 B' for 0 bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("returns '1 B' for 1 byte", () => {
    expect(formatSize(1)).toBe("1 B");
  });

  it("returns bytes for values under 1024", () => {
    expect(formatSize(999)).toBe("999 B");
  });

  it("returns '1.0 KB' for 1024 bytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
  });

  it("returns '1.5 KB' for 1536 bytes", () => {
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("returns '1023 B' for 1023 bytes", () => {
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("returns '1.0 MB' for 1048576 bytes", () => {
    expect(formatSize(1048576)).toBe("1.0 MB");
  });

  it("returns '1.5 MB' for ~1.5 MB", () => {
    expect(formatSize(1572864)).toBe("1.5 MB");
  });

  it("returns '1.00 GB' for 1 GB", () => {
    expect(formatSize(1073741824)).toBe("1.00 GB");
  });

  it("handles very large numbers in GB", () => {
    // 10 GB
    expect(formatSize(10737418240)).toBe("10.00 GB");
  });
});

describe("getFileIcon (extended)", () => {
  it("returns FileText for 'word'", () => {
    expect(getFileIcon("word")).toBe(FileText);
  });

  it("returns File for 'pdf'", () => {
    expect(getFileIcon("pdf")).toBe(File);
  });

  it("returns ImageIcon for 'image'", () => {
    expect(getFileIcon("image")).toBe(ImageIcon);
  });

  it("returns Presentation for 'pptx'", () => {
    expect(getFileIcon("pptx")).toBe(Presentation);
  });

  it("returns FileCode for 'markdown'", () => {
    expect(getFileIcon("markdown")).toBe(FileCode);
  });

  it("returns FileCode for 'txt'", () => {
    expect(getFileIcon("txt")).toBe(FileCode);
  });

  it("returns File for unknown/other types", () => {
    expect(getFileIcon("video")).toBe(File);
    expect(getFileIcon("audio")).toBe(File);
    expect(getFileIcon("")).toBe(File);
    expect(getFileIcon("zip")).toBe(File);
  });
});

describe("getFileColor (extended)", () => {
  it("returns blue classes for 'word'", () => {
    const color = getFileColor("word");
    expect(color).toContain("text-blue-600");
    expect(color).toContain("dark:text-blue-400");
    expect(color).toContain("bg-blue-50");
    expect(color).toContain("dark:bg-blue-500/15");
  });

  it("returns red classes for 'pdf'", () => {
    const color = getFileColor("pdf");
    expect(color).toContain("text-red-600");
    expect(color).toContain("bg-red-50");
  });

  it("returns green classes for 'image'", () => {
    const color = getFileColor("image");
    expect(color).toContain("text-green-600");
    expect(color).toContain("bg-green-50");
  });

  it("returns orange classes for 'pptx'", () => {
    const color = getFileColor("pptx");
    expect(color).toContain("text-orange-600");
    expect(color).toContain("bg-orange-50");
  });

  it("returns purple classes for 'markdown'", () => {
    const color = getFileColor("markdown");
    expect(color).toContain("text-purple-600");
    expect(color).toContain("bg-purple-50");
  });

  it("returns purple classes for 'txt'", () => {
    const color = getFileColor("txt");
    expect(color).toContain("text-purple-600");
    expect(color).toContain("bg-purple-50");
  });

  it("returns gray classes for unknown types", () => {
    const color = getFileColor("unknown");
    expect(color).toContain("text-gray-600");
    expect(color).toContain("bg-gray-50");
  });
});

describe("FileIconDisplay", () => {
  it("renders a FileText SVG for word type", () => {
    const { container } = render(<FileIconDisplay fileType="word" />);
    // Lucide icons render SVGs with specific aria attributes
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an ImageIcon SVG for image type", () => {
    const { container } = render(<FileIconDisplay fileType="image" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a File SVG for pdf type", () => {
    const { container } = render(<FileIconDisplay fileType="pdf" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a Presentation SVG for pptx type", () => {
    const { container } = render(<FileIconDisplay fileType="pptx" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a FileCode SVG for markdown type", () => {
    const { container } = render(<FileIconDisplay fileType="markdown" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a FileCode SVG for txt type", () => {
    const { container } = render(<FileIconDisplay fileType="txt" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a File SVG for unknown type", () => {
    const { container } = render(<FileIconDisplay fileType="unknown" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("applies className prop", () => {
    const { container } = render(<FileIconDisplay fileType="word" className="w-8 h-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-8", "h-8");
  });
});

describe("getFileTypeBadge", () => {
  it("returns DOCX badge for 'word'", () => {
    expect(getFileTypeBadge("word")).toEqual({
      label: "DOCX",
      color: expect.stringContaining("blue"),
    });
  });

  it("returns PDF badge for 'pdf'", () => {
    expect(getFileTypeBadge("pdf")).toEqual({
      label: "PDF",
      color: expect.stringContaining("red"),
    });
  });

  it("returns IMG badge for 'image'", () => {
    expect(getFileTypeBadge("image")).toEqual({
      label: "IMG",
      color: expect.stringContaining("green"),
    });
  });

  it("returns PPTX badge for 'pptx'", () => {
    expect(getFileTypeBadge("pptx")).toEqual({
      label: "PPTX",
      color: expect.stringContaining("orange"),
    });
  });

  it("returns MD badge for 'markdown'", () => {
    expect(getFileTypeBadge("markdown")).toEqual({
      label: "MD",
      color: expect.stringContaining("purple"),
    });
  });

  it("returns TXT badge for 'txt'", () => {
    expect(getFileTypeBadge("txt")).toEqual({
      label: "TXT",
      color: expect.stringContaining("purple"),
    });
  });

  it("returns FILE badge for unknown types", () => {
    expect(getFileTypeBadge("unknown")).toEqual({
      label: "FILE",
      color: expect.stringContaining("gray"),
    });
  });

  it("badge color includes border class", () => {
    const { color } = getFileTypeBadge("word");
    expect(color).toContain("border-");
  });
});

describe("isDocumentType", () => {
  const documentTypes = ["word", "pdf", "pptx", "markdown", "txt"];
  const nonDocumentTypes = ["image", "video", "audio", "unknown", "", "zip"];

  it.each(documentTypes)("returns true for '%s'", (type) => {
    expect(isDocumentType(type)).toBe(true);
  });

  it.each(nonDocumentTypes)("returns false for '%s'", (type) => {
    expect(isDocumentType(type)).toBe(false);
  });
});

describe("formatTime (extended)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "刚刚" for dates within the last minute', () => {
    const now = new Date();
    expect(formatTime(now)).toBe("刚刚");

    // 30 seconds ago
    const thirtySecAgo = new Date("2025-06-15T11:59:30.000Z");
    expect(formatTime(thirtySecAgo)).toBe("刚刚");
  });

  it('returns "X 分钟前" for minutes 1-59 ago', () => {
    const oneMinAgo = new Date("2025-06-15T11:59:00.000Z");
    expect(formatTime(oneMinAgo)).toBe("1 分钟前");

    const thirtyMinAgo = new Date("2025-06-15T11:30:00.000Z");
    expect(formatTime(thirtyMinAgo)).toBe("30 分钟前");

    const fiftyNineMinAgo = new Date("2025-06-15T11:01:00.000Z");
    expect(formatTime(fiftyNineMinAgo)).toBe("59 分钟前");
  });

  it('returns "X 小时前" for hours 1-23 ago', () => {
    const oneHourAgo = new Date("2025-06-15T11:00:00.000Z");
    expect(formatTime(oneHourAgo)).toBe("1 小时前");

    const fiveHoursAgo = new Date("2025-06-15T07:00:00.000Z");
    expect(formatTime(fiveHoursAgo)).toBe("5 小时前");

    const twentyThreeHoursAgo = new Date("2025-06-14T13:00:00.000Z");
    expect(formatTime(twentyThreeHoursAgo)).toBe("23 小时前");
  });

  it('returns "X 天前" for days 1-6 ago', () => {
    const oneDayAgo = new Date("2025-06-14T12:00:00.000Z");
    expect(formatTime(oneDayAgo)).toBe("1 天前");

    const threeDaysAgo = new Date("2025-06-12T12:00:00.000Z");
    expect(formatTime(threeDaysAgo)).toBe("3 天前");

    const sixDaysAgo = new Date("2025-06-09T12:00:00.000Z");
    expect(formatTime(sixDaysAgo)).toBe("6 天前");
  });

  it("returns formatted date for 7+ days ago", () => {
    const sevenDaysAgo = new Date("2025-06-08T12:00:00.000Z");
    const result = formatTime(sevenDaysAgo);
    expect(result).not.toContain("刚刚");
    expect(result).not.toContain("分钟前");
    expect(result).not.toContain("小时前");
    expect(result).not.toContain("天前");
    // Should be a locale date string
    expect(result).toMatch(/\d{4}/);
  });

  it("handles string date input", () => {
    const fiveMinAgo = "2025-06-15T11:55:00.000Z";
    expect(formatTime(fiveMinAgo)).toBe("5 分钟前");
  });

  it("handles ISO date string without milliseconds", () => {
    const oneHourAgo = "2025-06-15T11:00:00Z";
    expect(formatTime(oneHourAgo)).toBe("1 小时前");
  });
});
