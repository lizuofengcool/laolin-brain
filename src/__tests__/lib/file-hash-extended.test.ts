import { describe, it, expect } from 'vitest';
import { computeFileHash, findDuplicateByHash, checkDuplicateOnUpload } from '@/lib/file-hash';

describe('computeFileHash (extended)', () => {
  it('returns a 64-character hex string', async () => {
    const file = new File(['test data'], 'test.txt', { type: 'text/plain' });
    const hash = await computeFileHash(file);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same content always produces same hash', async () => {
    const content = 'deterministic content for hashing';
    const hash1 = await computeFileHash(new File([content], 'a.txt'));
    const hash2 = await computeFileHash(new File([content], 'b.txt'));
    const hash3 = await computeFileHash(new File([content], 'c.txt'));
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('differs for different files', async () => {
    const file1 = new File(['alpha'], 'alpha.txt');
    const file2 = new File(['bravo'], 'bravo.txt');
    const file3 = new File(['charlie'], 'charlie.txt');
    const hash1 = await computeFileHash(file1);
    const hash2 = await computeFileHash(file2);
    const hash3 = await computeFileHash(file3);
    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
  });
});

describe('findDuplicateByHash (extended)', () => {
  const existingFiles = [
    { id: '1', fileName: 'doc.pdf', fileHash: 'hashaaa' },
    { id: '2', fileName: 'photo.jpg', fileHash: 'hashbbb' },
    { id: '3', fileName: 'nohash.txt', fileHash: undefined },
    { id: '4', fileName: 'empty.txt' },
  ];

  it('returns matching file when hash exists', () => {
    const result = findDuplicateByHash('hashaaa', existingFiles);
    expect(result).toEqual({ id: '1', fileName: 'doc.pdf' });
  });

  it('returns null when no match', () => {
    const result = findDuplicateByHash('nonexistent', existingFiles);
    expect(result).toBeNull();
  });

  it('returns null when fileHash is undefined in input', () => {
    const result = findDuplicateByHash(undefined as unknown as string, existingFiles);
    expect(result).toBeNull();
  });

  it('returns null for empty files array', () => {
    const result = findDuplicateByHash('hashaaa', []);
    expect(result).toBeNull();
  });

  it('skips entries with undefined fileHash', () => {
    // 'hashbbb' exists but ensure files without fileHash are skipped
    const result = findDuplicateByHash('hashbbb', existingFiles);
    expect(result).toEqual({ id: '2', fileName: 'photo.jpg' });
  });
});

describe('checkDuplicateOnUpload (extended)', () => {
  it('integration: computes hash and detects duplicate', async () => {
    // Create two files with the same content
    const content = 'duplicate content here';
    const file1 = new File([content], 'original.txt');
    const file2 = new File([content], 'copy.txt');

    const hash1 = await computeFileHash(file1);
    const existingFiles = [
      { id: 'existing-1', fileName: 'original.txt', fileHash: hash1 },
    ];

    const result = await checkDuplicateOnUpload(file2, existingFiles);
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateFile).toEqual({ id: 'existing-1', fileName: 'original.txt' });
    expect(result.hash).toBe(hash1);
    expect(result.hash).toHaveLength(64);
  });

  it('integration: returns isDuplicate=false for new file', async () => {
    const file = new File(['brand new unique data'], 'new.txt');
    const existingFiles = [
      { id: '1', fileName: 'other.txt', fileHash: 'somehash' },
    ];

    const result = await checkDuplicateOnUpload(file, existingFiles);
    expect(result.isDuplicate).toBe(false);
    expect(result.duplicateFile).toBeUndefined();
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('integration: handles empty existing files list', async () => {
    const file = new File(['solo file'], 'solo.txt');
    const result = await checkDuplicateOnUpload(file, []);
    expect(result.isDuplicate).toBe(false);
    expect(result.duplicateFile).toBeUndefined();
    expect(result.hash).toHaveLength(64);
  });
});
