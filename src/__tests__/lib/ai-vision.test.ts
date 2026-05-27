import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('z-ai-web-dev-sdk', () => ({
  default: { create: mockCreate },
  __esModule: true,
}));

describe('AI Vision', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('describeImage', () => {
    it('returns description on success', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '室内,办公桌,笔记本电脑,文档' } }],
            }),
          },
        },
      });

      const { describeImage } = await import('@/lib/ai/vision');
      const result = await describeImage('base64data');
      expect(result).toBe('室内,办公桌,笔记本电脑,文档');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('returns "" when AI returns empty content', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '' } }],
            }),
          },
        },
      });

      const { describeImage } = await import('@/lib/ai/vision');
      const result = await describeImage('base64data');
      expect(result).toBe('');
    });

    it('returns "" on error', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));

      const { describeImage } = await import('@/lib/ai/vision');
      const result = await describeImage('base64data');
      expect(result).toBe('');
    });

    it('sends image base64 in the request', async () => {
      const mockCompletionCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'description' } }],
      });
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: mockCompletionCreate,
          },
        },
      });

      const { describeImage } = await import('@/lib/ai/vision');
      await describeImage('abc123');

      expect(mockCompletionCreate).toHaveBeenCalledTimes(1);
      const args = mockCompletionCreate.mock.calls[0][0];
      expect(args.messages).toHaveLength(2);
      const userMsg = JSON.stringify(args.messages[1].content);
      expect(userMsg).toContain('abc123');
    });
  });

  describe('extractTextFromImage', () => {
    it('returns text on success', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Extracted text content' } }],
            }),
          },
        },
      });

      const { extractTextFromImage } = await import('@/lib/ai/vision');
      const result = await extractTextFromImage('base64data');
      expect(result).toBe('Extracted text content');
    });

    it('returns "" when AI returns empty content', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: '' } }],
            }),
          },
        },
      });

      const { extractTextFromImage } = await import('@/lib/ai/vision');
      const result = await extractTextFromImage('base64data');
      expect(result).toBe('');
    });

    it('returns "" on error', async () => {
      mockCreate.mockRejectedValue(new Error('OCR failed'));

      const { extractTextFromImage } = await import('@/lib/ai/vision');
      const result = await extractTextFromImage('base64data');
      expect(result).toBe('');
    });

    it('sends correct system prompt for OCR', async () => {
      const mockCompletionCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'hello' } }],
      });
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: mockCompletionCreate,
          },
        },
      });

      const { extractTextFromImage } = await import('@/lib/ai/vision');
      await extractTextFromImage('base64data');

      const args = mockCompletionCreate.mock.calls[0][0];
      expect(args.messages[0].content).toContain('OCR');
    });
  });

  describe('askAboutDocument', () => {
    it('returns answer on success', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'The document discusses...' } }],
            }),
          },
        },
      });

      const { askAboutDocument } = await import('@/lib/ai/vision');
      const result = await askAboutDocument('document text', 'What is this about?');
      expect(result).toBe('The document discusses...');
    });

    it('returns fallback on error', async () => {
      mockCreate.mockRejectedValue(new Error('Service unavailable'));

      const { askAboutDocument } = await import('@/lib/ai/vision');
      const result = await askAboutDocument('text', 'question?');
      expect(result).toBe('AI 服务暂时不可用，请稍后再试。');
    });

    it('returns fallback when choices is empty', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [],
            }),
          },
        },
      });

      const { askAboutDocument } = await import('@/lib/ai/vision');
      const result = await askAboutDocument('text', 'question?');
      expect(result).toBe('无法回答此问题。');
    });

    it('passes document content and question in user message', async () => {
      const mockCompletionCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'answer' } }],
      });
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: mockCompletionCreate,
          },
        },
      });

      const { askAboutDocument } = await import('@/lib/ai/vision');
      await askAboutDocument('My document content', 'Summarize this');

      const args = mockCompletionCreate.mock.calls[0][0];
      const userContent = args.messages[1].content;
      expect(userContent).toContain('My document content');
      expect(userContent).toContain('Summarize this');
    });
  });

  describe('askAboutImage', () => {
    it('returns answer on success', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'The image shows...' } }],
            }),
          },
        },
      });

      const { askAboutImage } = await import('@/lib/ai/vision');
      const result = await askAboutImage('base64data', 'What is in the image?');
      expect(result).toBe('The image shows...');
    });

    it('returns fallback on error', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const { askAboutImage } = await import('@/lib/ai/vision');
      const result = await askAboutImage('base64data', 'Describe this');
      expect(result).toBe('AI 服务暂时不可用，请稍后再试。');
    });

    it('returns fallback when choices is empty', async () => {
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [],
            }),
          },
        },
      });

      const { askAboutImage } = await import('@/lib/ai/vision');
      const result = await askAboutImage('base64data', 'question?');
      expect(result).toBe('无法回答此问题。');
    });

    it('sends question and image in user message', async () => {
      const mockCompletionCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'answer' } }],
      });
      mockCreate.mockResolvedValue({
        chat: {
          completions: {
            create: mockCompletionCreate,
          },
        },
      });

      const { askAboutImage } = await import('@/lib/ai/vision');
      await askAboutImage('imgbase64', 'Describe the colors');

      const args = mockCompletionCreate.mock.calls[0][0];
      const userContent = JSON.stringify(args.messages[1].content);
      expect(userContent).toContain('Describe the colors');
      expect(userContent).toContain('imgbase64');
    });
  });
});
