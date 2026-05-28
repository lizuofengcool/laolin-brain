import { describe, it, expect } from 'vitest';

/**
 * Tests for JWT token parsing logic.
 * Mirrors the token expiry check in src/stores/app-store.ts.
 */
function parseJwtPayload(token: string): { payload: Record<string, unknown>; isExpired: boolean } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const isExpired = payload.exp ? Date.now() > (payload.exp as number) * 1000 : false;
    return { payload, isExpired };
  } catch {
    return null;
  }
}

function createJwt(header: object, payload: object, signature: string = 'sig'): string {
  const h = btoa(JSON.stringify(header));
  const p = btoa(JSON.stringify(payload));
  return `${h}.${p}.${signature}`;
}

describe('parseJwtPayload', () => {
  it('parses valid 3-part token', () => {
    const token = createJwt({ alg: 'HS256' }, { sub: '123', exp: Math.floor(Date.now() / 1000) + 3600 });
    const result = parseJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.payload.sub).toBe('123');
    expect(result!.isExpired).toBe(false);
  });

  it('detects expired token', () => {
    const token = createJwt({ alg: 'HS256' }, { sub: '123', exp: Math.floor(Date.now() / 1000) - 3600 });
    const result = parseJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.isExpired).toBe(true);
  });

  it('returns null for 2-part token', () => {
    const result = parseJwtPayload('header.payload');
    expect(result).toBeNull();
  });

  it('returns null for 1-part token', () => {
    const result = parseJwtPayload('justheader');
    expect(result).toBeNull();
  });

  it('returns null for empty token', () => {
    expect(parseJwtPayload('')).toBeNull();
  });

  it('returns null for token with corrupted payload', () => {
    const result = parseJwtPayload('eyJhbGci.not-valid-json.sig');
    expect(result).toBeNull();
  });

  it('handles token with no exp field', () => {
    const token = createJwt({ alg: 'HS256' }, { sub: '123', name: 'Test' });
    const result = parseJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.isExpired).toBe(false);
  });

  it('correctly compares exp in seconds (not milliseconds)', () => {
    // exp = 1 means Jan 1 1970 00:00:01 UTC — always expired
    const token = createJwt({ alg: 'HS256' }, { exp: 1 });
    const result = parseJwtPayload(token);
    expect(result!.isExpired).toBe(true);
  });

  it('handles URL-safe base64 encoding', () => {
    // JWT uses URL-safe base64: - instead of +, _ instead of /
    const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g, '-').replace(/\//g, '_');
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${header}.${payload}.sig`;
    const result = parseJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.isExpired).toBe(false);
  });

  it('handles token with many fields in payload', () => {
    const token = createJwt(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '123', name: 'Test User', role: 'admin', exp: Math.floor(Date.now() / 1000) + 7200, iat: Math.floor(Date.now() / 1000) }
    );
    const result = parseJwtPayload(token);
    expect(result).not.toBeNull();
    expect(result!.payload.name).toBe('Test User');
    expect(result!.payload.role).toBe('admin');
  });
});
