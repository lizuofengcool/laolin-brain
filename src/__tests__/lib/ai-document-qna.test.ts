/**
 * ai/document-qna 文档问答模块直接单测
 *
 * 覆盖目标：src/lib/ai/document-qna.ts。该模块以内存 Map（chatSessionsCache）作为
 * 对话会话的临时存储，并提供文档问答检索能力，含以下关键控制流：
 * - createChatSession：title 优先透传；无 title 且 fileIds 非空时，查 db.file.findMany
 *   （take:3）拼接文件名作为标题，fileIds.length>3 时追加 "等N个文件" 后缀；
 *   无 title 无 fileIds 时标题为 "新对话"；落库到内存缓存
 * - getChatSessions：按 userId+tenantId 过滤，updatedAt 倒序，slice(limit)，默认 limit=20
 * - getChatSession：命中且 userId/tenantId 双匹配返回会话，否则 null（跨用户/租户隔离）
 * - addChatMessage：双匹配时生成 id+timestamp 并 push 到 messages、更新 updatedAt；否则 null
 * - deleteChatSession：双匹配时从缓存删除返回 true；否则 false
 * - askQuestion：默认 fileIds=[]/includeCitations=true/model="default"；经 retrieveRelevantDocuments
 *   关键词检索（split /\s+/、过滤 len>1、slice 5、OR fileName contains insensitive、take 10）；
 *   citations 取前 3 条；score=1-index*0.1 递减；snippet 取 summary 否则回退；无文档时返回
 *   "抱歉..." 文案；confidence 固定 0.85；tokensUsed=estimateTokens(question+answer+context)
 * - checkAiQnAQuota：返回 mock 配额 {available:true,remaining:100,limit:100}
 * - recordAiQnAUsage：console.log 记录，返回 void
 *
 * 状态策略：模块持有 module-level 的 chatSessionsCache（Map）。每个用例前 vi.resetModules()
 * + await import() 重新求值模块，得到全新 chatSessionsCache，避免用例间缓存串扰；配合
 * vi.useFakeTimers() + vi.setSystemTime() 固定 now，使 createdAt/updatedAt/sort 顺序可断言。
 * @/lib/db 经 vi.hoisted + vi.mock 替换，仅 db.file.findMany 可控（createChatSession 标题生成
 * 与 retrieveRelevantDocuments 两处调用点形状不同，按 mock.calls[0][0] 分别断言）。
 *
 * latent 观察（已修复）：
 * - createChatSession 标题拼接原 `if (files.length > 3)` 因 db.file.findMany take:3
 *   恒假（死分支），` 等${fileIds.length}个文件` 后缀永不追加。已修复为
 *   `if (fileIds.length > 3)`：当用户选中的文件数 > 3 时，标题拼接前 3 名 + "等N个文件"。
 * - checkAiQnAQuota / recordAiQnAUsage 为 TODO 桩（返回固定 mock 数据 / 仅 console.log），
 *   已补用例锁定当前桩行为，留待接入真实配额与用量记录时升级。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const MIN = 60 * 1000;

type CreateChatSession = typeof import('@/lib/ai/document-qna').createChatSession;
type GetChatSessions = typeof import('@/lib/ai/document-qna').getChatSessions;
type GetChatSession = typeof import('@/lib/ai/document-qna').getChatSession;
type AddChatMessage = typeof import('@/lib/ai/document-qna').addChatMessage;
type DeleteChatSession = typeof import('@/lib/ai/document-qna').deleteChatSession;
type AskQuestion = typeof import('@/lib/ai/document-qna').askQuestion;
type CheckAiQnAQuota = typeof import('@/lib/ai/document-qna').checkAiQnAQuota;
type RecordAiQnAUsage = typeof import('@/lib/ai/document-qna').recordAiQnAUsage;

describe('ai/document-qna', () => {
  let createChatSession: CreateChatSession;
  let getChatSessions: GetChatSessions;
  let getChatSession: GetChatSession;
  let addChatMessage: AddChatMessage;
  let deleteChatSession: DeleteChatSession;
  let askQuestion: AskQuestion;
  let checkAiQnAQuota: CheckAiQnAQuota;
  let recordAiQnAUsage: RecordAiQnAUsage;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
    mockFileFindMany.mockReset();
    // 默认返回空数组，个别用例按需覆盖
    mockFileFindMany.mockResolvedValue([]);

    const mod = await import('@/lib/ai/document-qna');
    createChatSession = mod.createChatSession;
    getChatSessions = mod.getChatSessions;
    getChatSession = mod.getChatSession;
    addChatMessage = mod.addChatMessage;
    deleteChatSession = mod.deleteChatSession;
    askQuestion = mod.askQuestion;
    checkAiQnAQuota = mod.checkAiQnAQuota;
    recordAiQnAUsage = mod.recordAiQnAUsage;

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  // ─── createChatSession ──────────────────────────────────

  describe('createChatSession', () => {
    it('title 透传：传入 title 时直接使用，不查询 db', async () => {
      const session = await createChatSession('u1', 't1', ['f1', 'f2'], '我的对话');

      expect(session.title).toBe('我的对话');
      expect(session.userId).toBe('u1');
      expect(session.tenantId).toBe('t1');
      expect(session.fileIds).toEqual(['f1', 'f2']);
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
      // title 提供时早返回，不触达 db
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });

    it('无 title 无 fileIds：标题为 "新对话"，不查询 db', async () => {
      const session = await createChatSession('u1', 't1');

      expect(session.title).toBe('新对话');
      expect(session.fileIds).toEqual([]);
      expect(mockFileFindMany).not.toHaveBeenCalled();
    });

    it('无 title 有 fileIds 且 db 命中：标题为文件名逗号拼接', async () => {
      mockFileFindMany.mockResolvedValue([
        { fileName: 'a.pdf' },
        { fileName: 'b.pdf' },
      ]);

      const session = await createChatSession('u1', 't1', ['f1', 'f2']);

      expect(session.title).toBe('a.pdf, b.pdf');
      expect(mockFileFindMany).toHaveBeenCalledTimes(1);
      const arg = mockFileFindMany.mock.calls[0][0];
      expect(arg).toEqual({
        where: { id: { in: ['f1', 'f2'] }, tenantId: 't1', userId: 'u1' },
        select: { fileName: true },
        take: 3,
      });
    });

    it('无 title 有 fileIds 但 db 未命中：标题回退为 "新对话"', async () => {
      mockFileFindMany.mockResolvedValue([]);

      const session = await createChatSession('u1', 't1', ['f1']);

      expect(session.title).toBe('新对话');
      expect(mockFileFindMany).toHaveBeenCalledTimes(1);
    });

    it('fileIds>3 时追加 "等N个文件" 后缀（修复死分支）', async () => {
      // 修复前：源码 `if (files.length > 3)` 因 db take:3 恒假，后缀永不追加
      // 修复后：`if (fileIds.length > 3)`，用户选 >3 文件时追加后缀
      mockFileFindMany.mockResolvedValue([
        { fileName: 'a.pdf' },
        { fileName: 'b.pdf' },
        { fileName: 'c.pdf' },
      ]);

      const session = await createChatSession('u1', 't1', ['f1', 'f2', 'f3', 'f4', 'f5']);

      expect(session.title).toBe('a.pdf, b.pdf, c.pdf 等5个文件');
      expect(session.title).toContain('等5个文件');
    });

    it('fileIds.length 恰好为 3（边界）：不追加后缀', async () => {
      mockFileFindMany.mockResolvedValue([
        { fileName: 'a.pdf' },
        { fileName: 'b.pdf' },
        { fileName: 'c.pdf' },
      ]);

      const session = await createChatSession('u1', 't1', ['f1', 'f2', 'f3']);

      expect(session.title).toBe('a.pdf, b.pdf, c.pdf');
      expect(session.title).not.toContain('等');
    });

    it('fileIds.length 恰好为 4（边界）：追加 "等4个文件"', async () => {
      mockFileFindMany.mockResolvedValue([
        { fileName: 'a.pdf' },
        { fileName: 'b.pdf' },
        { fileName: 'c.pdf' },
      ]);

      const session = await createChatSession('u1', 't1', ['f1', 'f2', 'f3', 'f4']);

      expect(session.title).toBe('a.pdf, b.pdf, c.pdf 等4个文件');
    });

    it('fileIds>3 但 db 命中数少于 fileIds：后缀仍按 fileIds.length 追加', async () => {
      // fileIds 5 个但 db 只命中 2 个，fileIds.length>3 仍成立 → 后缀按 5 追加
      mockFileFindMany.mockResolvedValue([
        { fileName: 'a.pdf' },
        { fileName: 'b.pdf' },
      ]);

      const session = await createChatSession('u1', 't1', ['f1', 'f2', 'f3', 'f4', 'f5']);

      expect(session.title).toBe('a.pdf, b.pdf 等5个文件');
    });

    it('创建后落入缓存：可经 getChatSession 取回同一对象', async () => {
      const session = await createChatSession('u1', 't1', [], '会话A');

      const got = await getChatSession(session.id, 'u1', 't1');
      expect(got).not.toBeNull();
      expect(got!.id).toBe(session.id);
      expect(got!.title).toBe('会话A');
    });

    it('返回的 session.id 为非空字符串', async () => {
      const session = await createChatSession('u1', 't1', [], 'X');
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(0);
    });
  });

  // ─── getChatSessions ────────────────────────────────────

  describe('getChatSessions', () => {
    it('空缓存返回空数组', async () => {
      const list = await getChatSessions('u1', 't1');
      expect(list).toEqual([]);
    });

    it('按 userId+tenantId 过滤并以 updatedAt 倒序返回', async () => {
      vi.setSystemTime(NOW);
      const s1 = await createChatSession('u1', 't1', [], '早');
      vi.setSystemTime(new Date(NOW.getTime() + 10 * MIN));
      const s2 = await createChatSession('u1', 't1', [], '晚');

      const list = await getChatSessions('u1', 't1');
      expect(list.map((s) => s.id)).toEqual([s2.id, s1.id]);
    });

    it('跨用户隔离：仅返回当前 userId 的会话', async () => {
      vi.setSystemTime(NOW);
      const mine = await createChatSession('u1', 't1', [], '我的');
      await createChatSession('u2', 't1', [], '他人的');

      const list = await getChatSessions('u1', 't1');
      expect(list.map((s) => s.id)).toEqual([mine.id]);
    });

    it('跨租户隔离：仅返回当前 tenantId 的会话', async () => {
      const mine = await createChatSession('u1', 't1', [], '我的');
      await createChatSession('u1', 't2', [], '他租户');

      const list = await getChatSessions('u1', 't1');
      expect(list.map((s) => s.id)).toEqual([mine.id]);
    });

    it('limit 截断：默认 20，自定义 limit 生效', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(NOW.getTime() + i * MIN));
        ids.push((await createChatSession('u1', 't1', [], `s${i}`)).id);
      }

      const limited = await getChatSessions('u1', 't1', 2);
      expect(limited).toHaveLength(2);
      // 倒序 → 最近创建的在前
      expect(limited.map((s) => s.id)).toEqual([ids[4], ids[3]]);
    });
  });

  // ─── getChatSession ─────────────────────────────────────

  describe('getChatSession', () => {
    it('命中且双匹配返回会话', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const got = await getChatSession(s.id, 'u1', 't1');
      expect(got).not.toBeNull();
      expect(got!.title).toBe('会话');
    });

    it('未找到返回 null', async () => {
      const got = await getChatSession('不存在的id', 'u1', 't1');
      expect(got).toBeNull();
    });

    it('userId 不匹配返回 null', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const got = await getChatSession(s.id, 'u2', 't1');
      expect(got).toBeNull();
    });

    it('tenantId 不匹配返回 null', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const got = await getChatSession(s.id, 'u1', 't2');
      expect(got).toBeNull();
    });
  });

  // ─── addChatMessage ─────────────────────────────────────

  describe('addChatMessage', () => {
    it('双匹配：生成 id+timestamp 并 push 到 messages、更新 updatedAt', async () => {
      vi.setSystemTime(NOW);
      const s = await createChatSession('u1', 't1', [], '会话');
      const before = s.updatedAt;

      vi.setSystemTime(new Date(NOW.getTime() + 5 * MIN));
      const msg = await addChatMessage(s.id, 'u1', 't1', {
        role: 'user',
        content: '你好',
      });

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('user');
      expect(msg!.content).toBe('你好');
      expect(typeof msg!.id).toBe('string');
      expect(msg!.id.length).toBeGreaterThan(0);
      expect(msg!.timestamp).toBeInstanceOf(Date);
      // updatedAt 被推进到消息时间
      const refreshed = await getChatSession(s.id, 'u1', 't1');
      expect(refreshed!.messages).toHaveLength(1);
      expect(refreshed!.messages[0].id).toBe(msg!.id);
      expect(refreshed!.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    });

    it('支持带 citations 的 assistant 消息', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const msg = await addChatMessage(s.id, 'u1', 't1', {
        role: 'assistant',
        content: '回答',
        citations: [{ fileId: 'f1', fileName: 'a.pdf', snippet: '片段' }],
      });

      expect(msg).not.toBeNull();
      expect(msg!.citations).toEqual([{ fileId: 'f1', fileName: 'a.pdf', snippet: '片段' }]);
    });

    it('未找到会话返回 null', async () => {
      const msg = await addChatMessage('不存在', 'u1', 't1', { role: 'user', content: 'x' });
      expect(msg).toBeNull();
    });

    it('userId 不匹配返回 null', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const msg = await addChatMessage(s.id, 'u2', 't1', { role: 'user', content: 'x' });
      expect(msg).toBeNull();
    });

    it('tenantId 不匹配返回 null', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const msg = await addChatMessage(s.id, 'u1', 't2', { role: 'user', content: 'x' });
      expect(msg).toBeNull();
    });
  });

  // ─── deleteChatSession ──────────────────────────────────

  describe('deleteChatSession', () => {
    it('双匹配：从缓存删除并返回 true', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const ok = await deleteChatSession(s.id, 'u1', 't1');
      expect(ok).toBe(true);
      // 删除后不可再取回
      expect(await getChatSession(s.id, 'u1', 't1')).toBeNull();
    });

    it('未找到返回 false', async () => {
      const ok = await deleteChatSession('不存在', 'u1', 't1');
      expect(ok).toBe(false);
    });

    it('userId 不匹配返回 false', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const ok = await deleteChatSession(s.id, 'u2', 't1');
      expect(ok).toBe(false);
      // 未删除：仍可取回
      expect(await getChatSession(s.id, 'u1', 't1')).not.toBeNull();
    });

    it('tenantId 不匹配返回 false', async () => {
      const s = await createChatSession('u1', 't1', [], '会话');
      const ok = await deleteChatSession(s.id, 'u1', 't2');
      expect(ok).toBe(false);
      expect(await getChatSession(s.id, 'u1', 't1')).not.toBeNull();
    });
  });

  // ─── askQuestion ────────────────────────────────────────

  describe('askQuestion', () => {
    it('默认选项：返回 mock 答案 + 前 3 条引用 + confidence 0.85 + model default', async () => {
      mockFileFindMany.mockResolvedValue([
        { id: 'f1', fileName: 'a.pdf', summary: '摘要A' },
        { id: 'f2', fileName: 'b.pdf', summary: '摘要B' },
      ]);

      const result = await askQuestion('如何使用', 'u1', 't1');

      expect(result.model).toBe('default');
      expect(result.confidence).toBe(0.85);
      expect(typeof result.answer).toBe('string');
      expect(result.answer).toContain('a.pdf、b.pdf');
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(Number.isInteger(result.tokensUsed)).toBe(true);
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]).toEqual({
        fileId: 'f1',
        fileName: 'a.pdf',
        snippet: '摘要A',
        score: 1,
      });
      expect(result.citations[1].score).toBeCloseTo(0.9, 5);
    });

    it('includeCitations=false：citations 为空数组', async () => {
      mockFileFindMany.mockResolvedValue([
        { id: 'f1', fileName: 'a.pdf', summary: '摘要A' },
      ]);

      const result = await askQuestion('如何使用', 'u1', 't1', { includeCitations: false });

      expect(result.citations).toEqual([]);
      // answer 仍基于检索到的文档生成
      expect(result.answer).toContain('a.pdf');
    });

    it('无相关文档：返回 "抱歉" 文案且 citations 为空', async () => {
      mockFileFindMany.mockResolvedValue([]);

      const result = await askQuestion('随便问', 'u1', 't1');

      expect(result.answer.startsWith('抱歉')).toBe(true);
      expect(result.citations).toEqual([]);
    });

    it('fileIds 非空：db 查询 where.id = { in: fileIds }', async () => {
      mockFileFindMany.mockResolvedValue([]);

      await askQuestion('问题', 'u1', 't1', { fileIds: ['f1', 'f2'] });

      const arg = mockFileFindMany.mock.calls[0][0];
      expect(arg.where.id).toEqual({ in: ['f1', 'f2'] });
      expect(arg.where.tenantId).toBe('t1');
      expect(arg.where.userId).toBe('u1');
      expect(arg.where.isDeleted).toBe(false);
      expect(arg.take).toBe(10);
    });

    it('citations 截断为前 3 条（db 返回 5 条）', async () => {
      mockFileFindMany.mockResolvedValue([
        { id: 'f1', fileName: 'a.pdf', summary: 's1' },
        { id: 'f2', fileName: 'b.pdf', summary: 's2' },
        { id: 'f3', fileName: 'c.pdf', summary: 's3' },
        { id: 'f4', fileName: 'd.pdf', summary: 's4' },
        { id: 'f5', fileName: 'e.pdf', summary: 's5' },
      ]);

      const result = await askQuestion('问题', 'u1', 't1');

      expect(result.citations).toHaveLength(3);
      // score 递减：1, 0.9, 0.8
      expect(result.citations[0].score).toBe(1);
      expect(result.citations[1].score).toBeCloseTo(0.9, 5);
      expect(result.citations[2].score).toBeCloseTo(0.8, 5);
    });

    it('snippet 优先取 summary，缺省时回退默认片段文案', async () => {
      mockFileFindMany.mockResolvedValue([
        { id: 'f1', fileName: 'a.pdf', summary: '自定义摘要' },
        { id: 'f2', fileName: 'b.pdf' }, // 无 summary
      ]);

      const result = await askQuestion('问题', 'u1', 't1');

      expect(result.citations[0].snippet).toBe('自定义摘要');
      expect(result.citations[1].snippet).toBe('这是 b.pdf 中的相关内容片段...');
    });

    it('关键词构造：过滤 len<=1、最多 5 个，OR 子句数量匹配', async () => {
      mockFileFindMany.mockResolvedValue([]);

      // 7 个词：a/b 长度 1 被过滤，剩 cc/ddd/eee/fff/ggg 共 5 个（slice 5）
      await askQuestion('a b cc ddd eee fff ggg', 'u1', 't1');

      const arg = mockFileFindMany.mock.calls[0][0];
      expect(arg.where.OR).toHaveLength(5);
      const keywords = arg.where.OR.map((c: any) => c.fileName.contains);
      expect(keywords).toEqual(['cc', 'ddd', 'eee', 'fff', 'ggg']);
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('b');
      // 每个子句均为 insensitive contains
      expect(arg.where.OR[0]).toEqual({ fileName: { contains: 'cc', mode: 'insensitive' } });
    });

    it('单关键词问题：OR 仅 1 个子句', async () => {
      mockFileFindMany.mockResolvedValue([]);

      await askQuestion('系统', 'u1', 't1');

      const arg = mockFileFindMany.mock.calls[0][0];
      expect(arg.where.OR).toHaveLength(1);
      expect(arg.where.OR[0]).toEqual({ fileName: { contains: '系统', mode: 'insensitive' } });
    });

    it('全为短词（len<=1）：OR 为空数组', async () => {
      mockFileFindMany.mockResolvedValue([]);

      await askQuestion('a b c', 'u1', 't1');

      const arg = mockFileFindMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([]);
    });
  });

  // ─── checkAiQnAQuota / recordAiQnAUsage（TODO 桩）──────

  describe('checkAiQnAQuota（桩）', () => {
    it('返回固定 mock 配额 {available:true,remaining:100,limit:100}', async () => {
      const quota = await checkAiQnAQuota('u1', 't1');
      expect(quota).toEqual({ available: true, remaining: 100, limit: 100 });
    });
  });

  describe('recordAiQnAUsage（桩）', () => {
    it('调用 console.log 记录用量并返回 undefined', async () => {
      const ret = await recordAiQnAUsage('u1', 't1', 250);
      expect(ret).toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
      const logged = logSpy.mock.calls[0][0] as string;
      expect(logged).toContain('u1');
      expect(logged).toContain('t1');
      expect(logged).toContain('250');
    });

    it('不同 tokens 值均透传到日志', async () => {
      await recordAiQnAUsage('u2', 't2', 0);
      const logged = logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string;
      expect(logged).toContain('0');
    });
  });
});
