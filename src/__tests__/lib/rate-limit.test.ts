import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the rate limit logic by re-implementing the core algorithm
// since middleware.ts uses NextRequest which is hard to mock in vitest

interface RateLimitEntry {
  timestamps: number[];
}

function createLimiter(windowMs: number, maxRequests: number) {
  const store = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  function cleanup(now: number) {
    if (now - lastCleanup < 60_000) return;
    lastCleanup = now;
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 120_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }

  function check(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    cleanup(now);
    const entry = store.get(ip) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);
    const allowed = entry.timestamps.length < maxRequests;
    const remaining = Math.max(0, maxRequests - entry.timestamps.length - (allowed ? 1 : 0));
    if (allowed) entry.timestamps.push(now);
    store.set(ip, entry);
    return { allowed, remaining };
  }

  return { check };
}

describe('API Rate Limiter', () => {
  it('allows requests under limit', () => {
    const limiter = createLimiter(60_000, 5);
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('1.2.3.4');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests over limit', () => {
    const limiter = createLimiter(60_000, 3);
    limiter.check('1.2.3.4');
    limiter.check('1.2.3.4');
    limiter.check('1.2.3.4');
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('tracks remaining requests correctly', () => {
    const limiter = createLimiter(60_000, 5);
    expect(limiter.check('1.2.3.4').remaining).toBe(4);
    expect(limiter.check('1.2.3.4').remaining).toBe(3);
    expect(limiter.check('1.2.3.4').remaining).toBe(2);
  });

  it('isolates different IPs', () => {
    const limiter = createLimiter(60_000, 2);
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    const blocked = limiter.check('1.1.1.1');
    expect(blocked.allowed).toBe(false);
    const allowed = limiter.check('2.2.2.2');
    expect(allowed.allowed).toBe(true);
  });

  it('returns zero remaining when blocked', () => {
    const limiter = createLimiter(60_000, 1);
    limiter.check('1.1.1.1');
    const result = limiter.check('1.1.1.1');
    expect(result.remaining).toBe(0);
  });
});
