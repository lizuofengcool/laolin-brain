import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown - HTML escaping", () => {
  it("escapes HTML inside code blocks", () => {
    const md = '```\n<span class="x">\n```';
    expect(renderMarkdown(md)).toBe(
      '<pre class="markdown-code-block"><code>&lt;span class=&quot;x&quot;&gt;</code></pre>'
    );
  });
});

describe("renderMarkdown - complex documents", () => {
  it("handles combined markdown document", () => {
    const md = [
      "# Title", "", "**bold**", "", "- item", "", "```js", "code", "```", "", "---", "", "[link](https://example.com)",
    ].join("\n");
    const result = renderMarkdown(md);
    expect(result).toContain("<h1>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<pre");
    expect(result).toContain("<hr");
    expect(result).toContain('target="_blank"');
  });
});

describe("renderMarkdown - edge cases", () => {
  it("handles unclosed bold tags gracefully", () => {
    const result = renderMarkdown("This is **not closed");
    expect(result).toContain("**not closed");
  });
  it("handles multiple blank lines", () => {
    const result = renderMarkdown("Hello\n\n\nWorld");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });
  it("handles special characters in text", () => {
    expect(renderMarkdown("Price: $100 (30% off)")).toBe("<p>Price: $100 (30% off)</p>");
  });
  it("handles text that looks like a header but has no space", () => {
    const result = renderMarkdown("#NoSpace");
    expect(result).not.toContain("<h1>");
    expect(result).toContain("<p>");
  });
  it("handles empty input between code fences", () => {
    expect(renderMarkdown("```\n\n```")).toContain("<code></code>");
  });
});
