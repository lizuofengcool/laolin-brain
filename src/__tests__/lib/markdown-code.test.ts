import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown - code blocks", () => {
  it("fenced code block without language", () => {
    expect(renderMarkdown("```\nconst x = 1;\n```")).toBe(
      '<pre class="markdown-code-block"><code>const x = 1;</code></pre>'
    );
  });
  it("fenced code block with language tag", () => {
    expect(renderMarkdown("```javascript\nconst x = 1;\n```")).toBe(
      '<pre class="markdown-code-block"><code class="language-javascript">const x = 1;</code></pre>'
    );
  });
  it("escapes HTML inside code blocks", () => {
    expect(renderMarkdown("```\n<div>Hello</div>\n```")).toBe(
      '<pre class="markdown-code-block"><code>&lt;div&gt;Hello&lt;/div&gt;</code></pre>'
    );
  });
  it("handles multi-line code blocks", () => {
    expect(renderMarkdown("```python\ndef foo():\n    return 42\n```")).toBe(
      '<pre class="markdown-code-block"><code class="language-python">def foo():\n    return 42</code></pre>'
    );
  });
  it("handles code block with empty content", () => {
    expect(renderMarkdown("```\n```")).toBe(
      '<pre class="markdown-code-block"><code></code></pre>'
    );
  });
});

describe("renderMarkdown - links", () => {
  it("renders links with target=_blank and rel=noopener noreferrer", () => {
    expect(renderMarkdown("[Example](https://example.com)")).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer" class="markdown-link">Example</a></p>'
    );
  });
  it("handles links in headers", () => {
    expect(renderMarkdown("# [Link](https://example.com)")).toBe(
      '<h1><a href="https://example.com" target="_blank" rel="noopener noreferrer" class="markdown-link">Link</a></h1>'
    );
  });
});

describe("renderMarkdown - images", () => {
  it("renders images with alt and src", () => {
    expect(renderMarkdown("![Alt text](https://example.com/image.png)")).toBe(
      '<p><img src="https://example.com/image.png" alt="Alt text" class="markdown-image" /></p>'
    );
  });
  it("handles images with empty alt text", () => {
    expect(renderMarkdown("![](https://example.com/image.png)")).toBe(
      '<p><img src="https://example.com/image.png" alt="" class="markdown-image" /></p>'
    );
  });
  it("handles images inside paragraphs with other text", () => {
    const result = renderMarkdown("See ![logo](logo.png) here");
    expect(result).toContain('<img src="logo.png" alt="logo" class="markdown-image" />');
    expect(result).toContain("See");
    expect(result).toContain("here");
  });
});
