import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn().mockResolvedValue({ stdout: 'done', stderr: '' }),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: vi.fn((_cmd: string, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout: 'done', stderr: '' });
    }),
  };
});

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: () => mockExecAsync,
  };
});

import { parsePptx } from '@/lib/parser/ppt';

describe('parsePptx', () => {
  beforeEach(() => {
    mockExecAsync.mockResolvedValue({ stdout: 'done', stderr: '' });
  });

  it('returns fallback message when no valid PPTX content', async () => {
    // When there's no slides directory (which is the case in test env since we don't mock fs),
    // the function should return the fallback
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

  it('calls execAsync (unzip) during processing', async () => {
    const buffer = Buffer.from('fake pptx');
    await parsePptx(buffer);
    expect(mockExecAsync).toHaveBeenCalled();
  });

  it('handles execAsync failure gracefully', async () => {
    mockExecAsync.mockRejectedValue(new Error('unzip not available'));
    const buffer = Buffer.from('fake pptx');
    const result = await parsePptx(buffer);
    // Should still return a string (either content or fallback)
    expect(typeof result).toBe('string');
  });
});
