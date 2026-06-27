import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticateRequest } from '@/lib/api-auth';

// Mock @/lib/auth - verifyToken（同步函数，返回 { id, email } | null）
const mockVerifyToken = vi.fn();
vi.mock('@/lib/auth', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Mock @/lib/db —— authenticateRequest 会查询 tenantUser / tenant 并可能自动建租户
// 使用 vi.hoisted 确保 mockDb 在 vi.mock 工厂执行时已初始化
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    tenantUser: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    tenant: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));

// Mock NextResponse.json 以便捕获 status 和 body
const mockJsonResults: Array<{ body: unknown; status?: number }> = [];
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

/**
 * 构造一个类 NextRequest 对象（仅用 Request 即可，因为实现只读取 headers）。
 * 不传 auth 时不设置 Authorization 头。
 */
function makeRequest(opts: { auth?: string; url?: string } = {}): Parameters<typeof authenticateRequest>[0] {
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) {
    headers.Authorization = opts.auth;
  }
  return new Request(opts.url ?? 'http://localhost/api/test', { headers }) as unknown as Parameters<typeof authenticateRequest>[0];
}

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResults.length = 0;
  });

  it('返回 userId/email/tenantId/role 四字段（已存在租户成员关系）', async () => {
    mockVerifyToken.mockReturnValue({ id: 'user-123', email: 'test@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 'tenant-1', role: 'admin' });

    const result = await authenticateRequest(makeRequest({ auth: 'Bearer valid-token' }));

    expect(result).toEqual({
      userId: 'user-123',
      email: 'test@example.com',
      tenantId: 'tenant-1',
      role: 'admin',
    });
    expect(mockVerifyToken).toHaveBeenCalledWith('valid-token');
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      orderBy: { joinedAt: 'asc' },
    });
  });

  it('用户无租户时自动加入已有租户（owner 角色）', async () => {
    mockVerifyToken.mockReturnValue({ id: 'user-456', email: 'new@test.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue(null);
    mockDb.tenant.findFirst.mockResolvedValue({ id: 'existing-tenant', plan: 'free' });
    mockDb.tenantUser.create.mockResolvedValue({});

    const result = await authenticateRequest(makeRequest({ auth: 'Bearer valid-token' }));

    expect(result).toEqual({
      userId: 'user-456',
      email: 'new@test.com',
      tenantId: 'existing-tenant',
      role: 'owner',
    });
    expect(mockDb.tenant.findFirst).toHaveBeenCalled();
    expect(mockDb.tenantUser.create).toHaveBeenCalledWith({
      data: { userId: 'user-456', tenantId: 'existing-tenant', role: 'owner' },
    });
  });

  it('无任何租户时创建新的 free 租户并加入', async () => {
    mockVerifyToken.mockReturnValue({ id: 'user-789', email: 'fresh@test.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue(null);
    mockDb.tenant.findFirst.mockResolvedValue(null);
    mockDb.tenant.create.mockResolvedValue({ id: 'new-tenant', plan: 'free' });
    mockDb.tenantUser.create.mockResolvedValue({});

    const result = await authenticateRequest(makeRequest({ auth: 'Bearer valid-token' }));

    expect(result).toEqual({
      userId: 'user-789',
      email: 'fresh@test.com',
      tenantId: 'new-tenant',
      role: 'owner',
    });
    // 自动建租户必须使用 free 套餐（避免白嫖企业版配额）
    expect(mockDb.tenant.create).toHaveBeenCalledWith({
      data: { name: 'Default Tenant', plan: 'free' },
    });
  });

  it('未提供 Authorization 头时返回 401', async () => {
    const result = await authenticateRequest(makeRequest());

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('令牌无效时返回 401', async () => {
    mockVerifyToken.mockReturnValue(null);

    const result = await authenticateRequest(makeRequest({ auth: 'Bearer invalid-token' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '令牌无效或已过期' });
    expect(mockVerifyToken).toHaveBeenCalledWith('invalid-token');
  });

  it('不接受 URL query param 中的令牌（仅读取 Authorization 头，避免令牌泄露）', async () => {
    // 实现仅读取 Authorization 头，因此仅有 query param 时等价于"未提供令牌"
    const result = await authenticateRequest(
      makeRequest({ url: 'http://localhost/api/test?token=query-token' })
    );

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('Bearer 前缀大小写不敏感', async () => {
    mockVerifyToken.mockReturnValue({ id: 'user-1', email: 'a@b.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't-1', role: 'owner' });

    const result = await authenticateRequest(makeRequest({ auth: 'bearer case-insensitive' }));

    expect(result).toEqual({
      userId: 'user-1',
      email: 'a@b.com',
      tenantId: 't-1',
      role: 'owner',
    });
    expect(mockVerifyToken).toHaveBeenCalledWith('case-insensitive');
  });
});
