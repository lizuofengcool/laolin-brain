import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPdfParse } = vi.hoisted(() => ({
  mockPdfParse: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  default: mockPdfParse,
}));

import { parsePdf } from '@/lib/parser/pdf';

describe('parsePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text on success', async () => {
    mockPdfParse.mockResolvedValue({ text: 'Page 1 content' });
    const buffer = Buffer.from('fake pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('Page 1 content');
    expect(mockPdfParse).toHaveBeenCalledWith(buffer);
  });

  it('returns "" when text is empty', async () => {
    mockPdfParse.mockResolvedValue({ text: '' });
    const buffer = Buffer.from('empty pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('');
  });

  it('returns "" when text is undefined/falsy', async () => {
    mockPdfParse.mockResolvedValue({ text: null });
    const buffer = Buffer.from('no text pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('');
  });

  it('returns "" when parse throws', async () => {
    mockPdfParse.mockRejectedValue(new Error('Invalid PDF'));
    const buffer = Buffer.from('corrupt pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('');
  });

  it('returns "" when module call throws', async () => {
    mockPdfParse.mockImplementation(() => {
      throw new Error('module error');
    });
    const buffer = Buffer.from('broken pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('');
  });
});
