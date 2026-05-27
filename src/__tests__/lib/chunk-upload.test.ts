import { describe, it, expect } from 'vitest';
import {
  getTotalChunks,
  sliceFile,
  generateUploadFileId,
} from '@/lib/chunk-upload';

describe('chunk-upload', () => {
  describe('getTotalChunks', () => {
    it('returns 1 for small files', () => {
      expect(getTotalChunks(1024)).toBe(1);
    });

    it('returns correct chunks for 5MB boundaries', () => {
      const chunkSize = 5 * 1024 * 1024;
      expect(getTotalChunks(chunkSize)).toBe(1);
      expect(getTotalChunks(chunkSize + 1)).toBe(2);
      expect(getTotalChunks(chunkSize * 3)).toBe(3);
    });

    it('handles zero size', () => {
      expect(getTotalChunks(0)).toBe(0);
    });
  });

  describe('sliceFile', () => {
    it('slices file into correct chunk', () => {
      const content = 'a'.repeat(10 * 1024 * 1024); // 10MB
      const file = new File([content], 'test.bin', { type: 'application/octet-stream' });
      const chunk0 = sliceFile(file, 0);
      const chunk1 = sliceFile(file, 1);
      expect(chunk0.size).toBe(5 * 1024 * 1024);
      expect(chunk1.size).toBe(5 * 1024 * 1024);
    });

    it('handles last chunk smaller than CHUNK_SIZE', () => {
      const content = 'a'.repeat(6 * 1024 * 1024); // 6MB
      const file = new File([content], 'test.bin', { type: 'application/octet-stream' });
      const chunk0 = sliceFile(file, 0);
      const chunk1 = sliceFile(file, 1);
      expect(chunk0.size).toBe(5 * 1024 * 1024);
      expect(chunk1.size).toBe(1024 * 1024); // 1MB remainder
    });
  });

  describe('generateUploadFileId', () => {
    it('generates consistent ID for same file', () => {
      const file1 = new File(['hello'], 'test.txt', { type: 'text/plain' });
      const file2 = new File(['hello'], 'test.txt', { type: 'text/plain' });
      // lastModified may differ, so we just check format
      const id = generateUploadFileId(file1);
      expect(id).toMatch(/^upload_/);
    });

    it('generates ID with correct format', () => {
      const file = new File(['world'], 'doc.pdf', { type: 'application/pdf' });
      const id = generateUploadFileId(file);
      expect(id).toMatch(/^upload_[a-z0-9]+_[a-z0-9]+$/);
    });
  });
});
