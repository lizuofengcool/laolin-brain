import { describe, it, expect, beforeEach } from 'vitest';
import { clearRateLimits, rateLimit } from '@/lib/rate-limit';

describe('clearRateLimits', () => {
  beforeEach(() => {
    clearRateLimits();
  });

  it('does not throw when called without arguments', () => {
    expect(() => clearRateLimits()).not.toThrow();
  });

  it('does not throw when called with non-existent identifier', () => {
    expect(() => clearRateLimits('non-existent-id')).not.toThrow();
  });

  it('does not throw when called multiple times', () => {
    expect(() => {
      clearRateLimits();
      clearRateLimits('test');
      clearRateLimits();
    }).not.toThrow();
  });

  it('returns success: true for a fresh identifier after clearing', () => {
    const result = rateLimit('fresh-id-after-clear', '/api/test');
    expect(result.success).toBe(true);
  });

  it('rate limiting eventually activates for rapid requests', () => {
    clearRateLimits();
    let foundLimited = false;
    for (let i = 0; i < 500; i++) {
      const result = rateLimit('10.0.0.99', '/api/test');
      if (!result.success) {
        foundLimited = true;
        break;
      }
    }
    expect(foundLimited).toBe(true);
  });
});
