/**
 * knowledge-base/knowledge-base-manager KnowledgeBaseManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/knowledge-base/knowledge-base-manager.ts。该模块为纯内存态的知识库
 * 管理器（知识库 / 条目 / 分类 / 标签 / 版本 5 个 Map），无任何运行时外部 import，可直接
 * 对单例做白盒断言。构造器私有，通过 getInstance() 取单例；每用例 beforeEach 重置 5 个私有
 * Map 以隔离状态。
 *
 * 关键控制流：
 * - getInstance() 单例；模块导出 knowledgeBaseManager 单例
 * - createKnowledgeBase：id=`kb_${ts}_${rand}`；默认 status='active' / itemCount=0 /
 *   categoryCount=0 / tagCount=0；settings 浅合并默认（allowComments/allowRating/requireReview/
 *   defaultTags/versioning/maxVersions）
 * - getKnowledgeBase：命中同引用；未命中 / 跨租户 → null（不校验 status，已删除仍可取）
 * - getKnowledgeBaseList：过滤 tenantId + status!=='deleted'；search 匹配 name/description
 *   （小写包含）；分页 page 默认 1 / pageSize 默认 20
 * - updateKnowledgeBase：Object.assign 合并 + updatedAt；未命中 / 跨租户 → null
 * - deleteKnowledgeBase：软删除 status='deleted' + updatedAt；未命中 / 跨租户 → false
 * - createItem：kb 未命中 / 跨租户 → null；id=`ki_${ts}_${rand}`；type 默认 article / status
 *   默认 draft；views/likes/bookmarks=0；wordCount=中文+英文词；readingTime=max(1,ceil(wc/300))；
 *   tags/attachments/relatedItems 默认 []；publishedAt 仅 published 时设；kb.itemCount++；
 *   versioning 开 → 创建版本 1
 * - getItem：命中；未命中 / 跨租户 → null
 * - getItemList：过滤 kb+tenant+status!=='archived'；categoryId/tags(every)/status 过滤；
 *   排序 Date/string/number；分页默认 page 1 / pageSize 20
 * - updateItem（本轮修复 1+2）：content!==undefined 重算 wordCount/readingTime（此前空串 '' 跳过）；
 *   Object.assign 后创建版本（此前在赋值前调用致新版本记录旧内容）；status→published 且无
 *   publishedAt 时设；未命中 / 跨租户 → null
 * - deleteItem：硬删除（Map.delete）；kb.itemCount--；未命中 / 跨租户 → false
 * - incrementViews / likeItem / unlikeItem：未命中 / 跨租户 → false；unlike 下界 0
 * - createCategory：kb 未命中 / 跨租户 → null；id=`kc_...`；sortOrder=0；kb.categoryCount++
 * - getCategoryList：过滤 + 按 sortOrder 升序
 * - getCategoryTree：递归 buildTree(parentId)；根为 parentId===undefined
 * - createTag：kb 未命中 / 跨租户 → null；id=`kt_...`；重名（大小写不敏感）返回既有不增 tagCount；
 *   kb.tagCount++
 * - getTagList：过滤；sortBy count(默认,降序) / name(升序)；limit 截断
 * - search（本轮修复 3）：仅 published；query 匹配 title/summary/content/tags；type/status/
 *   categoryId/tags/authorId/dateFrom/dateTo 过滤；排序此前缺 string 分支致 sortBy='title'
 *   失效（本轮补齐对齐 getItemList）；分页 + hasMore + totalPages
 * - getStats：全量条目（含 archived）；published/draft/archived 计数；thisWeek/thisMonth；
 *   totalViews/Likes/Bookmarks；topCategories/topTags/topAuthors；kb 未命中 / 跨租户 → null
 * - generateKnowledgeGraph：仅 published；item 节点 + tag 节点 + tag 边 + related 边（仅目标在
 *   nodeSet）；maxNodes 截断；density；kb 未命中 / 跨租户 → null
 * - getVersions：createItem 初始版本 1；updateItem 递增；按 version 降序；tenant 过滤
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KnowledgeBaseManager,
  knowledgeBaseManager,
} from '@/lib/knowledge-base/knowledge-base-manager';
import type {
  CreateKnowledgeBaseParams,
  CreateKnowledgeItemParams,
  UpdateKnowledgeItemParams,
} from '@/lib/knowledge-base/types';

// 固定时间，便于断言 id 中的 Date.now() 与 createdAt/updatedAt
const NOW = new Date('2026-01-15T08:00:00.000Z');
const NOW_TS = NOW.getTime();

// 复用 manager 实例（单例）
let manager: KnowledgeBaseManager;

function resetManager(): void {
  manager = KnowledgeBaseManager.getInstance();
  (manager as unknown as { knowledgeBases: Map<string, unknown> }).knowledgeBases =
    new Map();
  (manager as unknown as { items: Map<string, unknown> }).items = new Map();
  (manager as unknown as { categories: Map<string, unknown> }).categories =
    new Map();
  (manager as unknown as { tags: Map<string, unknown> }).tags = new Map();
  (manager as unknown as { versions: Map<string, unknown[]> }).versions =
    new Map();
}

// 工具：创建一个 kb 并返回其 id
function makeKb(
  tenantId = 't-a',
  ownerId = 'owner-1',
  overrides: Partial<CreateKnowledgeBaseParams> = {}
): string {
  const kb = manager.createKnowledgeBase(
    { name: '测试知识库', ...overrides },
    ownerId,
    tenantId
  );
  return kb.id;
}

// 工具：创建一个 published item（默认带内容）
function makeItem(
  knowledgeBaseId: string,
  tenantId = 't-a',
  authorId = 'author-1',
  overrides: Partial<CreateKnowledgeItemParams> = {}
): string {
  const item = manager.createItem(
    knowledgeBaseId,
    {
      title: '测试条目',
      content: '一段测试内容 hello world',
      status: 'published',
      ...overrides,
    },
    authorId,
    tenantId
  );
  if (!item) throw new Error('makeItem: createItem returned null');
  return item.id;
}

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== 单例与重置 ====================
  describe('单例与状态隔离', () => {
    it('getInstance 返回同一实例', () => {
      expect(KnowledgeBaseManager.getInstance()).toBe(
        KnowledgeBaseManager.getInstance()
      );
    });

    it('模块导出 knowledgeBaseManager 是单例', () => {
      expect(knowledgeBaseManager).toBe(KnowledgeBaseManager.getInstance());
    });

    it('beforeEach 重置后状态隔离（无残留条目）', () => {
      const kbId = makeKb();
      makeItem(kbId);
      expect(manager.getItemList(kbId, 't-a').total).toBe(1);
      resetManager();
      expect(manager.getItemList(kbId, 't-a').total).toBe(0);
    });
  });

  // ==================== 知识库管理 ====================
  describe('createKnowledgeBase', () => {
    it('创建成功返回含 id 的知识库', () => {
      const kb = manager.createKnowledgeBase(
        { name: 'KB1' },
        'owner-1',
        't-a'
      );
      expect(kb.id).toBeTruthy();
      expect(kb.name).toBe('KB1');
    });

    it('id 格式为 kb_${ts}_${rand9}', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
      const kb = manager.createKnowledgeBase(
        { name: 'KB' },
        'o',
        't'
      );
      const expectedRand = (0.123456789).toString(36).substr(2, 9);
      expect(kb.id).toBe(`kb_${NOW_TS}_${expectedRand}`);
      vi.restoreAllMocks();
    });

    it('默认 status=active / itemCount=0 / categoryCount=0 / tagCount=0', () => {
      const kb = manager.createKnowledgeBase(
        { name: 'KB' },
        'o',
        't'
      );
      expect(kb.status).toBe('active');
      expect(kb.itemCount).toBe(0);
      expect(kb.categoryCount).toBe(0);
      expect(kb.tagCount).toBe(0);
    });

    it('存储 ownerId / tenantId', () => {
      const kb = manager.createKnowledgeBase(
        { name: 'KB' },
        'owner-9',
        'tenant-9'
      );
      expect(kb.ownerId).toBe('owner-9');
      expect(kb.tenantId).toBe('tenant-9');
    });

    it('settings 浅合并默认值（未传字段用默认）', () => {
      const kb = manager.createKnowledgeBase(
        { name: 'KB', settings: { requireReview: true, maxVersions: 5 } },
        'o',
        't'
      );
      expect(kb.settings.requireReview).toBe(true);
      expect(kb.settings.maxVersions).toBe(5);
      expect(kb.settings.allowComments).toBe(true);
      expect(kb.settings.allowRating).toBe(true);
      expect(kb.settings.versioning).toBe(true);
      expect(kb.settings.defaultTags).toEqual([]);
    });

    it('透传 description / icon / coverImage', () => {
      const kb = manager.createKnowledgeBase(
        {
          name: 'KB',
          description: 'desc',
          icon: 'icon-x',
          coverImage: 'cover.png',
        },
        'o',
        't'
      );
      expect(kb.description).toBe('desc');
      expect(kb.icon).toBe('icon-x');
      expect(kb.coverImage).toBe('cover.png');
    });

    it('createdAt 与 updatedAt 均为当前时间', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't');
      expect(kb.createdAt).toEqual(NOW);
      expect(kb.updatedAt).toEqual(NOW);
    });

    it('写入注册表后可被 getKnowledgeBase 取回（同引用）', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't');
      expect(manager.getKnowledgeBase(kb.id, 't')).toBe(kb);
    });
  });

  describe('getKnowledgeBase', () => {
    it('命中返回同引用', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      expect(manager.getKnowledgeBase(kb.id, 't-a')).toBe(kb);
    });

    it('未命中返回 null', () => {
      expect(manager.getKnowledgeBase('nope', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      expect(manager.getKnowledgeBase(kb.id, 't-b')).toBeNull();
    });

    it('已删除（status=deleted）仍可被 getKnowledgeBase 取回（不校验 status）', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      manager.deleteKnowledgeBase(kb.id, 't-a');
      // getKnowledgeBase 不校验 status，软删除后仍返回
      expect(manager.getKnowledgeBase(kb.id, 't-a')).not.toBeNull();
      expect(manager.getKnowledgeBase(kb.id, 't-a')?.status).toBe('deleted');
    });
  });

  describe('getKnowledgeBaseList', () => {
    it('仅返回当前租户的知识库', () => {
      manager.createKnowledgeBase({ name: 'A' }, 'o', 't-a');
      manager.createKnowledgeBase({ name: 'B' }, 'o', 't-b');
      const list = manager.getKnowledgeBaseList('t-a');
      expect(list.total).toBe(1);
      expect(list.items[0].name).toBe('A');
    });

    it('排除 status=deleted', () => {
      const a = manager.createKnowledgeBase({ name: 'A' }, 'o', 't-a');
      manager.createKnowledgeBase({ name: 'B' }, 'o', 't-a');
      manager.deleteKnowledgeBase(a.id, 't-a');
      const list = manager.getKnowledgeBaseList('t-a');
      expect(list.total).toBe(1);
      expect(list.items[0].name).toBe('B');
    });

    it('search 匹配 name（小写包含）', () => {
      manager.createKnowledgeBase({ name: 'React Notes' }, 'o', 't-a');
      manager.createKnowledgeBase({ name: 'Vue Notes' }, 'o', 't-a');
      const list = manager.getKnowledgeBaseList('t-a', { search: 'react' });
      expect(list.total).toBe(1);
      expect(list.items[0].name).toBe('React Notes');
    });

    it('search 匹配 description', () => {
      manager.createKnowledgeBase(
        { name: 'KB', description: '关于图论的笔记' },
        'o',
        't-a'
      );
      const list = manager.getKnowledgeBaseList('t-a', { search: '图论' });
      expect(list.total).toBe(1);
    });

    it('search 大小写不敏感', () => {
      manager.createKnowledgeBase({ name: 'ReactNotes' }, 'o', 't-a');
      const list = manager.getKnowledgeBaseList('t-a', { search: 'REACTNOTES' });
      expect(list.total).toBe(1);
    });

    it('分页默认 page=1 / pageSize=20', () => {
      for (let i = 0; i < 25; i++) {
        manager.createKnowledgeBase({ name: `KB${i}` }, 'o', 't-a');
      }
      const list = manager.getKnowledgeBaseList('t-a');
      expect(list.items.length).toBe(20);
      expect(list.total).toBe(25);
    });

    it('自定义分页', () => {
      for (let i = 0; i < 10; i++) {
        manager.createKnowledgeBase({ name: `KB${i}` }, 'o', 't-a');
      }
      const list = manager.getKnowledgeBaseList('t-a', {
        page: 2,
        pageSize: 4,
      });
      expect(list.items.length).toBe(4);
      expect(list.items[0].name).toBe('KB4');
    });

    it('末页不足 pageSize 时返回剩余', () => {
      for (let i = 0; i < 7; i++) {
        manager.createKnowledgeBase({ name: `KB${i}` }, 'o', 't-a');
      }
      const list = manager.getKnowledgeBaseList('t-a', {
        page: 2,
        pageSize: 5,
      });
      expect(list.items.length).toBe(2);
    });
  });

  describe('updateKnowledgeBase', () => {
    it('合并字段并更新 updatedAt', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 10000));
      const updated = manager.updateKnowledgeBase(
        kb.id,
        { name: 'KB2', description: 'new' },
        't-a'
      );
      expect(updated?.name).toBe('KB2');
      expect(updated?.description).toBe('new');
      expect(updated?.updatedAt).toEqual(new Date(NOW_TS + 10000));
    });

    it('未命中返回 null', () => {
      expect(
        manager.updateKnowledgeBase('nope', { name: 'x' }, 't-a')
      ).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      expect(
        manager.updateKnowledgeBase(kb.id, { name: 'x' }, 't-b')
      ).toBeNull();
    });

    it('部分更新不影响其他字段', () => {
      const kb = manager.createKnowledgeBase(
        { name: 'KB', description: 'keep' },
        'o',
        't-a'
      );
      const updated = manager.updateKnowledgeBase(kb.id, { name: 'new' }, 't-a');
      expect(updated?.name).toBe('new');
      expect(updated?.description).toBe('keep');
    });
  });

  describe('deleteKnowledgeBase', () => {
    it('软删除：status=deleted 且 updatedAt 更新', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 5000));
      const ok = manager.deleteKnowledgeBase(kb.id, 't-a');
      expect(ok).toBe(true);
      const after = manager.getKnowledgeBase(kb.id, 't-a');
      expect(after?.status).toBe('deleted');
      expect(after?.updatedAt).toEqual(new Date(NOW_TS + 5000));
    });

    it('未命中返回 false', () => {
      expect(manager.deleteKnowledgeBase('nope', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      expect(manager.deleteKnowledgeBase(kb.id, 't-b')).toBe(false);
    });

    it('删除后从 getKnowledgeBaseList 消失', () => {
      const kb = manager.createKnowledgeBase({ name: 'KB' }, 'o', 't-a');
      expect(manager.getKnowledgeBaseList('t-a').total).toBe(1);
      manager.deleteKnowledgeBase(kb.id, 't-a');
      expect(manager.getKnowledgeBaseList('t-a').total).toBe(0);
    });
  });

  // ==================== 知识条目管理 ====================
  describe('createItem', () => {
    it('kb 未命中返回 null', () => {
      expect(
        manager.createItem('nope', { title: 'T', content: 'C' }, 'a', 't-a')
      ).toBeNull();
    });

    it('跨租户 kb 返回 null', () => {
      const kbId = makeKb('t-a');
      expect(
        manager.createItem(kbId, { title: 'T', content: 'C' }, 'a', 't-b')
      ).toBeNull();
    });

    it('创建成功返回含 id 的条目', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(item).not.toBeNull();
      expect(item!.id).toBeTruthy();
    });

    it('id 格式为 ki_${ts}_${rand9}', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.987654321);
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      const expectedRand = (0.987654321).toString(36).substr(2, 9);
      expect(item!.id).toBe(`ki_${NOW_TS}_${expectedRand}`);
      vi.restoreAllMocks();
    });

    it('默认 type=article / status=draft', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(item!.type).toBe('article');
      expect(item!.status).toBe('draft');
    });

    it('views/likes/bookmarks 初始为 0', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(item!.views).toBe(0);
      expect(item!.likes).toBe(0);
      expect(item!.bookmarks).toBe(0);
    });

    it('wordCount 计算中文+英文词（中文每字 1，英文每词 1）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '你好 world test' },
        'a',
        't-a'
      );
      // 中文 2 字 + 英文 2 词 = 4
      expect(item!.wordCount).toBe(4);
    });

    it('readingTime = max(1, ceil(wordCount/300))', () => {
      const kbId = makeKb();
      // 600 字 → 2 分钟
      const content = '字'.repeat(600);
      const item = manager.createItem(
        kbId,
        { title: 'T', content },
        'a',
        't-a'
      );
      expect(item!.readingTime).toBe(2);
    });

    it('wordCount=0 时 readingTime 仍为 1（下界）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '' },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(0);
      expect(item!.readingTime).toBe(1);
    });

    it('tags/attachments/relatedItems 默认空数组', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(item!.tags).toEqual([]);
      expect(item!.attachments).toEqual([]);
      expect(item!.relatedItems).toEqual([]);
    });

    it('publishedAt 仅在 status=published 时设置', () => {
      const kbId = makeKb();
      const draft = manager.createItem(
        kbId,
        { title: 'D', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      const pub = manager.createItem(
        kbId,
        { title: 'P', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      expect(draft!.publishedAt).toBeUndefined();
      expect(pub!.publishedAt).toEqual(NOW);
    });

    it('kb.itemCount 递增且 updatedAt 更新', () => {
      const kbId = makeKb();
      const kbBefore = manager.getKnowledgeBase(kbId, 't-a');
      const beforeTime = kbBefore!.updatedAt;
      vi.setSystemTime(new Date(NOW_TS + 3000));
      manager.createItem(kbId, { title: 'T', content: 'C' }, 'a', 't-a');
      const kbAfter = manager.getKnowledgeBase(kbId, 't-a');
      expect(kbAfter!.itemCount).toBe(1);
      expect(kbAfter!.updatedAt).toEqual(new Date(NOW_TS + 3000));
      expect(kbAfter!.updatedAt).not.toBe(beforeTime);
    });

    it('versioning 开启时创建初始版本 1', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].content).toBe('C');
      expect(versions[0].changeLog).toBe('初始版本');
    });

    it('versioning 关闭时不创建版本', () => {
      const kbId = manager.createKnowledgeBase(
        { name: 'KB', settings: { versioning: false } },
        'o',
        't-a'
      ).id;
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.getVersions(item!.id, 't-a').length).toBe(0);
    });

    it('透传 categoryId / coverImage / attachments / relatedItems', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        {
          title: 'T',
          content: 'C',
          categoryId: 'cat-1',
          coverImage: 'cov.png',
          attachments: ['a1', 'a2'],
          relatedItems: ['r1'],
          tags: ['t1', 't2'],
        },
        'a',
        't-a'
      );
      expect(item!.categoryId).toBe('cat-1');
      expect(item!.coverImage).toBe('cov.png');
      expect(item!.attachments).toEqual(['a1', 'a2']);
      expect(item!.relatedItems).toEqual(['r1']);
      expect(item!.tags).toEqual(['t1', 't2']);
    });
  });

  describe('getItem', () => {
    it('命中返回同引用', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.getItem(item!.id, 't-a')).toBe(item);
    });

    it('未命中返回 null', () => {
      expect(manager.getItem('nope', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.getItem(item!.id, 't-b')).toBeNull();
    });
  });

  describe('getItemList', () => {
    it('仅返回指定 kb + 租户的条目', () => {
      const kb1 = makeKb();
      const kb2 = manager.createKnowledgeBase(
        { name: 'KB2' },
        'o',
        't-a'
      ).id;
      makeItem(kb1, 't-a');
      makeItem(kb2, 't-a');
      expect(manager.getItemList(kb1, 't-a').total).toBe(1);
    });

    it('排除 archived 条目', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a');
      manager.createItem(
        kbId,
        { title: 'A', content: 'C', status: 'archived' },
        'a',
        't-a'
      );
      expect(manager.getItemList(kbId, 't-a').total).toBe(1);
    });

    it('categoryId 过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { categoryId: 'cat-1' });
      makeItem(kbId, 't-a', 'a', { categoryId: 'cat-2' });
      expect(
        manager.getItemList(kbId, 't-a', { categoryId: 'cat-1' }).total
      ).toBe(1);
    });

    it('tags 过滤（every：须包含全部）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { tags: ['a', 'b'] });
      makeItem(kbId, 't-a', 'a', { tags: ['a'] });
      expect(manager.getItemList(kbId, 't-a', { tags: ['a', 'b'] }).total).toBe(
        1
      );
    });

    it('status 过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { status: 'published' });
      manager.createItem(
        kbId,
        { title: 'D', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      expect(manager.getItemList(kbId, 't-a', { status: 'draft' }).total).toBe(
        1
      );
    });

    it('默认按 updatedAt desc 排序', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const i2 = makeItem(kbId, 't-a');
      const list = manager.getItemList(kbId, 't-a');
      expect(list.items[0].id).toBe(i2);
      expect(list.items[1].id).toBe(i1);
    });

    it('sortBy createdAt asc', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const i2 = makeItem(kbId, 't-a');
      const list = manager.getItemList(kbId, 't-a', {
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      expect(list.items[0].id).toBe(i1);
      expect(list.items[1].id).toBe(i2);
    });

    it('sortBy title（string 分支）asc', () => {
      const kbId = makeKb();
      manager.createItem(
        kbId,
        { title: 'Banana', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'Apple', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      const list = manager.getItemList(kbId, 't-a', {
        sortBy: 'title',
        sortOrder: 'asc',
      });
      expect(list.items[0].title).toBe('Apple');
      expect(list.items[1].title).toBe('Banana');
    });

    it('sortBy views（number 分支）desc', () => {
      const kbId = makeKb();
      const a = makeItem(kbId, 't-a');
      const b = makeItem(kbId, 't-a');
      manager.incrementViews(a, 't-a');
      manager.incrementViews(b, 't-a');
      manager.incrementViews(b, 't-a');
      const list = manager.getItemList(kbId, 't-a', {
        sortBy: 'views',
        sortOrder: 'desc',
      });
      expect(list.items[0].id).toBe(b);
      expect(list.items[1].id).toBe(a);
    });

    it('分页默认 page=1 / pageSize=20', () => {
      const kbId = makeKb();
      for (let i = 0; i < 25; i++) {
        makeItem(kbId, 't-a');
      }
      const list = manager.getItemList(kbId, 't-a');
      expect(list.items.length).toBe(20);
      expect(list.total).toBe(25);
    });

    it('自定义分页', () => {
      const kbId = makeKb();
      for (let i = 0; i < 6; i++) {
        makeItem(kbId, 't-a');
      }
      const list = manager.getItemList(kbId, 't-a', {
        page: 2,
        pageSize: 3,
      });
      expect(list.items.length).toBe(3);
    });

    it('空结果返回 total=0', () => {
      const kbId = makeKb();
      expect(manager.getItemList(kbId, 't-a').total).toBe(0);
    });

    it('跨租户返回空', () => {
      const kbId = makeKb('t-a');
      makeItem(kbId, 't-a');
      expect(manager.getItemList(kbId, 't-b').total).toBe(0);
    });
  });

  describe('updateItem', () => {
    it('content 更新后重新计算 wordCount/readingTime', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'a' },
        'a',
        't-a'
      );
      const updated = manager.updateItem(
        item!.id,
        { content: '字'.repeat(300) },
        'u',
        't-a'
      );
      expect(updated!.wordCount).toBe(300);
      expect(updated!.readingTime).toBe(1);
    });

    it('【修复点 2】content 设为空串时仍重算 wordCount（此前 if(content) 真值判断跳过空串）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '字'.repeat(100) },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(100);
      const updated = manager.updateItem(
        item!.id,
        { content: '' },
        'u',
        't-a'
      );
      // 空串 content：此前 if(updates.content) 为 false 跳过重算，wordCount 残留 100
      expect(updated!.wordCount).toBe(0);
      expect(updated!.readingTime).toBe(1);
    });

    it('【修复点 1】新版本记录更新后的内容（而非旧内容）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '原始内容' },
        'a',
        't-a'
      );
      // 初始版本 1 内容 = 原始内容
      expect(manager.getVersions(item!.id, 't-a')[0].content).toBe('原始内容');
      vi.setSystemTime(new Date(NOW_TS + 5000));
      manager.updateItem(
        item!.id,
        { content: '更新后内容', changeLog: 'v2 改动' },
        'u',
        't-a'
      );
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.length).toBe(2);
      // 最新版本（version 2，降序首位）应记录更新后的内容；此前记录的是旧内容（与版本 1 重复）
      expect(versions[0].version).toBe(2);
      expect(versions[0].content).toBe('更新后内容');
      expect(versions[0].changeLog).toBe('v2 改动');
      expect(versions[1].version).toBe(1);
      expect(versions[1].content).toBe('原始内容');
    });

    it('content 更新时版本号递增', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C1' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'C2' }, 'u', 't-a');
      manager.updateItem(item!.id, { content: 'C3' }, 'u', 't-a');
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.length).toBe(3);
      expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(versions[0].content).toBe('C3');
      expect(versions[1].content).toBe('C2');
      expect(versions[2].content).toBe('C1');
    });

    it('仅更新 title（无 content）不创建新版本', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { title: 'T2' }, 'u', 't-a');
      expect(manager.getVersions(item!.id, 't-a').length).toBe(1);
      expect(manager.getItem(item!.id, 't-a')!.title).toBe('T2');
    });

    it('versioning 关闭时不创建版本', () => {
      const kbId = manager.createKnowledgeBase(
        { name: 'KB', settings: { versioning: false } },
        'o',
        't-a'
      ).id;
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'C2' }, 'u', 't-a');
      expect(manager.getVersions(item!.id, 't-a').length).toBe(0);
    });

    it('changeLog 未传时默认"更新内容"', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'C2' }, 'u', 't-a');
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions[0].changeLog).toBe('更新内容');
    });

    it('status→published 首次设置 publishedAt', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      expect(item!.publishedAt).toBeUndefined();
      vi.setSystemTime(new Date(NOW_TS + 8000));
      const updated = manager.updateItem(
        item!.id,
        { status: 'published' },
        'u',
        't-a'
      );
      expect(updated!.publishedAt).toEqual(new Date(NOW_TS + 8000));
    });

    it('已发布的再次更新 status=published 不覆盖 publishedAt', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      const firstPub = item!.publishedAt;
      vi.setSystemTime(new Date(NOW_TS + 9000));
      manager.updateItem(item!.id, { status: 'published' }, 'u', 't-a');
      expect(manager.getItem(item!.id, 't-a')!.publishedAt).toEqual(firstPub);
    });

    it('tags 更新', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      const updated = manager.updateItem(
        item!.id,
        { tags: ['x', 'y'] },
        'u',
        't-a'
      );
      expect(updated!.tags).toEqual(['x', 'y']);
    });

    it('未命中返回 null', () => {
      expect(manager.updateItem('nope', { title: 'x' }, 'u', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(
        manager.updateItem(item!.id, { title: 'x' }, 'u', 't-b')
      ).toBeNull();
    });

    it('updated 与原对象同引用（就地修改）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      const updated = manager.updateItem(
        item!.id,
        { title: 'T2' },
        'u',
        't-a'
      );
      expect(updated).toBe(item);
    });
  });

  describe('deleteItem', () => {
    it('硬删除：从注册表移除', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.deleteItem(item!.id, 't-a')).toBe(true);
      expect(manager.getItem(item!.id, 't-a')).toBeNull();
    });

    it('kb.itemCount 递减', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      manager.deleteItem(item!.id, 't-a');
      expect(manager.getKnowledgeBase(kbId, 't-a')!.itemCount).toBe(0);
    });

    it('未命中返回 false', () => {
      expect(manager.deleteItem('nope', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.deleteItem(item!.id, 't-b')).toBe(false);
    });

    it('kb 不存在时仍能删除条目（kb 容错）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      // 模拟 kb 已被移除（极端路径）
      (manager as unknown as { knowledgeBases: Map<string, unknown> }).knowledgeBases.delete(
        kbId
      );
      expect(manager.deleteItem(item!.id, 't-a')).toBe(true);
    });
  });

  describe('incrementViews', () => {
    it('浏览量 +1', () => {
      const kbId = makeKb();
      const item = makeItem(kbId);
      expect(manager.incrementViews(item, 't-a')).toBe(true);
      expect(manager.getItem(item, 't-a')!.views).toBe(1);
    });

    it('未命中返回 false', () => {
      expect(manager.incrementViews('nope', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const kbId = makeKb();
      const item = makeItem(kbId, 't-a');
      expect(manager.incrementViews(item, 't-b')).toBe(false);
    });
  });

  describe('likeItem / unlikeItem', () => {
    it('点赞 +1', () => {
      const kbId = makeKb();
      const item = makeItem(kbId);
      manager.likeItem(item, 't-a');
      expect(manager.getItem(item, 't-a')!.likes).toBe(1);
    });

    it('取消点赞 -1', () => {
      const kbId = makeKb();
      const item = makeItem(kbId);
      manager.likeItem(item, 't-a');
      manager.likeItem(item, 't-a');
      manager.unlikeItem(item, 't-a');
      expect(manager.getItem(item, 't-a')!.likes).toBe(1);
    });

    it('取消点赞下界为 0（不出现负数）', () => {
      const kbId = makeKb();
      const item = makeItem(kbId);
      manager.unlikeItem(item, 't-a');
      expect(manager.getItem(item, 't-a')!.likes).toBe(0);
    });

    it('like 未命中 / 跨租户返回 false', () => {
      expect(manager.likeItem('nope', 't-a')).toBe(false);
      const kbId = makeKb();
      const item = makeItem(kbId, 't-a');
      expect(manager.likeItem(item, 't-b')).toBe(false);
    });

    it('unlike 未命中 / 跨租户返回 false', () => {
      expect(manager.unlikeItem('nope', 't-a')).toBe(false);
      const kbId = makeKb();
      const item = makeItem(kbId, 't-a');
      expect(manager.unlikeItem(item, 't-b')).toBe(false);
    });
  });

  // ==================== 分类管理 ====================
  describe('createCategory', () => {
    it('kb 未命中返回 null', () => {
      expect(manager.createCategory('nope', 'Cat', 't-a')).toBeNull();
    });

    it('跨租户 kb 返回 null', () => {
      const kbId = makeKb('t-a');
      expect(manager.createCategory(kbId, 'Cat', 't-b')).toBeNull();
    });

    it('创建成功含 id 且字段正确', () => {
      const kbId = makeKb();
      const cat = manager.createCategory(kbId, 'Cat', 't-a', {
        description: 'd',
        parentId: 'p1',
        icon: 'i',
        color: 'red',
      });
      expect(cat).not.toBeNull();
      expect(cat!.id).toMatch(/^kc_/);
      expect(cat!.name).toBe('Cat');
      expect(cat!.description).toBe('d');
      expect(cat!.parentId).toBe('p1');
      expect(cat!.icon).toBe('i');
      expect(cat!.color).toBe('red');
      expect(cat!.sortOrder).toBe(0);
      expect(cat!.itemCount).toBe(0);
      expect(cat!.tenantId).toBe('t-a');
      expect(cat!.knowledgeBaseId).toBe(kbId);
    });

    it('kb.categoryCount 递增且 updatedAt 更新', () => {
      const kbId = makeKb();
      vi.setSystemTime(new Date(NOW_TS + 2000));
      manager.createCategory(kbId, 'Cat', 't-a');
      const kb = manager.getKnowledgeBase(kbId, 't-a');
      expect(kb!.categoryCount).toBe(1);
      expect(kb!.updatedAt).toEqual(new Date(NOW_TS + 2000));
    });
  });

  describe('getCategoryList', () => {
    it('过滤 kb + 租户', () => {
      const kb1 = makeKb();
      const kb2 = manager.createKnowledgeBase(
        { name: 'KB2' },
        'o',
        't-a'
      ).id;
      manager.createCategory(kb1, 'A', 't-a');
      manager.createCategory(kb2, 'B', 't-a');
      expect(manager.getCategoryList(kb1, 't-a').length).toBe(1);
    });

    it('按 sortOrder 升序', () => {
      const kbId = makeKb();
      const c1 = manager.createCategory(kbId, 'B', 't-a');
      c1!.sortOrder = 2;
      const c2 = manager.createCategory(kbId, 'A', 't-a');
      c2!.sortOrder = 1;
      const list = manager.getCategoryList(kbId, 't-a');
      expect(list[0].name).toBe('A');
      expect(list[1].name).toBe('B');
    });

    it('跨租户排除', () => {
      const kbId = makeKb('t-a');
      manager.createCategory(kbId, 'A', 't-a');
      expect(manager.getCategoryList(kbId, 't-b').length).toBe(0);
    });

    it('空返回 []', () => {
      const kbId = makeKb();
      expect(manager.getCategoryList(kbId, 't-a')).toEqual([]);
    });
  });

  describe('getCategoryTree', () => {
    it('扁平分类（无 parentId 为根）', () => {
      const kbId = makeKb();
      manager.createCategory(kbId, 'A', 't-a');
      manager.createCategory(kbId, 'B', 't-a');
      const tree = manager.getCategoryTree(kbId, 't-a');
      expect(tree.length).toBe(2);
      expect(tree[0].children).toEqual([]);
    });

    it('嵌套分类树', () => {
      const kbId = makeKb();
      const parent = manager.createCategory(kbId, 'Parent', 't-a');
      manager.createCategory(kbId, 'Child', 't-a', {
        parentId: parent!.id,
      });
      const tree = manager.getCategoryTree(kbId, 't-a');
      expect(tree.length).toBe(1);
      expect(tree[0].name).toBe('Parent');
      expect(tree[0].children!.length).toBe(1);
      expect(tree[0].children![0].name).toBe('Child');
    });

    it('多层嵌套', () => {
      const kbId = makeKb();
      const root = manager.createCategory(kbId, 'Root', 't-a');
      const mid = manager.createCategory(kbId, 'Mid', 't-a', {
        parentId: root!.id,
      });
      manager.createCategory(kbId, 'Leaf', 't-a', {
        parentId: mid!.id,
      });
      const tree = manager.getCategoryTree(kbId, 't-a');
      expect(tree[0].children![0].children![0].name).toBe('Leaf');
    });

    it('跨租户排除', () => {
      const kbId = makeKb('t-a');
      manager.createCategory(kbId, 'A', 't-a');
      expect(manager.getCategoryTree(kbId, 't-b')).toEqual([]);
    });

    it('空返回 []', () => {
      const kbId = makeKb();
      expect(manager.getCategoryTree(kbId, 't-a')).toEqual([]);
    });
  });

  // ==================== 标签管理 ====================
  describe('createTag', () => {
    it('kb 未命中返回 null', () => {
      expect(manager.createTag('nope', 'Tag', 't-a')).toBeNull();
    });

    it('跨租户 kb 返回 null', () => {
      const kbId = makeKb('t-a');
      expect(manager.createTag(kbId, 'Tag', 't-b')).toBeNull();
    });

    it('创建成功含 id 且字段正确', () => {
      const kbId = makeKb();
      const tag = manager.createTag(kbId, 'React', 't-a', { color: 'blue' });
      expect(tag).not.toBeNull();
      expect(tag!.id).toMatch(/^kt_/);
      expect(tag!.name).toBe('React');
      expect(tag!.color).toBe('blue');
      expect(tag!.itemCount).toBe(0);
      expect(tag!.tenantId).toBe('t-a');
    });

    it('kb.tagCount 递增', () => {
      const kbId = makeKb();
      manager.createTag(kbId, 'A', 't-a');
      manager.createTag(kbId, 'B', 't-a');
      expect(manager.getKnowledgeBase(kbId, 't-a')!.tagCount).toBe(2);
    });

    it('重名（大小写不敏感）返回既有且不递增 tagCount', () => {
      const kbId = makeKb();
      const t1 = manager.createTag(kbId, 'React', 't-a');
      const t2 = manager.createTag(kbId, 'REACT', 't-a');
      expect(t2).toBe(t1);
      expect(manager.getKnowledgeBase(kbId, 't-a')!.tagCount).toBe(1);
    });
  });

  describe('getTagList', () => {
    it('过滤 kb + 租户', () => {
      const kb1 = makeKb();
      const kb2 = manager.createKnowledgeBase(
        { name: 'KB2' },
        'o',
        't-a'
      ).id;
      manager.createTag(kb1, 'A', 't-a');
      manager.createTag(kb2, 'B', 't-a');
      expect(manager.getTagList(kb1, 't-a').length).toBe(1);
    });

    it('默认 sortBy=count 降序', () => {
      const kbId = makeKb();
      const a = manager.createTag(kbId, 'A', 't-a');
      const b = manager.createTag(kbId, 'B', 't-a');
      a!.itemCount = 1;
      b!.itemCount = 5;
      const list = manager.getTagList(kbId, 't-a');
      expect(list[0].id).toBe(b!.id);
      expect(list[1].id).toBe(a!.id);
    });

    it('sortBy=name 升序', () => {
      const kbId = makeKb();
      manager.createTag(kbId, 'Banana', 't-a');
      manager.createTag(kbId, 'Apple', 't-a');
      const list = manager.getTagList(kbId, 't-a', { sortBy: 'name' });
      expect(list[0].name).toBe('Apple');
      expect(list[1].name).toBe('Banana');
    });

    it('limit 截断', () => {
      const kbId = makeKb();
      manager.createTag(kbId, 'A', 't-a');
      manager.createTag(kbId, 'B', 't-a');
      manager.createTag(kbId, 'C', 't-a');
      const list = manager.getTagList(kbId, 't-a', {
        sortBy: 'name',
        limit: 2,
      });
      expect(list.length).toBe(2);
    });

    it('跨租户排除', () => {
      const kbId = makeKb('t-a');
      manager.createTag(kbId, 'A', 't-a');
      expect(manager.getTagList(kbId, 't-b').length).toBe(0);
    });

    it('空返回 []', () => {
      const kbId = makeKb();
      expect(manager.getTagList(kbId, 't-a')).toEqual([]);
    });
  });

  // ==================== 搜索功能 ====================
  describe('search', () => {
    it('仅搜索 published 条目（draft/archived 排除）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { title: 'Pub' });
      manager.createItem(
        kbId,
        { title: 'Draft', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'Arch', content: 'C', status: 'archived' },
        'a',
        't-a'
      );
      const result = manager.search(kbId, {}, 't-a');
      expect(result.total).toBe(1);
      expect(result.items[0].title).toBe('Pub');
    });

    it('query 匹配 title', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { title: 'React Guide' });
      makeItem(kbId, 't-a', 'a', { title: 'Vue Guide' });
      expect(manager.search(kbId, { query: 'react' }, 't-a').total).toBe(1);
    });

    it('query 匹配 summary', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', {
        title: 'T',
        summary: '关于图论的介绍',
      });
      expect(manager.search(kbId, { query: '图论' }, 't-a').total).toBe(1);
    });

    it('query 匹配 content', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', {
        title: 'T',
        content: 'deep content here',
      });
      expect(manager.search(kbId, { query: 'deep' }, 't-a').total).toBe(1);
    });

    it('query 匹配 tags', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { tags: ['typescript'] });
      expect(
        manager.search(kbId, { query: 'typescript' }, 't-a').total
      ).toBe(1);
    });

    it('query 大小写不敏感', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { title: 'ReactGuide' });
      expect(manager.search(kbId, { query: 'REACTGUIDE' }, 't-a').total).toBe(
        1
      );
    });

    it('type 过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { type: 'article' });
      makeItem(kbId, 't-a', 'a', { type: 'note' });
      expect(
        manager.search(kbId, { type: 'note' }, 't-a').total
      ).toBe(1);
    });

    it('status 过滤为非 published 时返回空（搜索池仅 published）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a');
      manager.createItem(
        kbId,
        { title: 'D', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      // 搜索池已限定 published，再过滤 status=draft 必为空
      expect(
        manager.search(kbId, { status: 'draft' }, 't-a').total
      ).toBe(0);
    });

    it('status 过滤为 published 时等价于无过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a');
      makeItem(kbId, 't-a', 'a');
      expect(
        manager.search(kbId, { status: 'published' }, 't-a').total
      ).toBe(2);
    });

    it('categoryId 过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { categoryId: 'c1' });
      makeItem(kbId, 't-a', 'a', { categoryId: 'c2' });
      expect(
        manager.search(kbId, { categoryId: 'c1' }, 't-a').total
      ).toBe(1);
    });

    it('tags 过滤（every）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { tags: ['a', 'b'] });
      makeItem(kbId, 't-a', 'a', { tags: ['a'] });
      expect(
        manager.search(kbId, { tags: ['a', 'b'] }, 't-a').total
      ).toBe(1);
    });

    it('authorId 过滤', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'author-1');
      makeItem(kbId, 't-a', 'author-2');
      expect(
        manager.search(kbId, { authorId: 'author-1' }, 't-a').total
      ).toBe(1);
    });

    it('dateFrom 过滤（createdAt >= dateFrom）', () => {
      const kbId = makeKb();
      const old = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 100000));
      makeItem(kbId, 't-a');
      const from = new Date(NOW_TS + 50000);
      const result = manager.search(kbId, { dateFrom: from }, 't-a');
      expect(result.total).toBe(1);
      expect(result.items[0].id).not.toBe(old);
    });

    it('dateTo 过滤（createdAt <= dateTo）', () => {
      const kbId = makeKb();
      const old = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 100000));
      makeItem(kbId, 't-a');
      const to = new Date(NOW_TS + 50000);
      const result = manager.search(kbId, { dateTo: to }, 't-a');
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe(old);
    });

    it('默认 sortBy=updatedAt desc', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const i2 = makeItem(kbId, 't-a');
      const result = manager.search(kbId, {}, 't-a');
      expect(result.items[0].id).toBe(i2);
      expect(result.items[1].id).toBe(i1);
    });

    it('sortBy createdAt asc', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const i2 = makeItem(kbId, 't-a');
      const result = manager.search(
        kbId,
        { sortBy: 'createdAt', sortOrder: 'asc' },
        't-a'
      );
      expect(result.items[0].id).toBe(i1);
      expect(result.items[1].id).toBe(i2);
    });

    it('sortBy views desc（number 分支）', () => {
      const kbId = makeKb();
      const a = makeItem(kbId, 't-a');
      const b = makeItem(kbId, 't-a');
      manager.incrementViews(b, 't-a');
      manager.incrementViews(b, 't-a');
      const result = manager.search(
        kbId,
        { sortBy: 'views', sortOrder: 'desc' },
        't-a'
      );
      expect(result.items[0].id).toBe(b);
      expect(result.items[1].id).toBe(a);
    });

    it('【修复点 3】sortBy title asc（string 分支，此前缺失致返回 0 不排序）', () => {
      const kbId = makeKb();
      manager.createItem(
        kbId,
        { title: 'Banana', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'Apple', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'Cherry', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      const result = manager.search(
        kbId,
        { sortBy: 'title', sortOrder: 'asc' },
        't-a'
      );
      expect(result.items.map((i) => i.title)).toEqual([
        'Apple',
        'Banana',
        'Cherry',
      ]);
    });

    it('【修复点 3】sortBy title desc', () => {
      const kbId = makeKb();
      manager.createItem(
        kbId,
        { title: 'Banana', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'Apple', content: 'C', status: 'published' },
        'a',
        't-a'
      );
      const result = manager.search(
        kbId,
        { sortBy: 'title', sortOrder: 'desc' },
        't-a'
      );
      expect(result.items.map((i) => i.title)).toEqual([
        'Banana',
        'Apple',
      ]);
    });

    it('分页 + totalPages + hasMore', () => {
      const kbId = makeKb();
      for (let i = 0; i < 25; i++) {
        makeItem(kbId, 't-a');
      }
      const result = manager.search(
        kbId,
        { page: 1, pageSize: 10 },
        't-a'
      );
      expect(result.items.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.hasMore).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('末页 hasMore=false', () => {
      const kbId = makeKb();
      for (let i = 0; i < 15; i++) {
        makeItem(kbId, 't-a');
      }
      const result = manager.search(
        kbId,
        { page: 2, pageSize: 10 },
        't-a'
      );
      expect(result.items.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('空结果返回零值元数据', () => {
      const kbId = makeKb();
      const result = manager.search(kbId, {}, 't-a');
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('跨租户排除', () => {
      const kbId = makeKb('t-a');
      makeItem(kbId, 't-a');
      expect(manager.search(kbId, {}, 't-b').total).toBe(0);
    });
  });

  // ==================== 统计功能 ====================
  describe('getStats', () => {
    it('kb 未命中返回 null', () => {
      expect(manager.getStats('nope', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kbId = makeKb('t-a');
      expect(manager.getStats(kbId, 't-b')).toBeNull();
    });

    it('totalItems 含全量条目（含 archived/draft）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { status: 'published' });
      manager.createItem(
        kbId,
        { title: 'D', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      manager.createItem(
        kbId,
        { title: 'A', content: 'C', status: 'archived' },
        'a',
        't-a'
      );
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.totalItems).toBe(3);
      expect(stats!.publishedItems).toBe(1);
      expect(stats!.draftItems).toBe(1);
      expect(stats!.archivedItems).toBe(1);
    });

    it('totalCategories / totalTags 取自 kb 计数', () => {
      const kbId = makeKb();
      manager.createCategory(kbId, 'C', 't-a');
      manager.createTag(kbId, 'T', 't-a');
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.totalCategories).toBe(1);
      expect(stats!.totalTags).toBe(1);
    });

    it('totalViews / totalLikes / totalBookmarks 求和', () => {
      const kbId = makeKb();
      const a = makeItem(kbId, 't-a');
      const b = makeItem(kbId, 't-a');
      manager.incrementViews(a, 't-a');
      manager.incrementViews(b, 't-a');
      manager.incrementViews(b, 't-a');
      manager.likeItem(a, 't-a');
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.totalViews).toBe(3);
      expect(stats!.totalLikes).toBe(1);
      expect(stats!.totalBookmarks).toBe(0);
    });

    it('thisWeekNew / thisMonthNew', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a'); // createdAt = NOW
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.thisWeekNew).toBe(1);
      expect(stats!.thisMonthNew).toBe(1);
    });

    it('topCategories 按条目数降序取前 5', () => {
      const kbId = makeKb();
      const cat = manager.createCategory(kbId, 'Cat', 't-a');
      makeItem(kbId, 't-a', 'a', { categoryId: cat!.id });
      makeItem(kbId, 't-a', 'a', { categoryId: cat!.id });
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.topCategories.length).toBe(1);
      expect(stats!.topCategories[0]).toEqual({
        id: cat!.id,
        name: 'Cat',
        count: 2,
      });
    });

    it('topCategories 中分类不存在时 name 为"未知"', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { categoryId: 'ghost-cat' });
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.topCategories[0].name).toBe('未知');
    });

    it('topTags 按出现次数降序取前 10', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { tags: ['a', 'b'] });
      makeItem(kbId, 't-a', 'a', { tags: ['a'] });
      const stats = manager.getStats(kbId, 't-a');
      const aTag = stats!.topTags.find((t) => t.name === 'a');
      const bTag = stats!.topTags.find((t) => t.name === 'b');
      expect(aTag!.count).toBe(2);
      expect(bTag!.count).toBe(1);
    });

    it('topAuthors 按条目数降序取前 5', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'author-1');
      makeItem(kbId, 't-a', 'author-1');
      makeItem(kbId, 't-a', 'author-2');
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.topAuthors[0]).toEqual({
        id: 'author-1',
        name: 'author-1',
        count: 2,
      });
    });

    it('空知识库返回零值统计', () => {
      const kbId = makeKb();
      const stats = manager.getStats(kbId, 't-a');
      expect(stats!.totalItems).toBe(0);
      expect(stats!.totalViews).toBe(0);
      expect(stats!.topCategories).toEqual([]);
      expect(stats!.topTags).toEqual([]);
      expect(stats!.topAuthors).toEqual([]);
    });
  });

  // ==================== 知识图谱 ====================
  describe('generateKnowledgeGraph', () => {
    it('kb 未命中返回 null', () => {
      expect(manager.generateKnowledgeGraph('nope', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const kbId = makeKb('t-a');
      expect(manager.generateKnowledgeGraph(kbId, 't-b')).toBeNull();
    });

    it('生成 item 节点（仅 published）', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { title: 'Item1' });
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      const itemNodes = graph!.nodes.filter((n) => n.type === 'item');
      expect(itemNodes.length).toBe(1);
      expect(itemNodes[0].label).toBe('Item1');
      expect(itemNodes[0].size).toBeGreaterThanOrEqual(20);
    });

    it('draft 条目不生成节点', () => {
      const kbId = makeKb();
      manager.createItem(
        kbId,
        { title: 'D', content: 'C', status: 'draft' },
        'a',
        't-a'
      );
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      expect(graph!.nodes.length).toBe(0);
    });

    it('tag 节点与 item-tag 边', () => {
      const kbId = makeKb();
      makeItem(kbId, 't-a', 'a', { tags: ['react'] });
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      const tagNodes = graph!.nodes.filter((n) => n.type === 'tag');
      expect(tagNodes.length).toBe(1);
      expect(tagNodes[0].id).toBe('tag_react');
      const tagEdges = graph!.edges.filter((e) => e.type === 'tag');
      expect(tagEdges.length).toBe(1);
    });

    it('related 边仅当目标 item 也在节点集中', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a', 'a');
      const i2 = makeItem(kbId, 't-a', 'a');
      // i1 relatedItems 指向 i2（在节点集中）
      manager.updateItem(i1, { relatedItems: [i2] }, 'u', 't-a');
      // i2 relatedItems 指向不存在的 id（不在节点集中）
      manager.updateItem(
        i2,
        { relatedItems: ['non-existent'] },
        'u',
        't-a'
      );
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      const relatedEdges = graph!.edges.filter((e) => e.type === 'related');
      expect(relatedEdges.length).toBe(1);
      expect(relatedEdges[0].source).toBe(i1);
      expect(relatedEdges[0].target).toBe(i2);
    });

    it('maxNodes 限制 item 节点数', () => {
      const kbId = makeKb();
      for (let i = 0; i < 5; i++) {
        makeItem(kbId, 't-a', 'a');
      }
      const graph = manager.generateKnowledgeGraph(kbId, 't-a', {
        maxNodes: 2,
      });
      const itemNodes = graph!.nodes.filter((n) => n.type === 'item');
      expect(itemNodes.length).toBe(2);
    });

    it('density 计算（nodes>1）', () => {
      const kbId = makeKb();
      const i1 = makeItem(kbId, 't-a', 'a', { tags: ['t'] });
      const i2 = makeItem(kbId, 't-a', 'a', { tags: ['t'] });
      manager.updateItem(i1, { relatedItems: [i2] }, 'u', 't-a');
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      expect(graph!.stats.nodeCount).toBeGreaterThan(1);
      expect(graph!.stats.density).toBeGreaterThan(0);
      // density = 2*edges / (nodes*(nodes-1))
      const expected =
        (2 * graph!.stats.edgeCount) /
        (graph!.stats.nodeCount * (graph!.stats.nodeCount - 1));
      expect(graph!.stats.density).toBeCloseTo(expected, 6);
    });

    it('空知识库 density=0', () => {
      const kbId = makeKb();
      const graph = manager.generateKnowledgeGraph(kbId, 't-a');
      expect(graph!.nodes).toEqual([]);
      expect(graph!.edges).toEqual([]);
      expect(graph!.stats.density).toBe(0);
    });
  });

  // ==================== 版本管理 ====================
  describe('getVersions', () => {
    it('createItem 创建初始版本 1', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C', summary: 'S' },
        'a',
        't-a'
      );
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].title).toBe('T');
      expect(versions[0].content).toBe('C');
      expect(versions[0].summary).toBe('S');
      expect(versions[0].createdBy).toBe('a');
      expect(versions[0].changeLog).toBe('初始版本');
      expect(versions[0].tenantId).toBe('t-a');
      expect(versions[0].id).toMatch(/^kv_/);
    });

    it('updateItem 递增版本号', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C1' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'C2' }, 'u', 't-a');
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.length).toBe(2);
    });

    it('按 version 降序', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C1' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'C2' }, 'u', 't-a');
      manager.updateItem(item!.id, { content: 'C3' }, 'u', 't-a');
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    });

    it('版本内容随更新推进（最新版本 = 最新内容）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'V1' },
        'a',
        't-a'
      );
      manager.updateItem(item!.id, { content: 'V2' }, 'u', 't-a');
      manager.updateItem(item!.id, { content: 'V3' }, 'u', 't-a');
      const versions = manager.getVersions(item!.id, 't-a');
      expect(versions[0].content).toBe('V3');
      expect(versions[1].content).toBe('V2');
      expect(versions[2].content).toBe('V1');
    });

    it('tenant 过滤（跨租户返回空）', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'C' },
        'a',
        't-a'
      );
      expect(manager.getVersions(item!.id, 't-b')).toEqual([]);
    });

    it('无版本时返回空数组', () => {
      expect(manager.getVersions('nope', 't-a')).toEqual([]);
    });
  });

  // ==================== 工具函数（间接测） ====================
  describe('calculateWordCount（间接）', () => {
    it('纯中文按字计数', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '你好世界' },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(4);
    });

    it('纯英文按词计数', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: 'hello world foo' },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(3);
    });

    it('中英混合', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '你好 hello 世界 world' },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(6);
    });

    it('空字符串返回 0', () => {
      const kbId = makeKb();
      const item = manager.createItem(
        kbId,
        { title: 'T', content: '' },
        'a',
        't-a'
      );
      expect(item!.wordCount).toBe(0);
    });
  });
});
