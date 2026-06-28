import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticateRequest, requirePlatformAdmin } from '@/lib/api-auth';

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

// Mock NextResponse：用真实 class 以便 requirePlatformAdmin 中的
// `auth instanceof NextResponse` 判定可工作（json() 返回 NextResponse 实例）。
// 兼容既有 authenticateRequest 测试：实例仍带 _type/status/body 三字段。
const mockJsonResults: Array<{ body: unknown; status?: number }> = [];
vi.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    _type: string;
    constructor(body?: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this._type = 'NextResponse';
    }
    static json(body: unknown, init?: { status?: number }) {
      const response = new NextResponse(body, init);
      mockJsonResults.push(response as never);
      return response;
    }
  }
  return { NextResponse };
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

describe('requirePlatformAdmin', () => {
  // 捕获模块加载时的 ADMIN_EMAILS 原值，测试后恢复，避免污染其他测试 / 其他文件
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    // 本 describe 与 authenticateRequest 为兄弟块，顶层 beforeEach 不生效，
    // 故此处自行清理 mock 调用记录与 json 捕获队列（mockReturnValue 实现由各测试自设）。
    vi.clearAllMocks();
    mockJsonResults.length = 0;
    // 默认 fail-closed：每个测试自行设置 ADMIN_EMAILS；不设置等价于未配置
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    if (originalAdminEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalAdminEmails;
    }
  });

  it('未认证（无 Authorization 头）时透传 authenticateRequest 的 401，不检查 ADMIN_EMAILS', async () => {
    const result = await requirePlatformAdmin(makeRequest());

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '未提供身份认证令牌' });
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('令牌无效时透传 authenticateRequest 的 401', async () => {
    mockVerifyToken.mockReturnValue(null);

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer invalid-token' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 401);
    expect((result as { body: unknown }).body).toEqual({ error: '令牌无效或已过期' });
  });

  it('ADMIN_EMAILS 未配置时 fail-closed 返回 403（即使令牌有效且租户成员关系存在）', async () => {
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'someone@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 403);
    expect((result as { body: unknown }).body).toEqual({
      error: '未配置平台管理员 (ADMIN_EMAILS)，管理端点已禁用',
    });
  });

  it('ADMIN_EMAILS 为空字符串时同样 fail-closed 返回 403', async () => {
    process.env.ADMIN_EMAILS = '';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'someone@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 403);
    expect((result as { body: unknown }).body).toEqual({
      error: '未配置平台管理员 (ADMIN_EMAILS)，管理端点已禁用',
    });
  });

  it('ADMIN_EMAILS 仅含逗号与空白时 fail-closed 返回 403（filter(Boolean) 生效）', async () => {
    process.env.ADMIN_EMAILS = ' , , , ';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'someone@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 403);
  });

  it('令牌有效但邮箱不在允许列表时返回 403 "无平台管理员权限"', async () => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'ordinary@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toHaveProperty('_type', 'NextResponse');
    expect(result).toHaveProperty('status', 403);
    expect((result as { body: unknown }).body).toEqual({ error: '无平台管理员权限' });
  });

  it('邮箱精确匹配允许列表时返回 AuthResult（透传 authenticateRequest 结果）', async () => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'boss@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toEqual({
      userId: 'u1',
      email: 'boss@example.com',
      tenantId: 't1',
      role: 'owner',
    });
    expect(mockVerifyToken).toHaveBeenCalledWith('valid');
  });

  it('邮箱大小写不敏感匹配（ADMIN_EMAILS 大写、token email 小写）', async () => {
    process.env.ADMIN_EMAILS = 'BOSS@Example.COM';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'boss@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'admin' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toEqual({
      userId: 'u1',
      email: 'boss@example.com',
      tenantId: 't1',
      role: 'admin',
    });
  });

  it('多邮箱逗号分隔 + 前后空格 trim，命中其中之一即可', async () => {
    process.env.ADMIN_EMAILS = ' a@x.com , boss@example.com ,c@y.com';
    mockVerifyToken.mockReturnValue({ id: 'u1', email: 'boss@example.com' });
    mockDb.tenantUser.findFirst.mockResolvedValue({ tenantId: 't1', role: 'owner' });

    const result = await requirePlatformAdmin(makeRequest({ auth: 'Bearer valid' }));

    expect(result).toEqual({
      userId: 'u1',
      email: 'boss@example.com',
      tenantId: 't1',
      role: 'owner',
    });
  });
});
