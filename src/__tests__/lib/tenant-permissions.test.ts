import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasRole,
  isAdminOrOwner,
  isOwner,
  isNextResponse,
  getTenantUserInfo,
  requireAdmin,
  requireOwner,
  type UserRole,
} from '@/lib/utils/tenant-permissions';

// Mock @/lib/db —— getTenantUserInfo / requireAdmin / requireOwner 经 db.tenantUser.findFirst 查询
// 使用 vi.hoisted 确保 mockDb 在 vi.mock 工厂执行时已初始化
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    tenantUser: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));

// Mock NextResponse：用真实 class 以便 isNextResponse 的
// `result instanceof NextResponse` 判定可工作（requireAdmin/requireOwner 失败路径返回 NextResponse）。
// 兼容断言：实例带 _type/status/body 三字段，便于在不引入 instanceof 的场景下断言。
const { MockNextResponse } = vi.hoisted(() => {
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
      return new NextResponse(body, init);
    }
  }
  return { MockNextResponse: NextResponse };
});
vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));

// 所有角色常量，便于矩阵用例引用
const ROLES: UserRole[] = ['owner', 'admin', 'member', 'viewer'];

// 取 NextResponse 失败响应的断言辅助（requireAdmin/requireOwner 失败路径走 NextResponse.json）
function expectDenied(result: unknown, status: number, error: string) {
  expect(result).toBeInstanceOf(MockNextResponse);
  expect(result).toHaveProperty('_type', 'NextResponse');
  expect(result).toHaveProperty('status', status);
  expect((result as { body: unknown }).body).toEqual({ error });
}

describe('hasRole —— 数值层级 owner4 > admin3 > member2 > viewer1，>= 比较', () => {
  it('owner >= 任意角色恒为 true（层级最高 4）', () => {
    for (const required of ROLES) {
      expect(hasRole('owner', required)).toBe(true);
    }
  });

  it('admin >= admin/member/viewer 为 true，>= owner 为 false（3 < 4）', () => {
    expect(hasRole('admin', 'owner')).toBe(false);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('admin', 'member')).toBe(true);
    expect(hasRole('admin', 'viewer')).toBe(true);
  });

  it('member >= member/viewer 为 true，>= owner/admin 为 false（2 < 3,4）', () => {
    expect(hasRole('member', 'owner')).toBe(false);
    expect(hasRole('member', 'admin')).toBe(false);
    expect(hasRole('member', 'member')).toBe(true);
    expect(hasRole('member', 'viewer')).toBe(true);
  });

  it('viewer >= viewer 为 true，>= owner/admin/member 为 false（1 < 2,3,4）', () => {
    expect(hasRole('viewer', 'owner')).toBe(false);
    expect(hasRole('viewer', 'admin')).toBe(false);
    expect(hasRole('viewer', 'member')).toBe(false);
    expect(hasRole('viewer', 'viewer')).toBe(true);
  });

  it('相等角色恒为 true（>= 在等值时成立）', () => {
    expect(hasRole('owner', 'owner')).toBe(true);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('member', 'member')).toBe(true);
    expect(hasRole('viewer', 'viewer')).toBe(true);
  });

  it('层级严格偏序：高角色满足低要求，低角色不满足高要求（双向锁定）', () => {
    // 高→低：owner 满足 admin 要求，admin 满足 member 要求，member 满足 viewer 要求
    expect(hasRole('owner', 'admin')).toBe(true);
    expect(hasRole('admin', 'member')).toBe(true);
    expect(hasRole('member', 'viewer')).toBe(true);
    // 低→高：viewer 不满足 member，member 不满足 admin，admin 不满足 owner
    expect(hasRole('viewer', 'member')).toBe(false);
    expect(hasRole('member', 'admin')).toBe(false);
    expect(hasRole('admin', 'owner')).toBe(false);
  });
});

describe('isAdminOrOwner —— owner/admin 为 true，member/viewer 为 false', () => {
  it('owner → true', () => {
    expect(isAdminOrOwner('owner')).toBe(true);
  });
  it('admin → true', () => {
    expect(isAdminOrOwner('admin')).toBe(true);
  });
  it('member → false', () => {
    expect(isAdminOrOwner('member')).toBe(false);
  });
  it('viewer → false', () => {
    expect(isAdminOrOwner('viewer')).toBe(false);
  });
});

describe('isOwner —— 仅 owner 为 true', () => {
  it('owner → true', () => {
    expect(isOwner('owner')).toBe(true);
  });
  it('admin → false', () => {
    expect(isOwner('admin')).toBe(false);
  });
  it('member → false', () => {
    expect(isOwner('member')).toBe(false);
  });
  it('viewer → false', () => {
    expect(isOwner('viewer')).toBe(false);
  });
});

describe('isNextResponse —— instanceof NextResponse 判定', () => {
  it('requireAdmin 失败返回的 NextResponse 实例 → true（真实用法）', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue(null);
    const result = await requireAdmin('no-such-user');
    expect(isNextResponse(result)).toBe(true);
  });

  it('requireAdmin 成功返回的普通对象 → false（真实用法）', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-1',
      role: 'admin',
      userId: 'u-1',
    });
    const result = await requireAdmin('u-1');
    expect(isNextResponse(result)).toBe(false);
  });

  it('直接构造的 NextResponse 实例 → true', () => {
    const res = new MockNextResponse({ error: 'x' }, { status: 403 });
    expect(isNextResponse(res)).toBe(true);
  });

  it('普通对象 → false', () => {
    expect(isNextResponse({ tenantId: 't', role: 'owner' })).toBe(false);
  });

  it('null → false', () => {
    expect(isNextResponse(null)).toBe(false);
  });

  it('undefined → false', () => {
    expect(isNextResponse(undefined)).toBe(false);
  });

  it('类型守卫收窄：成功路径 result 在守卫后被识别为非 NextResponse（编译期 + 运行期）', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-guard',
      role: 'owner',
      userId: 'u-guard',
    });
    const result = await requireAdmin('u-guard');
    expect(isNextResponse(result)).toBe(false);
    if (!isNextResponse(result)) {
      // 守卫收窄后可安全访问 tenantId / role
      expect(result.tenantId).toBe('t-guard');
      expect(result.role).toBe('owner');
    }
  });
});

describe('getTenantUserInfo —— 按 userId 查询租户成员关系', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('命中：返回 {tenantId, role, userId}，role cast 为 UserRole', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 'tenant-1',
      role: 'admin',
      userId: 'user-1',
    });

    const result = await getTenantUserInfo('user-1');

    expect(result).toEqual({
      tenantId: 'tenant-1',
      role: 'admin',
      userId: 'user-1',
    });
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { tenantId: true, role: true, userId: true },
    });
  });

  it('命中 owner 角色：role 字段透传', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-owner',
      role: 'owner',
      userId: 'u-owner',
    });

    const result = await getTenantUserInfo('u-owner');

    expect(result).toEqual({
      tenantId: 't-owner',
      role: 'owner',
      userId: 'u-owner',
    });
  });

  it('未命中（findFirst 返回 null）→ 返回 null，不抛错', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue(null);

    const result = await getTenantUserInfo('ghost-user');

    expect(result).toBeNull();
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledTimes(1);
  });

  it('select 字段精确为 {tenantId, role, userId}（不查询额外字段）', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-sel',
      role: 'member',
      userId: 'u-sel',
    });

    await getTenantUserInfo('u-sel');

    const callArgs = mockDb.tenantUser.findFirst.mock.calls[0][0];
    expect(callArgs.select).toEqual({ tenantId: true, role: true, userId: true });
    expect(callArgs.where).toEqual({ userId: 'u-sel' });
  });
});

describe('requireAdmin —— 要求 admin 或 owner 权限', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('命中 owner → 返回 {tenantId, role: owner}', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-owner',
      role: 'owner',
      userId: 'u-owner',
    });

    const result = await requireAdmin('u-owner');

    expect(result).toEqual({ tenantId: 't-owner', role: 'owner' });
    expect(isNextResponse(result)).toBe(false);
  });

  it('命中 admin → 返回 {tenantId, role: admin}', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-admin',
      role: 'admin',
      userId: 'u-admin',
    });

    const result = await requireAdmin('u-admin');

    expect(result).toEqual({ tenantId: 't-admin', role: 'admin' });
    expect(isNextResponse(result)).toBe(false);
  });

  it('命中 member → 403 "没有权限执行此操作"', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-member',
      role: 'member',
      userId: 'u-member',
    });

    const result = await requireAdmin('u-member');

    expectDenied(result, 403, '没有权限执行此操作');
  });

  it('命中 viewer → 403 "没有权限执行此操作"', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-viewer',
      role: 'viewer',
      userId: 'u-viewer',
    });

    const result = await requireAdmin('u-viewer');

    expectDenied(result, 403, '没有权限执行此操作');
  });

  it('未命中（无租户成员关系）→ 404 "租户不存在"', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue(null);

    const result = await requireAdmin('ghost-user');

    expectDenied(result, 404, '租户不存在');
  });

  it('内部调用 getTenantUserInfo（复用查询），不在 requireAdmin 内重复查询逻辑', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-call',
      role: 'admin',
      userId: 'u-call',
    });

    await requireAdmin('u-call');

    // 仅一次 findFirst 调用（requireAdmin → getTenantUserInfo → db.tenantUser.findFirst）
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledTimes(1);
    expect(mockDb.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-call' },
      select: { tenantId: true, role: true, userId: true },
    });
  });
});

describe('requireOwner —— 仅 owner 通过', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('命中 owner → 返回 {tenantId, role: owner}', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-owner',
      role: 'owner',
      userId: 'u-owner',
    });

    const result = await requireOwner('u-owner');

    expect(result).toEqual({ tenantId: 't-owner', role: 'owner' });
    expect(isNextResponse(result)).toBe(false);
  });

  it('命中 admin → 403 "没有权限执行此操作"（admin 不满足 owner 要求）', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-admin',
      role: 'admin',
      userId: 'u-admin',
    });

    const result = await requireOwner('u-admin');

    expectDenied(result, 403, '没有权限执行此操作');
  });

  it('命中 member → 403', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-member',
      role: 'member',
      userId: 'u-member',
    });

    const result = await requireOwner('u-member');

    expectDenied(result, 403, '没有权限执行此操作');
  });

  it('命中 viewer → 403', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't-viewer',
      role: 'viewer',
      userId: 'u-viewer',
    });

    const result = await requireOwner('u-viewer');

    expectDenied(result, 403, '没有权限执行此操作');
  });

  it('未命中 → 404 "租户不存在"', async () => {
    mockDb.tenantUser.findFirst.mockResolvedValue(null);

    const result = await requireOwner('ghost-user');

    expectDenied(result, 404, '租户不存在');
  });

  it('仅 owner 通过、其余角色全部拒绝（与 requireAdmin 的 admin 放行差异）', async () => {
    // owner 通过
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't',
      role: 'owner',
      userId: 'u',
    });
    const ok = await requireOwner('u');
    expect(isNextResponse(ok)).toBe(false);

    // admin 被拒（requireOwner 比 requireAdmin 更严格）
    mockDb.tenantUser.findFirst.mockResolvedValue({
      tenantId: 't',
      role: 'admin',
      userId: 'u',
    });
    const denied = await requireOwner('u');
    expect(isNextResponse(denied)).toBe(true);
    expect(denied as { status: number }).toHaveProperty('status', 403);
  });
});
