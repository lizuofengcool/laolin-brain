import { describe, it, expect } from 'vitest';

/**
 * Tests for URL sanitization logic used in markdown renderer to prevent XSS.
 * This mirrors the sanitizeUrl function in src/lib/markdown.ts.
 */
function sanitizeUrl(url: string): string {
  if (/^(javascript|data|vbscript):/i.test(url.trim())) return '#';
  return url.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

describe('sanitizeUrl', () => {
  describe('blocks dangerous URL schemes', () => {
    it('blocks javascript: URL', () => {
      expect(sanitizeUrl('javascript:void(0)')).toBe('#');
    });

    it('blocks javascript: with alert', () => {
      expect(sanitizeUrl('javascript:alert(document.cookie)')).toBe('#');
    });

    it('blocks data: URI', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    });

    it('blocks data: URI with base64', () => {
      expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('#');
    });

    it('blocks vbscript: URL', () => {
      expect(sanitizeUrl('vbscript:MsgBox("XSS")')).toBe('#');
    });

    it('blocks JAVASCRIPT: (uppercase)', () => {
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('#');
    });

    it('blocks JavaScript: (mixed case)', () => {
      expect(sanitizeUrl('JavaScript:void(0)')).toBe('#');
    });

    it('blocks javascript: with leading spaces', () => {
      expect(sanitizeUrl('  javascript:alert(1)')).toBe('#');
    });
  });

  describe('allows safe URLs', () => {
    it('allows https: URL', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('allows http: URL', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('allows relative URL', () => {
      expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
    });

    it('allows anchor link', () => {
      expect(sanitizeUrl('#section')).toBe('#section');
    });

    it('allows mailto: URL', () => {
      expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    });

    it('allows tel: URL', () => {
      expect(sanitizeUrl('tel:+1234567890')).toBe('tel:+1234567890');
    });

    it('allows empty URL', () => {
      expect(sanitizeUrl('')).toBe('');
    });
  });

  describe('escapes dangerous characters', () => {
    it('escapes double quotes', () => {
      expect(sanitizeUrl('https://example.com/"onclick')).toBe('https://example.com/&quot;onclick');
    });

    it('escapes angle brackets', () => {
      expect(sanitizeUrl('https://example.com/<script>')).toBe('https://example.com/&lt;script>');
      // Note: only < is explicitly escaped, > is preserved (sanitizeUrl only escapes < and ")
    });

    it('escapes both quotes and brackets', () => {
      expect(sanitizeUrl('https://x.com/"<y>')).toBe('https://x.com/&quot;&lt;y>');
    });
  });

  describe('edge cases', () => {
    it('handles URL with spaces', () => {
      expect(sanitizeUrl('https://example.com/path with spaces')).toBe('https://example.com/path with spaces');
    });

    it('handles URL with query parameters', () => {
      expect(sanitizeUrl('https://example.com?foo=bar&baz=1')).toBe('https://example.com?foo=bar&baz=1');
    });

    it('handles URL with hash fragment', () => {
      expect(sanitizeUrl('https://example.com#section')).toBe('https://example.com#section');
    });

    it('does not block colon in path position', () => {
      expect(sanitizeUrl('https://example.com/time:12:00')).toBe('https://example.com/time:12:00');
    });
  });
});
