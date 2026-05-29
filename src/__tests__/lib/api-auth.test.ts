import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateRequest } from '@/lib/api-auth';

// Mock @/lib/auth - verifyToken
const mockVerifyToken = vi.fn();
vi.mock('@/lib/auth', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Mock NextResponse.json to capture status and body
const mockJsonResults: Array<{ body: unknown; init?: { status?: number } }> = [];
vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => {
        const response = {
          body,
          status: init?.status ?? 200,
          _type: 'NextResponse',
        };
        mockJsonResults.push(response as never);
        return response;
      },
    },
  };
});

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResults.length = 0;
  });

  it('returns userId and email for a valid token in Authorization header', () => {
    mockVerifyToken.mockReturnValue({ id: 'user-123', email: 'test@example.com' });
    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer valid-token' },
    }) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    expect(result).toEqual({ userId: 'user-123', email: 'test@example.com' });
    expect(mockVerifyToken).toHaveBeenCalledWith('valid-token');
  });

  it('returns 401 when token is only in query param (URL tokens are not accepted for security)', () => {
    mockVerifyToken.mockReturnValue({ id: 'user-456', email: 'query@test.com' });
    const request = new Request('http://localhost/api/test?token=query-token', {}) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    // URL query param tokens are rejected for security (token leakage risk)
    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
  });

  it('returns 401 response when no token is provided', () => {
    const request = new Request('http://localhost/api/test', {}) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    // Should return a NextResponse-like object
    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '未提供身份认证令牌' });
  });

  it('returns 401 response when token is invalid', () => {
    mockVerifyToken.mockReturnValue(null);
    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    }) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '令牌无效或已过期' });
    expect(mockVerifyToken).toHaveBeenCalledWith('invalid-token');
  });

  it('Authorization header takes precedence over query param', () => {
    mockVerifyToken.mockReturnValue({ id: 'user-789', email: 'header@test.com' });
    const request = new Request('http://localhost/api/test?token=query-token', {
      headers: { Authorization: 'Bearer header-token' },
    }) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    expect(result).toEqual({ userId: 'user-789', email: 'header@test.com' });
    // verifyToken should only be called once with the header token
    expect(mockVerifyToken).toHaveBeenCalledTimes(1);
    expect(mockVerifyToken).toHaveBeenCalledWith('header-token');
  });

  it('handles Bearer prefix case-insensitively', () => {
    mockVerifyToken.mockReturnValue({ id: 'user-1', email: 'a@b.com' });
    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'bearer case-insensitive' },
    }) as unknown as Parameters<typeof authenticateRequest>[0];

    const result = authenticateRequest(request);

    expect(result).toEqual({ userId: 'user-1', email: 'a@b.com' });
    expect(mockVerifyToken).toHaveBeenCalledWith('case-insensitive');
  });
});
