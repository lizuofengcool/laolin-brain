import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSharpResize, mockSharpJpeg, mockSharpToFile, mockSharp } = vi.hoisted(() => {
  const mockSharpResize = vi.fn();
  const mockSharpJpeg = vi.fn();
  const mockSharpToFile = vi.fn().mockResolvedValue(undefined);
  const mockSharp = vi.fn().mockImplementation(() => ({
    resize: mockSharpResize.mockReturnThis(),
    jpeg: mockSharpJpeg.mockReturnThis(),
    toFile: mockSharpToFile,
  }));
  return { mockSharpResize, mockSharpJpeg, mockSharpToFile, mockSharp };
});

vi.mock('sharp', () => ({
  default: mockSharp,
  __esModule: true,
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: actual,
    mkdir: (...args: Parameters<typeof actual.mkdir>) => Promise.resolve(undefined),
    writeFile: (...args: Parameters<typeof actual.writeFile>) => Promise.resolve(undefined),
  };
});

import { generateThumbnail } from '@/lib/parser/image';

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
});
