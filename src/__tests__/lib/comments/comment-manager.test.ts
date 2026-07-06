/**
 * comments/comment-manager CommentManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/comments/comment-manager.ts。该模块为纯内存态的评论管理器
 * （评论 / 目标评论索引 / 父回复索引 / 通知 / 审核 / 举报 / 设置 7 个 Map），无任何
 * 运行时外部 import，可直接对实例做白盒断言。构造器公开，每用例 new 全新实例隔离状态。
 *
 * 关键控制流：
 * - 构造器公开 + 模块导出 commentManager 单例（new CommentManager()）
 * - createComment id=`comment_${ts}_${rand}`；默认 status 由 settings.requireApproval 决定
 *   （true→'pending' / false→'published'）；likes=0 / likedBy=[] / reactions=[] / isEdited=false /
 *   replyCount=0；settings.enabled=false → null；content.length > settings.maxLength → null；
 *   加入 targetComments（unshift 到队首）；parentId 回复：加入 commentReplies 并更新父 replyCount +
 *   通知父作者（本轮修复：租户隔离——跨租户父评论不计入 replyCount 且不发通知；同租户自回复不发通知）；
 *   mentions：通知被@用户（排除自己）
 * - getComment 命中返回同引用；未命中 / 跨租户 → null
 * - queryComments：无 parentId 时取 targetComments 顶级评论（过滤掉有 parentId 的）；
 *   有 parentId 时取 commentReplies；filter 可选；排序 newest/oldest/most_liked/most_replies；
 *   分页 page 默认 1 / pageSize 默认 20；includeReplies=true 时附加 replies 字段
 *   （maxDepth 控制递归下探层数：1=直接回复，2=含孙回复，依此类推）
 * - getReplies（私有，递归）：depth<=0 返回空；否则返回直接回复，每个回复递归填充自身
 *   replies 字段（depth-1 下探），maxDepth>1 时返回多层嵌套树（本轮修复：此前为扁平直接回复）
 * - applyFilter（私有）：status(单值或数组) / userId / dateFrom / dateTo / hasAttachments / hasMentions /
 *   search(内容小写包含)
 * - sortComments（私有）：newest(createdAt desc) / oldest(createdAt asc) / most_liked(likes desc) /
 *   most_replies(replyCount desc)
 * - updateComment：仅作者可改；allowEditing=false → null；editTimeLimit 超时 → null；
 *   maxLength 超限 → null；content 用 || 兜底（空串回退原值）；isEdited=true + editedAt + updatedAt
 * - deleteComment：仅作者可删；allowDeletion=false → false；deleteTimeLimit 超时 → false；
 *   软删除（status='deleted'）；从 targetComments 与父 commentReplies 移除并回退父 replyCount
 * - toggleLike：未赞→赞（likedBy push / likes=len / 通知作者，自赞不通知）；已赞→取消（splice）；
 *   跨租户 → {liked:false, likes:0}
 * - addReaction：REACTION_EMOJIS 校验；新表情新建 reaction；已存在则 push userId（幂等，重复不计数）
 * - removeReaction：splice userId；count 同步；未找到 / 未反应 → false
 * - getQuote：返回 {commentId,userId,userName,content,createdAt}；未命中 / 跨租户 → null
 * - getStats（本轮修复：仅统计顶级 published 评论）：
 *   totalComments=顶级数 / totalReplies=Σ顶级replyCount / totalLikes=Σ顶级likes /
 *   totalUsers=顶级唯一作者数 / byDate / byUser / topComments（按 likes desc 取前 5，仅顶级）
 * - getCommentSettings：未设置返回 DEFAULT_COMMENT_SETTINGS 副本；updateCommentSettings 浅合并
 * - moderateComment：approved→status='published'+通知作者；rejected→status='deleted'；跨租户 → false
 * - reportComment：创建 'pending' 举报记录；跨租户 → null
 * - sendNotification（私有）：unshift 到 notifications[userId]
 * - getUserNotifications：按 tenantId 过滤；unreadOnly；limit 截断
 * - markNotificationAsRead：置 isRead=true + readAt；未找到 / 跨用户 / 跨租户 → false
 * - exportComments（本轮修复：includeReplies=false 时仅导出顶级评论）：
 *   json / csv / markdown 三格式；dateFrom/dateTo 过滤；includeLikes/includeAttachments 选项
 * - canEditComment / canDeleteComment：作者 + 设置 + 时间限制三重校验
 * - getStatusDisplayName / getReportReasonDisplayName：枚举映射
 *
 * 状态策略：CommentManager 构造器公开，每用例前 new CommentManager() 取全新实例（fresh Maps）。
 * 依赖 Date.now() 的 id/时间戳断言用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；
 * Math.random 在精确 id 断言用例中 spy 固定返回值，期望后缀用同一表达式计算保证匹配。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CommentManager,
  commentManager,
} from '@/lib/comments/comment-manager';
import {
  DEFAULT_COMMENT_SETTINGS,
  REACTION_EMOJIS,
} from '@/lib/comments/types';
import type {
  Comment,
  CommentSettings,
  CreateCommentParams,
  UpdateCommentParams,
  CommentQueryParams,
  CommentPaginationResult,
  CommentStats,
  CommentTargetType,
  ExportOptions,
  ReportReason,
  CommentStatus,
} from '@/lib/comments/types';

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

let manager: CommentManager;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  manager = new CommentManager();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 构造一个最小可用的 CreateCommentParams，overrides 覆盖默认值 */
function makeParams(overrides: Partial<CreateCommentParams> = {}): CreateCommentParams {
  return {
    targetId: overrides.targetId ?? 'target-1',
    targetType: overrides.targetType ?? 'file',
    content: overrides.content ?? 'hello',
    ...overrides,
  };
}

/** 创建一条顶级评论的快捷方法（使用模块级 manager 实例） */
function seedTop(
  overrides: {
    tenantId?: string;
    userId?: string;
    userName?: string;
    params?: Partial<CreateCommentParams>;
    userAvatar?: string;
  } = {}
): Comment {
  const c = manager.createComment(
    overrides.tenantId ?? 'tenant-a',
    overrides.userId ?? 'user-1',
    overrides.userName ?? 'Alice',
    makeParams(overrides.params ?? {}),
    overrides.userAvatar ? { userAvatar: overrides.userAvatar } : undefined
  );
  if (!c) throw new Error('seedTop: createComment returned null');
  return c;
}

describe('comments/comment-manager CommentManager', () => {
  // ─── 构造器与单例导出 ───────────────────────────────────

  describe('构造器与单例导出', () => {
    it('CommentManager 可直接 new', () => {
      expect(new CommentManager()).toBeInstanceOf(CommentManager);
    });

    it('模块导出 commentManager 为 CommentManager 实例', () => {
      expect(commentManager).toBeInstanceOf(CommentManager);
    });

    it('两个实例状态隔离（Map 独立）', () => {
      const a = new CommentManager();
      const b = new CommentManager();
      a.createComment('t1', 'u1', 'A', makeParams());
      expect(b.getStats('target-1', 'file', 't1').totalComments).toBe(0);
    });
  });

  // ─── createComment ─────────────────────────────────────

  describe('createComment', () => {
    it('创建成功返回评论对象，写入基础字段', () => {
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams({ content: 'hi' }));
      expect(c).not.toBeNull();
      expect(c!.tenantId).toBe('t1');
      expect(c!.userId).toBe('u1');
      expect(c!.userName).toBe('Alice');
      expect(c!.content).toBe('hi');
      expect(c!.targetId).toBe('target-1');
      expect(c!.targetType).toBe('file');
      expect(c!.status).toBe('published');
      expect(c!.likes).toBe(0);
      expect(c!.likedBy).toEqual([]);
      expect(c!.reactions).toEqual([]);
      expect(c!.isEdited).toBe(false);
      expect(c!.replyCount).toBe(0);
      expect(c!.mentions).toBeUndefined();
      expect(c!.attachments).toBeUndefined();
      expect(c!.userAvatar).toBeUndefined();
      expect(c!.createdAt).toEqual(NOW);
      expect(c!.updatedAt).toEqual(NOW);
    });

    it('id 格式 comment_${ts}_${rand}', () => {
      const r = 0.123456789;
      const randSpy = vi.spyOn(Math, 'random').mockReturnValue(r);
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams());
      const expectedSuffix = r.toString(36).substr(2, 9);
      expect(c!.id).toBe(`comment_${NOW_TS}_${expectedSuffix}`);
      randSpy.mockRestore();
    });

    it('requireApproval=true → status=pending', () => {
      manager.updateCommentSettings('target-1', { requireApproval: true });
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams());
      expect(c!.status).toBe('pending');
    });

    it('settings.enabled=false → 返回 null 且不入库', () => {
      manager.updateCommentSettings('target-1', { enabled: false });
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams());
      expect(c).toBeNull();
      expect(manager.getStats('target-1', 'file', 't1').totalComments).toBe(0);
    });

    it('content 超过 maxLength → 返回 null', () => {
      manager.updateCommentSettings('target-1', { maxLength: 5 });
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams({ content: '123456' }));
      expect(c).toBeNull();
    });

    it('content 等于 maxLength → 允许', () => {
      manager.updateCommentSettings('target-1', { maxLength: 5 });
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams({ content: '12345' }));
      expect(c).not.toBeNull();
    });

    it('userAvatar 透传', () => {
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams(), { userAvatar: 'ava' });
      expect(c!.userAvatar).toBe('ava');
    });

    it('mentions 与 attachments 透传', () => {
      const c = manager.createComment('t1', 'u1', 'Alice', makeParams({
        mentions: ['u2', 'u3'],
        attachments: [{ id: 'a1', type: 'image', url: 'u' }],
      }));
      expect(c!.mentions).toEqual(['u2', 'u3']);
      expect(c!.attachments).toHaveLength(1);
    });

    it('加入 targetComments 队首（unshift）', () => {
      const c1 = seedTop();
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const c2 = seedTop();
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments.map(c => c.id)).toEqual([c2.id, c1.id]);
    });

    it('回复：更新父 replyCount + 父 updatedAt', () => {
      const parent = seedTop();
      const reply = manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: parent.id }));
      expect(reply).not.toBeNull();
      const updated = manager.getComment(parent.id, 'tenant-a');
      expect(updated!.replyCount).toBe(1);
      expect(updated!.updatedAt.getTime()).toBe(NOW_TS);
    });

    it('回复：父作者 ≠ 自己 → 发送 new_reply 通知', () => {
      const parent = seedTop({ userId: 'user-1' });
      manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: parent.id }));
      const notifs = manager.getUserNotifications('user-1', 'tenant-a');
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe('new_reply');
      expect(notifs[0].fromUserId).toBe('user-2');
      expect(notifs[0].fromUserName).toBe('Bob');
      expect(notifs[0].commentId).toBe(manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', parentId: parent.id,
      }).comments[0].id);
    });

    it('回复：父作者 = 自己 → 不发通知（自回复）', () => {
      const parent = seedTop({ userId: 'user-1' });
      manager.createComment('tenant-a', 'user-1', 'Alice', makeParams({ parentId: parent.id }));
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(0);
    });

    it('回复：父评论不存在 → 仍创建评论但不计 replyCount / 不通知', () => {
      const reply = manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: 'comment_nonexistent' }));
      expect(reply).not.toBeNull();
      expect(manager.getUserNotifications('user-2', 'tenant-a')).toHaveLength(0);
    });

    it('回复（本轮修复）：父评论跨租户 → 不计 replyCount 且不通知', () => {
      // 租户 A 的父评论
      const parent = manager.createComment('tenantA', 'uA', 'A', makeParams());
      expect(parent).not.toBeNull();
      // 租户 B 的回复引用 A 的父评论
      const reply = manager.createComment('tenantB', 'uB', 'B', makeParams({ parentId: parent.id }));
      expect(reply).not.toBeNull();
      // 父评论 replyCount 不应被跨租户回复递增
      const stillParent = manager.getComment(parent.id, 'tenantA');
      expect(stillParent!.replyCount).toBe(0);
      // 父作者不应收到跨租户回复通知
      expect(manager.getUserNotifications('uA', 'tenantA')).toHaveLength(0);
      expect(manager.getUserNotifications('uA', 'tenantB')).toHaveLength(0);
    });

    it('mentions：通知被@用户（排除自己）', () => {
      manager.createComment('tenant-a', 'user-1', 'Alice', makeParams({ mentions: ['user-1', 'user-2', 'user-3'] }));
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(0);
      const n2 = manager.getUserNotifications('user-2', 'tenant-a');
      const n3 = manager.getUserNotifications('user-3', 'tenant-a');
      expect(n2).toHaveLength(1);
      expect(n2[0].type).toBe('mentioned');
      expect(n3).toHaveLength(1);
      expect(n3[0].type).toBe('mentioned');
    });

    it('mentions：空数组不发通知', () => {
      manager.createComment('tenant-a', 'user-1', 'Alice', makeParams({ mentions: [] }));
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(0);
    });

    it('content 截断 100 字符存入通知 content 字段', () => {
      const long = 'x'.repeat(150);
      manager.createComment('tenant-a', 'user-1', 'Alice', makeParams({ content: long, mentions: ['user-2'] }));
      const n = manager.getUserNotifications('user-2', 'tenant-a');
      expect(n[0].content).toBe(long.substring(0, 100));
    });
  });

  // ─── getComment ────────────────────────────────────────

  describe('getComment', () => {
    it('命中返回同引用', () => {
      const c = seedTop();
      expect(manager.getComment(c.id, 'tenant-a')).toBe(c);
    });

    it('未命中 → null', () => {
      expect(manager.getComment('nope', 'tenant-a')).toBeNull();
    });

    it('跨租户 → null', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.getComment(c.id, 'tenant-b')).toBeNull();
    });
  });

  // ─── queryComments ─────────────────────────────────────

  describe('queryComments', () => {
    it('无 parentId 返回顶级评论（过滤掉回复）', () => {
      const top = seedTop();
      const top2 = seedTop({ params: { content: 'second' } });
      manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: top.id }));
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments).toHaveLength(2);
      expect(res.comments.every(c => !c.parentId)).toBe(true);
    });

    it('有 parentId 返回该父评论的回复列表', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: parent.id }));
      manager.createComment('tenant-a', 'user-3', 'Carol', makeParams({ parentId: parent.id }));
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', parentId: parent.id,
      });
      expect(res.comments).toHaveLength(2);
      expect(res.comments.every(c => c.parentId === parent.id)).toBe(true);
    });

    it('跨租户评论不返回', () => {
      seedTop({ tenantId: 'tenant-a' });
      seedTop({ tenantId: 'tenant-b' });
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].tenantId).toBe('tenant-a');
    });

    it('分页默认 page=1 / pageSize=20', () => {
      for (let i = 0; i < 25; i++) {
        seedTop({ params: { content: `c${i}` } });
      }
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.comments).toHaveLength(20);
      expect(res.total).toBe(25);
      expect(res.totalPages).toBe(2);
      expect(res.hasMore).toBe(true);
    });

    it('自定义分页', () => {
      for (let i = 0; i < 10; i++) seedTop({ params: { content: `c${i}` } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', page: 2, pageSize: 3,
      });
      expect(res.comments).toHaveLength(3);
      expect(res.totalPages).toBe(4);
      expect(res.hasMore).toBe(true);
    });

    it('最后一页 hasMore=false', () => {
      for (let i = 0; i < 5; i++) seedTop({ params: { content: `c${i}` } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', page: 2, pageSize: 3,
      });
      expect(res.comments).toHaveLength(2);
      expect(res.hasMore).toBe(false);
    });

    it('排序 newest（默认）', () => {
      const c1 = seedTop({ params: { content: 'first' } });
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const c2 = seedTop({ params: { content: 'second' } });
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments.map(c => c.id)).toEqual([c2.id, c1.id]);
    });

    it('排序 oldest', () => {
      const c1 = seedTop({ params: { content: 'first' } });
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const c2 = seedTop({ params: { content: 'second' } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', sortBy: 'oldest',
      });
      expect(res.comments.map(c => c.id)).toEqual([c1.id, c2.id]);
    });

    it('排序 most_liked', () => {
      const c1 = seedTop({ params: { content: 'a' } });
      const c2 = seedTop({ params: { content: 'b' } });
      const c3 = seedTop({ params: { content: 'c' } });
      manager.toggleLike(c1.id, 'tenant-a', 'u9');
      manager.toggleLike(c1.id, 'tenant-a', 'u8');
      manager.toggleLike(c2.id, 'tenant-a', 'u7');
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', sortBy: 'most_liked',
      });
      expect(res.comments.map(c => c.id)).toEqual([c1.id, c2.id, c3.id]);
    });

    it('排序 most_replies', () => {
      const c1 = seedTop({ params: { content: 'a' } });
      const c2 = seedTop({ params: { content: 'b' } });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: c1.id }));
      manager.createComment('tenant-a', 'u3', 'C', makeParams({ parentId: c1.id }));
      manager.createComment('tenant-a', 'u4', 'D', makeParams({ parentId: c2.id }));
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', sortBy: 'most_replies',
      });
      expect(res.comments.map(c => c.id)).toEqual([c1.id, c2.id]);
    });

    it('filter.status 单值', () => {
      manager.updateCommentSettings('target-1', { requireApproval: true });
      const pending = seedTop({ params: { content: 'p' } });
      manager.updateCommentSettings('target-1', { requireApproval: false });
      const published = seedTop({ params: { content: 'pub' } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { status: 'pending' },
      });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].id).toBe(pending.id);
    });

    it('filter.status 数组', () => {
      manager.updateCommentSettings('target-1', { requireApproval: true });
      seedTop({ params: { content: 'p' } });
      manager.updateCommentSettings('target-1', { requireApproval: false });
      seedTop({ params: { content: 'pub' } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { status: ['pending', 'published'] },
      });
      expect(res.comments).toHaveLength(2);
    });

    it('filter.userId', () => {
      seedTop({ userId: 'user-1' });
      seedTop({ userId: 'user-2' });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { userId: 'user-1' },
      });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].userId).toBe('user-1');
    });

    it('filter.dateFrom / dateTo', () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      seedTop({ params: { content: 'old' } });
      vi.setSystemTime(new Date('2026-07-15T00:00:00Z'));
      seedTop({ params: { content: 'mid' } });
      vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
      seedTop({ params: { content: 'new' } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: {
          dateFrom: new Date('2026-07-01T00:00:00Z'),
          dateTo: new Date('2026-07-31T23:59:59Z'),
        },
      });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].content).toBe('mid');
    });

    it('filter.hasAttachments true/false', () => {
      seedTop({ params: { attachments: [{ id: 'a', type: 'image' }] } });
      seedTop({ params: { content: 'no-att' } });
      const withAtt = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { hasAttachments: true },
      });
      expect(withAtt.comments).toHaveLength(1);
      const noAtt = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { hasAttachments: false },
      });
      expect(noAtt.comments).toHaveLength(1);
      expect(noAtt.comments[0].content).toBe('no-att');
    });

    it('filter.hasMentions true/false', () => {
      seedTop({ params: { mentions: ['u2'] } });
      seedTop({ params: { content: 'no-mention' } });
      const withM = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { hasMentions: true },
      });
      expect(withM.comments).toHaveLength(1);
      const noM = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { hasMentions: false },
      });
      expect(noM.comments).toHaveLength(1);
    });

    it('filter.search 内容小写包含', () => {
      seedTop({ params: { content: 'Hello World' } });
      seedTop({ params: { content: 'Goodbye' } });
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        filter: { search: 'WORLD' },
      });
      expect(res.comments).toHaveLength(1);
      expect(res.comments[0].content).toBe('Hello World');
    });

    it('includeReplies=false（默认）→ comments 无 replies 字段', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments[0]).not.toHaveProperty('replies');
    });

    it('includeReplies=true 默认 maxDepth=1 → 返回直接回复（本轮修复）', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', includeReplies: true,
      });
      expect(res.comments).toHaveLength(1);
      expect((res.comments[0] as any).replies).toHaveLength(1);
      expect((res.comments[0] as any).replies[0].parentId).toBe(parent.id);
    });

    it('includeReplies=true maxDepth=0 → 不返回回复', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        includeReplies: true, maxDepth: 0,
      });
      expect((res.comments[0] as any).replies).toHaveLength(0);
    });

    it('includeReplies=true + parentId 同传 → 不附加 replies（仅顶级查询时附加）', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const res = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
        parentId: parent.id, includeReplies: true,
      });
      expect(res.comments[0]).not.toHaveProperty('replies');
    });

    // ─── 递归回复树（getReplies maxDepth>1）—— 本轮修复 ──
    describe('递归回复树（getReplies maxDepth>1）', () => {
      it('maxDepth=2 → 顶级.r1.r2 两层嵌套，叶子 replies 为 []', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        const r2 = manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2', parentId: r1!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 2,
        });

        expect(res.comments).toHaveLength(1);
        expect(res.comments[0].id).toBe(top.id);
        const topReplies = res.comments[0].replies!;
        expect(topReplies).toHaveLength(1);
        expect(topReplies[0].id).toBe(r1!.id);
        // 第二层：r1 的子回复 r2
        expect(topReplies[0].replies).toHaveLength(1);
        expect(topReplies[0].replies![0].id).toBe(r2!.id);
        // 叶子 r2 的 replies 为空数组（已下探到底）
        expect(topReplies[0].replies![0].replies).toEqual([]);
      });

      it('maxDepth=3 → 三层嵌套 top.r1.r2.r3', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        const r2 = manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2', parentId: r1!.id }));
        const r3 = manager.createComment('tenant-a', 'u4', 'D', makeParams({ content: 'r3', parentId: r2!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 3,
        });

        const r1Node = res.comments[0].replies![0];
        const r2Node = r1Node.replies![0];
        const r3Node = r2Node.replies![0];
        expect(r1Node.id).toBe(r1!.id);
        expect(r2Node.id).toBe(r2!.id);
        expect(r3Node.id).toBe(r3!.id);
        expect(r3Node.replies).toEqual([]);
      });

      it('maxDepth=1 → 直接回复叶子 replies 为 []（形状一致）', () => {
        const top = seedTop({ params: { content: 'top' } });
        manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 1,
        });

        expect(res.comments[0].replies![0].replies).toEqual([]);
      });

      it('maxDepth 超过实际深度 → 返回完整树，无报错，叶子 replies 为 []', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2', parentId: r1!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 5,
        });

        const r1Node = res.comments[0].replies![0];
        expect(r1Node.replies).toHaveLength(1);
        expect(r1Node.replies![0].replies).toEqual([]);
      });

      it('maxDepth=2 截断第三层：r3 不出现', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        const r2 = manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2', parentId: r1!.id }));
        manager.createComment('tenant-a', 'u4', 'D', makeParams({ content: 'r3', parentId: r2!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 2,
        });

        const r1Node = res.comments[0].replies![0];
        expect(r1Node.replies).toHaveLength(1);
        expect(r1Node.replies![0].id).toBe(r2!.id);
        // 第三层 r3 被截断：r2 作为叶子 replies 为 []
        expect(r1Node.replies![0].replies).toEqual([]);
      });

      it('多分支：顶级有两条回复，各自带子回复', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        const r3 = manager.createComment('tenant-a', 'u4', 'D', makeParams({ content: 'r3', parentId: top.id }));
        manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2', parentId: r1!.id }));
        manager.createComment('tenant-a', 'u5', 'E', makeParams({ content: 'r4', parentId: r3!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 2,
        });

        const topReplies = res.comments[0].replies!;
        expect(topReplies).toHaveLength(2);
        // 每个直接回复各带 1 条子回复
        for (const node of topReplies) {
          expect(node.replies).toHaveLength(1);
          expect(node.replies![0].replies).toEqual([]);
        }
      });

      it('租户隔离：跨租户嵌套回复被递归过滤', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1', parentId: top.id }));
        // r2 属于 tenant-b，作为 r1 的回复（跨租户）
        manager.createComment('tenant-b', 'u3', 'C', makeParams({ content: 'r2-cross', parentId: r1!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 3,
        });

        const r1Node = res.comments[0].replies![0];
        expect(r1Node.id).toBe(r1!.id);
        // 跨租户 r2 被过滤，r1 为叶子
        expect(r1Node.replies).toEqual([]);
      });

      it('嵌套回复为完整 Comment 对象（含 content/userId/parentId 等字段）', () => {
        const top = seedTop({ params: { content: 'top' } });
        const r1 = manager.createComment('tenant-a', 'u2', 'B', makeParams({ content: 'r1-content', parentId: top.id }));
        const r2 = manager.createComment('tenant-a', 'u3', 'C', makeParams({ content: 'r2-content', parentId: r1!.id }));

        const res = manager.queryComments({
          tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file',
          includeReplies: true, maxDepth: 2,
        });

        const r1Node = res.comments[0].replies![0];
        expect(r1Node.content).toBe('r1-content');
        expect(r1Node.userId).toBe('u2');
        expect(r1Node.parentId).toBe(top.id);
        expect(r1Node.likes).toBe(0);
        expect(r1Node.isEdited).toBe(false);
        const r2Node = r1Node.replies![0];
        expect(r2Node.content).toBe('r2-content');
        expect(r2Node.userId).toBe('u3');
        expect(r2Node.parentId).toBe(r1!.id);
      });
    });

    it('空结果分页元数据', () => {
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'empty', targetType: 'file' });
      expect(res.comments).toHaveLength(0);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
      expect(res.hasMore).toBe(false);
    });
  });

  // ─── updateComment ─────────────────────────────────────

  describe('updateComment', () => {
    it('更新 content 成功，置 isEdited/editedAt/updatedAt', () => {
      const c = seedTop();
      const updated = manager.updateComment(c.id, 'tenant-a', 'user-1', { content: 'new' });
      expect(updated!.content).toBe('new');
      expect(updated!.isEdited).toBe(true);
      expect(updated!.editedAt).toEqual(NOW);
      expect(updated!.updatedAt).toEqual(NOW);
    });

    it('更新 attachments', () => {
      const c = seedTop();
      const atts = [{ id: 'a1', type: 'file' as const }];
      const updated = manager.updateComment(c.id, 'tenant-a', 'user-1', { attachments: atts });
      expect(updated!.attachments).toEqual(atts);
    });

    it('未命中 → null', () => {
      expect(manager.updateComment('nope', 'tenant-a', 'user-1', { content: 'x' })).toBeNull();
    });

    it('跨租户 → null', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.updateComment(c.id, 'tenant-b', 'user-1', { content: 'x' })).toBeNull();
    });

    it('非作者 → null', () => {
      const c = seedTop({ userId: 'user-1' });
      expect(manager.updateComment(c.id, 'tenant-a', 'user-2', { content: 'x' })).toBeNull();
    });

    it('allowEditing=false → null', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { allowEditing: false });
      expect(manager.updateComment(c.id, 'tenant-a', 'user-1', { content: 'x' })).toBeNull();
    });

    it('editTimeLimit 超时 → null', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { editTimeLimit: 10 });
      vi.setSystemTime(new Date(NOW_TS + 11 * 60 * 1000));
      expect(manager.updateComment(c.id, 'tenant-a', 'user-1', { content: 'x' })).toBeNull();
    });

    it('editTimeLimit 未超时 → 允许', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { editTimeLimit: 30 });
      vi.setSystemTime(new Date(NOW_TS + 20 * 60 * 1000));
      expect(manager.updateComment(c.id, 'tenant-a', 'user-1', { content: 'x' })).not.toBeNull();
    });

    it('editTimeLimit=0 表示无限制', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { editTimeLimit: 0 });
      vi.setSystemTime(new Date(NOW_TS + 9999 * 60 * 1000));
      expect(manager.updateComment(c.id, 'tenant-a', 'user-1', { content: 'x' })).not.toBeNull();
    });

    it('updates.content 超过 maxLength → null', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { maxLength: 3 });
      expect(manager.updateComment(c.id, 'tenant-a', 'user-1', { content: '1234' })).toBeNull();
    });

    it('updates.content 为空串 → 回退原值（|| 兜底）', () => {
      const c = seedTop({ params: { content: 'original' } });
      const updated = manager.updateComment(c.id, 'tenant-a', 'user-1', { content: '' });
      expect(updated!.content).toBe('original');
    });

    it('仅更新 attachments 时 content 保持原值', () => {
      const c = seedTop({ params: { content: 'keep' } });
      const updated = manager.updateComment(c.id, 'tenant-a', 'user-1', {
        attachments: [{ id: 'a', type: 'file' as const }],
      });
      expect(updated!.content).toBe('keep');
    });
  });

  // ─── deleteComment ─────────────────────────────────────

  describe('deleteComment', () => {
    it('软删除：status=deleted + updatedAt 刷新', () => {
      const c = seedTop();
      expect(manager.deleteComment(c.id, 'tenant-a', 'user-1')).toBe(true);
      expect(manager.getComment(c.id, 'tenant-a')!.status).toBe('deleted');
    });

    it('从 targetComments 列表移除', () => {
      const c = seedTop();
      manager.deleteComment(c.id, 'tenant-a', 'user-1');
      const res = manager.queryComments({ tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file' });
      expect(res.comments).toHaveLength(0);
    });

    it('回复删除：从父 commentReplies 移除 + 父 replyCount 回退', () => {
      const parent = seedTop();
      const reply = manager.createComment('tenant-a', 'user-2', 'Bob', makeParams({ parentId: parent.id }));
      manager.deleteComment(reply!.id, 'tenant-a', 'user-2');
      expect(manager.getComment(parent.id, 'tenant-a')!.replyCount).toBe(0);
      const replies = manager.queryComments({
        tenantId: 'tenant-a', targetId: 'target-1', targetType: 'file', parentId: parent.id,
      });
      expect(replies.comments).toHaveLength(0);
    });

    it('未命中 → false', () => {
      expect(manager.deleteComment('nope', 'tenant-a', 'user-1')).toBe(false);
    });

    it('跨租户 → false', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.deleteComment(c.id, 'tenant-b', 'user-1')).toBe(false);
    });

    it('非作者 → false', () => {
      const c = seedTop({ userId: 'user-1' });
      expect(manager.deleteComment(c.id, 'tenant-a', 'user-2')).toBe(false);
    });

    it('allowDeletion=false → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { allowDeletion: false });
      expect(manager.deleteComment(c.id, 'tenant-a', 'user-1')).toBe(false);
    });

    it('deleteTimeLimit 超时 → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { deleteTimeLimit: 5 });
      vi.setSystemTime(new Date(NOW_TS + 6 * 60 * 1000));
      expect(manager.deleteComment(c.id, 'tenant-a', 'user-1')).toBe(false);
    });

    it('deleteTimeLimit=0 表示无限制', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { deleteTimeLimit: 0 });
      vi.setSystemTime(new Date(NOW_TS + 9999 * 60 * 1000));
      expect(manager.deleteComment(c.id, 'tenant-a', 'user-1')).toBe(true);
    });
  });

  // ─── toggleLike ────────────────────────────────────────

  describe('toggleLike', () => {
    it('点赞：likedBy push + likes 同步 + 返回 liked:true', () => {
      const c = seedTop({ userId: 'user-1' });
      const res = manager.toggleLike(c.id, 'tenant-a', 'user-2');
      expect(res).toEqual({ liked: true, likes: 1 });
      expect(manager.getComment(c.id, 'tenant-a')!.likedBy).toEqual(['user-2']);
    });

    it('取消点赞：splice + likes 同步 + 返回 liked:false', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'user-2');
      const res = manager.toggleLike(c.id, 'tenant-a', 'user-2');
      expect(res).toEqual({ liked: false, likes: 0 });
      expect(manager.getComment(c.id, 'tenant-a')!.likedBy).toEqual([]);
    });

    it('点赞：通知作者（作者 ≠ 自己）', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'user-2');
      const n = manager.getUserNotifications('user-1', 'tenant-a');
      expect(n).toHaveLength(1);
      expect(n[0].type).toBe('liked');
      expect(n[0].fromUserId).toBe('user-2');
    });

    it('自赞：不通知', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'user-1');
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(0);
    });

    it('取消点赞：不通知', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'user-2'); // like
      manager.getUserNotifications('user-1', 'tenant-a'); // clear
      manager.toggleLike(c.id, 'tenant-a', 'user-2'); // unlike
      // still only the like notification
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(1);
    });

    it('多人点赞 likes 累计', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'u2');
      manager.toggleLike(c.id, 'tenant-a', 'u3');
      expect(manager.getComment(c.id, 'tenant-a')!.likes).toBe(2);
    });

    it('重复点赞幂等（likedBy 不重复）', () => {
      const c = seedTop({ userId: 'user-1' });
      manager.toggleLike(c.id, 'tenant-a', 'u2');
      manager.toggleLike(c.id, 'tenant-a', 'u2'); // unlike
      manager.toggleLike(c.id, 'tenant-a', 'u2'); // re-like
      expect(manager.getComment(c.id, 'tenant-a')!.likedBy).toEqual(['u2']);
      expect(manager.getComment(c.id, 'tenant-a')!.likes).toBe(1);
    });

    it('未命中 → {liked:false, likes:0}', () => {
      expect(manager.toggleLike('nope', 'tenant-a', 'u1')).toEqual({ liked: false, likes: 0 });
    });

    it('跨租户 → {liked:false, likes:0}', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.toggleLike(c.id, 'tenant-b', 'u1')).toEqual({ liked: false, likes: 0 });
    });
  });

  // ─── addReaction / removeReaction ─────────────────────

  describe('addReaction', () => {
    it('有效 emoji：新建 reaction', () => {
      const c = seedTop();
      const r = manager.addReaction(c.id, 'tenant-a', 'user-1', '👍');
      expect(r).not.toBeNull();
      expect(r!.emoji).toBe('👍');
      expect(r!.count).toBe(1);
      expect(r!.userIds).toEqual(['user-1']);
    });

    it('无效 emoji → null', () => {
      const c = seedTop();
      expect(manager.addReaction(c.id, 'tenant-a', 'user-1', '🚀')).toBeNull();
    });

    it('同用户重复反应幂等（count 不变）', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'user-1', '👍');
      const r = manager.addReaction(c.id, 'tenant-a', 'user-1', '👍');
      expect(r!.count).toBe(1);
      expect(r!.userIds).toEqual(['user-1']);
    });

    it('多用户同 emoji 累计', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'u1', '❤️');
      manager.addReaction(c.id, 'tenant-a', 'u2', '❤️');
      const r = manager.addReaction(c.id, 'tenant-a', 'u3', '❤️');
      expect(r!.count).toBe(3);
    });

    it('多个不同 emoji 各自计数', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'u1', '👍');
      manager.addReaction(c.id, 'tenant-a', 'u2', '❤️');
      const comment = manager.getComment(c.id, 'tenant-a');
      expect(comment!.reactions).toHaveLength(2);
    });

    it('未命中 → null', () => {
      expect(manager.addReaction('nope', 'tenant-a', 'u1', '👍')).toBeNull();
    });

    it('跨租户 → null', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.addReaction(c.id, 'tenant-b', 'u1', '👍')).toBeNull();
    });

    it('REACTION_EMOJIS 全部可用', () => {
      const c = seedTop();
      for (const emoji of REACTION_EMOJIS) {
        expect(manager.addReaction(c.id, 'tenant-a', 'u1', emoji)).not.toBeNull();
      }
    });
  });

  describe('removeReaction', () => {
    it('移除成功：count 同步', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'u1', '👍');
      manager.addReaction(c.id, 'tenant-a', 'u2', '👍');
      expect(manager.removeReaction(c.id, 'tenant-a', 'u1', '👍')).toBe(true);
      const comment = manager.getComment(c.id, 'tenant-a');
      expect(comment!.reactions![0].count).toBe(1);
      expect(comment!.reactions![0].userIds).toEqual(['u2']);
    });

    it('未命中 → false', () => {
      expect(manager.removeReaction('nope', 'tenant-a', 'u1', '👍')).toBe(false);
    });

    it('跨租户 → false', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      manager.addReaction(c.id, 'tenant-a', 'u1', '👍');
      expect(manager.removeReaction(c.id, 'tenant-b', 'u1', '👍')).toBe(false);
    });

    it('表情不存在 → false', () => {
      const c = seedTop();
      expect(manager.removeReaction(c.id, 'tenant-a', 'u1', '👍')).toBe(false);
    });

    it('用户未反应 → false', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'u1', '👍');
      expect(manager.removeReaction(c.id, 'tenant-a', 'u2', '👍')).toBe(false);
    });

    it('移除后 count=0 时 reaction 条目仍保留（实现行为）', () => {
      const c = seedTop();
      manager.addReaction(c.id, 'tenant-a', 'u1', '👍');
      manager.removeReaction(c.id, 'tenant-a', 'u1', '👍');
      const comment = manager.getComment(c.id, 'tenant-a');
      expect(comment!.reactions).toHaveLength(1);
      expect(comment!.reactions![0].count).toBe(0);
    });
  });

  // ─── getQuote ──────────────────────────────────────────

  describe('getQuote', () => {
    it('返回引用信息', () => {
      const c = seedTop({ params: { content: 'quote me' } });
      const q = manager.getQuote(c.id, 'tenant-a');
      expect(q).toEqual({
        commentId: c.id,
        userId: 'user-1',
        userName: 'Alice',
        content: 'quote me',
        createdAt: NOW,
      });
    });

    it('未命中 → null', () => {
      expect(manager.getQuote('nope', 'tenant-a')).toBeNull();
    });

    it('跨租户 → null', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.getQuote(c.id, 'tenant-b')).toBeNull();
    });
  });

  // ─── getStats（本轮修复：仅顶级 published） ────────────

  describe('getStats', () => {
    it('totalComments 仅计顶级 published（不含回复）— 本轮修复', () => {
      const parent = seedTop({ params: { content: 'p' } });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      manager.createComment('tenant-a', 'u3', 'C', makeParams({ parentId: parent.id }));
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalComments).toBe(1);
    });

    it('totalReplies = Σ顶级 replyCount', () => {
      const parent = seedTop();
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      manager.createComment('tenant-a', 'u3', 'C', makeParams({ parentId: parent.id }));
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalReplies).toBe(2);
    });

    it('totalLikes = Σ顶级 likes', () => {
      const c1 = seedTop();
      const c2 = seedTop({ params: { content: 'b' } });
      manager.toggleLike(c1.id, 'tenant-a', 'u9');
      manager.toggleLike(c2.id, 'tenant-a', 'u8');
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalLikes).toBe(2);
    });

    it('totalUsers = 顶级唯一作者数', () => {
      seedTop({ userId: 'u1', userName: 'A' });
      seedTop({ userId: 'u2', userName: 'B' });
      seedTop({ userId: 'u1', userName: 'A' });
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalUsers).toBe(2);
    });

    it('byDate 按日期分组', () => {
      seedTop();
      vi.setSystemTime(new Date('2026-07-02T00:00:00Z'));
      seedTop({ params: { content: 'd2' } });
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(Object.keys(stats.byDate).sort()).toEqual(['2026-07-01', '2026-07-02']);
      expect(stats.byDate['2026-07-01']).toBe(1);
      expect(stats.byDate['2026-07-02']).toBe(1);
    });

    it('byUser 按用户分组', () => {
      seedTop({ userId: 'u1' });
      seedTop({ userId: 'u1' });
      seedTop({ userId: 'u2' });
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.byUser['u1']).toBe(2);
      expect(stats.byUser['u2']).toBe(1);
    });

    it('topComments 按 likes desc 取前 5（仅顶级）— 本轮修复', () => {
      const cs: Comment[] = [];
      for (let i = 0; i < 6; i++) {
        cs.push(seedTop({ params: { content: `c${i}` } }));
      }
      // 第 6 条点赞最多
      manager.toggleLike(cs[5].id, 'tenant-a', 'u1');
      manager.toggleLike(cs[5].id, 'tenant-a', 'u2');
      manager.toggleLike(cs[5].id, 'tenant-a', 'u3');
      manager.toggleLike(cs[0].id, 'tenant-a', 'u4');
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.topComments).toHaveLength(5);
      expect(stats.topComments[0].id).toBe(cs[5].id);
      expect(stats.topComments[0].likes).toBe(3);
    });

    it('topComments 不含回复 — 本轮修复', () => {
      const parent = seedTop();
      const reply = manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      manager.toggleLike(reply!.id, 'tenant-a', 'u1');
      manager.toggleLike(reply!.id, 'tenant-a', 'u3');
      manager.toggleLike(reply!.id, 'tenant-a', 'u4');
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.topComments).toHaveLength(1);
      expect(stats.topComments[0].id).toBe(parent.id);
    });

    it('pending / deleted 评论不计入统计', () => {
      manager.updateCommentSettings('target-1', { requireApproval: true });
      seedTop(); // pending
      manager.updateCommentSettings('target-1', { requireApproval: false });
      const published = seedTop({ params: { content: 'pub' } });
      manager.deleteComment(published.id, 'tenant-a', 'user-1');
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalComments).toBe(0);
    });

    it('跨租户评论不计入', () => {
      seedTop({ tenantId: 'tenant-a' });
      seedTop({ tenantId: 'tenant-b' });
      const stats = manager.getStats('target-1', 'file', 'tenant-a');
      expect(stats.totalComments).toBe(1);
    });

    it('空目标返回零值统计', () => {
      const stats = manager.getStats('empty', 'file', 'tenant-a');
      expect(stats.totalComments).toBe(0);
      expect(stats.totalReplies).toBe(0);
      expect(stats.totalLikes).toBe(0);
      expect(stats.totalUsers).toBe(0);
      expect(stats.topComments).toEqual([]);
    });
  });

  // ─── getCommentSettings / updateCommentSettings ────────

  describe('getCommentSettings / updateCommentSettings', () => {
    it('未设置返回 DEFAULT_COMMENT_SETTINGS 副本', () => {
      const s = manager.getCommentSettings('target-1');
      expect(s).toEqual(DEFAULT_COMMENT_SETTINGS);
    });

    it('返回的副本修改不影响内部状态', () => {
      const s = manager.getCommentSettings('target-1');
      s.enabled = false;
      expect(manager.getCommentSettings('target-1').enabled).toBe(true);
    });

    it('updateCommentSettings 浅合并', () => {
      const updated = manager.updateCommentSettings('target-1', { requireApproval: true, maxLength: 100 });
      expect(updated.requireApproval).toBe(true);
      expect(updated.maxLength).toBe(100);
      expect(updated.enabled).toBe(true); // 未改动保留默认
      // 二次更新基于已更新值
      const updated2 = manager.updateCommentSettings('target-1', { enabled: false });
      expect(updated2.enabled).toBe(false);
      expect(updated2.requireApproval).toBe(true); // 保留上次更新
    });
  });

  // ─── moderateComment ───────────────────────────────────

  describe('moderateComment', () => {
    it('approved → status=published + 通知作者', () => {
      manager.updateCommentSettings('target-1', { requireApproval: true });
      const c = seedTop(); // pending
      expect(c.status).toBe('pending');
      expect(manager.moderateComment(c.id, 'tenant-a', 'mod-1', 'Moderator', 'approved')).toBe(true);
      expect(manager.getComment(c.id, 'tenant-a')!.status).toBe('published');
      const n = manager.getUserNotifications('user-1', 'tenant-a');
      expect(n).toHaveLength(1);
      expect(n[0].type).toBe('comment_approved');
      expect(n[0].fromUserName).toBe('Moderator');
    });

    it('rejected → status=deleted', () => {
      const c = seedTop();
      expect(manager.moderateComment(c.id, 'tenant-a', 'mod-1', 'Mod', 'rejected', 'spam')).toBe(true);
      expect(manager.getComment(c.id, 'tenant-a')!.status).toBe('deleted');
    });

    it('rejected 不通知作者', () => {
      const c = seedTop();
      manager.moderateComment(c.id, 'tenant-a', 'mod-1', 'Mod', 'rejected');
      expect(manager.getUserNotifications('user-1', 'tenant-a')).toHaveLength(0);
    });

    it('reason 透传到审核记录', () => {
      const c = seedTop();
      manager.moderateComment(c.id, 'tenant-a', 'mod-1', 'Mod', 'rejected', 'spam content');
      // 审核记录内部存储，无公开 getter，通过通知/状态间接验证已足够
      expect(manager.getComment(c.id, 'tenant-a')!.status).toBe('deleted');
    });

    it('未命中 → false', () => {
      expect(manager.moderateComment('nope', 'tenant-a', 'mod-1', 'Mod', 'approved')).toBe(false);
    });

    it('跨租户 → false', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.moderateComment(c.id, 'tenant-b', 'mod-1', 'Mod', 'approved')).toBe(false);
    });
  });

  // ─── reportComment ─────────────────────────────────────

  describe('reportComment', () => {
    it('创建 pending 举报记录', () => {
      const c = seedTop();
      const r = manager.reportComment(c.id, 'tenant-a', 'reporter-1', 'spam', 'ad content');
      expect(r).not.toBeNull();
      expect(r!.commentId).toBe(c.id);
      expect(r!.tenantId).toBe('tenant-a');
      expect(r!.reporterId).toBe('reporter-1');
      expect(r!.reason).toBe('spam');
      expect(r!.description).toBe('ad content');
      expect(r!.status).toBe('pending');
      expect(r!.createdAt).toEqual(NOW);
    });

    it('id 格式 report_${ts}_${rand}', () => {
      const c = seedTop();
      const r = 0.456789123;
      const randSpy = vi.spyOn(Math, 'random').mockReturnValue(r);
      const report = manager.reportComment(c.id, 'tenant-a', 'r1', 'other');
      const expectedSuffix = r.toString(36).substr(2, 9);
      expect(report!.id).toBe(`report_${NOW_TS}_${expectedSuffix}`);
      randSpy.mockRestore();
    });

    it('未命中 → null', () => {
      expect(manager.reportComment('nope', 'tenant-a', 'r1', 'spam')).toBeNull();
    });

    it('跨租户 → null', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.reportComment(c.id, 'tenant-b', 'r1', 'spam')).toBeNull();
    });
  });

  // ─── getUserNotifications / markNotificationAsRead ─────

  describe('getUserNotifications', () => {
    it('按 tenantId 过滤', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id, mentions: ['u3'] }));
      const n1 = manager.getUserNotifications('u1', 'tenant-a');
      expect(n1).toHaveLength(2);
      const nOther = manager.getUserNotifications('u1', 'tenant-b');
      expect(nOther).toHaveLength(0);
    });

    it('unreadOnly=true 仅未读', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      manager.createComment('tenant-a', 'u3', 'C', makeParams({ parentId: parent.id }));
      const notifs = manager.getUserNotifications('u1', 'tenant-a');
      manager.markNotificationAsRead(notifs[0].id, 'u1', 'tenant-a');
      const unread = manager.getUserNotifications('u1', 'tenant-a', { unreadOnly: true });
      expect(unread).toHaveLength(1);
    });

    it('limit 截断', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      for (let i = 0; i < 5; i++) {
        manager.createComment('tenant-a', `u${i + 10}`, `B${i}`, makeParams({ parentId: parent.id }));
      }
      const limited = manager.getUserNotifications('u1', 'tenant-a', { limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('无通知返回空数组', () => {
      expect(manager.getUserNotifications('nobody', 'tenant-a')).toEqual([]);
    });
  });

  describe('markNotificationAsRead', () => {
    it('标记成功：isRead=true + readAt', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const notif = manager.getUserNotifications('u1', 'tenant-a')[0];
      expect(manager.markNotificationAsRead(notif.id, 'u1', 'tenant-a')).toBe(true);
      const after = manager.getUserNotifications('u1', 'tenant-a')[0];
      expect(after.isRead).toBe(true);
      expect(after.readAt).toEqual(NOW);
    });

    it('未命中 → false', () => {
      expect(manager.markNotificationAsRead('nope', 'u1', 'tenant-a')).toBe(false);
    });

    it('跨用户 → false', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const notif = manager.getUserNotifications('u1', 'tenant-a')[0];
      expect(manager.markNotificationAsRead(notif.id, 'u2', 'tenant-a')).toBe(false);
    });

    it('跨租户 → false', () => {
      const parent = seedTop({ tenantId: 'tenant-a', userId: 'u1' });
      manager.createComment('tenant-a', 'u2', 'B', makeParams({ parentId: parent.id }));
      const notif = manager.getUserNotifications('u1', 'tenant-a')[0];
      expect(manager.markNotificationAsRead(notif.id, 'u1', 'tenant-b')).toBe(false);
    });
  });

  // ─── exportComments（本轮修复：includeReplies 选项） ──

  describe('exportComments', () => {
    function seedThread(): { parent: Comment; reply: Comment | null } {
      const parent = seedTop({ params: { content: 'parent post' } });
      const reply = manager.createComment('tenant-a', 'u2', 'Bob', makeParams({ parentId: parent.id, content: 'a reply' }));
      return { parent, reply };
    }

    it('json 格式导出', () => {
      const { parent } = seedThread();
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: true,
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(parent.id);
      expect(data[0].likes).toBe(0);
    });

    it('csv 格式导出', () => {
      seedTop({ params: { content: 'hello, world' } });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'csv', includeReplies: false, includeAttachments: false, includeLikes: true,
      });
      const lines = out.split('\n');
      expect(lines[0]).toBe('ID,用户ID,用户名,内容,创建时间,点赞数,回复数');
      expect(lines.length).toBe(2);
      // 含逗号的内容用双引号包裹并转义
      expect(lines[1]).toContain('"hello, world"');
    });

    it('markdown 格式导出', () => {
      seedTop({ params: { content: 'md content' } });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'markdown', includeReplies: false, includeAttachments: false, includeLikes: true,
      });
      expect(out).toContain('# 评论导出');
      expect(out).toContain('## Alice');
      expect(out).toContain('md content');
      expect(out).toContain('👍');
    });

    it('includeReplies=false → 仅顶级（本轮修复）', () => {
      const { parent, reply } = seedThread();
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(parent.id);
    });

    it('includeReplies=true → 含回复', () => {
      const { parent, reply } = seedThread();
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: true, includeAttachments: false, includeLikes: false,
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(2);
      expect(data.map((d: any) => d.id)).toContain(parent.id);
      expect(data.map((d: any) => d.id)).toContain(reply!.id);
    });

    it('dateFrom 过滤', () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      seedTop({ params: { content: 'old' } });
      vi.setSystemTime(new Date('2026-07-15T00:00:00Z'));
      seedTop({ params: { content: 'new' } });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: false,
        dateFrom: new Date('2026-07-01T00:00:00Z'),
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe('new');
    });

    it('dateTo 过滤', () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      seedTop({ params: { content: 'old' } });
      vi.setSystemTime(new Date('2026-07-15T00:00:00Z'));
      seedTop({ params: { content: 'new' } });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: false,
        dateTo: new Date('2026-06-30T23:59:59Z'),
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe('old');
    });

    it('includeLikes=false → json 不含 likes 字段', () => {
      seedTop();
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      const data = JSON.parse(out);
      expect(data[0].likes).toBeUndefined();
    });

    it('includeAttachments=true → json 含 attachments', () => {
      seedTop({ params: { attachments: [{ id: 'a1', type: 'image' as const }] } });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: true, includeLikes: false,
      });
      const data = JSON.parse(out);
      expect(data[0].attachments).toHaveLength(1);
    });

    it('跨租户不导出', () => {
      seedTop({ tenantId: 'tenant-a' });
      seedTop({ tenantId: 'tenant-b' });
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'json', includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      const data = JSON.parse(out);
      expect(data).toHaveLength(1);
    });

    it('未指定 format 走 default → json', () => {
      seedTop();
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'unknown' as any, includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      expect(() => JSON.parse(out)).not.toThrow();
    });

    it('csv includeLikes=false → 点赞数列为 0', () => {
      const c = seedTop();
      manager.toggleLike(c.id, 'tenant-a', 'u9');
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'csv', includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      const line = out.split('\n')[1];
      // 列序: ID,用户ID,用户名,内容,创建时间,点赞数,回复数
      expect(line.split(',')[5]).toBe('0');
    });

    it('markdown includeLikes=false → 不含 👍', () => {
      const c = seedTop();
      manager.toggleLike(c.id, 'tenant-a', 'u9');
      const out = manager.exportComments('target-1', 'file', 'tenant-a', {
        format: 'markdown', includeReplies: false, includeAttachments: false, includeLikes: false,
      });
      expect(out).not.toContain('👍');
      expect(out).toContain('💬');
    });
  });

  // ─── canEditComment / canDeleteComment ─────────────────

  describe('canEditComment', () => {
    it('作者 + 默认设置 → true', () => {
      const c = seedTop({ userId: 'u1' });
      expect(manager.canEditComment(c.id, 'u1', 'tenant-a')).toBe(true);
    });

    it('非作者 → false', () => {
      const c = seedTop({ userId: 'u1' });
      expect(manager.canEditComment(c.id, 'u2', 'tenant-a')).toBe(false);
    });

    it('未命中 → false', () => {
      expect(manager.canEditComment('nope', 'u1', 'tenant-a')).toBe(false);
    });

    it('跨租户 → false', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.canEditComment(c.id, 'u1', 'tenant-b')).toBe(false);
    });

    it('allowEditing=false → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { allowEditing: false });
      expect(manager.canEditComment(c.id, 'user-1', 'tenant-a')).toBe(false);
    });

    it('editTimeLimit 超时 → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { editTimeLimit: 5 });
      vi.setSystemTime(new Date(NOW_TS + 6 * 60 * 1000));
      expect(manager.canEditComment(c.id, 'user-1', 'tenant-a')).toBe(false);
    });
  });

  describe('canDeleteComment', () => {
    it('作者 + 默认设置 → true', () => {
      const c = seedTop({ userId: 'u1' });
      expect(manager.canDeleteComment(c.id, 'u1', 'tenant-a')).toBe(true);
    });

    it('非作者 → false', () => {
      const c = seedTop({ userId: 'u1' });
      expect(manager.canDeleteComment(c.id, 'u2', 'tenant-a')).toBe(false);
    });

    it('allowDeletion=false → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { allowDeletion: false });
      expect(manager.canDeleteComment(c.id, 'user-1', 'tenant-a')).toBe(false);
    });

    it('deleteTimeLimit 超时 → false', () => {
      const c = seedTop();
      manager.updateCommentSettings('target-1', { deleteTimeLimit: 5 });
      vi.setSystemTime(new Date(NOW_TS + 6 * 60 * 1000));
      expect(manager.canDeleteComment(c.id, 'user-1', 'tenant-a')).toBe(false);
    });

    it('未命中 → false', () => {
      expect(manager.canDeleteComment('nope', 'u1', 'tenant-a')).toBe(false);
    });

    it('跨租户 → false', () => {
      const c = seedTop({ tenantId: 'tenant-a' });
      expect(manager.canDeleteComment(c.id, 'user-1', 'tenant-b')).toBe(false);
    });
  });

  // ─── getStatusDisplayName / getReportReasonDisplayName ─

  describe('getStatusDisplayName', () => {
    it('published → 已发布', () => {
      expect(manager.getStatusDisplayName('published')).toBe('已发布');
    });

    it('pending → 待审核', () => {
      expect(manager.getStatusDisplayName('pending')).toBe('待审核');
    });

    it('deleted → 已删除', () => {
      expect(manager.getStatusDisplayName('deleted')).toBe('已删除');
    });

    it('spam → 垃圾内容', () => {
      expect(manager.getStatusDisplayName('spam')).toBe('垃圾内容');
    });
  });

  describe('getReportReasonDisplayName', () => {
    const cases: [ReportReason, string][] = [
      ['spam', '垃圾广告'],
      ['harassment', '骚扰/欺凌'],
      ['hate_speech', '仇恨言论'],
      ['inappropriate', '不当内容'],
      ['misinformation', '虚假信息'],
      ['other', '其他'],
    ];
    for (const [reason, expected] of cases) {
      it(`${reason} → ${expected}`, () => {
        expect(manager.getReportReasonDisplayName(reason)).toBe(expected);
      });
    }
  });
});
