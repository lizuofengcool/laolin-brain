/**
 * ai/recommendation 智能推荐系统单测
 *
 * 覆盖目标：src/lib/ai/recommendation.ts。该模块提供混合推荐（首页/相关/搜索/每日），
 * 含以下公开函数：
 * - getHomeRecommendations：混合推荐，合并 基于访问历史(0.6) + 基于内容(0.4)，去重 + 加权
 * - getRelatedRecommendations：基于源文件的标签相似度/类型/文件夹/时间接近度评分
 * - getSearchRecommendations：基于关键词匹配文件名与标签，最短 2 字符门槛
 * - getDailyRecommendations：每日精选，优先未访问文件，随机打散后取 limit
 * - recordUserAction：记录用户行为，view 走 upsert 访问历史，其余仅写活动日志；try/catch 吞错
 * - getUserInterestTags：基于用户文件标签频次计算兴趣标签
 *
 * 私有函数 getContentBasedRecommendations / getHistoryBasedRecommendations / mergeRecommendations
 * 经 getHomeRecommendations 间接覆盖（标签偏好统计、访问历史评分、加权去重合并）。
 *
 * @/lib/db 经 vi.hoisted + vi.mock 替换 file.findMany / file.findFirst /
 * accessHistory.findMany / accessHistory.upsert / activityLog.create。
 *
 * 说明：
 * - getDailyRecommendations 使用 Math.random 散乱排序，相关用例 vi.spyOn(Math,'random')
 *   固定为 0.5（比较器恒返回 0，稳定排序保持原序）以确定性断言顺序。
 * - getHomeRecommendations 的访问历史评分含 Date.now()，相关用例以 new Date() 构造「当前」
 *   时间点并用 toBeCloseTo 容忍微秒级误差。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  mockFileFindMany,
  mockFileFindFirst,
  mockAccessHistoryFindMany,
  mockAccessHistoryUpsert,
  mockActivityLogCreate,
} = vi.hoisted(() => ({
  mockFileFindMany: vi.fn(),
  mockFileFindFirst: vi.fn(),
  mockAccessHistoryFindMany: vi.fn(),
  mockAccessHistoryUpsert: vi.fn(),
  mockActivityLogCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    file: {
      findMany: mockFileFindMany,
      findFirst: mockFileFindFirst,
    },
    accessHistory: {
      findMany: mockAccessHistoryFindMany,
      upsert: mockAccessHistoryUpsert,
    },
    activityLog: {
      create: mockActivityLogCreate,
    },
  },
}));

import {
  getHomeRecommendations,
  getRelatedRecommendations,
  getSearchRecommendations,
  getDailyRecommendations,
  recordUserAction,
  getUserInterestTags,
} from '@/lib/ai/recommendation';

// ─── 工厂 ───────────────────────────────────────────────
type FileRow = {
  id: string;
  tenantId: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  tags: string;
  isDeleted: boolean;
  createdAt: Date;
  folderId: string | null;
  thumbnailUrl: string | null;
  summary: string | null;
  keyPoints: string;
};

function makeFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: 'f1',
    tenantId: 't1',
    userId: 'u1',
    fileName: 'file.pdf',
    fileType: 'pdf',
    fileSize: 100,
    tags: '',
    isDeleted: false,
    createdAt: new Date('2026-01-10T00:00:00Z'),
    folderId: null,
    thumbnailUrl: null,
    summary: null,
    keyPoints: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 安全默认值：空结果，避免未设置的 mock 返回 undefined 导致类型崩溃
  mockFileFindMany.mockResolvedValue([]);
  mockFileFindFirst.mockResolvedValue(null);
  mockAccessHistoryFindMany.mockResolvedValue([]);
  mockAccessHistoryUpsert.mockResolvedValue({});
  mockActivityLogCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── getRelatedRecommendations ──────────────────────────
describe('getRelatedRecommendations', () => {
  it('源文件不存在时返回空数组', async () => {
    mockFileFindFirst.mockResolvedValue(null);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    expect(result).toEqual([]);
    expect(mockFileFindFirst).toHaveBeenCalledTimes(1);
    // 源文件不存在应短路，不查询候选文件
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it('源文件存在但无候选文件时返回空数组', async () => {
    mockFileFindFirst.mockResolvedValue(makeFile({ id: 'f1' }));
    mockFileFindMany.mockResolvedValue([]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    expect(result).toEqual([]);
  });

  it('标签相似度计分并生成「相同标签」理由', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '["a","b"]',
      fileType: 'pdf',
      folderId: null,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    // 候选：1 个相同标签，类型/文件夹/时间均不贡献
    const candidate = makeFile({
      id: 'f2',
      tags: '["a"]',
      fileType: 'img',
      folderId: 'fold2',
      createdAt: new Date('2025-11-01T00:00:00Z'), // >30 天，无时间加分
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    // commonTags=["a"], tagSimilarity = 1/max(2,1) = 0.5, score = 0.5*5 = 2.5
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('f2');
    expect(result[0].score).toBeCloseTo(2.5, 5);
    expect(result[0].reasons).toContain('有 1 个相同标签');
    expect(result[0].algorithm).toBe('content-based');
    expect(result[0].tags).toEqual(['a']);
  });

  it('相同文件类型计分 +2 并生成理由', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '',
      fileType: 'pdf',
      folderId: null,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    const candidate = makeFile({
      id: 'f2',
      tags: '',
      fileType: 'pdf', // 同类型
      folderId: 'fold2',
      createdAt: new Date('2025-11-01T00:00:00Z'), // 远期
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(2, 5);
    expect(result[0].reasons).toContain('相同文件类型');
  });

  it('同一文件夹计分 +1.5 并生成理由', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '',
      fileType: 'pdf',
      folderId: 'fold1',
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    const candidate = makeFile({
      id: 'f2',
      tags: '',
      fileType: 'img', // 不同类型
      folderId: 'fold1', // 同文件夹
      createdAt: new Date('2025-11-01T00:00:00Z'),
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(1.5, 5);
    expect(result[0].reasons).toContain('同一文件夹');
  });

  it('时间接近（<30 天）计分且不加理由', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '',
      fileType: 'pdf',
      folderId: null,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    const candidate = makeFile({
      id: 'f2',
      tags: '',
      fileType: 'img',
      folderId: 'fold2',
      createdAt: new Date('2026-01-09T00:00:00Z'), // 1 天前
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    // daysDiff=1, score = (30-1)/30 = 29/30
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(29 / 30, 5);
    // 时间接近不产生理由
    expect(result[0].reasons).toEqual([]);
  });

  it('得分为 0 的候选被过滤掉', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '',
      fileType: 'pdf',
      folderId: null,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    const candidate = makeFile({
      id: 'f2',
      tags: '',
      fileType: 'img', // 不同类型
      folderId: 'fold2', // 不同文件夹
      createdAt: new Date('2025-11-01T00:00:00Z'), // >30 天
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    // 无任何加分项 → score=0 → 被过滤
    expect(result).toEqual([]);
  });

  it('按分数降序排序并截断到 limit', async () => {
    const source = makeFile({
      id: 'f1',
      tags: '["a","b"]',
      fileType: 'pdf',
      folderId: null,
      createdAt: new Date('2026-01-10T00:00:00Z'),
    });
    // hi：2 个相同标签（score 2*5/... 实际 2/max(2,2)=1 *5=5）+ 同类型 +2 = 7
    const hi = makeFile({
      id: 'hi',
      tags: '["a","b"]',
      fileType: 'pdf',
      folderId: 'fold2',
      createdAt: new Date('2025-11-01T00:00:00Z'),
    });
    // lo：仅同类型 +2
    const lo = makeFile({
      id: 'lo',
      tags: '',
      fileType: 'pdf',
      folderId: 'fold3',
      createdAt: new Date('2025-11-01T00:00:00Z'),
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([lo, hi]); // 故意倒序输入

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 1);

    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('hi'); // 高分优先
    expect(result[0].score).toBeCloseTo(7, 5);
  });

  it('查询候选时排除源文件 id', async () => {
    const source = makeFile({ id: 'f1' });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([]);

    await getRelatedRecommendations('f1', 'u1', 't1', 10);

    const arg = mockFileFindMany.mock.calls[0][0];
    expect(arg.where.id).toEqual({ not: 'f1' });
    expect(arg.where.tenantId).toBe('t1');
    expect(arg.where.userId).toBe('u1');
    expect(arg.where.isDeleted).toBe(false);
    expect(arg.take).toBe(30); // limit*3
  });

  it('源文件 tags 为空时 sourceTags 为空数组', async () => {
    const source = makeFile({ id: 'f1', tags: '' });
    const candidate = makeFile({
      id: 'f2',
      tags: '["a"]',
      fileType: 'pdf',
      folderId: 'fold2',
      createdAt: new Date('2025-11-01T00:00:00Z'),
    });
    mockFileFindFirst.mockResolvedValue(source);
    mockFileFindMany.mockResolvedValue([candidate]);

    const result = await getRelatedRecommendations('f1', 'u1', 't1', 10);

    // sourceTags 空 → tagSimilarity 0；仅同类型 +2
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeCloseTo(2, 5);
  });
});

// ─── getSearchRecommendations ───────────────────────────
describe('getSearchRecommendations', () => {
  it('空查询返回空数组且不查库', async () => {
    const result = await getSearchRecommendations('', 'u1', 't1', 5);

    expect(result).toEqual([]);
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it('查询长度小于 2 返回空数组且不查库', async () => {
    const result = await getSearchRecommendations('a', 'u1', 't1', 5);

    expect(result).toEqual([]);
    expect(mockFileFindMany).not.toHaveBeenCalled();
  });

  it('文件名匹配生成「文件名匹配」理由', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', fileName: 'quarterly-report.pdf', tags: '' }),
    ]);

    const result = await getSearchRecommendations('report', 'u1', 't1', 5);

    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('文件名匹配');
    expect(result[0].score).toBe(1);
    expect(result[0].algorithm).toBe('content-based');
  });

  it('标签匹配生成「标签匹配」理由', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', fileName: 'doc.pdf', tags: '["finance-report"]' }),
    ]);

    const result = await getSearchRecommendations('report', 'u1', 't1', 5);

    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('标签匹配');
  });

  it('文件名与标签同时匹配生成两条理由', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', fileName: 'report.pdf', tags: '["report"]' }),
    ]);

    const result = await getSearchRecommendations('report', 'u1', 't1', 5);

    expect(result).toHaveLength(1);
    expect(result[0].reasons).toEqual(
      expect.arrayContaining(['文件名匹配', '标签匹配'])
    );
    expect(result[0].reasons).toHaveLength(2);
  });

  it('匹配为大小写不敏感', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', fileName: 'Quarterly-Report.pdf', tags: '' }),
    ]);

    const result = await getSearchRecommendations('REPORT', 'u1', 't1', 5);

    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('文件名匹配');
  });

  it('查询使用 OR + contains 过滤文件名与标签', async () => {
    mockFileFindMany.mockResolvedValue([]);

    await getSearchRecommendations('report', 'u1', 't1', 5);

    const arg = mockFileFindMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe('t1');
    expect(arg.where.OR).toHaveLength(2);
    expect(arg.take).toBe(5);
  });
});

// ─── getDailyRecommendations ────────────────────────────
describe('getDailyRecommendations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无近期文件返回空数组', async () => {
    mockFileFindMany.mockResolvedValue([]);

    const result = await getDailyRecommendations('u1', 't1', 5);

    expect(result).toEqual([]);
  });

  it('有文件且无访问记录时返回前 limit 个，理由为每日精选', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 比较器恒 0，保持原序
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', tags: '["a"]' }),
      makeFile({ id: 'f2', tags: '' }),
      makeFile({ id: 'f3', tags: '' }),
    ]);
    mockAccessHistoryFindMany.mockResolvedValue([]);

    const result = await getDailyRecommendations('u1', 't1', 2);

    expect(result).toHaveLength(2);
    expect(result[0].fileId).toBe('f1');
    expect(result[1].fileId).toBe('f2');
    expect(result[0].reasons).toEqual(['每日精选', '近期上传']);
    expect(result[0].algorithm).toBe('history-based');
    expect(result[0].score).toBe(1);
    expect(result[0].tags).toEqual(['a']);
  });

  it('优先推荐未访问过的文件', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1' }), // 已访问
      makeFile({ id: 'f2' }), // 未访问
      makeFile({ id: 'f3' }), // 未访问
    ]);
    mockAccessHistoryFindMany.mockResolvedValue([{ fileId: 'f1' }]);

    const result = await getDailyRecommendations('u1', 't1', 5);

    // candidates = 未访问 = [f2, f3]
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.fileId)).toEqual(['f2', 'f3']);
  });

  it('全部已访问时回退到全部文件', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1' }),
      makeFile({ id: 'f2' }),
    ]);
    mockAccessHistoryFindMany.mockResolvedValue([
      { fileId: 'f1' },
      { fileId: 'f2' },
    ]);

    const result = await getDailyRecommendations('u1', 't1', 5);

    // unaccessed 为空 → candidates = 全部文件
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.fileId)).toEqual(['f1', 'f2']);
  });

  it('limit 大于候选数时返回全部候选', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    mockFileFindMany.mockResolvedValue([makeFile({ id: 'f1' })]);
    mockAccessHistoryFindMany.mockResolvedValue([]);

    const result = await getDailyRecommendations('u1', 't1', 10);

    expect(result).toHaveLength(1);
  });
});

// ─── recordUserAction ───────────────────────────────────
describe('recordUserAction', () => {
  it('view 行为 upsert 访问历史并写活动日志', async () => {
    await recordUserAction('u1', 't1', 'f1', 'view');

    expect(mockAccessHistoryUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockAccessHistoryUpsert.mock.calls[0][0];
    expect(upsertArg.where.tenantId_userId_fileId_accessType).toMatchObject({
      tenantId: 't1',
      userId: 'u1',
      fileId: 'f1',
      accessType: 'view',
    });
    expect(upsertArg.update.accessCount).toEqual({ increment: 1 });
    expect(upsertArg.create.accessType).toBe('view');

    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
    const logArg = mockActivityLogCreate.mock.calls[0][0];
    expect(logArg.data).toMatchObject({
      tenantId: 't1',
      userId: 'u1',
      action: 'view',
      resourceType: 'file',
      resourceId: 'f1',
    });
  });

  it('非 view 行为仅写活动日志，不 upsert 访问历史', async () => {
    await recordUserAction('u1', 't1', 'f1', 'download');

    expect(mockAccessHistoryUpsert).not.toHaveBeenCalled();
    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
    expect(mockActivityLogCreate.mock.calls[0][0].data.action).toBe('download');
    expect(mockActivityLogCreate.mock.calls[0][0].data.resourceType).toBe('file');
  });

  it('提供 details 时序列化为 JSON 字符串', async () => {
    await recordUserAction('u1', 't1', 'f1', 'share', { target: 'group-a' });

    const logArg = mockActivityLogCreate.mock.calls[0][0];
    expect(logArg.data.details).toBe(JSON.stringify({ target: 'group-a' }));
  });

  it('未提供 details 时 details 为 undefined', async () => {
    await recordUserAction('u1', 't1', 'f1', 'comment');

    const logArg = mockActivityLogCreate.mock.calls[0][0];
    expect(logArg.data.details).toBeUndefined();
  });

  it('upsert 抛错时被捕获，活动日志不写入，控制台打印错误', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAccessHistoryUpsert.mockRejectedValue(new Error('db down'));

    await recordUserAction('u1', 't1', 'f1', 'view');

    // upsert 抛错后 activityLog.create 不会被执行
    expect(mockActivityLogCreate).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it('favorite 行为写活动日志 action=favorite', async () => {
    await recordUserAction('u1', 't1', 'f1', 'favorite');

    expect(mockActivityLogCreate.mock.calls[0][0].data.action).toBe('favorite');
  });
});

// ─── getUserInterestTags ────────────────────────────────
describe('getUserInterestTags', () => {
  it('按标签频次统计并降序排序、截断到 limit', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', tags: '["a","b"]' }),
      makeFile({ id: 'f2', tags: '["a"]' }),
      makeFile({ id: 'f3', tags: '["b","c"]' }),
    ]);

    const result = await getUserInterestTags('u1', 't1', 2);

    // a:2, b:2, c:1 → 降序取前 2：a, b（a 先于 b 稳定排序）
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ tag: 'a', score: 2 });
    expect(result[1]).toEqual({ tag: 'b', score: 2 });
  });

  it('无文件时返回空数组', async () => {
    mockFileFindMany.mockResolvedValue([]);

    const result = await getUserInterestTags('u1', 't1', 10);

    expect(result).toEqual([]);
  });

  it('文件 tags 为空字符串时不贡献标签', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFile({ id: 'f1', tags: '' }),
      makeFile({ id: 'f2', tags: '["a"]' }),
    ]);

    const result = await getUserInterestTags('u1', 't1', 10);

    expect(result).toEqual([{ tag: 'a', score: 1 }]);
  });

  it('查询使用 select 仅取 tags 且 take 200', async () => {
    mockFileFindMany.mockResolvedValue([]);

    await getUserInterestTags('u1', 't1', 10);

    const arg = mockFileFindMany.mock.calls[0][0];
    expect(arg.select).toEqual({ tags: true });
    expect(arg.take).toBe(200);
    expect(arg.where).toMatchObject({ tenantId: 't1', userId: 'u1', isDeleted: false });
  });
});

// ─── getHomeRecommendations（合并逻辑） ─────────────────
describe('getHomeRecommendations', () => {
  // file.findMany 在 getHomeRecommendations 中被调用 3 次，按参数形状区分：
  //  - where.id.in  → 基于访问历史的文件查询
  //  - select       → 基于内容的用户标签偏好查询
  //  - 其余          → 基于内容的全部文件查询
  function setupHomeMocks(opts: {
    accessHistory: Array<{ fileId: string; accessCount: number; lastAccessedAt: Date }>;
    historyFiles: FileRow[];
    userPrefFiles: FileRow[];
    allFiles: FileRow[];
  }) {
    mockAccessHistoryFindMany.mockResolvedValue(opts.accessHistory);
    mockFileFindMany.mockImplementation((args: { where?: { id?: unknown }; select?: unknown }) => {
      if (args.where?.id) return Promise.resolve(opts.historyFiles);
      if (args.select) return Promise.resolve(opts.userPrefFiles);
      return Promise.resolve(opts.allFiles);
    });
  }

  it('历史与内容重叠的文件按 0.6/0.4 加权合并分数与理由', async () => {
    const now = new Date();
    // f1：历史（1 条访问，accessCount=9 → frequencyScore=log10(10)=1）+ 内容
    // f2：仅内容
    // f3：仅历史（不在 allFiles 中）
    setupHomeMocks({
      accessHistory: [
        { fileId: 'f1', accessCount: 9, lastAccessedAt: now },
        { fileId: 'f3', accessCount: 9, lastAccessedAt: now },
      ],
      historyFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf' }),
        makeFile({ id: 'f3', tags: '["t3"]', fileType: 'doc' }),
      ],
      userPrefFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf' }),
        makeFile({ id: 'f2', tags: '["t2"]', fileType: 'img' }),
      ],
      allFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf', createdAt: now }),
        makeFile({ id: 'f2', tags: '["t2"]', fileType: 'img', createdAt: now }),
      ],
    });

    const result = await getHomeRecommendations('u1', 't1', 10);

    // 历史评分：recencyScore≈1（now），frequencyScore=1 → score≈3
    // 内容评分（f1/f2）：tag(0.1) + type(0.05) + 新文件(≈1) = 1.15
    // f1 合并：3*0.6 + 1.15*0.4 = 1.8 + 0.46 = 2.26
    // f3 仅历史：3*0.6 = 1.8
    // f2 仅内容：1.15*0.4 = 0.46
    expect(result.map((r) => r.fileId)).toEqual(['f1', 'f3', 'f2']);
    expect(result[0].score).toBeCloseTo(2.26, 2);
    expect(result[1].score).toBeCloseTo(1.8, 2);
    expect(result[2].score).toBeCloseTo(0.46, 2);

    // 合并后算法统一为 hybrid
    expect(result.every((r) => r.algorithm === 'hybrid')).toBe(true);

    // f1 理由为历史与内容理由的并集（去重）
    expect(result[0].reasons).toEqual(
      expect.arrayContaining(['你经常访问', '符合你的文件类型偏好', '最近上传'])
    );
    // f3 仅历史理由
    expect(result[1].reasons).toEqual(['你经常访问']);
    // f2 仅内容理由
    expect(result[2].reasons).toEqual(
      expect.arrayContaining(['符合你的文件类型偏好', '最近上传'])
    );
  });

  it('空访问历史时仅返回基于内容的推荐（权重 0.4）', async () => {
    const now = new Date();
    setupHomeMocks({
      accessHistory: [],
      historyFiles: [],
      userPrefFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf' }),
      ],
      allFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf', createdAt: now }),
      ],
    });

    const result = await getHomeRecommendations('u1', 't1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('f1');
    // 内容分 1.15 * 0.4 = 0.46
    expect(result[0].score).toBeCloseTo(0.46, 2);
    expect(result[0].algorithm).toBe('hybrid');
  });

  it('按合并后分数降序并截断到 limit', async () => {
    const now = new Date();
    setupHomeMocks({
      accessHistory: [{ fileId: 'f1', accessCount: 9, lastAccessedAt: now }],
      historyFiles: [makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf' })],
      userPrefFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf' }),
        makeFile({ id: 'f2', tags: '["t2"]', fileType: 'img' }),
      ],
      allFiles: [
        makeFile({ id: 'f1', tags: '["t1"]', fileType: 'pdf', createdAt: now }),
        makeFile({ id: 'f2', tags: '["t2"]', fileType: 'img', createdAt: now }),
      ],
    });

    const result = await getHomeRecommendations('u1', 't1', 1);

    // f1 (2.26) 高于 f2 (0.46)，截断到 1 → 仅 f1
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('f1');
  });

  it('历史与内容均空时返回空数组', async () => {
    setupHomeMocks({
      accessHistory: [],
      historyFiles: [],
      userPrefFiles: [],
      allFiles: [],
    });

    const result = await getHomeRecommendations('u1', 't1', 10);

    expect(result).toEqual([]);
  });

  it('内容推荐中类型匹配生成「符合你的文件类型偏好」理由', async () => {
    const now = new Date();
    setupHomeMocks({
      accessHistory: [],
      historyFiles: [],
      userPrefFiles: [makeFile({ id: 'f1', tags: '[]', fileType: 'pdf' })],
      allFiles: [makeFile({ id: 'f1', tags: '[]', fileType: 'pdf', createdAt: now })],
    });

    const result = await getHomeRecommendations('u1', 't1', 10);

    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('符合你的文件类型偏好');
    expect(result[0].reasons).toContain('最近上传');
  });
});
