import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExtractRawText } = vi.hoisted(() => ({
  mockExtractRawText: vi.fn(),
}));

vi.mock('mammoth', () => ({
  default: { extractRawText: mockExtractRawText },
}));

import { parseWord } from '@/lib/parser/word';

describe('parseWord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns extracted text on success', async () => {
    mockExtractRawText.mockResolvedValue({ value: 'Hello World' });
    const buffer = Buffer.from('fake docx');
    const result = await parseWord(buffer);
    expect(result).toBe('Hello World');
    expect(mockExtractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('returns empty string for empty document', async () => {
    mockExtractRawText.mockResolvedValue({ value: '' });
    const buffer = Buffer.from('empty docx');
    const result = await parseWord(buffer);
    expect(result).toBe('');
  });

  it('handles errors gracefully by returning empty string', async () => {
    mockExtractRawText.mockRejectedValue(new Error('File is corrupted'));
    const buffer = Buffer.from('corrupt');
    const result = await parseWord(buffer);
    expect(result).toBe('');
  });

  it('passes the buffer argument to mammoth', async () => {
    const buffer = Buffer.from('test content');
    mockExtractRawText.mockResolvedValue({ value: 'content' });
    await parseWord(buffer);
    expect(mockExtractRawText).toHaveBeenCalledTimes(1);
    expect(mockExtractRawText).toHaveBeenCalledWith({ buffer });
  });
});
