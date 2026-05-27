import { describe, it, expect, vi, beforeEach } from 'vitest';

import { parsePptx } from '@/lib/parser/ppt';

describe('parsePptx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fallback message when no valid PPTX content', async () => {
    const buffer = Buffer.from('fake pptx content');
    const result = await parsePptx(buffer);
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('returns fallback message when buffer is empty', async () => {
    const buffer = Buffer.from('');
    const result = await parsePptx(buffer);
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('does not throw for any input', async () => {
    const buffer = Buffer.from('anything');
    await expect(parsePptx(buffer)).resolves.toBeDefined();
  });

  it('returns string type', async () => {
    const buffer = Buffer.from('fake pptx');
    const result = await parsePptx(buffer);
    expect(typeof result).toBe('string');
  });

  it('handles large input without crashing', async () => {
    const buffer = Buffer.alloc(1024 * 1024, 'A'); // 1MB
    const result = await parsePptx(buffer);
    expect(typeof result).toBe('string');
  });

  it('always returns a string even on error', async () => {
    // Force an error by passing invalid data multiple times
    const promises = [
      parsePptx(Buffer.from('')),
      parsePptx(Buffer.from('corrupt')),
      parsePptx(Buffer.alloc(0)),
    ];
    const results = await Promise.all(promises);
    for (const result of results) {
      expect(typeof result).toBe('string');
    }
  });
});
