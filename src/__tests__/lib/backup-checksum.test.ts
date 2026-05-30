import { describe, it, expect } from 'vitest';
import { simpleHash, verifyChecksum } from '@/lib/checksum';

// ─── simpleHash ────────────────────────────────────────────────────

describe('simpleHash', () => {
  it('returns a non-empty hex string (64 chars for SHA-256)', () => {
    const result = simpleHash('hello world');
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same input (deterministic)', () => {
    const hash1 = simpleHash('test data');
    const hash2 = simpleHash('test data');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = simpleHash('first input');
    const hash2 = simpleHash('second input');
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty string', () => {
    const result = simpleHash('');
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
  });

  it('handles unicode characters', () => {
    const result = simpleHash('你好世界 🌍');
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
  });

  it('handles large strings', () => {
    const bigStr = 'a'.repeat(10000);
    const result = simpleHash(bigStr);
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
  });

  it('matches the same algorithm used in BackupRestore.tsx (SHA-256)', () => {
    const result = simpleHash('hello');
    expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

// ─── verifyChecksum ────────────────────────────────────────────────

describe('verifyChecksum', () => {
  const testData = { files: [{ id: '1', name: 'test.txt' }], folders: [] };

  it('returns false when no checksum is provided (strict mode)', () => {
    expect(verifyChecksum(testData, undefined)).toBe(false);
    expect(verifyChecksum(testData, '')).toBe(false);
  });

  it('returns true with correct checksum', () => {
    const correctChecksum = simpleHash(JSON.stringify(testData));
    expect(verifyChecksum(testData, correctChecksum)).toBe(true);
  });

  it('returns false with tampered data', () => {
    const originalChecksum = simpleHash(JSON.stringify(testData));
    const tamperedData = { files: [{ id: '1', name: 'HACKED.txt' }], folders: [] };
    expect(verifyChecksum(tamperedData, originalChecksum)).toBe(false);
  });

  it('returns false with wrong checksum string', () => {
    expect(verifyChecksum(testData, 'totally-wrong-checksum')).toBe(false);
  });

  it('returns false with a checksum from different data', () => {
    const otherData = { files: [{ id: '2', name: 'other.txt' }], folders: [] };
    const otherChecksum = simpleHash(JSON.stringify(otherData));
    expect(verifyChecksum(testData, otherChecksum)).toBe(false);
  });

  it('passes with large nested objects and correct checksum', () => {
    const largeData = {
      files: Array.from({ length: 100 }, (_, i) => ({
        id: `file-${i}`,
        fileName: `document-${i}.pdf`,
        tags: `["tag-a", "tag-b-${i}"]`,
      })),
      folders: Array.from({ length: 50 }, (_, i) => ({
        id: `folder-${i}`,
        name: `My Folder ${i}`,
        parentId: i > 0 ? `folder-${i - 1}` : null,
      })),
    };
    const checksum = simpleHash(JSON.stringify(largeData));
    expect(verifyChecksum(largeData, checksum)).toBe(true);
  });

  it('detects single-field tampering in large data', () => {
    const largeData = {
      files: Array.from({ length: 100 }, (_, i) => ({
        id: `file-${i}`,
        fileName: `document-${i}.pdf`,
      })),
      folders: [],
    };
    const checksum = simpleHash(JSON.stringify(largeData));
    // Tamper just one field
    const tampered = { ...largeData };
    (tampered.files[42] as { fileName: string }).fileName = 'MALICIOUS.pdf';
    expect(verifyChecksum(tampered, checksum)).toBe(false);
  });
});
