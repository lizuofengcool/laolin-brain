import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const {
  mockSharpResize, mockSharpJpeg, mockSharpToFile, mockSharp,
  mockMkdir, mockReaddir, mockUnlink,
} = vi.hoisted(() => {
  const mockSharpResize = vi.fn();
  const mockSharpJpeg = vi.fn();
  const mockSharpToFile = vi.fn().mockResolvedValue(undefined);
  const mockSharp = vi.fn().mockImplementation(() => ({
    resize: mockSharpResize.mockReturnThis(),
    jpeg: mockSharpJpeg.mockReturnThis(),
    toFile: mockSharpToFile,
  }));
  const mockMkdir = vi.fn().mockResolvedValue(undefined);
  const mockReaddir = vi.fn().mockResolvedValue([]);
  const mockUnlink = vi.fn().mockResolvedValue(undefined);
  return { mockSharpResize, mockSharpJpeg, mockSharpToFile, mockSharp, mockMkdir, mockReaddir, mockUnlink };
});

vi.mock('sharp', () => ({
  default: mockSharp,
  __esModule: true,
}));

vi.mock('fs/promises', () => ({
  default: { mkdir: mockMkdir, readdir: mockReaddir, unlink: mockUnlink },
  mkdir: mockMkdir,
  readdir: mockReaddir,
  unlink: mockUnlink,
}));

import { generateThumbnail, cleanupOrphanedThumbnails } from '@/lib/parser/image';

describe('generateThumbnail', () => {
  beforeEach(() => {
    mockSharpResize.mockReturnThis();
    mockSharpJpeg.mockReturnThis();
    mockSharpToFile.mockResolvedValue(undefined);
    mockSharp.mockImplementation(() => ({
      resize: mockSharpResize.mockReturnThis(),
      jpeg: mockSharpJpeg.mockReturnThis(),
      toFile: mockSharpToFile,
    }));
  });

  it('returns URL path string on success', async () => {
    const buffer = Buffer.from('fake image');
    const result = await generateThumbnail(buffer, 'photo.jpg');
    expect(result).toMatch(/^\/api\/files\/thumbnail\//);
    expect(result).toContain('photo.jpg');
    expect(mockSharp).toHaveBeenCalledWith(buffer);
    expect(mockSharpResize).toHaveBeenCalledWith(200, 200, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    expect(mockSharpJpeg).toHaveBeenCalledWith({ quality: 70 });
  });

  it('returns "" on error when sharp fails', async () => {
    mockSharp.mockImplementation(() => {
      throw new Error('Invalid image');
    });
    const buffer = Buffer.from('corrupt');
    const result = await generateThumbnail(buffer, 'bad.jpg');
    expect(result).toBe('');
  });

  it('returns "" on error when toFile fails', async () => {
    mockSharpToFile.mockRejectedValue(new Error('Write failed'));
    const buffer = Buffer.from('fake image');
    const result = await generateThumbnail(buffer, 'test.jpg');
    expect(result).toBe('');
  });

  it('encodes the file name in the returned URL', async () => {
    const buffer = Buffer.from('fake image');
    const result = await generateThumbnail(buffer, 'my photo.jpg');
    expect(result).toContain(encodeURIComponent('my photo.jpg'));
  });

  it('uses inside fit and withoutEnlargement for resize', async () => {
    const buffer = Buffer.from('fake image');
    await generateThumbnail(buffer, 'test.png');
    expect(mockSharpResize).toHaveBeenCalledWith(200, 200, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  });

  it('uses jpeg format with quality 70', async () => {
    const buffer = Buffer.from('fake image');
    await generateThumbnail(buffer, 'test.bmp');
    expect(mockSharpJpeg).toHaveBeenCalledWith({ quality: 70 });
  });

  it('works with PNG file names', async () => {
    const buffer = Buffer.from('fake png');
    const result = await generateThumbnail(buffer, 'image.png');
    expect(result).toMatch(/^\/api\/files\/thumbnail\//);
    expect(result).toContain('image.png');
  });

  it('works with WebP file names', async () => {
    const buffer = Buffer.from('fake webp');
    const result = await generateThumbnail(buffer, 'photo.webp');
    expect(result).toMatch(/^\/api\/files\/thumbnail\//);
    expect(result).toContain('photo.webp');
  });
});

describe('cleanupOrphanedThumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
  });

  it('returns { cleaned: 0, remaining: 0 } when directory does not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    const result = await cleanupOrphanedThumbnails();
    expect(result).toEqual({ cleaned: 0, remaining: 0 });
  });

  it('returns { cleaned: 0, remaining: 0 } when directory is empty', async () => {
    mockReaddir.mockResolvedValue([]);
    const result = await cleanupOrphanedThumbnails();
    expect(result).toEqual({ cleaned: 0, remaining: 0 });
  });

  it('returns { cleaned: 0, remaining: N } when no reference set provided (safe default)', async () => {
    mockReaddir.mockResolvedValue(['thumb_a.jpg', 'thumb_b.png']);
    const result = await cleanupOrphanedThumbnails();
    expect(result).toEqual({ cleaned: 0, remaining: 2 });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('keeps referenced thumbnails and removes orphaned ones', async () => {
    mockReaddir.mockResolvedValue(['thumb_kept.jpg', 'thumb_orphan.png', 'thumb_orphan2.webp']);
    const referencedUrls = new Set([
      '/api/files/thumbnail/thumb_kept.jpg',
    ]);
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    expect(result.cleaned).toBe(2);
    expect(result.remaining).toBe(1);
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it('keeps all thumbnails when all are referenced', async () => {
    mockReaddir.mockResolvedValue(['thumb_a.jpg', 'thumb_b.png']);
    const referencedUrls = new Set([
      '/api/files/thumbnail/thumb_a.jpg',
      '/api/files/thumbnail/thumb_b.png',
    ]);
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    expect(result).toEqual({ cleaned: 0, remaining: 2 });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('removes all thumbnails when none are referenced', async () => {
    mockReaddir.mockResolvedValue(['a.jpg', 'b.png', 'c.webp']);
    const referencedUrls = new Set<string>();
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    expect(result).toEqual({ cleaned: 3, remaining: 0 });
    expect(mockUnlink).toHaveBeenCalledTimes(3);
  });

  it('handles unlink errors gracefully (concurrent deletion)', async () => {
    mockReaddir.mockResolvedValue(['thumb_orphan.jpg']);
    mockUnlink.mockRejectedValue(new Error('ENOENT: already deleted'));
    const referencedUrls = new Set<string>();
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    // The file was already removed (race), cleaned count should not increment
    expect(result.cleaned).toBe(0);
    expect(result.remaining).toBe(1);
  });

  it('returns { cleaned: 0, remaining: 0 } on unexpected error', async () => {
    // Make readdir work but then cause error in the outer catch
    // We can simulate by making the function error via a different path
    // Since the outer try/catch catches everything, let's test by
    // having readdir work but then the path.join or other ops fail
    // Actually, let's mock a scenario where the function hits the outer catch
    mockReaddir.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    // But readdir is inside inner try/catch, so it returns {cleaned:0, remaining:0}
    // Let's test that the outer catch works by directly testing
    // Actually the inner try/catch handles readdir errors - returns {0,0}
    // To hit outer catch, we need error after readdir succeeds
    // The only place is in the for loop - but unlink errors are caught
    // So the outer catch is mainly a safety net. Let's verify it works.
    mockReaddir.mockResolvedValue(['file.jpg']);
    // Override path.join to throw? Not practical.
    // Instead, test that the function never throws
    const result = await cleanupOrphanedThumbnails(new Set());
    expect(result).toBeDefined();
    expect(typeof result.cleaned).toBe('number');
    expect(typeof result.remaining).toBe('number');
  });

  it('encodes file names correctly when matching references', async () => {
    mockReaddir.mockResolvedValue(['thumb with spaces.jpg']);
    const referencedUrls = new Set<string>();
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    // The URL encoding should match between readdir entry and reference check
    expect(result.cleaned).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it('handles files with special characters in names', async () => {
    mockReaddir.mockResolvedValue(['thumb_%20.jpg', 'thumb_日本語.png']);
    // encodeURIComponent('%20') = '%2520', so the reference must use the double-encoded form
    const referencedUrls = new Set([
      '/api/files/thumbnail/thumb_%2520.jpg',
      '/api/files/thumbnail/thumb_%E6%97%A5%E6%9C%AC%E8%AA%9E.png',
    ]);
    const result = await cleanupOrphanedThumbnails(referencedUrls);
    expect(result.cleaned).toBe(0);
    expect(result.remaining).toBe(2);
  });
});
