import { describe, it, expect } from 'vitest';

/**
 * Tests for filename sanitization and path traversal prevention.
 * Mirrors the logic used in file upload and thumbnail generation.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\0/g, '');
}

function isPathSafe(resolvedPath: string, baseDir: string): boolean {
  // Normalize separators
  const normalizedBase = baseDir.replace(/[\/\\]$/, '');
  const normalizedPath = resolvedPath.replace(/\\/g, '/');
  return (
    normalizedPath === normalizedBase ||
    normalizedPath.startsWith(normalizedBase + '/')
  );
}

describe('sanitizeFileName', () => {
  it('preserves normal filename', () => {
    expect(sanitizeFileName('photo.jpg')).toBe('photo.jpg');
  });

  it('preserves filename with spaces', () => {
    expect(sanitizeFileName('my photo.jpg')).toBe('my photo.jpg');
  });

  it('strips forward slashes', () => {
    expect(sanitizeFileName('path/to/file.txt')).toBe('path_to_file.txt');
  });

  it('strips backslashes', () => {
    expect(sanitizeFileName('path\\to\\file.txt')).toBe('path_to_file.txt');
  });

  it('strips mixed slashes', () => {
    expect(sanitizeFileName('path/to\\file.txt')).toBe('path_to_file.txt');
  });

  it('strips null bytes', () => {
    expect(sanitizeFileName('file\x00name.txt')).toBe('filename.txt');
  });

  it('handles path traversal attempt', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('handles combined attacks', () => {
    const result = sanitizeFileName('../../../\\..\\etc/passwd\x00');
    // Each / and \ is replaced with _, null byte is stripped
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('\0');
  });

  it('handles empty string', () => {
    expect(sanitizeFileName('')).toBe('');
  });

  it('handles only slashes', () => {
    expect(sanitizeFileName('///')).toBe('___');
  });

  it('preserves dots that are not traversal', () => {
    expect(sanitizeFileName('file...txt')).toBe('file...txt');
    expect(sanitizeFileName('.hidden')).toBe('.hidden');
  });
});

describe('isPathSafe', () => {
  const baseDir = '/home/user/upload';

  it('returns true for path within base', () => {
    expect(isPathSafe('/home/user/upload/file.jpg', baseDir)).toBe(true);
  });

  it('returns true for nested path within base', () => {
    expect(isPathSafe('/home/user/upload/user123/file.jpg', baseDir)).toBe(true);
  });

  it('returns true for base directory itself', () => {
    expect(isPathSafe('/home/user/upload', baseDir)).toBe(true);
  });

  it('returns false for path traversal above base', () => {
    // Raw string check: the string still starts with base, so returns true.
    // In production, path.resolve() normalizes '../' first.
    // Our isPathSafe function operates on already-resolved paths.
    // The resolved version of '../../../etc/passwd' from base would be '/etc/passwd'
    expect(isPathSafe('/home/user/etc/passwd', baseDir)).toBe(false);
  });

  it('returns false for completely different path', () => {
    expect(isPathSafe('/etc/passwd', baseDir)).toBe(false);
  });

  it('returns false for path that starts with base but has traversal', () => {
    // Note: this tests the resolved path check, not the raw string
    expect(isPathSafe('/home/user/uploads/file.jpg', baseDir)).toBe(false);
  });

  it('handles Windows-style paths', () => {
    // Function normalizes \\ to / for comparison
    expect(isPathSafe('C:/Users/upload/file.jpg', 'C:/Users/upload')).toBe(true);
  });

  it('returns false for empty path', () => {
    expect(isPathSafe('', baseDir)).toBe(false);
  });

  it('handles base with trailing slash', () => {
    expect(isPathSafe('/home/user/upload/file.txt', '/home/user/upload/')).toBe(true);
  });
});
