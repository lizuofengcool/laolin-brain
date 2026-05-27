import { describe, it, expect } from 'vitest';
import { sanitizeUserHtml, sanitizeMarkdownHtml, stripHtml } from '@/lib/sanitize';

describe('sanitize', () => {
  describe('sanitizeUserHtml', () => {
    it('should allow safe HTML tags', () => {
      const input = '<h1>Title</h1><p>Hello <strong>world</strong></p>';
      const result = sanitizeUserHtml(input);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>world</strong>');
    });

    it('should remove script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeUserHtml(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should remove onclick event handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      const result = sanitizeUserHtml(input);
      expect(result).not.toContain('onclick');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="https://evil.com"></iframe>';
      const result = sanitizeUserHtml(input);
      expect(result).not.toContain('<iframe');
    });

    it('should handle empty input', () => {
      expect(sanitizeUserHtml('')).toBe('');
      expect(sanitizeUserHtml(null as any)).toBe('');
      expect(sanitizeUserHtml(undefined as any)).toBe('');
    });

    it('should add target and rel to links', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeUserHtml(input);
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Evil</a>';
      const result = sanitizeUserHtml(input);
      expect(result).not.toContain('javascript:');
    });
  });

  describe('sanitizeMarkdownHtml', () => {
    it('should preserve code blocks', () => {
      const input = '<pre class="markdown-code-block"><code>console.log("hello")</code></pre>';
      const result = sanitizeMarkdownHtml(input);
      expect(result).toContain('console.log');
      expect(result).toContain('code');
    });

    it('should preserve tables', () => {
      const input = '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Test</td></tr></tbody></table>';
      const result = sanitizeMarkdownHtml(input);
      expect(result).toContain('Name');
      expect(result).toContain('Test');
    });

    it('should allow input tags for task lists', () => {
      const input = '<input type="checkbox" checked disabled />';
      const result = sanitizeMarkdownHtml(input);
      expect(result).toContain('<input');
    });

    it('should still block script tags in markdown', () => {
      const input = '<pre><code>hello</code></pre><script>alert(1)</script>';
      const result = sanitizeMarkdownHtml(input);
      expect(result).toContain('<pre>');
      expect(result).not.toContain('<script>');
    });
  });

  describe('stripHtml', () => {
    it('should remove all HTML tags and return plain text', () => {
      const input = '<h1>Title</h1><p>Hello <strong>world</strong></p>';
      const result = stripHtml(input);
      expect(result).toBe('TitleHello world');
    });

    it('should handle complex HTML', () => {
      const input = '<div class="test"><a href="url">Link</a><br/>Text</div>';
      const result = stripHtml(input);
      expect(result).toContain('Link');
      expect(result).toContain('Text');
      expect(result).not.toContain('<');
    });
  });
});
