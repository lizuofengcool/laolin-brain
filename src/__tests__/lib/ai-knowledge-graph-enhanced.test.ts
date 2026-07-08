/**
 * ai/knowledge-graph-enhanced 知识图谱增强模块单测
 *
 * 覆盖目标：src/lib/ai/knowledge-graph-enhanced.ts。该模块提供实体/关系图谱构建与
 * 图算法工具，含以下公开函数：
 * - getEntityColor / getEntityIcon：按 EntityType 返回颜色/图标，未知类型回退 other
 * - findNeighbors：BFS 查找邻居，depth 限制（depth=N 含距 source 距离 ≤N 的节点），不含自身
 * - findPath：BFS 查找两点最短路径并重建；source===target 返回 [source]；maxDepth 限制探索深度
 *   （maxDepth=N 可命中 N 边路径）
 * - detectCommunities：连通分量社区发现，以社区内 occurrenceCount 最高的实体命名
 * - forceDirectedLayout：力导向布局，含斥力/引力/中心引力/阻尼/边界裁剪，返回 NodePosition[]
 * - extractGraphFromFiles：经 db.file.findMany 取文件，从 fileName/summary/keyPoints/tags
 *   提取实体（【标签】/专有名词/技术术语）与共现关系，跨文件聚合 occurrenceCount/fileIds，构建 stats
 *
 * @/lib/db 经 vi.hoisted + vi.mock 替换 file.findMany（extractGraphFromFiles 唯一 DB 调用点），
 * 其余 5 个图算法函数为纯函数，不依赖 db。
 *
 * 历史修复：
 * - extractGraphFromFiles 的 select 曾含 textContent，但 extractEntities 仅分析
 *   fileName/summary/keyPoints/tags，textContent 被查询但未参与实体提取（无效字段查询）；
 *   已从 select 移除 textContent，避免拉取潜在较大的无效字段。
 * - extractGraphFromFiles 的 select 曾含 fileType，属同类死字段（仅查询未被消费，
 *   textToAnalyze 仅用 fileName/summary/keyPoints/tags）；已从 select 移除 fileType。
 * - findPath 的 maxDepth 曾存在 off-by-one（入队条件 `depth < maxDepth` 导致 maxDepth=N 仅可
 *   命中 N-1 边路径）；已改为 `depth <= maxDepth`，maxDepth=N 现可命中 N 边路径。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockFileFindMany } = vi.hoisted(() => ({
  mockFileFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    file: {
      findMany: mockFileFindMany,
    },
  },
}));

import {
  getEntityColor,
  getEntityIcon,
  findNeighbors,
  findPath,
  detectCommunities,
  forceDirectedLayout,
  extractGraphFromFiles,
  type Entity,
  type Relation,
  type EntityType,
} from '@/lib/ai/knowledge-graph-enhanced';

// ─── 工厂 ───────────────────────────────────────────────
function makeEntity(
  id: string,
  name: string = id,
  type: EntityType = 'concept',
  occurrenceCount: number = 1
): Entity {
  return { id, name, type, fileIds: [], occurrenceCount };
}

function makeRelation(
  sourceId: string,
  targetId: string,
  weight: number = 0.5
): Relation {
  return {
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    type: 'related_to',
    weight,
    fileIds: [],
  };
}

// 构造 extractGraphFromFiles 的 file 行（select 字段；textContent/fileType 已从 select 移除）
function makeFileRow(opts: {
  id: string;
  fileName?: string;
  summary?: string | null;
  keyPoints?: string | null;
  tags?: string | null;
}) {
  return {
    id: opts.id,
    fileName: opts.fileName ?? `${opts.id}.txt`,
    summary: opts.summary ?? null,
    keyPoints: opts.keyPoints ?? null,
    tags: opts.tags ?? null,
  };
}

// ─── getEntityColor ─────────────────────────────────────
describe('getEntityColor', () => {
  it('各 EntityType 返回对应十六进制颜色', () => {
    const expected: Record<EntityType, string> = {
      person: '#3b82f6',
      organization: '#8b5cf6',
      location: '#10b981',
      concept: '#f59e0b',
      technology: '#ef4444',
      product: '#ec4899',
      event: '#06b6d4',
      date: '#6b7280',
      other: '#6b7280',
    };
    for (const type of Object.keys(expected) as EntityType[]) {
      expect(getEntityColor(type)).toBe(expected[type]);
    }
  });

  it('未知类型回退 other 颜色 (#6b7280)', () => {
    expect(getEntityColor('unknown' as unknown as EntityType)).toBe('#6b7280');
  });
});

// ─── getEntityIcon ──────────────────────────────────────
describe('getEntityIcon', () => {
  it('各 EntityType 返回对应图标', () => {
    const expected: Record<EntityType, string> = {
      person: '👤',
      organization: '🏢',
      location: '📍',
      concept: '💡',
      technology: '⚙️',
      product: '📦',
      event: '📅',
      date: '🕐',
      other: '📄',
    };
    for (const type of Object.keys(expected) as EntityType[]) {
      expect(getEntityIcon(type)).toBe(expected[type]);
    }
  });

  it('未知类型回退 other 图标 (📄)', () => {
    expect(getEntityIcon('unknown' as unknown as EntityType)).toBe('📄');
  });
});

// ─── findNeighbors ──────────────────────────────────────
describe('findNeighbors', () => {
  it('depth=1（默认）：返回直接邻居，不含自身', () => {
    const rels = [makeRelation('A', 'B'), makeRelation('A', 'C')];
    expect(findNeighbors('A', rels)).toEqual(['B', 'C']);
  });

  it('depth=2：含距离 1 与 2 的节点，不含距离 3', () => {
    // 链 A-B-C-D
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
    ];
    expect(findNeighbors('A', rels, 2)).toEqual(['B', 'C']);
  });

  it('depth=3：含距离 1/2/3 的节点', () => {
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
    ];
    expect(findNeighbors('A', rels, 3)).toEqual(['B', 'C', 'D']);
  });

  it('depth=0：返回空数组（自身被排除）', () => {
    const rels = [makeRelation('A', 'B')];
    expect(findNeighbors('A', rels, 0)).toEqual([]);
  });

  it('entityId 不出现在任何关系中：返回空数组', () => {
    const rels = [makeRelation('A', 'B')];
    expect(findNeighbors('Z', rels)).toEqual([]);
  });

  it('自环关系不把节点自身算作邻居', () => {
    const rels = [makeRelation('A', 'A'), makeRelation('A', 'B')];
    expect(findNeighbors('A', rels)).toEqual(['B']);
  });
});

// ─── findPath ───────────────────────────────────────────
describe('findPath', () => {
  it('source===target：返回 [source]', () => {
    expect(findPath('A', 'A', [])).toEqual(['A']);
  });

  it('直接相邻：返回两节点路径，source 在前', () => {
    const rels = [makeRelation('A', 'B')];
    expect(findPath('A', 'B', rels)).toEqual(['A', 'B']);
  });

  it('多跳链：返回完整最短路径', () => {
    // A-B-C-D
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
    ];
    expect(findPath('A', 'D', rels)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('关系无向：反向也能找到路径', () => {
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
    ];
    expect(findPath('D', 'A', rels)).toEqual(['D', 'C', 'B', 'A']);
  });

  it('不连通：返回 null', () => {
    const rels = [makeRelation('A', 'B'), makeRelation('C', 'D')];
    expect(findPath('A', 'D', rels)).toBeNull();
  });

  it('maxDepth=3 命中 3 边路径；maxDepth=2 无法命中（边界精确）', () => {
    // 链 A-B-C-D（3 边）
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
    ];
    expect(findPath('A', 'D', rels, 3)).toEqual(['A', 'B', 'C', 'D']);
    expect(findPath('A', 'D', rels, 2)).toBeNull();
  });

  it('maxDepth=5 命中 5 边路径；maxDepth=4 无法命中（边界精确）', () => {
    // 链 A-B-C-D-E-F（5 边）
    const rels = [
      makeRelation('A', 'B'),
      makeRelation('B', 'C'),
      makeRelation('C', 'D'),
      makeRelation('D', 'E'),
      makeRelation('E', 'F'),
    ];
    expect(findPath('A', 'F', rels, 5)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(findPath('A', 'F', rels, 4)).toBeNull();
    // maxDepth=5 同时可命中更短的 4 边路径
    expect(findPath('A', 'E', rels, 5)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

// ─── detectCommunities ──────────────────────────────────
describe('detectCommunities', () => {
  it('空实体：返回空数组', () => {
    expect(detectCommunities([], [])).toEqual([]);
  });

  it('单实体无关系：自成社区，以其名命名', () => {
    const ents = [makeEntity('E1', 'alpha')];
    expect(detectCommunities(ents, [])).toEqual([
      { id: 'community_0', name: 'alpha', entities: ['E1'] },
    ]);
  });

  it('两个连通实体：合并为一个社区（occurrenceCount 相同时以 BFS 首个实体命名）', () => {
    const ents = [makeEntity('E1', 'alpha'), makeEntity('E2', 'beta')];
    const rels = [makeRelation('E1', 'E2')];
    expect(detectCommunities(ents, rels)).toEqual([
      { id: 'community_0', name: 'alpha', entities: ['E1', 'E2'] },
    ]);
  });

  it('两个不连通实体：分为两个社区', () => {
    const ents = [makeEntity('E1', 'alpha'), makeEntity('E2', 'beta')];
    expect(detectCommunities(ents, [])).toEqual([
      { id: 'community_0', name: 'alpha', entities: ['E1'] },
      { id: 'community_1', name: 'beta', entities: ['E2'] },
    ]);
  });

  it('社区以 occurrenceCount 最高的实体命名', () => {
    const ents = [
      makeEntity('E1', 'low', 'concept', 1),
      makeEntity('E2', 'high', 'concept', 5),
      makeEntity('E3', 'mid', 'concept', 3),
    ];
    const rels = [makeRelation('E1', 'E2'), makeRelation('E2', 'E3')];
    const comms = detectCommunities(ents, rels);
    expect(comms).toHaveLength(1);
    expect(comms[0].name).toBe('high');
    expect(comms[0].entities).toEqual(['E1', 'E2', 'E3']);
  });
});

// ─── forceDirectedLayout ────────────────────────────────
describe('forceDirectedLayout', () => {
  it('空实体：返回空数组', () => {
    expect(forceDirectedLayout([], [])).toEqual([]);
  });

  it('返回每个实体的位置，id 全覆盖，长度一致', () => {
    const ents = [makeEntity('E1'), makeEntity('E2'), makeEntity('E3')];
    const positions = forceDirectedLayout(ents, []);
    expect(positions).toHaveLength(3);
    expect(positions.map((p) => p.id).sort()).toEqual(['E1', 'E2', 'E3']);
    for (const p of positions) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('默认边界：位置裁剪在 [20, width-20] × [20, height-20] 内', () => {
    const ents = [makeEntity('E1'), makeEntity('E2'), makeEntity('E3'), makeEntity('E4')];
    const rels = [makeRelation('E1', 'E2'), makeRelation('E2', 'E3')];
    const positions = forceDirectedLayout(ents, rels);
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(800 - 20);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(600 - 20);
    }
  });

  it('自定义 width/height：位置裁剪在对应边界内', () => {
    const ents = [makeEntity('E1'), makeEntity('E2')];
    const positions = forceDirectedLayout(ents, [], { width: 100, height: 100 });
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(20);
      expect(p.x).toBeLessThanOrEqual(80);
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(80);
    }
  });

  it('关系引用不存在的实体：不抛错，仍返回全部实体位置', () => {
    const ents = [makeEntity('E1'), makeEntity('E2')];
    const rels = [makeRelation('E1', 'GHOST'), makeRelation('GHOST', 'E2')];
    const positions = forceDirectedLayout(ents, rels);
    expect(positions).toHaveLength(2);
    expect(positions.map((p) => p.id).sort()).toEqual(['E1', 'E2']);
  });
});

// ─── extractGraphFromFiles ──────────────────────────────
describe('extractGraphFromFiles', () => {
  beforeEach(() => {
    mockFileFindMany.mockReset();
  });

  it('无文件命中：返回空图谱', async () => {
    mockFileFindMany.mockResolvedValue([]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    expect(graph.entities).toEqual([]);
    expect(graph.relations).toEqual([]);
    expect(graph.stats).toEqual({
      totalEntities: 0,
      totalRelations: 0,
      entityTypes: {},
      relationTypes: {},
    });
  });

  it('单个【标签】实体：1 个 concept 实体，0 关系', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: '这是关于【概念甲】的文档' }),
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0]).toMatchObject({
      id: 'entity_概念甲',
      name: '概念甲',
      type: 'concept',
      occurrenceCount: 1,
      fileIds: ['f1'],
    });
    expect(graph.relations).toEqual([]);
    expect(graph.stats.totalEntities).toBe(1);
    expect(graph.stats.totalRelations).toBe(0);
    expect(graph.stats.entityTypes).toEqual({ concept: 1 });
  });

  it('同文件两个【标签】实体：生成共现关系 weight 0.5', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: '【甲实体】【乙实体】共现' }),
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    expect(graph.entities).toHaveLength(2);
    expect(graph.relations).toHaveLength(1);
    expect(graph.relations[0]).toMatchObject({
      type: 'related_to',
      weight: 0.5,
      fileIds: ['f1'],
    });
    expect(graph.stats.totalRelations).toBe(1);
    expect(graph.stats.relationTypes).toEqual({ related_to: 1 });
    expect(graph.stats.entityTypes).toEqual({ concept: 2 });
  });

  it('同一对实体跨两文件：occurrenceCount 累加、关系 weight 累加、fileIds 聚合', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: '【甲实体】【乙实体】' }),
      makeFileRow({ id: 'f2', summary: '【甲实体】【乙实体】再次' }),
    ]);
    const graph = await extractGraphFromFiles(['f1', 'f2'], 'u1', 't1');
    expect(graph.entities).toHaveLength(2);
    for (const e of graph.entities) {
      expect(e.occurrenceCount).toBe(2);
      expect(e.fileIds).toEqual(['f1', 'f2']);
    }
    expect(graph.relations).toHaveLength(1);
    expect(graph.relations[0].weight).toBeCloseTo(0.6, 5);
    expect(graph.relations[0].fileIds).toEqual(['f1', 'f2']);
  });

  it('技术术语 "API"：提取为 technology 类型实体', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: '使用 API 进行开发' }),
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    const api = graph.entities.find((e) => e.name === 'API');
    expect(api).toBeDefined();
    expect(api?.type).toBe('technology');
    expect(api?.id).toBe('entity_api');
    expect(graph.stats.entityTypes).toEqual({ technology: 1 });
  });

  it('专有名词含 org 关键词 "Inc"：guessEntityType 判为 organization', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: 'Acme Inc 发布了新产品' }),
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    const org = graph.entities.find((e) => e.name === 'Acme Inc');
    expect(org).toBeDefined();
    expect(org?.type).toBe('organization');
    expect(org?.id).toBe('entity_acme_inc');
  });

  it('混合 concept + technology：stats.entityTypes 正确聚合', async () => {
    mockFileFindMany.mockResolvedValue([
      makeFileRow({ id: 'f1', summary: '【概念甲】用 API 开发' }),
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    expect(graph.entities).toHaveLength(2);
    expect(graph.stats.entityTypes).toEqual({ concept: 1, technology: 1 });
    expect(graph.stats.totalEntities).toBe(2);
    // 两个实体共现 → 1 条关系
    expect(graph.relations).toHaveLength(1);
  });

  it('db.file.findMany 按 fileIds/tenantId/userId 过滤且 select 不含 textContent/fileType', async () => {
    mockFileFindMany.mockResolvedValue([]);
    await extractGraphFromFiles(['f1', 'f2'], 'u1', 't1');
    expect(mockFileFindMany).toHaveBeenCalledTimes(1);
    const arg = mockFileFindMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      tenantId: 't1',
      userId: 'u1',
      isDeleted: false,
      id: { in: ['f1', 'f2'] },
    });
    // extractEntities 仅分析 fileName/summary/keyPoints/tags，textContent/fileType 均不参与
    // 实体提取（死字段），已从 select 移除以避免拉取无效字段。
    expect(arg.select).toMatchObject({
      fileName: true,
      summary: true,
      keyPoints: true,
      tags: true,
    });
    expect(arg.select).not.toHaveProperty('textContent');
    expect(arg.select).not.toHaveProperty('fileType');
  });

  it('extractGraphFromFiles 不依赖 fileType：行不含 fileType 字段仍正常提取实体', async () => {
    // 锁定 fileType 死字段移除的回归：返回行完全不带 fileType（模拟真实 select 后的查询结果），
    // 函数仍应正常构建图谱，证明其从不读取 file.fileType。
    mockFileFindMany.mockResolvedValue([
      { id: 'f1', fileName: 'f1.txt', summary: '【概念甲】', keyPoints: null, tags: null },
    ]);
    const graph = await extractGraphFromFiles(['f1'], 'u1', 't1');
    expect(graph.entities).toHaveLength(1);
    expect(graph.entities[0]).toMatchObject({ name: '概念甲', type: 'concept' });
  });
});
