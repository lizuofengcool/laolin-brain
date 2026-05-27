import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '@/lib/math-utils';

describe('cosineSimilarity (shared math-utils)', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 1.0 for same-direction vectors (scaled)', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity([1, 0, 0], [10, 0, 0])).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
    expect(cosineSimilarity([0, 1, 0], [0, 0, 1])).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0.0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0.0 for different-length vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });

  it('returns 0.0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('returns value between -1 and 1 for random vectors', () => {
    const a = [0.3, -0.7, 0.5, 0.1];
    const b = [0.8, 0.2, -0.3, 0.6];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('handles single-element vectors', () => {
    expect(cosineSimilarity([5], [5])).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity([3], [-3])).toBeCloseTo(-1.0, 5);
    expect(cosineSimilarity([0], [1])).toBe(0);
  });

  it('handles high-dimensional vectors', () => {
    const a = Array.from({ length: 64 }, () => Math.random());
    const b = Array.from({ length: 64 }, () => Math.random());
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('handles negative values correctly', () => {
    const a = [-1, -2, -3];
    const b = [-2, -4, -6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('is symmetric: sim(a,b) === sim(b,a)', () => {
    const a = [0.5, 0.3, -0.8];
    const b = [-0.2, 0.7, 0.4];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});
