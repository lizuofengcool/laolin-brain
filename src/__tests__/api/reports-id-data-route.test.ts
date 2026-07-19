/**
 * /api/reports/[id]/data 路由 handler 级集成测试
 *
 * 锁定路由层控制流契约：
 *   - 401 透传：authenticateRequest 返回 NextResponse 时不触达 fetcher / reportManager
 *   - 403 权限：非 owner/admin 拒绝（与 /api/stats 对齐）
 *   - 400：空 id（trim 后为空字符串）
 *   - 404：未知 reportId（不在 BUILTIN_REPORT_TEMPLATES）
 *   - 200：合法内置模板 id → fetchReportData 被以 (report, tenantId, dateFrom, dateTo) 调用
 *
 * Mock 策略：
 *   - @/lib/api-auth → mockAuthenticate 返回权威 AuthResult
 *   - @/lib/reports/data-fetcher → mockFetchReportData 返回固定 Map
 *   - @/lib/reports/report-manager 保持真实运行（BUILTIN_REPORT_TEMPLATES 是纯内存常量，
 *     无 db 依赖，单测直接消费真实数据，与 reports-list-page.test.tsx 一致）
 *   - next/server → MockNextResponse 真实 class（支持 instanceof 判定）
 *
 * params 以 Promise.resolve 提供，对齐 Next.js 16 动态路由签名
 * （与 files-id-route.test.ts 同范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  MockNextResponse,
  mockAuthenticate,
  mockFetchReportData,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body?: unknown, init?: { status?: number } | undefined) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number } | undefined) {
      return new MockNextResponse(body, init);
    }
    async json(): Promise<unknown> {
      return this.body;
    }
  }
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockFetchReportData: vi.fn(),
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('@/lib/api-auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock('@/lib/reports/data-fetcher', () => ({
  fetchReportData: (...args: unknown[]) => mockFetchReportData(...args),
}));

import { GET } from '@/app/api/reports/[id]/data/route';

const ownerAuth = {
  userId: 'user-1',
  email: 'owner@example.com',
  tenantId: 'tenant-1',
  role: 'owner',
};

type MockRes = InstanceType<typeof MockNextResponse>;

function makeGetRequest(id: string, query?: string): NextRequest {
  const url = query
    ? `http://localhost/api/reports/${id}/data?${query}`
    : `http://localhost/api/reports/${id}/data`;
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticate.mockResolvedValue({ ...ownerAuth });
  mockFetchReportData.mockResolvedValue({});
});

describe('/api/reports/[id]/data 路由', () => {
  describe('鉴权与权限', () => {
    it('未认证 → 401 透传，不触达 fetcher / reportManager', async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: '未提供身份认证令牌' }, { status: 401 })
      );

      const res = (await GET(makeGetRequest('storage-overview'), ctx('storage-overview'))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: '未提供身份认证令牌' });
      expect(mockFetchReportData).not.toHaveBeenCalled();
    });

    it('member 角色 → 403，不触达 fetcher', async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: 'member' });

      const res = (await GET(makeGetRequest('storage-overview'), ctx('storage-overview'))) as MockRes;

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: '没有权限查看报表数据' });
      expect(mockFetchReportData).not.toHaveBeenCalled();
    });

    it('admin 角色 → 通过（与 owner 同等权限）', async () => {
      mockAuthenticate.mockResolvedValue({ ...ownerAuth, role: 'admin' });
      mockFetchReportData.mockResolvedValue({ w1: { metricValue: 100 } });

      const res = (await GET(makeGetRequest('storage-overview'), ctx('storage-overview'))) as MockRes;

      expect(res.status).toBe(200);
      expect(mockFetchReportData).toHaveBeenCalledTimes(1);
    });
  });

  describe('参数校验', () => {
    it('空 id（trim 后空字符串）→ 400 "缺少报表 id"', async () => {
      const res = (await GET(makeGetRequest('   '), ctx('   '))) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: '缺少报表 id' });
      expect(mockFetchReportData).not.toHaveBeenCalled();
    });

    it('未知 reportId → 404 "报表不存在或已被删除"', async () => {
      const res = (await GET(makeGetRequest('nonexistent-report'), ctx('nonexistent-report'))) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: '报表不存在或已被删除' });
      expect(mockFetchReportData).not.toHaveBeenCalled();
    });
  });

  describe('合法内置模板', () => {
    it('storage-overview → 200，fetchReportData 以 (report, tenantId, dateFrom, dateTo) 调用', async () => {
      const fakeData = {
        w1: { metricValue: 1024 },
        w5: { chartData: [{ name: '2026-07-01', value: 500 }] },
      };
      mockFetchReportData.mockResolvedValue(fakeData);

      const res = (await GET(makeGetRequest('storage-overview'), ctx('storage-overview'))) as MockRes;

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: unknown };
      expect(body.success).toBe(true);
      expect(body.data).toEqual(fakeData);

      // fetchReportData 调用契约：第一参数 report（含 id 与 layout），第二参数 tenantId，第三/四参数 dateFrom/dateTo
      expect(mockFetchReportData).toHaveBeenCalledTimes(1);
      const callArgs = mockFetchReportData.mock.calls[0];
      const reportArg = callArgs[0] as { id: string; tenantId: string; layout: unknown };
      expect(reportArg.id).toBe('storage-overview');
      expect(reportArg.tenantId).toBe('tenant-1');
      expect(callArgs[1]).toBe('tenant-1');
      // 无 query 参数时 URLSearchParams.get 返回 null（route 透传给 fetcher）
      expect(callArgs[2]).toBeNull();
      expect(callArgs[3]).toBeNull();
    });

    it('ai-usage → 200，fetchReportData 接收 report 含声明的 widgets', async () => {
      mockFetchReportData.mockResolvedValue({});

      const res = (await GET(makeGetRequest('ai-usage'), ctx('ai-usage'))) as MockRes;

      expect(res.status).toBe(200);
      const callArgs = mockFetchReportData.mock.calls[0];
      const reportArg = callArgs[0] as {
        id: string;
        layout: { widgets: Array<{ id: string; dataConfig?: { dataSource: string } }> };
      };
      expect(reportArg.id).toBe('ai-usage');
      // ai-usage 模板含 6 个 widget，前 5 个声明了 dataConfig
      expect(reportArg.layout.widgets).toHaveLength(6);
      const w1 = reportArg.layout.widgets.find((w) => w.id === 'w1');
      expect(w1?.dataConfig?.dataSource).toBe('stats:ai');
    });

    it('透传 dateFrom / dateTo query 给 fetchReportData', async () => {
      mockFetchReportData.mockResolvedValue({});

      const res = (await GET(
        makeGetRequest('storage-overview', 'dateFrom=2026-07-01&dateTo=2026-07-31'),
        ctx('storage-overview')
      )) as MockRes;

      expect(res.status).toBe(200);
      const callArgs = mockFetchReportData.mock.calls[0];
      expect(callArgs[2]).toBe('2026-07-01');
      expect(callArgs[3]).toBe('2026-07-31');
    });

    it('fetchReportData 抛错 → 500 "拉取报表数据失败"', async () => {
      mockFetchReportData.mockRejectedValue(new Error('db down'));

      const res = (await GET(makeGetRequest('storage-overview'), ctx('storage-overview'))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: '拉取报表数据失败' });
    });
  });
});
