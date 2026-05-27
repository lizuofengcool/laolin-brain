import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-parse before importing the module
// Use require-style mock since parsePdf uses require()
const mockPdfParse = vi.fn();

vi.mock('pdf-parse', () => {
  // Return a function directly so require('pdf-parse') returns a callable
  return Object.assign(mockPdfParse, { default: mockPdfParse });
});

import { parsePdf } from '@/lib/parser/pdf';

describe('parsePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "" when pdf-parse throws (e.g. DOMMatrix not available)', async () => {
    mockPdfParse.mockImplementation(() => {
      throw new Error('DOMMatrix is not defined');
    });
    const buffer = Buffer.from('fake pdf');
    const result = await parsePdf(buffer);
    expect(result).toBe('');
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

  it('always returns a string for any input', async () => {
    mockPdfParse.mockImplementation(() => {
      throw new Error('Always fails in test env');
    });
    const buffer = Buffer.from('anything');
    const result = await parsePdf(buffer);
    expect(typeof result).toBe('string');
  });
});
