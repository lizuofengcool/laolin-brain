import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown - basics", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("handles whitespace-only input", () => {
    expect(renderMarkdown("   \n  \n  ").trim()).toBe("");
  });

  it("handles a single empty line", () => {
    expect(renderMarkdown("\n")).toBe("\n");
  });
});

describe("renderMarkdown - headers", () => {
  it("renders h1", () => { expect(renderMarkdown("# Hello")).toBe("<h1>Hello</h1>"); });
  it("renders h2", () => { expect(renderMarkdown("## World")).toBe("<h2>World</h2>"); });
  it("renders h3", () => { expect(renderMarkdown("### Section")).toBe("<h3>Section</h3>"); });
  it("renders h4", () => { expect(renderMarkdown("#### Sub")).toBe("<h4>Sub</h4>"); });
  it("renders h5", () => { expect(renderMarkdown("##### Deep")).toBe("<h5>Deep</h5>"); });
  it("renders h6", () => { expect(renderMarkdown("###### Deepest")).toBe("<h6>Deepest</h6>"); });
  it("applies inline formatting inside headers", () => {
    expect(renderMarkdown("# **Bold** header")).toBe("<h1><strong>Bold</strong> header</h1>");
  });
});

describe("renderMarkdown - inline formatting", () => {
  it("bold with **double asterisks**", () => {
    expect(renderMarkdown("This is **bold** text")).toBe("<p>This is <strong>bold</strong> text</p>");
  });
  it("bold with __double underscores__", () => {
    expect(renderMarkdown("This is __bold__ text")).toBe("<p>This is <strong>bold</strong> text</p>");
  });
  it("italic with *single asterisk*", () => {
    expect(renderMarkdown("This is *italic* text")).toBe("<p>This is <em>italic</em> text</p>");
  });
  it("italic with _single underscore_", () => {
    expect(renderMarkdown("This is _italic_ text")).toBe("<p>This is <em>italic</em> text</p>");
  });
  it("bold+italic with ***triple asterisks***", () => {
    expect(renderMarkdown("***bold and italic***")).toBe("<p><strong><em>bold and italic</em></strong></p>");
  });
  it("bold+italic with ___triple underscores___", () => {
    expect(renderMarkdown("___bold and italic___")).toBe("<p><strong><em>bold and italic</em></strong></p>");
  });
  it("strikethrough with ~~double tildes~~", () => {
    expect(renderMarkdown("This is ~~strikethrough~~ text")).toBe("<p>This is <del>strikethrough</del> text</p>");
  });
  it("inline code with backticks", () => {
    expect(renderMarkdown("Use `console.log()` to debug")).toBe(
      '<p>Use <code class="markdown-inline-code">console.log()</code> to debug</p>'
    );
  });
});
