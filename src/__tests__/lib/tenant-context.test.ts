import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Mock @/lib/api-auth —— getTenantIdFromRequest 内部调用 authenticateRequest，
// 此处控制其返回 AuthResult（成功）或 NextResponse（未授权，触发 throw '未授权'）。
const mockAuthenticateRequest = vi.fn();
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

// Mock @/lib/db —— 仅需 tenantUser.findFirst；返回 null 触发 throw '用户不属于任何租户'。
const { mockDb } = vi.hoisted(() => ({
  mockDb: { tenantUser: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  getTenantIdOr401,
  getTenantIdFromRequest,
} from '@/lib/db/tenant-context';

/**
 * 构造类 NextRequest 对象：实现只读取 headers（Authorization）。
 * 不传 auth 时不设置 Authorization 头（等价于未授权）。
 */
function makeRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth !== undefined) headers.authorization = auth;
  return new Request('http://localhost/api/test', {
    headers,
  }) as unknown as NextRequest;
}

describe('getTenantIdOr401', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('认证成功且存在租户成员关系时返回 tenantId 字符串', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.com',
      tenantId: 't1',
      role: 'owner',
    });
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-1',
      role: 'admin',
    });

    const result = await getTenantIdOr401(makeRequest('Bearer valid'));

    expect(result).toBe('t-1');
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { joinedAt: 'asc' },
    });
  });

  it('authenticateRequest 返回 401 响应时包装为 401（不抛、不落到外层 500）', async () => {
    mockAuthenticateRequest.mockResolvedValue(
      NextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 })
    );

    const result = await getTenantIdOr401(makeRequest());

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    const body = await (result as NextResponse).json();
    expect(body).toEqual({ error: '未授权访问' });
    // findFirst 不应被调用（auth 已失败短路）
    expect(mockDb.tenantUser.findFirst).not.toHaveBeenCalled();
  });

  it('用户无租户时 getTenantIdFromRequest 抛错，包装为 401（原先会落到 catch 返 500）', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: 'u2',
      email: 'a@b.com',
      tenantId: 't1',
      role: 'owner',
    });
    mockDb.tenantUser.findFirst.mockResolvedValue(null);

    const result = await getTenantIdOr401(makeRequest('Bearer valid'));

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    const body = await (result as NextResponse).json();
    expect(body).toEqual({ error: '未授权访问' });
  });
});

// 回归：getTenantIdFromRequest 保持原 throw 语义不变（analytics 等仍依赖此行为）。
describe('getTenantIdFromRequest (回归，仍 throw)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未授权时抛 Error("未授权")（不返回 null/空，故调用方 if(!tenantId) 为死代码）', async () => {
    mockAuthenticateRequest.mockResolvedValue(
      NextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 })
    );

    await expect(getTenantIdFromRequest(makeRequest())).rejects.toThrow(
      '未授权'
    );
  });

  it('用户无租户时抛 Error("用户不属于任何租户")', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: 'u3',
      email: 'a@b.com',
      tenantId: 't1',
      role: 'owner',
    });
    mockDb.tenantUser.findFirst.mockResolvedValue(null);

    await expect(
      getTenantIdFromRequest(makeRequest('Bearer valid'))
    ).rejects.toThrow('用户不属于任何租户');
  });

  it('认证成功且有租户时返回 tenantId', async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: 'u4',
      email: 'a@b.com',
      tenantId: 't1',
      role: 'owner',
    });
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-9',
      role: 'owner',
    });

    await expect(
      getTenantIdFromRequest(makeRequest('Bearer valid'))
    ).resolves.toBe('t-9');
  });
});
