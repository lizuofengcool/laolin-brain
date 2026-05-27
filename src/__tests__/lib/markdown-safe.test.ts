import { describe, it, expect } from 'vitest';
import { renderMarkdownSafe, renderMarkdown } from '@/lib/markdown-safe';

describe('markdown-safe', () => {
  it('should render basic markdown safely', () => {
    const result = renderMarkdownSafe('# Hello World\n\nThis is **bold** text.');
    expect(result).toContain('<h1>');
    expect(result).toContain('Hello World');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('should strip script tags from markdown content', () => {
    const md = '# Title\n\n<script>alert("xss")</script>\n\nSome text';
    const result = renderMarkdownSafe(md);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<h1>Title</h1>');
  });

  it('should sanitize javascript: URLs in links', () => {
    const md = '[Click me](javascript:alert(1))';
    const result = renderMarkdownSafe(md);
    expect(result).not.toContain('javascript:');
  });

  it('should handle code blocks correctly', () => {
    const md = '```js\nconsole.log("hello");\n```';
    const result = renderMarkdownSafe(md);
    expect(result).toContain('<pre');
    expect(result).toContain('<code');
    expect(result).toContain('console.log');
  });

  it('should handle empty input', () => {
    expect(renderMarkdownSafe('')).toBe('');
    expect(renderMarkdownSafe(null as any)).toBe('');
  });

  it('should preserve tables', () => {
    const md = '| Header | Other |\n|--------|-------|\n| Cell1 | Cell2 |';
    const result = renderMarkdownSafe(md);
    expect(result).toContain('Header');
    expect(result).toContain('Cell1');
    expect(result).toContain('Other');
    expect(result).toContain('Cell2');
  });

  it('should add security attributes to links', () => {
    const md = '[Example](https://example.com)';
    const result = renderMarkdownSafe(md);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});
