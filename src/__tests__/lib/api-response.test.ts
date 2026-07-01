import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  parsePaginationParams,
  calculatePagination,
} from '@/lib/utils/api-response';

// api-response.ts 仅依赖 next/server 的 NextResponse.json（产出标准 Response 对象，
// 可通过 .status / .json() 断言真实输出），无 @/lib/db / 无网络 / 无外部状态。
// 本测试锁定 9 个导出函数的当前行为（含分页数学与边界、状态码默认值、消息默认值）。

/** 取 NextResponse 的 status + body（一次断言用）。 */
async function unwrap(res: NextResponse) {
  const body = await res.json();
  return { status: res.status, body };
}

describe('api-response —— successResponse', () => {
  it('默认 status=200，body 形如 { success:true, data, message }', async () => {
    const res = successResponse({ id: 1 }, 'ok');
    const { status, body } = await unwrap(res);
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { id: 1 }, message: 'ok' });
  });

  it('message 省略时为 undefined（仍占位 key）', async () => {
    const { body } = await unwrap(successResponse(42));
    expect(body).toEqual({ success: true, data: 42, message: undefined });
  });

  it('自定义 statusCode 反映到 Response.status', async () => {
    const res = successResponse(null, 'created', 201);
    expect(res.status).toBe(201);
    const { body } = await unwrap(res);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('data 可为任意类型（数组 / 字符串 / 嵌套对象）', async () => {
    const arr = await unwrap(successResponse([1, 2, 3]));
    expect(arr.body.data).toEqual([1, 2, 3]);
    const str = await unwrap(successResponse('hello'));
    expect(str.body.data).toBe('hello');
    const nested = await unwrap(successResponse({ a: { b: { c: 1 } } }));
    expect(nested.body.data).toEqual({ a: { b: { c: 1 } } });
  });
});

describe('api-response —— errorResponse', () => {
  it('默认 status=400，body 形如 { success:false, error }', async () => {
    const { status, body } = await unwrap(errorResponse('bad request'));
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: 'bad request' });
  });

  it('自定义 statusCode 反映到 Response.status', async () => {
    const res = errorResponse('conflict', 409);
    expect(res.status).toBe(409);
    const { body } = await unwrap(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe('conflict');
  });
});

describe('api-response —— paginatedResponse', () => {
  it('body 含 data/total/page/pageSize/totalPages/hasMore 六字段', async () => {
    const { body } = await unwrap(paginatedResponse([1, 2, 3], 100, 2, 3));
    expect(body).toEqual({
      data: [1, 2, 3],
      total: 100,
      page: 2,
      pageSize: 3,
      totalPages: 34, // Math.ceil(100/3)
      hasMore: true, // 2*3=6 < 100
    });
  });

  it('totalPages = Math.ceil(total/pageSize)（非整除向上取整）', async () => {
    const { body } = await unwrap(paginatedResponse([], 10, 1, 3));
    expect(body.totalPages).toBe(4); // ceil(10/3)=4
  });

  it('page*pageSize === total 时 hasMore=false（最后一页恰好填满）', async () => {
    const { body } = await unwrap(paginatedResponse([1], 6, 2, 3));
    expect(body.hasMore).toBe(false); // 2*3=6 === 6
    expect(body.totalPages).toBe(2);
  });

  it('page*pageSize > total 时 hasMore=false（越界页）', async () => {
    const { body } = await unwrap(paginatedResponse([], 6, 5, 3));
    expect(body.hasMore).toBe(false); // 5*3=15 > 6
  });

  it('total=0 时 totalPages=0、hasMore=false', async () => {
    const { body } = await unwrap(paginatedResponse([], 0, 1, 20));
    expect(body.totalPages).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it('data 为空数组时仍保留 data 字段', async () => {
    const { body } = await unwrap(paginatedResponse([], 50, 1, 10));
    expect(body.data).toEqual([]);
    expect(body.total).toBe(50);
  });
});

describe('api-response —— 语义化错误响应包装器', () => {
  it('unauthorizedResponse 默认 401 + 默认消息', async () => {
    const { status, body } = await unwrap(unauthorizedResponse());
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: '未授权访问' });
  });

  it('unauthorizedResponse 自定义消息透传', async () => {
    const { status, body } = await unwrap(unauthorizedResponse('token 过期'));
    expect(status).toBe(401);
    expect(body.error).toBe('token 过期');
  });

  it('forbiddenResponse 默认 403 + 默认消息', async () => {
    const { status, body } = await unwrap(forbiddenResponse());
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: '没有权限执行此操作' });
  });

  it('forbiddenResponse 自定义消息透传', async () => {
    const { status, body } = await unwrap(forbiddenResponse('非 owner'));
    expect(status).toBe(403);
    expect(body.error).toBe('非 owner');
  });

  it('notFoundResponse 默认 404 + 默认消息', async () => {
    const { status, body } = await unwrap(notFoundResponse());
    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: '资源不存在' });
  });

  it('notFoundResponse 自定义消息透传', async () => {
    const { status, body } = await unwrap(notFoundResponse('文件不存在'));
    expect(status).toBe(404);
    expect(body.error).toBe('文件不存在');
  });

  it('serverErrorResponse 默认 500 + 默认消息', async () => {
    const { status, body } = await unwrap(serverErrorResponse());
    expect(status).toBe(500);
    expect(body).toEqual({ success: false, error: '服务器内部错误' });
  });

  it('serverErrorResponse 自定义消息透传', async () => {
    const { status, body } = await unwrap(serverErrorResponse('DB 连接失败'));
    expect(status).toBe(500);
    expect(body.error).toBe('DB 连接失败');
  });

  it('四个包装器均委托 errorResponse（body 结构一致 success:false）', async () => {
    for (const res of [
      unauthorizedResponse(),
      forbiddenResponse(),
      notFoundResponse(),
      serverErrorResponse(),
    ]) {
      const { body } = await unwrap(res);
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe('string');
    }
  });
});

describe('api-response —— parsePaginationParams', () => {
  it('无参数时走默认值 page=1 / pageSize=20 / skip=0', () => {
    const r = parsePaginationParams(new URLSearchParams());
    expect(r).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it('显式 page / pageSize 解析为整数', () => {
    const r = parsePaginationParams(
      new URLSearchParams({ page: '3', pageSize: '15' })
    );
    expect(r).toEqual({ page: 3, pageSize: 15, skip: 30 }); // skip=(3-1)*15
  });

  it('page<1 被 Math.max(1, ...) 钳制为 1', () => {
    const r = parsePaginationParams(new URLSearchParams({ page: '0' }));
    expect(r.page).toBe(1);
    expect(r.skip).toBe(0);
  });

  it('page 为负数同样钳制为 1', () => {
    const r = parsePaginationParams(new URLSearchParams({ page: '-5' }));
    expect(r.page).toBe(1);
  });

  it('pageSize<1 被 Math.max(1, ...) 钳制为 1', () => {
    const r = parsePaginationParams(new URLSearchParams({ pageSize: '0' }));
    expect(r.pageSize).toBe(1);
  });

  it('pageSize>100 被 Math.min(100, ...) 钳制为 100', () => {
    const r = parsePaginationParams(new URLSearchParams({ pageSize: '500' }));
    expect(r.pageSize).toBe(100);
  });

  it('pageSize=100 边界值不被钳制', () => {
    const r = parsePaginationParams(new URLSearchParams({ pageSize: '100' }));
    expect(r.pageSize).toBe(100);
  });

  it('skip = (page-1)*pageSize 联动计算', () => {
    const r = parsePaginationParams(
      new URLSearchParams({ page: '4', pageSize: '25' })
    );
    expect(r.skip).toBe(75); // (4-1)*25
  });

  it('小数 page 经 parseInt 截断为整数', () => {
    const r = parsePaginationParams(new URLSearchParams({ page: '2.9' }));
    expect(r.page).toBe(2);
  });

  it('非数字 page（parseInt=NaN）无守卫：Math.max(1,NaN)=NaN（锁定当前行为）', () => {
    // 已知未守护边界：page="abc" → parseInt=NaN → Math.max(1, NaN)=NaN。
    // 若后续加 NaN 守卫需同步更新此用例。
    const r = parsePaginationParams(new URLSearchParams({ page: 'abc' }));
    expect(r.page).toBeNaN();
    expect(r.skip).toBeNaN();
  });
});

describe('api-response —— calculatePagination', () => {
  it('返回 { total, page, pageSize, totalPages, hasMore } 五字段', () => {
    expect(calculatePagination(100, 2, 10)).toEqual({
      total: 100,
      page: 2,
      pageSize: 10,
      totalPages: 10,
      hasMore: true, // 2*10=20 < 100
    });
  });

  it('totalPages = Math.ceil(total/pageSize)（非整除向上取整）', () => {
    expect(calculatePagination(10, 1, 3).totalPages).toBe(4); // ceil(10/3)
  });

  it('page*pageSize === total 时 hasMore=false', () => {
    expect(calculatePagination(20, 2, 10).hasMore).toBe(false); // 2*10=20
  });

  it('page*pageSize > total 时 hasMore=false（越界）', () => {
    expect(calculatePagination(5, 10, 10).hasMore).toBe(false); // 10*10 > 5
  });

  it('total=0 时 totalPages=0、hasMore=false', () => {
    const r = calculatePagination(0, 1, 20);
    expect(r.totalPages).toBe(0);
    expect(r.hasMore).toBe(false);
  });

  it('与 paginatedResponse 的分页字段计算一致（同一公式）', async () => {
    // paginatedResponse 内联了 totalPages/hasMore 计算，calculatePagination 抽出同一逻辑。
    const total = 95;
    const page = 3;
    const pageSize = 10;
    const fromCalc = calculatePagination(total, page, pageSize);
    const fromPaginated = await unwrap(
      paginatedResponse([], total, page, pageSize)
    );
    expect(fromCalc.totalPages).toBe(fromPaginated.body.totalPages);
    expect(fromCalc.hasMore).toBe(fromPaginated.body.hasMore);
  });
});
