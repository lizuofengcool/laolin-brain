import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock z-ai-web-dev-sdk
vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: vi.fn().mockResolvedValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: '[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, -0.1, -0.2, -0.3, -0.4, -0.5, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99, -0.11, -0.22, -0.33, -0.44, -0.55, 0.12, 0.23, 0.34, 0.45, 0.56, 0.67, 0.78, 0.89, -0.12, -0.23, 0.13, 0.24, 0.35, 0.46, 0.57, 0.68, 0.79, -0.13, -0.24, 0.14, 0.25, 0.36, 0.47, 0.58, 0.69, -0.14, 0.15, 0.26, 0.37, 0.48, 0.59, 0.7, -0.15, 0.16, 0.27, 0.38]',
                },
              },
            ],
          }),
        },
      },
    }),
  },
}));

// Import after mocking
import {
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  createFileEmbeddingText,
  generateEmbedding,
  clearEmbeddingCache,
  batchGenerateEmbeddings,
} from '@/lib/ai/embeddings';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0, 0, 0.5, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 4);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 4);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 4);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('returns 0 for vectors of different lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('handles null/undefined vectors', () => {
    expect(cosineSimilarity(null as unknown as number[], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], undefined as unknown as number[])).toBe(0);
  });

  it('computes similarity for typical text embeddings', () => {
    const a = [0.5, 0.5, 0.5, 0.5];
    const b = [0.3, 0.7, 0.3, 0.7];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it('correctly ranks similar vectors above dissimilar ones', () => {
    const query = [1, 0, 0, 0];
    const similar = [0.99, 0.1, 0, 0];
    const dissimilar = [0, 0, 1, 0];

    const simScore = cosineSimilarity(query, similar);
    const dissimScore = cosineSimilarity(query, dissimilar);

    expect(simScore).toBeGreaterThan(dissimScore);
  });
});

describe('serializeEmbedding & deserializeEmbedding', () => {
  it('round-trips an embedding correctly', () => {
    const original = [0.1, -0.2, 0.3, 0.4, -0.5, 0.6];
    const serialized = serializeEmbedding(original);
    const deserialized = deserializeEmbedding(serialized);
    expect(deserialized).toEqual(original);
  });

  it('handles empty array', () => {
    expect(deserializeEmbedding('[]')).toEqual([]);
  });

  it('handles invalid JSON gracefully', () => {
    const result = deserializeEmbedding('not valid json');
    // Should return a zero vector of 64 dimensions
    expect(result).toHaveLength(64);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('handles non-array JSON', () => {
    const result = deserializeEmbedding('{"key": "value"}');
    expect(result).toHaveLength(64);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('filters non-number values in deserialization', () => {
    const serialized = JSON.stringify([1, 'string', null, 3]);
    const deserialized = deserializeEmbedding(serialized);
    expect(deserialized).toEqual([1, 0, 0, 3]);
  });
});

describe('createFileEmbeddingText', () => {
  it('creates embedding text from file data', () => {
    const text = createFileEmbeddingText({
      fileName: 'test.pdf',
      fileType: 'pdf',
      textContent: 'Hello world',
      tags: ['important', 'report'],
      summary: 'A test report',
    });

    expect(text).toContain('test.pdf');
    expect(text).toContain('pdf');
    expect(text).toContain('Hello world');
    expect(text).toContain('important');
    expect(text).toContain('report');
    expect(text).toContain('A test report');
  });

  it('handles missing optional fields', () => {
    const text = createFileEmbeddingText({
      fileName: 'image.png',
    });

    expect(text).toContain('image.png');
    expect(text).not.toContain('类型:');
  });

  it('truncates long text content', () => {
    const longContent = 'a'.repeat(5000);
    const text = createFileEmbeddingText({
      fileName: 'test.txt',
      textContent: longContent,
    });

    expect(text.length).toBeLessThan(6000);
  });

  it('works with empty tags array', () => {
    const text = createFileEmbeddingText({
      fileName: 'test.pdf',
      tags: [],
    });

    expect(text).toContain('test.pdf');
    expect(text).not.toContain('标签:');
  });
});

describe('generateEmbedding', () => {
  beforeEach(() => {
    clearEmbeddingCache();
  });

  it('generates an embedding for text', async () => {
    const embedding = await generateEmbedding('hello world');
    expect(embedding).toHaveLength(64);
    expect(embedding.every((v) => typeof v === 'number' && isFinite(v))).toBe(true);
  });

  it('returns zero vector for empty text', async () => {
    const embedding = await generateEmbedding('');
    expect(embedding).toHaveLength(64);
    expect(embedding.every((v) => v === 0)).toBe(true);
  });

  it('returns zero vector for whitespace-only text', async () => {
    const embedding = await generateEmbedding('   ');
    expect(embedding).toHaveLength(64);
    expect(embedding.every((v) => v === 0)).toBe(true);
  });

  it('caches results', async () => {
    const emb1 = await generateEmbedding('cache test');
    const emb2 = await generateEmbedding('cache test');
    expect(emb1).toBe(emb2); // Same reference from cache
  });

  it('caches case-insensitively', async () => {
    const emb1 = await generateEmbedding('Cache Test');
    const emb2 = await generateEmbedding('cache test');
    expect(emb1).toBe(emb2);
  });
});

describe('batchGenerateEmbeddings', () => {
  beforeEach(() => {
    clearEmbeddingCache();
  });

  it('generates embeddings for multiple texts', async () => {
    const results = await batchGenerateEmbeddings(['hello', 'world']);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveLength(64);
    expect(results[1]).toHaveLength(64);
  });

  it('respects concurrency limit', async () => {
    // This test mainly verifies the function doesn't error
    const texts = Array.from({ length: 5 }, (_, i) => `text ${i}`);
    const results = await batchGenerateEmbeddings(texts, 2);
    expect(results).toHaveLength(5);
  });

  it('handles empty array', async () => {
    const results = await batchGenerateEmbeddings([]);
    expect(results).toHaveLength(0);
  });
});

describe('similarity ranking', () => {
  it('ranks results correctly by similarity', () => {
    const query = [1, 0, 0, 0];
    const candidates = [
      { id: 'a', vector: [0.9, 0.1, 0, 0] },
      { id: 'b', vector: [0.3, 0.7, 0, 0] },
      { id: 'c', vector: [0.95, 0.05, 0, 0] },
    ];

    const scored = candidates
      .map((c) => ({ ...c, score: cosineSimilarity(query, c.vector) }))
      .sort((a, b) => b.score - a.score);

    expect(scored[0].id).toBe('c');
    expect(scored[1].id).toBe('a');
    expect(scored[2].id).toBe('b');
  });

  it('filters results below similarity threshold', () => {
    const query = [1, 0, 0, 0];
    const results = [
      { vector: [0.1, 0.9, 0, 0] },
      { vector: [0.05, 0.95, 0, 0] },
      { vector: [0.99, 0.01, 0, 0] },
    ];

    const threshold = 0.5;
    const filtered = results
      .map((r) => ({ ...r, score: cosineSimilarity(query, r.vector) }))
      .filter((r) => r.score >= threshold);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].score).toBeCloseTo(0.99, 1);
  });
});
