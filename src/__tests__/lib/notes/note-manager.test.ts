/**
 * notes/note-manager NoteManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/notes/note-manager.ts。该模块为纯内存态的笔记管理器单例（笔记本 /
 * 笔记 / 标签 / 版本 4 个 Map），无任何运行时外部 import，可直接对实例做白盒断言。
 *
 * 关键控制流：
 * - 单例：private constructor + static getInstance；模块导出 noteManager = getInstance()
 * - 笔记本 CRUD：tenantId + userId 双重隔离（未命中 / 跨租户 → null/false）；
 *   createNotebook 默认值（noteCount=0 / sortOrder=0 / isDefault=false / isFavorite=false）；
 *   getNotebookList 按 sortBy（默认 updatedAt）+ sortOrder（默认 desc）排序，支持 Date/string/number；
 *   updateNotebook 浅合并（Object.assign(notebook, updates, { updatedAt })，updatedAt 永远覆盖；
 *   id/tenantId 可被 updates 覆写——实际行为，记录而非断言"保留"）；
 *   deleteNotebook 将所属笔记 notebookId 置 undefined 后删除笔记本
 * - 笔记 CRUD：
 *   · createNote id=`note_${ts}_${rand}`；calculateWordCount = 中文字符数 + 英文单词数；
 *     readingTime = max(1, ceil(wordCount/300))；默认 format=markdown / status=active / tags=[] /
 *     isFavorite=false / isPinned=false / attachments=[] / relatedNotes=[]；
 *     若 notebookId 命中且属主匹配 → notebook.noteCount++ + updatedAt 刷新；
 *     随后 createVersion(note, 1, userId, '初始版本') 写入版本 1
 *   · getNote 命中时同引用突变 lastAccessedAt = new Date()
 *   · getNoteList 预过滤 status !== 'deleted'；支持 notebookId / tags(every) / status /
 *     isFavorite / isPinned 过滤；排序时置顶优先（isPinned 不同时 a.isPinned?-1:1，忽略 sortOrder），
 *     再按 sortBy + sortOrder（Date/string/number 三分支）；分页 page 默认 1 / pageSize 默认 20
 *   · updateNote（本轮修复重点）：原实现 createVersion 在 Object.assign 之前调用，
 *     致使版本 N 快照记录的是更新前的旧内容（版本历史永远捕获不到更新内容）。
 *     修复后 createVersion 移至 Object.assign 之后，版本 N 记录更新后的新内容。
 *     content 为 truthy 时重算 wordCount/readingTime；content 为 '' 时 falsy 不重算但仍建版本；
 *     notebookId 变更时旧笔记本 noteCount--（max 0）/ 新笔记本 noteCount++
 *   · deleteNote 软删除（status='deleted'）+ 笔记本 noteCount--（max 0），不建版本
 *   · permanentlyDeleteNote 从 notes/versions Map 物理删除；活跃笔记 -- 笔记本计数，
 *     已软删除笔记不重复 --（避免与 deleteNote 双重递减）
 *   · restoreNote 置 status='active' + 回补笔记本 noteCount++（与 deleteNote -- 对称）
 * - 标签管理：createTag 按 name 小写 + userId + tenantId 去重（命中返回已存在项）；
 *   noteCount 恒为 0（全模块无递增点）；getTagList sortBy 'count'(默认，全 0 稳定)/'name'(localeCompare)，limit 截断
 * - 搜索：仅查 status === 'active'（archived/deleted 均排除）；query 小写匹配 title/summary/content/tags(any)；
 *   tags 用 every（须全含）；dateFrom/dateTo 基于 createdAt；排序 Date/string/number 三分支
 * - 统计：notes 过滤含全状态（含 deleted，记录实际行为）；thisWeekNew/monthAgo 基于 createdAt 与 now 比较；
 *   topNotebooks 按 noteCount desc 取前 5；topTags 按 noteCount desc 取前 10
 * - 版本：getVersions 按 version desc；版本 N 快照捕获更新后内容（本轮修复验证）
 * - 导入导出：exportNote 内部调 getNote（副作用 lastAccessedAt 突变）；markdown/json/html 三格式；
 *   pdf 与未知 format 返回 null；未命中返回 null
 * - 工具：calculateWordCount（private，经 createNote 间接覆盖）= 中文字符 + 英文单词
 *
 * 状态策略：NoteManager 构造器私有无法 new；每个用例前 vi.resetModules() + await import 取全新单例
 * （fresh class → fresh instance → fresh notes/notebooks/tags/versions Maps）。依赖 Date.now() 的
 * id/时间戳断言用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；Math.random 在精确 id
 * 断言用例中 spy 固定返回值，期望后缀用同一表达式计算保证匹配。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Notebook,
  Note,
  NoteTag,
  NoteVersion,
  CreateNotebookParams,
  CreateNoteParams,
  UpdateNoteParams,
  NoteSearchParams,
  NoteExportFormat,
} from '@/lib/notes/types';

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

let NoteManager: typeof import('@/lib/notes/note-manager')['NoteManager'];
let noteManager: import('@/lib/notes/note-manager')['NoteManager'];

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@/lib/notes/note-manager');
  NoteManager = mod.NoteManager;
  noteManager = mod.noteManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('notes/note-manager NoteManager', () => {
  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('noteManager 为 NoteManager 实例', () => {
      expect(noteManager).toBeInstanceOf(NoteManager);
    });

    it('getInstance 多次返回同一实例（单例）', () => {
      expect(NoteManager.getInstance()).toBe(noteManager);
      expect(NoteManager.getInstance()).toBe(NoteManager.getInstance());
    });

    it('resetModules 后 noteManager 为全新实例（状态隔离）', async () => {
      noteManager.createNote({ title: 'before-reset', content: 'c' }, 'u-a', 't-a');
      vi.resetModules();
      const mod2 = await import('@/lib/notes/note-manager');
      expect(mod2.noteManager).not.toBe(noteManager);
      expect(mod2.noteManager.getNoteList('u-a', 't-a').total).toBe(0);
    });
  });

  // ─── 笔记本管理 ─────────────────────────────────────────

  describe('createNotebook', () => {
    it('id 形如 nb_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.123456789;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const nb = noteManager.createNotebook({ name: 'nb1' }, 'u-a', 't-a');
      expect(nb.id).toBe(`nb_${NOW_TS}_${expectedSuffix}`);
      expect(nb.name).toBe('nb1');
      expect(nb.description).toBeUndefined();
      expect(nb.icon).toBeUndefined();
      expect(nb.color).toBeUndefined();
      expect(nb.coverImage).toBeUndefined();
      expect(nb.noteCount).toBe(0);
      expect(nb.sortOrder).toBe(0);
      expect(nb.isDefault).toBe(false);
      expect(nb.isFavorite).toBe(false);
      expect(nb.tenantId).toBe('t-a');
      expect(nb.userId).toBe('u-a');
      expect(nb.createdAt).toEqual(NOW);
      expect(nb.updatedAt).toEqual(NOW);
    });

    it('params 透传覆盖默认值', () => {
      const nb = noteManager.createNotebook(
        { name: 'N', description: 'd', icon: '📝', color: '#f00', coverImage: 'img' },
        'u-a', 't-a'
      );
      expect(nb).toMatchObject({
        name: 'N', description: 'd', icon: '📝', color: '#f00', coverImage: 'img',
      });
    });
  });

  describe('getNotebook', () => {
    it('命中返回笔记本，未命中返回 null', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      expect(noteManager.getNotebook(nb.id, 'u-a', 't-a')).toBe(nb);
      expect(noteManager.getNotebook('nope', 'u-a', 't-a')).toBeNull();
    });

    it('跨租户 / 跨用户访问返回 null（即使 id 存在）', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      expect(noteManager.getNotebook(nb.id, 'u-b', 't-a')).toBeNull();
      expect(noteManager.getNotebook(nb.id, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('getNotebookList', () => {
    it('按 userId + tenantId 过滤（跨租户/跨用户隔离）', () => {
      noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      noteManager.createNotebook({ name: 'b' }, 'u-b', 't-a');
      noteManager.createNotebook({ name: 'c' }, 'u-a', 't-b');
      expect(noteManager.getNotebookList('u-a', 't-a').map(n => n.name)).toEqual(['a']);
      expect(noteManager.getNotebookList('u-a', 't-b').map(n => n.name)).toEqual(['c']);
      expect(noteManager.getNotebookList('u-b', 't-a').map(n => n.name)).toEqual(['b']);
      expect(noteManager.getNotebookList('u-x', 't-x')).toHaveLength(0);
    });

    it('默认按 updatedAt 降序', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      noteManager.createNotebook({ name: 'a' }, 'u', 't');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      noteManager.createNotebook({ name: 'b' }, 'u', 't');
      vi.setSystemTime(new Date(NOW_TS + 2000));
      noteManager.createNotebook({ name: 'c' }, 'u', 't');
      expect(noteManager.getNotebookList('u', 't').map(n => n.name)).toEqual(['c', 'b', 'a']);
    });

    it('sortBy=updatedAt + sortOrder=asc 升序', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      noteManager.createNotebook({ name: 'a' }, 'u', 't');
      vi.setSystemTime(new Date(NOW_TS + 1000));
      noteManager.createNotebook({ name: 'b' }, 'u', 't');
      const list = noteManager.getNotebookList('u', 't', { sortBy: 'updatedAt', sortOrder: 'asc' });
      expect(list.map(n => n.name)).toEqual(['a', 'b']);
    });

    it('sortBy=name 走 string 分支（localeCompare），sortOrder=desc 降序', () => {
      noteManager.createNotebook({ name: 'banana' }, 'u', 't');
      noteManager.createNotebook({ name: 'apple' }, 'u', 't');
      noteManager.createNotebook({ name: 'cherry' }, 'u', 't');
      const desc = noteManager.getNotebookList('u', 't', { sortBy: 'name', sortOrder: 'desc' });
      expect(desc.map(n => n.name)).toEqual(['cherry', 'banana', 'apple']);
      const asc = noteManager.getNotebookList('u', 't', { sortBy: 'name', sortOrder: 'asc' });
      expect(asc.map(n => n.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('sortBy=noteCount 走 number 分支', () => {
      // 通过 createNote 累加 noteCount
      const nb1 = noteManager.createNotebook({ name: 'a' }, 'u', 't');
      const nb2 = noteManager.createNotebook({ name: 'b' }, 'u', 't');
      noteManager.createNote({ title: 'n1', content: 'c', notebookId: nb1.id }, 'u', 't');
      noteManager.createNote({ title: 'n2', content: 'c', notebookId: nb1.id }, 'u', 't');
      noteManager.createNote({ title: 'n3', content: 'c', notebookId: nb2.id }, 'u', 't');
      const asc = noteManager.getNotebookList('u', 't', { sortBy: 'noteCount', sortOrder: 'asc' });
      // noteCount: nb1=2, nb2=1 → asc [b(1), a(2)]
      expect(asc.map(n => n.name)).toEqual(['b', 'a']);
    });

    it('sortBy 为 Date/number/string 之外的类型 → 比较返回 0（保持插入序）', () => {
      noteManager.createNotebook({ name: 'first' }, 'u', 't');
      noteManager.createNotebook({ name: 'second' }, 'u', 't');
      // sortBy='isDefault'（boolean）→ 三个分支都不命中 → 返回 0
      const list = noteManager.getNotebookList('u', 't', { sortBy: 'isDefault' });
      expect(list.map(n => n.name)).toEqual(['first', 'second']);
    });
  });

  describe('updateNotebook', () => {
    it('命中：浅合并 + updatedAt 刷新', () => {
      const nb = noteManager.createNotebook({ name: 'old', icon: 'i' }, 'u-a', 't-a');
      const before = nb.updatedAt;
      const upd = noteManager.updateNotebook(nb.id, { name: 'new', color: '#000' }, 'u-a', 't-a');
      expect(upd).not.toBeNull();
      expect(upd!.name).toBe('new');
      expect(upd!.color).toBe('#000');
      expect(upd!.icon).toBe('i'); // 未传字段保留
      expect(upd!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('即便 updates 带 id/tenantId/userId 也会被 Object.assign 覆写（实际行为，非保留）', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      const upd = noteManager.updateNotebook(
        nb.id,
        { id: 'forged', tenantId: 'forged', userId: 'forged', name: 'b' } as Partial<Notebook>,
        'u-a', 't-a'
      );
      // Object.assign(notebook, updates, { updatedAt }) — updates 在 updatedAt 之前，
      // 故 updates.id/tenantId/userId 覆写原值（与 bi-manager 的"强制保留"不同）
      expect(upd!.id).toBe('forged');
      expect(upd!.tenantId).toBe('forged');
      expect(upd!.userId).toBe('forged');
    });

    it('未命中 / 跨租户 / 跨用户返回 null', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      expect(noteManager.updateNotebook('nope', { name: 'b' }, 'u-a', 't-a')).toBeNull();
      expect(noteManager.updateNotebook(nb.id, { name: 'b' }, 'u-b', 't-a')).toBeNull();
      expect(noteManager.updateNotebook(nb.id, { name: 'b' }, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('deleteNotebook', () => {
    it('命中删除返回 true，再次 getNotebook 返回 null', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      expect(noteManager.deleteNotebook(nb.id, 'u-a', 't-a')).toBe(true);
      expect(noteManager.getNotebook(nb.id, 'u-a', 't-a')).toBeNull();
    });

    it('未命中 / 跨租户返回 false（不删除他人笔记本）', () => {
      const nb = noteManager.createNotebook({ name: 'a' }, 'u-a', 't-a');
      expect(noteManager.deleteNotebook(nb.id, 'u-b', 't-a')).toBe(false);
      expect(noteManager.deleteNotebook(nb.id, 'u-a', 't-b')).toBe(false);
      expect(noteManager.deleteNotebook('nope', 'u-a', 't-a')).toBe(false);
      expect(noteManager.getNotebook(nb.id, 'u-a', 't-a')).not.toBeNull();
    });

    it('删除笔记本时将其下属笔记的 notebookId 置 undefined', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(note.notebookId).toBe(nb.id);
      noteManager.deleteNotebook(nb.id, 'u-a', 't-a');
      // 笔记仍在，但 notebookId 被置 undefined
      const after = noteManager.getNote(note.id, 'u-a', 't-a');
      expect(after).not.toBeNull();
      expect(after!.notebookId).toBeUndefined();
    });
  });

  // ─── 笔记管理 ───────────────────────────────────────────

  describe('createNote - id / 默认值 / 字数计算', () => {
    it('id 形如 note_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.456789123;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const note = noteManager.createNote({ title: 't', content: 'hello world' }, 'u-a', 't-a');
      expect(note.id).toBe(`note_${NOW_TS}_${expectedSuffix}`);
      expect(note.title).toBe('t');
      expect(note.content).toBe('hello world');
      expect(note.format).toBe('markdown');
      expect(note.status).toBe('active');
      expect(note.notebookId).toBeUndefined();
      expect(note.tags).toEqual([]);
      expect(note.wordCount).toBe(2); // 2 english words
      expect(note.readingTime).toBe(1); // max(1, ceil(2/300)) = 1
      expect(note.isFavorite).toBe(false);
      expect(note.isPinned).toBe(false);
      expect(note.coverImage).toBeUndefined();
      expect(note.attachments).toEqual([]);
      expect(note.relatedNotes).toEqual([]);
      expect(note.tenantId).toBe('t-a');
      expect(note.userId).toBe('u-a');
      expect(note.createdAt).toEqual(NOW);
      expect(note.updatedAt).toEqual(NOW);
      expect(note.lastAccessedAt).toEqual(NOW);
    });

    it('params 透传覆盖默认值', () => {
      const note = noteManager.createNote(
        {
          title: 'T', content: 'body', format: 'html', summary: 's',
          tags: ['a', 'b'], isFavorite: true, isPinned: true,
          coverImage: 'img', attachments: ['att1'], relatedNotes: ['r1'],
        },
        'u-a', 't-a'
      );
      expect(note).toMatchObject({
        title: 'T', content: 'body', format: 'html', summary: 's',
        tags: ['a', 'b'], isFavorite: true, isPinned: true,
        coverImage: 'img', attachments: ['att1'], relatedNotes: ['r1'],
      });
    });

    it('空 content → wordCount=0、readingTime=1（max(1, ceil(0/300))）', () => {
      const note = noteManager.createNote({ title: 't', content: '' }, 'u', 't');
      expect(note.wordCount).toBe(0);
      expect(note.readingTime).toBe(1);
    });

    it('纯中文 content → wordCount = 中文字符数', () => {
      const note = noteManager.createNote({ title: 't', content: '你好世界测试' }, 'u', 't');
      expect(note.wordCount).toBe(6);
    });

    it('中英混合 content → wordCount = 中文 + 英文单词数', () => {
      const note = noteManager.createNote({ title: 't', content: '你好 hello 世界 world' }, 'u', 't');
      expect(note.wordCount).toBe(6); // 4 中文 + 2 英文
    });

    it('readingTime = max(1, ceil(wordCount/300))，600 单词 → 2 分钟', () => {
      // 构造 600 个英文单词
      const content = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
      const note = noteManager.createNote({ title: 't', content }, 'u', 't');
      expect(note.wordCount).toBe(600);
      expect(note.readingTime).toBe(2); // ceil(600/300) = 2
    });

    it('notebookId 命中且属主匹配 → notebook.noteCount++ 且 updatedAt 刷新', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const before = nb.updatedAt.getTime();
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(note.notebookId).toBe(nb.id);
      expect(nb.noteCount).toBe(1);
      expect(nb.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('notebookId 命中但属主不匹配 → 笔记仍创建但 notebook 不计数', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-b', 't-a'
      );
      expect(note.notebookId).toBe(nb.id); // 笔记记录了 notebookId
      expect(nb.noteCount).toBe(0); // 但 notebook 属主不匹配，未计数
    });

    it('notebookId 指向不存在的笔记本 → 笔记仍创建，notebookId 保留', () => {
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: 'nb_ghost' }, 'u-a', 't-a'
      );
      expect(note.notebookId).toBe('nb_ghost');
    });

    it('创建笔记时同步创建版本 1（changeLog="初始版本"，createdBy=userId）', () => {
      const note = noteManager.createNote({ title: 't', content: 'c1' }, 'u-a', 't-a');
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].title).toBe('t');
      expect(versions[0].content).toBe('c1');
      expect(versions[0].changeLog).toBe('初始版本');
      expect(versions[0].createdBy).toBe('u-a');
      expect(versions[0].noteId).toBe(note.id);
      expect(versions[0].format).toBe('markdown');
      expect(versions[0].id).toMatch(/^nv_/);
    });
  });

  describe('getNote', () => {
    it('命中返回笔记，未命中返回 null', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.getNote(note.id, 'u-a', 't-a')).toBe(note);
      expect(noteManager.getNote('nope', 'u-a', 't-a')).toBeNull();
    });

    it('跨租户 / 跨用户返回 null', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.getNote(note.id, 'u-b', 't-a')).toBeNull();
      expect(noteManager.getNote(note.id, 'u-a', 't-b')).toBeNull();
    });

    it('命中时同引用突变 lastAccessedAt = new Date()', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      expect(note.lastAccessedAt).toEqual(NOW);
      vi.setSystemTime(new Date(NOW_TS + 5000));
      const got = noteManager.getNote(note.id, 'u-a', 't-a');
      expect(got).toBe(note);
      expect(note.lastAccessedAt).toEqual(new Date(NOW_TS + 5000));
    });
  });

  describe('getNoteList - 过滤', () => {
    it('按 userId + tenantId 过滤，且排除 status="deleted"', () => {
      const n1 = noteManager.createNote({ title: 'a', content: 'c' }, 'u-a', 't-a');
      const n2 = noteManager.createNote({ title: 'b', content: 'c' }, 'u-b', 't-a');
      const n3 = noteManager.createNote({ title: 'c', content: 'c' }, 'u-a', 't-b');
      noteManager.deleteNote(n1.id, 'u-a', 't-a'); // 软删除
      const list = noteManager.getNoteList('u-a', 't-a');
      expect(list.total).toBe(0); // n1 软删除被排除
      expect(list.notes).toEqual([]);
      expect(noteManager.getNoteList('u-b', 't-a').total).toBe(1); // n2 仍在
      expect(noteManager.getNoteList('u-a', 't-b').total).toBe(1); // n3 仍在
    });

    it('notebookId 过滤', () => {
      const nb1 = noteManager.createNotebook({ name: 'nb1' }, 'u', 't');
      const nb2 = noteManager.createNotebook({ name: 'nb2' }, 'u', 't');
      noteManager.createNote({ title: 'a', content: 'c', notebookId: nb1.id }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c', notebookId: nb2.id }, 'u', 't');
      noteManager.createNote({ title: 'c', content: 'c' }, 'u', 't'); // 无笔记本
      expect(noteManager.getNoteList('u', 't', { notebookId: nb1.id }).total).toBe(1);
      expect(noteManager.getNoteList('u', 't', { notebookId: nb1.id }).notes[0].title).toBe('a');
    });

    it('tags 过滤用 every（须全含）', () => {
      noteManager.createNote({ title: 'a', content: 'c', tags: ['x'] }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c', tags: ['x', 'y'] }, 'u', 't');
      noteManager.createNote({ title: 'c', content: 'c', tags: ['y'] }, 'u', 't');
      expect(noteManager.getNoteList('u', 't', { tags: ['x'] }).total).toBe(2); // a, b
      expect(noteManager.getNoteList('u', 't', { tags: ['x', 'y'] }).total).toBe(1); // 仅 b
      expect(noteManager.getNoteList('u', 't', { tags: [] }).total).toBe(3); // 空数组不过滤
    });

    it('status 过滤（但 deleted 已被预过滤，请求 deleted 返回空）', () => {
      noteManager.createNote({ title: 'active', content: 'c' }, 'u', 't');
      const arch = noteManager.createNote({ title: 'archived', content: 'c' }, 'u', 't');
      noteManager.updateNote(arch.id, { status: 'archived' }, 'u', 't');
      expect(noteManager.getNoteList('u', 't', { status: 'active' }).total).toBe(1);
      expect(noteManager.getNoteList('u', 't', { status: 'archived' }).total).toBe(1);
      // deleted 已被预过滤排除，显式请求 status='deleted' 仍为空
      const del = noteManager.createNote({ title: 'del', content: 'c' }, 'u', 't');
      noteManager.deleteNote(del.id, 'u', 't');
      expect(noteManager.getNoteList('u', 't', { status: 'deleted' }).total).toBe(0);
    });

    it('isFavorite / isPinned 过滤', () => {
      noteManager.createNote({ title: 'a', content: 'c', isFavorite: true }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c', isPinned: true }, 'u', 't');
      noteManager.createNote({ title: 'c', content: 'c', isFavorite: true, isPinned: true }, 'u', 't');
      expect(noteManager.getNoteList('u', 't', { isFavorite: true }).total).toBe(2);
      expect(noteManager.getNoteList('u', 't', { isPinned: true }).total).toBe(2);
      expect(noteManager.getNoteList('u', 't', { isFavorite: false }).total).toBe(1);
    });
  });

  describe('getNoteList - 排序与分页', () => {
    it('置顶优先（忽略 sortOrder），同置顶态再按 sortBy', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const a = noteManager.createNote({ title: 'a', content: 'c' }, 'u', 't'); // unpinned
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const b = noteManager.createNote({ title: 'b', content: 'c', isPinned: true }, 'u', 't'); // pinned
      vi.setSystemTime(new Date(NOW_TS + 2000));
      const c = noteManager.createNote({ title: 'c', content: 'c', isPinned: true }, 'u', 't'); // pinned
      const list = noteManager.getNoteList('u', 't'); // 默认 updatedAt desc
      // pinned 优先：b, c 在前（按 updatedAt desc → c, b），再 a
      expect(list.notes.map(n => n.title)).toEqual(['c', 'b', 'a']);
      // a 是 unpinned，即便时间最新也排最后
      expect(list.notes[2]).toBe(a);
    });

    it('sortBy=wordCount + sortOrder=desc 走 number 分支', () => {
      noteManager.createNote({ title: 'small', content: 'a' }, 'u', 't'); // 1 word
      noteManager.createNote({ title: 'big', content: 'one two three four five' }, 'u', 't'); // 5 words
      noteManager.createNote({ title: 'mid', content: 'one two' }, 'u', 't'); // 2 words
      const desc = noteManager.getNoteList('u', 't', { sortBy: 'wordCount', sortOrder: 'desc' });
      expect(desc.notes.map(n => n.title)).toEqual(['big', 'mid', 'small']);
      const asc = noteManager.getNoteList('u', 't', { sortBy: 'wordCount', sortOrder: 'asc' });
      expect(asc.notes.map(n => n.title)).toEqual(['small', 'mid', 'big']);
    });

    it('分页 page/pageSize 默认 1/20', () => {
      for (let i = 0; i < 25; i++) {
        noteManager.createNote({ title: `n${i}`, content: 'c' }, 'u', 't');
      }
      const page1 = noteManager.getNoteList('u', 't');
      expect(page1.total).toBe(25);
      expect(page1.notes).toHaveLength(20); // 默认 pageSize 20
      const page2 = noteManager.getNoteList('u', 't', { page: 2 });
      expect(page2.notes).toHaveLength(5);
      const page2size5 = noteManager.getNoteList('u', 't', { page: 2, pageSize: 5 });
      expect(page2size5.notes).toHaveLength(5);
    });

    it('page 超出范围返回空数组，total 仍为全集长度', () => {
      noteManager.createNote({ title: 'a', content: 'c' }, 'u', 't');
      const empty = noteManager.getNoteList('u', 't', { page: 99, pageSize: 10 });
      expect(empty.total).toBe(1);
      expect(empty.notes).toEqual([]);
    });
  });

  describe('updateNote', () => {
    it('未命中 / 跨租户 / 跨用户返回 null', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.updateNote('nope', { title: 'x' }, 'u-a', 't-a')).toBeNull();
      expect(noteManager.updateNote(note.id, { title: 'x' }, 'u-b', 't-a')).toBeNull();
      expect(noteManager.updateNote(note.id, { title: 'x' }, 'u-a', 't-b')).toBeNull();
    });

    it('非 content 字段更新：浅合并 + updatedAt 刷新，不创建新版本', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      const before = note.updatedAt.getTime();
      const upd = noteManager.updateNote(note.id, { title: 'new-title', isFavorite: true }, 'u-a', 't-a');
      expect(upd).not.toBeNull();
      expect(upd!.title).toBe('new-title');
      expect(upd!.isFavorite).toBe(true);
      expect(upd!.content).toBe('c'); // 未传 content 保留
      expect(upd!.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(noteManager.getVersions(note.id, 'u-a', 't-a')).toHaveLength(1); // 仅初始版本
    });

    it('content 更新：重算 wordCount/readingTime + 创建新版本（修复后记录新内容）', () => {
      const note = noteManager.createNote({ title: 't', content: 'c1' }, 'u-a', 't-a');
      expect(note.wordCount).toBe(1); // 'c1' 1 word
      const upd = noteManager.updateNote(
        note.id, { content: 'one two three four five', changeLog: 'second' }, 'u-a', 't-a'
      );
      expect(upd!.content).toBe('one two three four five');
      expect(upd!.wordCount).toBe(5);
      expect(upd!.readingTime).toBe(1); // ceil(5/300)=1
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions).toHaveLength(2);
      // 修复后：version 2 快照应记录更新后的新内容（此前 bug 会记录旧内容 'c1'）
      expect(versions[0].version).toBe(2);
      expect(versions[0].content).toBe('one two three four five');
      expect(versions[0].title).toBe('t');
      expect(versions[0].changeLog).toBe('second');
      expect(versions[1].version).toBe(1);
      expect(versions[1].content).toBe('c1');
    });

    it('content 更新同时改 title → 版本快照记录新 title（修复后）', () => {
      const note = noteManager.createNote({ title: 't1', content: 'c1' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { title: 't2', content: 'c2' }, 'u-a', 't-a');
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions[0].title).toBe('t2'); // 修复后捕获新 title
      expect(versions[0].content).toBe('c2');
    });

    it('content 更新未传 changeLog → 默认 "更新内容"', () => {
      const note = noteManager.createNote({ title: 't', content: 'c1' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { content: 'c2' }, 'u-a', 't-a');
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions[0].changeLog).toBe('更新内容');
    });

    it('content 设为空串 "" → falsy 不重算 wordCount，但 !==undefined 仍建版本（捕获空内容）', () => {
      const note = noteManager.createNote({ title: 't', content: 'hello' }, 'u-a', 't-a');
      expect(note.wordCount).toBe(1);
      const upd = noteManager.updateNote(note.id, { content: '' }, 'u-a', 't-a');
      // content 为 '' falsy → 不进入重算块，wordCount 保持旧值
      expect(upd!.content).toBe('');
      expect(upd!.wordCount).toBe(1); // 未重算
      // 但 content !== undefined → 仍建版本
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions).toHaveLength(2);
      expect(versions[0].content).toBe(''); // 修复后捕获空内容
    });

    it('连续多次 content 更新 → 版本号递增 1/2/3', () => {
      const note = noteManager.createNote({ title: 't', content: 'v1' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { content: 'v2' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { content: 'v3' }, 'u-a', 't-a');
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions).toHaveLength(3);
      expect(versions.map(v => v.version)).toEqual([3, 2, 1]); // desc
      // 修复后：每版本捕获对应新内容
      expect(versions.map(v => v.content)).toEqual(['v3', 'v2', 'v1']);
    });

    it('notebookId 变更：旧笔记本 noteCount-- / 新笔记本 noteCount++', () => {
      const nb1 = noteManager.createNotebook({ name: 'nb1' }, 'u-a', 't-a');
      const nb2 = noteManager.createNotebook({ name: 'nb2' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb1.id }, 'u-a', 't-a'
      );
      expect(nb1.noteCount).toBe(1);
      expect(nb2.noteCount).toBe(0);
      noteManager.updateNote(note.id, { notebookId: nb2.id }, 'u-a', 't-a');
      expect(nb1.noteCount).toBe(0);
      expect(nb2.noteCount).toBe(1);
      expect(note.notebookId).toBe(nb2.id);
    });

    it('notebookId 变更为 undefined（移出笔记本）：旧笔记本计数递减（已修复）', () => {
      // 修复前 guard 为 updates.notebookId !== undefined，把"显式移出"与"未传该字段"
      // 混为一谈，导致移出笔记本时旧计数不递减（计数漂移）。
      // 修复后用 'notebookId' in updates 判定，显式传 undefined 触发旧笔记本 --。
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(nb.noteCount).toBe(1);
      noteManager.updateNote(note.id, { notebookId: undefined }, 'u-a', 't-a');
      expect(nb.noteCount).toBe(0); // 旧笔记本递减（已修复）
      expect(note.notebookId).toBeUndefined();
    });

    it('notebookId 变更但目标笔记本属主不匹配 → 仅旧笔记本 noteCount--，新笔记本不计数', () => {
      const nb1 = noteManager.createNotebook({ name: 'nb1' }, 'u-a', 't-a');
      const nb2 = noteManager.createNotebook({ name: 'nb2' }, 'u-b', 't-a'); // 不同用户
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb1.id }, 'u-a', 't-a'
      );
      noteManager.updateNote(note.id, { notebookId: nb2.id }, 'u-a', 't-a');
      expect(nb1.noteCount).toBe(0); // 旧笔记本 --
      expect(nb2.noteCount).toBe(0); // 新笔记本属主不匹配，未 ++
      expect(note.notebookId).toBe(nb2.id); // 但 note.notebookId 仍被 Object.assign 更新
    });
  });

  describe('deleteNote / permanentlyDeleteNote / restoreNote', () => {
    it('deleteNote 软删除：status=deleted + updatedAt 刷新 + 笔记本 noteCount--（max 0）', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(nb.noteCount).toBe(1);
      const before = note.updatedAt.getTime();
      expect(noteManager.deleteNote(note.id, 'u-a', 't-a')).toBe(true);
      expect(note.status).toBe('deleted');
      expect(note.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(nb.noteCount).toBe(0); // 计数递减
    });

    it('deleteNote 不创建新版本', () => {
      const note = noteManager.createNote({ title: 'n', content: 'c' }, 'u-a', 't-a');
      noteManager.deleteNote(note.id, 'u-a', 't-a');
      expect(noteManager.getVersions(note.id, 'u-a', 't-a')).toHaveLength(1); // 仅初始版本
    });

    it('deleteNote 未命中 / 跨租户返回 false', () => {
      const note = noteManager.createNote({ title: 'n', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.deleteNote('nope', 'u-a', 't-a')).toBe(false);
      expect(noteManager.deleteNote(note.id, 'u-b', 't-a')).toBe(false);
      expect(note.status).toBe('active'); // 未被删除
    });

    it('deleteNote 笔记本 noteCount 不会降至负数（max 0 保护）', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      // 手动篡改 notebook 计数为 0 后再删除（模拟计数漂移）
      nb.noteCount = 0;
      noteManager.deleteNote(note.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(0); // max(0, 0-1) = 0
    });

    it('permanentlyDeleteNote 物理删除 notes + versions Map；活跃笔记递减笔记本计数（已修复）', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(nb.noteCount).toBe(1);
      expect(noteManager.permanentlyDeleteNote(note.id, 'u-a', 't-a')).toBe(true);
      expect(noteManager.getNote(note.id, 'u-a', 't-a')).toBeNull();
      expect(noteManager.getVersions(note.id, 'u-a', 't-a')).toEqual([]);
      expect(nb.noteCount).toBe(0); // 活跃笔记物理删除递减（已修复）
    });

    it('permanentlyDeleteNote 对已软删除笔记不重复递减（避免双重递减）', () => {
      // deleteNote 已 --，permanentlyDeleteNote 须跳过递减，否则同一笔记删两次计数 -2
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      noteManager.deleteNote(note.id, 'u-a', 't-a'); // 软删除 → noteCount 0
      expect(nb.noteCount).toBe(0);
      noteManager.permanentlyDeleteNote(note.id, 'u-a', 't-a'); // 物理删除 → 不再递减
      expect(nb.noteCount).toBe(0); // 已软删除，跳过递减
    });

    it('permanentlyDeleteNote 未命中 / 跨租户返回 false', () => {
      const note = noteManager.createNote({ title: 'n', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.permanentlyDeleteNote('nope', 'u-a', 't-a')).toBe(false);
      expect(noteManager.permanentlyDeleteNote(note.id, 'u-b', 't-a')).toBe(false);
    });

    it('restoreNote 将 status 置 active + updatedAt 刷新', () => {
      const note = noteManager.createNote({ title: 'n', content: 'c' }, 'u-a', 't-a');
      noteManager.deleteNote(note.id, 'u-a', 't-a');
      expect(note.status).toBe('deleted');
      const before = note.updatedAt.getTime();
      expect(noteManager.restoreNote(note.id, 'u-a', 't-a')).toBe(true);
      expect(note.status).toBe('active');
      expect(note.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('restoreNote 未命中 / 跨租户返回 false', () => {
      const note = noteManager.createNote({ title: 'n', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.restoreNote('nope', 'u-a', 't-a')).toBe(false);
      expect(noteManager.restoreNote(note.id, 'u-b', 't-a')).toBe(false);
    });

    it('restoreNote 回补笔记本计数（与 deleteNote -- 对称，已修复）', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote(
        { title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a'
      );
      expect(nb.noteCount).toBe(1);
      noteManager.deleteNote(note.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(0); // 删除时 --
      noteManager.restoreNote(note.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(1); // 恢复时回补 ++（已修复）
      expect(note.status).toBe('active');
    });
  });

  // ─── 标签管理 ───────────────────────────────────────────

  describe('createTag', () => {
    it('id 形如 nt_${ts}_${rand}，默认 noteCount=0', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.789123456;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const tag = noteManager.createTag('work', 'u-a', 't-a');
      expect(tag.id).toBe(`nt_${NOW_TS}_${expectedSuffix}`);
      expect(tag.name).toBe('work');
      expect(tag.color).toBeUndefined();
      expect(tag.noteCount).toBe(0);
      expect(tag.tenantId).toBe('t-a');
      expect(tag.userId).toBe('u-a');
      expect(tag.createdAt).toEqual(NOW);
    });

    it('options.color 透传', () => {
      const tag = noteManager.createTag('work', 'u-a', 't-a', { color: '#0f0' });
      expect(tag.color).toBe('#0f0');
    });

    it('同名（大小写不敏感）+ 同 userId + 同 tenantId 去重，返回已存在项（同引用）', () => {
      const t1 = noteManager.createTag('Work', 'u-a', 't-a');
      const t2 = noteManager.createTag('WORK', 'u-a', 't-a'); // 大小写不同
      const t3 = noteManager.createTag('work', 'u-a', 't-a'); // 完全同名
      expect(t2).toBe(t1); // 同引用
      expect(t3).toBe(t1);
      expect(noteManager.getTagList('u-a', 't-a')).toHaveLength(1);
    });

    it('同名但不同 userId 或 tenantId 不去重（各自独立）', () => {
      const t1 = noteManager.createTag('work', 'u-a', 't-a');
      const t2 = noteManager.createTag('work', 'u-b', 't-a');
      const t3 = noteManager.createTag('work', 'u-a', 't-b');
      expect(t1).not.toBe(t2);
      expect(t1).not.toBe(t3);
      expect(noteManager.getTagList('u-a', 't-a')).toHaveLength(1);
      expect(noteManager.getTagList('u-b', 't-a')).toHaveLength(1);
      expect(noteManager.getTagList('u-a', 't-b')).toHaveLength(1);
    });
  });

  describe('getTagList', () => {
    it('按 userId + tenantId 过滤', () => {
      noteManager.createTag('a', 'u-a', 't-a');
      noteManager.createTag('b', 'u-b', 't-a');
      noteManager.createTag('c', 'u-a', 't-b');
      expect(noteManager.getTagList('u-a', 't-a').map(t => t.name).sort()).toEqual(['a']);
      expect(noteManager.getTagList('u-a', 't-b').map(t => t.name).sort()).toEqual(['c']);
      expect(noteManager.getTagList('u-x', 't-x')).toHaveLength(0);
    });

    it('sortBy="count"（默认）全为 0 → 稳定（保持插入序）', () => {
      noteManager.createTag('first', 'u', 't');
      noteManager.createTag('second', 'u', 't');
      noteManager.createTag('third', 'u', 't');
      const list = noteManager.getTagList('u', 't'); // 默认 sortBy='count'
      expect(list.map(t => t.name)).toEqual(['first', 'second', 'third']);
    });

    it('sortBy="name" 走 localeCompare 升序', () => {
      noteManager.createTag('cherry', 'u', 't');
      noteManager.createTag('apple', 'u', 't');
      noteManager.createTag('banana', 'u', 't');
      const list = noteManager.getTagList('u', 't', { sortBy: 'name' });
      expect(list.map(t => t.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('limit 截断前 N 项', () => {
      noteManager.createTag('a', 'u', 't');
      noteManager.createTag('b', 'u', 't');
      noteManager.createTag('c', 'u', 't');
      const list = noteManager.getTagList('u', 't', { limit: 2, sortBy: 'name' });
      expect(list).toHaveLength(2);
      expect(list.map(t => t.name)).toEqual(['a', 'b']);
    });
  });

  // ─── 搜索 ───────────────────────────────────────────────

  describe('search', () => {
    it('仅查 status="active"（archived/deleted 均排除）', () => {
      noteManager.createNote({ title: 'active note', content: 'c' }, 'u', 't');
      const arch = noteManager.createNote({ title: 'archived note', content: 'c' }, 'u', 't');
      noteManager.updateNote(arch.id, { status: 'archived' }, 'u', 't');
      const del = noteManager.createNote({ title: 'deleted note', content: 'c' }, 'u', 't');
      noteManager.deleteNote(del.id, 'u', 't');
      const r = noteManager.search({}, 'u', 't');
      expect(r.total).toBe(1);
      expect(r.notes[0].title).toBe('active note');
    });

    it('按 userId + tenantId 过滤', () => {
      noteManager.createNote({ title: 'a', content: 'c' }, 'u-a', 't-a');
      noteManager.createNote({ title: 'b', content: 'c' }, 'u-b', 't-a');
      expect(noteManager.search({}, 'u-a', 't-a').total).toBe(1);
      expect(noteManager.search({}, 'u-b', 't-a').total).toBe(1);
      expect(noteManager.search({}, 'u-x', 't-x').total).toBe(0);
    });

    it('query 小写匹配 title / summary / content / tags（任一命中）', () => {
      noteManager.createNote({ title: 'Alpha', content: 'body', summary: 'sum', tags: [] }, 'u', 't');
      noteManager.createNote({ title: 'other', content: 'alpha body', summary: '', tags: [] }, 'u', 't');
      noteManager.createNote({ title: 'x', content: 'y', summary: 'ALPHA summary', tags: [] }, 'u', 't');
      noteManager.createNote({ title: 'x', content: 'y', summary: 'z', tags: ['alpha-tag'] }, 'u', 't');
      const r = noteManager.search({ query: 'alpha' }, 'u', 't');
      expect(r.total).toBe(4); // 4 处都命中（大小写不敏感）
    });

    it('tags 过滤用 every（须全含）', () => {
      noteManager.createNote({ title: 'a', content: 'c', tags: ['x'] }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c', tags: ['x', 'y'] }, 'u', 't');
      noteManager.createNote({ title: 'c', content: 'c', tags: ['y'] }, 'u', 't');
      expect(noteManager.search({ tags: ['x'] }, 'u', 't').total).toBe(2);
      expect(noteManager.search({ tags: ['x', 'y'] }, 'u', 't').total).toBe(1);
    });

    it('notebookId / isFavorite / isPinned 过滤', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u', 't');
      noteManager.createNote({ title: 'a', content: 'c', notebookId: nb.id, isFavorite: true }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c', isPinned: true }, 'u', 't');
      expect(noteManager.search({ notebookId: nb.id }, 'u', 't').total).toBe(1);
      expect(noteManager.search({ isFavorite: true }, 'u', 't').total).toBe(1);
      expect(noteManager.search({ isPinned: true }, 'u', 't').total).toBe(1);
    });

    it('dateFrom / dateTo 基于 createdAt 过滤', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      noteManager.createNote({ title: 'old', content: 'c' }, 'u', 't');
      vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));
      noteManager.createNote({ title: 'mid', content: 'c' }, 'u', 't');
      vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
      noteManager.createNote({ title: 'new', content: 'c' }, 'u', 't');
      const from = noteManager.search(
        { dateFrom: new Date('2026-06-01T00:00:00Z') }, 'u', 't'
      );
      expect(from.total).toBe(2); // mid + new
      const to = noteManager.search(
        { dateTo: new Date('2026-06-30T00:00:00Z') }, 'u', 't'
      );
      expect(to.total).toBe(2); // old + mid
      const range = noteManager.search(
        { dateFrom: new Date('2026-06-01T00:00:00Z'), dateTo: new Date('2026-06-30T00:00:00Z') }, 'u', 't'
      );
      expect(range.total).toBe(1); // 仅 mid
    });

    it('排序支持 string 分支：sortBy="title" 按 localeCompare 排序（已修复）', () => {
      // 修复前 search 排序仅 Date/number 两分支，sortBy='title' 比较返回 0 → 保持插入序（不排序）
      // 修复后补 string 分支，与 getNoteList 一致。用「插入序 ≠ 字母序」的标题验证排序确实生效。
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      noteManager.createNote({ title: 'banana', content: 'c' }, 'u', 't'); // 先创建
      vi.setSystemTime(new Date(NOW_TS + 1000));
      noteManager.createNote({ title: 'apple', content: 'c' }, 'u', 't'); // 后创建
      // 默认 sortBy=updatedAt + sortOrder=desc 走 Date 分支：后创建在前
      const desc = noteManager.search({ sortBy: 'updatedAt', sortOrder: 'desc' }, 'u', 't');
      expect(desc.notes.map(n => n.title)).toEqual(['apple', 'banana']);
      // sortBy='title' 走 string 分支：asc 字母序升（与插入序 banana→apple 相反）
      const asc = noteManager.search({ sortBy: 'title', sortOrder: 'asc' }, 'u', 't');
      expect(asc.notes.map(n => n.title)).toEqual(['apple', 'banana']);
      // sortBy='title' desc 字母序降
      const titleDesc = noteManager.search({ sortBy: 'title', sortOrder: 'desc' }, 'u', 't');
      expect(titleDesc.notes.map(n => n.title)).toEqual(['banana', 'apple']);
    });

    it('分页 totalPages / hasMore 计算', () => {
      for (let i = 0; i < 25; i++) {
        noteManager.createNote({ title: `n${i}`, content: 'c' }, 'u', 't');
      }
      const r1 = noteManager.search({ page: 1, pageSize: 20 }, 'u', 't');
      expect(r1.total).toBe(25);
      expect(r1.page).toBe(1);
      expect(r1.pageSize).toBe(20);
      expect(r1.totalPages).toBe(2); // ceil(25/20) = 2
      expect(r1.hasMore).toBe(true);
      expect(r1.notes).toHaveLength(20);
      const r2 = noteManager.search({ page: 2, pageSize: 20 }, 'u', 't');
      expect(r2.hasMore).toBe(false); // page 2 == totalPages 2
      expect(r2.notes).toHaveLength(5);
      const r3 = noteManager.search({ page: 3, pageSize: 20 }, 'u', 't');
      expect(r3.hasMore).toBe(false);
      expect(r3.notes).toHaveLength(0);
    });

    it('默认 page/pageSize = 1/20', () => {
      for (let i = 0; i < 25; i++) {
        noteManager.createNote({ title: `n${i}`, content: 'c' }, 'u', 't');
      }
      const r = noteManager.search({}, 'u', 't');
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
      expect(r.notes).toHaveLength(20);
    });
  });

  // ─── 统计 ───────────────────────────────────────────────

  describe('getStats', () => {
    it('基础计数：totalNotes / totalNotebooks / totalTags / favorite / pinned / archived', () => {
      const nb1 = noteManager.createNotebook({ name: 'nb1' }, 'u-a', 't-a');
      const nb2 = noteManager.createNotebook({ name: 'nb2' }, 'u-a', 't-a');
      noteManager.createTag('t1', 'u-a', 't-a');
      noteManager.createTag('t2', 'u-a', 't-a');
      noteManager.createNote({ title: 'a', content: 'hello', isFavorite: true }, 'u-a', 't-a');
      noteManager.createNote({ title: 'b', content: 'world', isPinned: true }, 'u-a', 't-a');
      const arch = noteManager.createNote({ title: 'c', content: 'foo' }, 'u-a', 't-a');
      noteManager.updateNote(arch.id, { status: 'archived' }, 'u-a', 't-a');
      const s = noteManager.getStats('u-a', 't-a');
      expect(s.totalNotes).toBe(3);
      expect(s.totalNotebooks).toBe(2);
      expect(s.totalTags).toBe(2);
      expect(s.favoriteNotes).toBe(1);
      expect(s.pinnedNotes).toBe(1);
      expect(s.archivedNotes).toBe(1);
    });

    it('totalWords / totalReadingTime 聚合', () => {
      noteManager.createNote({ title: 'a', content: 'one two three' }, 'u', 't'); // 3 words, 1 min
      noteManager.createNote({ title: 'b', content: 'four five' }, 'u', 't'); // 2 words, 1 min
      const s = noteManager.getStats('u', 't');
      expect(s.totalWords).toBe(5);
      expect(s.totalReadingTime).toBe(2); // 1 + 1
    });

    it('totalNotes 包含软删除笔记（实际行为：getStats 不过滤 status）', () => {
      const n1 = noteManager.createNote({ title: 'a', content: 'c' }, 'u', 't');
      noteManager.createNote({ title: 'b', content: 'c' }, 'u', 't');
      noteManager.deleteNote(n1.id, 'u', 't'); // 软删除
      const s = noteManager.getStats('u', 't');
      expect(s.totalNotes).toBe(2); // 含软删除（实际行为）
    });

    it('按 userId + tenantId 隔离', () => {
      noteManager.createNote({ title: 'a', content: 'c' }, 'u-a', 't-a');
      noteManager.createNote({ title: 'b', content: 'c' }, 'u-b', 't-a');
      noteManager.createNote({ title: 'c', content: 'c' }, 'u-a', 't-b');
      const s = noteManager.getStats('u-a', 't-a');
      expect(s.totalNotes).toBe(1);
      expect(s.totalNotebooks).toBe(0);
    });

    it('thisWeekNew / thisMonthNew 基于 createdAt 与 now 比较', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW); // 2026-07-01
      // 3 天前（本周内）
      vi.setSystemTime(new Date(NOW_TS - 3 * 24 * 60 * 60 * 1000));
      noteManager.createNote({ title: 'recent', content: 'c' }, 'u', 't');
      // 20 天前（本月内但本周外）
      vi.setSystemTime(new Date(NOW_TS - 20 * 24 * 60 * 60 * 1000));
      noteManager.createNote({ title: 'mid', content: 'c' }, 'u', 't');
      // 60 天前（本月外）
      vi.setSystemTime(new Date(NOW_TS - 60 * 24 * 60 * 60 * 1000));
      noteManager.createNote({ title: 'old', content: 'c' }, 'u', 't');
      vi.setSystemTime(NOW); // 恢复 now 进行统计
      const s = noteManager.getStats('u', 't');
      expect(s.thisWeekNew).toBe(1); // 仅 recent
      expect(s.thisMonthNew).toBe(2); // recent + mid（30 天内）
    });

    it('topNotebooks 按 noteCount desc 取前 5', () => {
      for (let i = 0; i < 6; i++) {
        const nb = noteManager.createNotebook({ name: `nb${i}` }, 'u', 't');
        for (let j = 0; j <= i; j++) {
          noteManager.createNote({ title: `n-${i}-${j}`, content: 'c', notebookId: nb.id }, 'u', 't');
        }
      }
      const s = noteManager.getStats('u', 't');
      expect(s.topNotebooks).toHaveLength(5); // 取前 5
      // noteCount 最多的是 nb5(6)、nb4(5)、nb3(4)、nb2(3)、nb1(2)
      expect(s.topNotebooks.map(n => n.count)).toEqual([6, 5, 4, 3, 2]);
      expect(s.topNotebooks.map(n => n.name)).toEqual(['nb5', 'nb4', 'nb3', 'nb2', 'nb1']);
      expect(s.topNotebooks[0]).toMatchObject({ name: 'nb5', count: 6 });
    });

    it('topTags 按 noteCount desc 取前 10（全 0 稳定）', () => {
      for (let i = 0; i < 12; i++) {
        noteManager.createTag(`t${i}`, 'u', 't');
      }
      const s = noteManager.getStats('u', 't');
      expect(s.topTags).toHaveLength(10); // 取前 10
      expect(s.topTags.every(t => t.count === 0)).toBe(true); // noteCount 恒 0
    });
  });

  // ─── 版本管理 ───────────────────────────────────────────

  describe('getVersions', () => {
    it('按 version 降序返回', () => {
      const note = noteManager.createNote({ title: 't', content: 'v1' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { content: 'v2' }, 'u-a', 't-a');
      noteManager.updateNote(note.id, { content: 'v3' }, 'u-a', 't-a');
      const versions = noteManager.getVersions(note.id, 'u-a', 't-a');
      expect(versions.map(v => v.version)).toEqual([3, 2, 1]);
    });

    it('未命中 / 跨租户 / 跨用户返回空数组', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      expect(noteManager.getVersions('nope', 'u-a', 't-a')).toEqual([]);
      expect(noteManager.getVersions(note.id, 'u-b', 't-a')).toEqual([]);
      expect(noteManager.getVersions(note.id, 'u-a', 't-b')).toEqual([]);
    });

    it('每条版本含 id/noteId/version/title/content/format/createdBy/createdAt/tenantId', () => {
      const note = noteManager.createNote({ title: 't', content: 'c' }, 'u-a', 't-a');
      const v = noteManager.getVersions(note.id, 'u-a', 't-a')[0];
      expect(v.id).toMatch(/^nv_/);
      expect(v.noteId).toBe(note.id);
      expect(v.version).toBe(1);
      expect(v.title).toBe('t');
      expect(v.content).toBe('c');
      expect(v.format).toBe('markdown');
      expect(v.createdBy).toBe('u-a');
      expect(v.createdAt).toBeInstanceOf(Date);
      expect(v.tenantId).toBe('t-a');
    });
  });

  // ─── 导入导出 ───────────────────────────────────────────

  describe('exportNote', () => {
    it('markdown 格式：# title + content', () => {
      const note = noteManager.createNote({ title: 'My Title', content: 'body text' }, 'u-a', 't-a');
      const out = noteManager.exportNote(note.id, 'markdown', 'u-a', 't-a');
      expect(out).toBe('# My Title\n\nbody text');
    });

    it('json 格式：JSON.stringify(note, null, 2)', () => {
      const note = noteManager.createNote({ title: 'T', content: 'C' }, 'u-a', 't-a');
      const out = noteManager.exportNote(note.id, 'json', 'u-a', 't-a');
      expect(out).not.toBeNull();
      const parsed = JSON.parse(out!);
      expect(parsed.id).toBe(note.id);
      expect(parsed.title).toBe('T');
      expect(parsed.content).toBe('C');
    });

    it('html 格式：含 DOCTYPE + title 标签 + content div', () => {
      const note = noteManager.createNote({ title: 'HT', content: 'HC' }, 'u-a', 't-a');
      const out = noteManager.exportNote(note.id, 'html', 'u-a', 't-a');
      expect(out).toContain('<!DOCTYPE html>');
      expect(out).toContain('<title>HT</title>');
      expect(out).toContain('<h1>HT</h1>');
      expect(out).toContain('<div class="content">HC</div>');
    });

    it('pdf 格式与未知 format 返回 null', () => {
      const note = noteManager.createNote({ title: 'T', content: 'C' }, 'u-a', 't-a');
      expect(noteManager.exportNote(note.id, 'pdf', 'u-a', 't-a')).toBeNull();
      expect(noteManager.exportNote(note.id, 'unknown' as NoteExportFormat, 'u-a', 't-a')).toBeNull();
    });

    it('未命中 / 跨租户返回 null', () => {
      const note = noteManager.createNote({ title: 'T', content: 'C' }, 'u-a', 't-a');
      expect(noteManager.exportNote('nope', 'markdown', 'u-a', 't-a')).toBeNull();
      expect(noteManager.exportNote(note.id, 'markdown', 'u-b', 't-a')).toBeNull();
    });

    it('导出会触发 getNote 副作用：lastAccessedAt 突变', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const note = noteManager.createNote({ title: 'T', content: 'C' }, 'u-a', 't-a');
      expect(note.lastAccessedAt).toEqual(NOW);
      vi.setSystemTime(new Date(NOW_TS + 8000));
      noteManager.exportNote(note.id, 'markdown', 'u-a', 't-a');
      expect(note.lastAccessedAt).toEqual(new Date(NOW_TS + 8000)); // 被突变
    });
  });

  // ─── 工具函数（经 createNote 间接覆盖） ──────────────────

  describe('calculateWordCount（经 createNote 间接覆盖）', () => {
    it('空字符串 → 0', () => {
      const n = noteManager.createNote({ title: 't', content: '' }, 'u', 't');
      expect(n.wordCount).toBe(0);
    });

    it('纯英文 → 单词数（空格分隔）', () => {
      const n = noteManager.createNote({ title: 't', content: 'hello world foo' }, 'u', 't');
      expect(n.wordCount).toBe(3);
    });

    it('纯中文 → 中文字符数', () => {
      const n = noteManager.createNote({ title: 't', content: '你好世界' }, 'u', 't');
      expect(n.wordCount).toBe(4);
    });

    it('中英混合 → 中文 + 英文单词', () => {
      const n = noteManager.createNote({ title: 't', content: '你好hello世界world' }, 'u', 't');
      expect(n.wordCount).toBe(6); // 4 中文 + 2 英文单词
    });

    it('数字与标点不计入字数', () => {
      const n = noteManager.createNote({ title: 't', content: '!!! 123 ???' }, 'u', 't');
      expect(n.wordCount).toBe(0); // 无中文、无英文单词
    });

    it('英文与数字混合：字母段计数', () => {
      const n = noteManager.createNote({ title: 't', content: 'abc123def' }, 'u', 't');
      expect(n.wordCount).toBe(2); // 'abc' + 'def' 两段字母
    });
  });

  // ─── 跨模块协作（笔记 ↔ 笔记本计数） ─────────────────────

  describe('跨模块协作：笔记 ↔ 笔记本计数一致性', () => {
    it('createNote + deleteNote 全流程：notebook.noteCount 随笔记增减', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const n1 = noteManager.createNote({ title: 'n1', content: 'c', notebookId: nb.id }, 'u-a', 't-a');
      const n2 = noteManager.createNote({ title: 'n2', content: 'c', notebookId: nb.id }, 'u-a', 't-a');
      expect(nb.noteCount).toBe(2);
      noteManager.deleteNote(n1.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(1);
      noteManager.deleteNote(n2.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(0);
    });

    it('permanentlyDeleteNote 递减活跃笔记的 notebook.noteCount（已修复）', () => {
      const nb = noteManager.createNotebook({ name: 'nb' }, 'u-a', 't-a');
      const note = noteManager.createNote({ title: 'n', content: 'c', notebookId: nb.id }, 'u-a', 't-a');
      expect(nb.noteCount).toBe(1);
      noteManager.permanentlyDeleteNote(note.id, 'u-a', 't-a');
      expect(nb.noteCount).toBe(0); // 活跃笔记物理删除递减（已修复）
    });

    it('updateNote 移动笔记到新笔记本后，getNoteList 按 notebookId 过滤正确', () => {
      const nb1 = noteManager.createNotebook({ name: 'nb1' }, 'u', 't');
      const nb2 = noteManager.createNotebook({ name: 'nb2' }, 'u', 't');
      const note = noteManager.createNote({ title: 'n', content: 'c', notebookId: nb1.id }, 'u', 't');
      noteManager.updateNote(note.id, { notebookId: nb2.id }, 'u', 't');
      expect(noteManager.getNoteList('u', 't', { notebookId: nb1.id }).total).toBe(0);
      expect(noteManager.getNoteList('u', 't', { notebookId: nb2.id }).total).toBe(1);
    });
  });
});
