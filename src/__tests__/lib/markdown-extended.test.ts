import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown - unordered lists", () => {
  it("renders unordered list with - marker", () => {
    expect(renderMarkdown("- item 1\n- item 2\n- item 3")).toBe(
      "<ul><li>item 1</li><li>item 2</li><li>item 3</li></ul>"
    );
  });
  it("renders unordered list with * marker", () => {
    expect(renderMarkdown("* item 1\n* item 2")).toBe(
      "<ul><li>item 1</li><li>item 2</li></ul>"
    );
  });
  it("renders unordered list with + marker", () => {
    expect(renderMarkdown("+ item 1\n+ item 2")).toBe(
      "<ul><li>item 1</li><li>item 2</li></ul>"
    );
  });
  it("handles inline formatting inside list items", () => {
    expect(renderMarkdown("- **bold item**\n- *italic item*")).toBe(
      "<ul><li><strong>bold item</strong></li><li><em>italic item</em></li></ul>"
    );
  });
  it("handles single list item", () => {
    expect(renderMarkdown("- only one item")).toBe("<ul><li>only one item</li></ul>");
  });
});

describe("renderMarkdown - ordered lists", () => {
  it("renders ordered list", () => {
    expect(renderMarkdown("1. first\n2. second\n3. third")).toBe(
      "<ol><li>first</li><li>second</li><li>third</li></ol>"
    );
  });
  it("handles inline formatting in ordered list items", () => {
    expect(renderMarkdown("1. **bold** first")).toBe(
      "<ol><li><strong>bold</strong> first</li></ol>"
    );
  });
  it("handles non-sequential numbering", () => {
    expect(renderMarkdown("5. fifth\n6. sixth")).toBe(
      "<ol><li>fifth</li><li>sixth</li></ol>"
    );
  });
});

describe("renderMarkdown - tables", () => {
  it("renders basic table structure", () => {
    const md = "| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |";
    const result = renderMarkdown(md);
    expect(result).toContain("<table");
    expect(result).toContain("<thead>");
    expect(result).toContain("Header 1");
    expect(result).toContain("Header 2");
    expect(result).toContain("Cell 1");
    expect(result).toContain("Cell 2");
    expect(result).toContain("</table>");
  });

  it("applies text-align style from alignment specifiers", () => {
    // Test that the alignment parsing produces left, center, right styles
    const md = "| A | B |\n|:---:|---:|\n| x | y |";
    const result = renderMarkdown(md);
    expect(result).toContain('align="');
  });

  it("renders table with multiple rows", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const result = renderMarkdown(md);
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
  });
});

describe("renderMarkdown - blockquotes", () => {
  it("renders simple blockquote", () => {
    expect(renderMarkdown("> This is a quote")).toBe(
      "<blockquote><p>This is a quote</p></blockquote>"
    );
  });
  it("renders multi-line blockquote", () => {
    expect(renderMarkdown("> Line 1\n> Line 2")).toBe(
      "<blockquote><p>Line 1<br/>Line 2</p></blockquote>"
    );
  });
  it("renders nested blockquotes", () => {
    const result = renderMarkdown("> Level 1\n>> Level 2");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("Level 1");
    expect(result).toContain("Level 2");
    expect((result.match(/<blockquote>/g) || []).length).toBe(2);
  });
});

describe("renderMarkdown - horizontal rules", () => {
  it("renders hr with ---", () => { expect(renderMarkdown("---")).toBe("<hr />"); });
  it("renders hr with ***", () => { expect(renderMarkdown("***")).toBe("<hr />"); });
  it("renders hr with ___", () => { expect(renderMarkdown("___")).toBe("<hr />"); });
});

describe("renderMarkdown - paragraphs", () => {
  it("wraps plain text in <p> tags", () => {
    expect(renderMarkdown("Hello world")).toBe("<p>Hello world</p>");
  });
  it("joins consecutive lines with <br/>", () => {
    expect(renderMarkdown("Line 1\nLine 2")).toBe("<p>Line 1<br/>Line 2</p>");
  });
  it("separates paragraphs with blank lines", () => {
    const result = renderMarkdown("Paragraph 1\n\nParagraph 2");
    expect(result).toContain("<p>Paragraph 1</p>");
    expect(result).toContain("<p>Paragraph 2</p>");
  });
});
