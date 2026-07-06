/**
 * collaboration/collaboration-manager CollaborationManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/collaboration/collaboration-manager.ts。该模块为纯内存态的协作管理器
 * （在线用户 / 文件编辑者 / 会话 / 操作 / 冲突 / 编辑历史 / 任务 / 任务列表 / 通知 / 通知设置 /
 * 批注 11 个 Map），无任何运行时外部 import，可直接对实例做白盒断言。构造器公开，每用例
 * new 一个新实例以隔离状态。
 *
 * 关键控制流：
 * - userOnline：写入 onlineUsers；status='online'；userOffline 不删除条目只置 'offline'，
 *   并从所有 fileEditors 移除；会话参与者被移除，host 下线时转移 host 给剩余参与者
 *   （与 leaveSession 一致），仅当无剩余参与者时 endSession
 * - getOnlineUsers：仅 status==='online'；spaceId 过滤 currentSpaceId
 * - joinEditing（本轮修复 2）：已存在则更新 status/lastActiveAt，否则新增；调用
 *   updateUserCurrentFile 时保留 currentSpaceId（此前不传 spaceId 致其清空，getOnlineUsers
 *   (spaceId) 过滤失效）
 * - createSession：id=`collab_${ts}_${rand}`；host 自动入 participants（role='host'，
 *   cursorColor=CURSOR_COLORS[0]）；status='active'；初始化 operations/conflicts 为 []
 * - joinSession：会话不存在/非 active → null；已存在返回既有；满员（>=maxParticipants）→ null；
 *   role 默认 viewer；cursorColor=CURSOR_COLORS[len % len]
 * - leaveSession：移除参与者；host 离开且仍有人 → 转移 host 给 participants[0]；无人 → endSession
 * - submitOperation：会话非 active → null；version=operations.length+1；更新 session 与
 *   participant lastActivityAt
 * - detectConflict：仅 position+length 均定义时做区间重叠检测；命中则入 conflicts
 * - resolveConflict：未命中/已 resolved → false
 * - createTask：id=`task_...`；status='todo'；priority 默认 medium；assignee 存在则发 task_assigned
 * - updateTask：status→completed 设 completedAt 并通知 createdBy（非本人）；assignee 变更通知新 assignee
 * - queryTasks：tenantId 过滤 + spaceId/assignee/status/priority/dueDate/tags 过滤；排序
 *   createdAt/dueDate/priority/status；分页默认 1/20
 * - addTaskComment（本轮修复 3）：此前仅 mentions 发 task_mentioned；现对 assignee+createdBy
 *   （排除评论者、去重）发 task_commented；mentions 仍发 task_mentioned
 * - sendNotification（本轮修复 1）：notification.type 为 snake_case，NotificationSettings key 为
 *   camelCase；此前 typeKey in settings 永远 false 致开关形同虚设；现经显式映射尊重用户设置
 * - 通知设置 / 标记已读 / 未读计数 / 权限检查 / 显示名称 等
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CollaborationManager,
  collaborationManager,
} from '@/lib/collaboration/collaboration-manager';
import {
  CURSOR_COLORS,
  DEFAULT_COLLABORATION_CONFIG,
  DEFAULT_NOTIFICATION_SETTINGS,
  COLLABORATION_ROLE_PERMISSIONS,
} from '@/lib/collaboration/types';
import type {
  CreateTaskParams,
  UpdateTaskParams,
  TaskQueryParams,
  CreateAnnotationParams,
  CollaborationOperation,
  CollaborationRole,
  CollaborationPermissions,
  TaskStatus,
  TaskPriority,
  AnnotationType,
  UserOnlineStatus,
} from '@/lib/collaboration/types';

// 固定时间，便于断言 id 中的 Date.now() 与时间戳字段
const NOW = new Date('2026-01-15T08:00:00.000Z');
const NOW_TS = NOW.getTime();

let manager: CollaborationManager;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  manager = new CollaborationManager();
});

afterEach(() => {
  vi.useRealTimers();
});

// ==================== 工具函数 ====================

// 固定 Math.random → 固定 id 后缀
function fixRandom(seq: number[]): void {
  const s = vi.spyOn(Math, 'random');
  for (const v of seq) {
    s.mockReturnValueOnce(v);
  }
}

// 由 random 值生成与源码一致的 9 位后缀
function suffixOf(r: number): string {
  return r.toString(36).substr(2, 9);
}

// 创建一个任务并返回
function makeTask(
  tenantId = 't-1',
  userId = 'creator-1',
  overrides: Partial<CreateTaskParams> = {}
) {
  return manager.createTask(tenantId, userId, {
    title: '测试任务',
    ...overrides,
  });
}

// 创建一个会话并返回
function makeSession(
  fileId = 'file-1',
  hostUserId = 'host-1',
  hostUserName = 'Host',
  tenantId = 't-1'
) {
  return manager.createSession(fileId, hostUserId, hostUserName, tenantId);
}

// ==================== 单例与构造 ====================

describe('CollaborationManager 单例与构造', () => {
  it('模块导出 collaborationManager 为 CollaborationManager 实例', () => {
    expect(collaborationManager).toBeInstanceOf(CollaborationManager);
  });

  it('new 出的实例相互独立（状态隔离）', () => {
    const a = new CollaborationManager();
    const b = new CollaborationManager();
    a.userOnline('u1', 'Name');
    expect(a.getOnlineUsers()).toHaveLength(1);
    expect(b.getOnlineUsers()).toHaveLength(0);
  });

  it('默认配置为 DEFAULT_COLLABORATION_CONFIG', () => {
    // 间接验证：maxParticipants=10
    const session = makeSession();
    // host 占 1，再 join 9 个达上限 10
    for (let i = 0; i < 9; i++) {
      expect(manager.joinSession(session.id, `u${i}`, `U${i}`, 'editor')).not.toBeNull();
    }
    // 第 10 个 join（总第 11 人）应被拒
    expect(manager.joinSession(session.id, 'overflow', 'O', 'editor')).toBeNull();
  });
});

// ==================== 在线用户管理 ====================

describe('在线用户管理', () => {
  it('userOnline：写入并返回，status=online，lastActiveAt=NOW', () => {
    const u = manager.userOnline('u1', 'Alice', {
      avatar: 'a.png',
      device: 'web',
      ipAddress: '1.2.3.4',
    });
    expect(u.userId).toBe('u1');
    expect(u.userName).toBe('Alice');
    expect(u.userAvatar).toBe('a.png');
    expect(u.status).toBe('online');
    expect(u.lastActiveAt).toEqual(NOW);
    expect(u.device).toBe('web');
    expect(u.ipAddress).toBe('1.2.3.4');
    expect(manager.getOnlineUsers()).toHaveLength(1);
  });

  it('userOnline：重复上线覆盖同 userId', () => {
    manager.userOnline('u1', 'Alice');
    manager.userOnline('u1', 'Bob');
    const users = manager.getOnlineUsers();
    expect(users).toHaveLength(1);
    expect(users[0].userName).toBe('Bob');
  });

  it('userOffline：置 offline，不删除条目，从 fileEditors 移除', () => {
    manager.userOnline('u1', 'Alice');
    manager.joinEditing('file-1', 'u1', 'Alice');
    expect(manager.getFileEditors('file-1')).toHaveLength(1);
    manager.userOffline('u1');
    expect(manager.getUserOnlineStatus('u1')).toBe('offline');
    expect(manager.getOnlineUsers()).toHaveLength(0); // 仅 online
    expect(manager.getFileEditors('file-1')).toHaveLength(0);
  });

  it('userOffline：host 下线转移 host 给剩余参与者（与 leaveSession 一致）', () => {
    manager.userOnline('host', 'H');
    const s = makeSession('file-1', 'host', 'H', 't-1');
    manager.joinSession(s.id, 'p1', 'P1', 'editor');
    manager.userOffline('host');
    const updated = manager.getSession(s.id);
    // 不再直接 endSession：host 下线时转移给剩余参与者，会话保持 active
    expect(updated?.status).toBe('active');
    expect(updated?.hostUserId).toBe('p1');
    // host 已从 participants 移除，p1 升为 host
    expect(updated?.participants.find(p => p.userId === 'host')).toBeUndefined();
    expect(updated?.participants.find(p => p.userId === 'p1')?.role).toBe('host');
  });

  it('userOffline：非 host 下线仅从 participants 移除', () => {
    manager.userOnline('p1', 'P');
    const s = makeSession('file-1', 'host', 'H', 't-1');
    manager.joinSession(s.id, 'p1', 'P', 'editor');
    manager.userOffline('p1');
    const updated = manager.getSession(s.id);
    expect(updated?.status).toBe('active');
    expect(updated?.participants.find(p => p.userId === 'p1')).toBeUndefined();
  });

  it('userOffline：未上线用户无副作用', () => {
    expect(() => manager.userOffline('nobody')).not.toThrow();
  });

  it('updateUserStatus：命中更新 status/lastActiveAt', () => {
    manager.userOnline('u1', 'A');
    expect(manager.updateUserStatus('u1', 'busy')).toBe(true);
    expect(manager.getUserOnlineStatus('u1')).toBe('busy');
  });

  it('updateUserStatus：未命中返回 false', () => {
    expect(manager.updateUserStatus('nobody', 'busy')).toBe(false);
  });

  it('getOnlineUsers：仅返回 online', () => {
    manager.userOnline('u1', 'A');
    manager.userOnline('u2', 'B');
    manager.updateUserStatus('u2', 'away');
    expect(manager.getOnlineUsers()).toHaveLength(1);
    expect(manager.getOnlineUsers()[0].userId).toBe('u1');
  });

  it('getOnlineUsers(spaceId)：按 currentSpaceId 过滤', () => {
    manager.userOnline('u1', 'A');
    manager.userOnline('u2', 'B');
    manager.updateUserCurrentFile('u1', 'f1', 'space-1');
    manager.updateUserCurrentFile('u2', 'f2', 'space-2');
    expect(manager.getOnlineUsers('space-1')).toHaveLength(1);
    expect(manager.getOnlineUsers('space-1')[0].userId).toBe('u1');
  });

  it('getUserOnlineStatus：未上线返回 offline', () => {
    expect(manager.getUserOnlineStatus('nobody')).toBe('offline');
  });

  it('updateUserCurrentFile：设置 currentFileId/currentSpaceId/lastActiveAt', () => {
    manager.userOnline('u1', 'A');
    manager.updateUserCurrentFile('u1', 'f1', 'space-1');
    const u = manager.getOnlineUsers()[0];
    expect(u.currentFileId).toBe('f1');
    expect(u.currentSpaceId).toBe('space-1');
  });

  it('updateUserCurrentFile：未上线用户无副作用', () => {
    expect(() => manager.updateUserCurrentFile('nobody', 'f1', 's1')).not.toThrow();
  });
});

// ==================== 文件编辑者管理 ====================

describe('文件编辑者管理', () => {
  it('joinEditing：新增编辑者，默认 status=editing', () => {
    const ed = manager.joinEditing('file-1', 'u1', 'Alice');
    expect(ed.userId).toBe('u1');
    expect(ed.fileId).toBe('file-1');
    expect(ed.status).toBe('editing');
    expect(ed.joinedAt).toEqual(NOW);
    expect(ed.lastActiveAt).toEqual(NOW);
    expect(manager.getFileEditors('file-1')).toHaveLength(1);
  });

  it('joinEditing：自定义 status', () => {
    const ed = manager.joinEditing('file-1', 'u1', 'A', { status: 'viewing' });
    expect(ed.status).toBe('viewing');
  });

  it('joinEditing：已存在则更新 status/lastActiveAt 不新增', () => {
    manager.joinEditing('file-1', 'u1', 'A', { status: 'viewing' });
    vi.setSystemTime(new Date(NOW_TS + 1000));
    const ed = manager.joinEditing('file-1', 'u1', 'A', { status: 'editing' });
    expect(manager.getFileEditors('file-1')).toHaveLength(1);
    expect(ed.status).toBe('editing');
    expect(ed.lastActiveAt.getTime()).toBe(NOW_TS + 1000);
  });

  it('joinEditing（修复点 2）：保留用户已有 currentSpaceId，不清空', () => {
    manager.userOnline('u1', 'A');
    manager.updateUserCurrentFile('u1', 'f0', 'space-1');
    expect(manager.getOnlineUsers('space-1')).toHaveLength(1);
    // 加入编辑（不传 spaceId）——修复前会清空 currentSpaceId
    manager.joinEditing('file-1', 'u1', 'A');
    // 修复后：currentSpaceId 仍为 space-1，getOnlineUsers(spaceId) 仍命中
    expect(manager.getOnlineUsers('space-1')).toHaveLength(1);
    const u = manager.getOnlineUsers('space-1')[0];
    expect(u.currentSpaceId).toBe('space-1');
    expect(u.currentFileId).toBe('file-1');
  });

  it('joinEditing：用户未上线时仍加入 fileEditors（updateUserCurrentFile 无副作用）', () => {
    const ed = manager.joinEditing('file-1', 'ghost', 'G');
    expect(ed).toBeDefined();
    expect(manager.getFileEditors('file-1')).toHaveLength(1);
  });

  it('leaveEditing：移除并清空 currentFileId', () => {
    manager.userOnline('u1', 'A');
    manager.updateUserCurrentFile('u1', 'file-1', 'space-1');
    manager.joinEditing('file-1', 'u1', 'A');
    expect(manager.leaveEditing('file-1', 'u1')).toBe(true);
    expect(manager.getFileEditors('file-1')).toHaveLength(0);
    const u = manager.getOnlineUsers()[0];
    expect(u.currentFileId).toBeUndefined();
  });

  it('leaveEditing：fileId 不存在返回 false', () => {
    expect(manager.leaveEditing('nope', 'u1')).toBe(false);
  });

  it('leaveEditing：userId 不在编辑者中返回 false', () => {
    manager.joinEditing('file-1', 'u1', 'A');
    expect(manager.leaveEditing('file-1', 'nobody')).toBe(false);
  });

  it('getFileEditors：不存在返回 []', () => {
    expect(manager.getFileEditors('nope')).toEqual([]);
  });

  it('updateCursorPosition：更新 cursorPosition/lastActiveAt', () => {
    manager.joinEditing('file-1', 'u1', 'A');
    const pos = { line: 3, column: 5, offset: 20 };
    expect(manager.updateCursorPosition('file-1', 'u1', pos)).toBe(true);
    const ed = manager.getFileEditors('file-1')[0];
    expect(ed.cursorPosition).toEqual(pos);
  });

  it('updateCursorPosition：fileId 不存在返回 false', () => {
    expect(manager.updateCursorPosition('nope', 'u1', { line: 1, column: 1 })).toBe(false);
  });

  it('updateCursorPosition：userId 不在编辑者中返回 false', () => {
    manager.joinEditing('file-1', 'u1', 'A');
    expect(manager.updateCursorPosition('file-1', 'nobody', { line: 1, column: 1 })).toBe(false);
  });
});

// ==================== 协作会话管理 ====================

describe('协作会话管理', () => {
  it('createSession：id 格式 / host 自动入 participants / status=active / 初始化 operations+conflicts', () => {
    fixRandom([0.5]);
    const s = makeSession('file-1', 'host', 'Host', 't-1');
    expect(s.id).toBe(`collab_${NOW_TS}_${suffixOf(0.5)}`);
    expect(s.fileId).toBe('file-1');
    expect(s.tenantId).toBe('t-1');
    expect(s.hostUserId).toBe('host');
    expect(s.status).toBe('active');
    expect(s.startedAt).toEqual(NOW);
    expect(s.participants).toHaveLength(1);
    expect(s.participants[0]).toMatchObject({ userId: 'host', role: 'host' });
    expect(s.participants[0].cursorColor).toBe(CURSOR_COLORS[0]);
    // operations/conflicts 初始化为 []
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 0, length: 1, content: 'a' });
    expect(manager.getOperations(s.id)).toHaveLength(1);
  });

  it('createSession：带 spaceId', () => {
    const s = manager.createSession('file-1', 'host', 'H', 't-1', { spaceId: 'space-1' });
    expect(s.spaceId).toBe('space-1');
  });

  it('joinSession：成功加入，role 默认 viewer，cursorColor 按人数取', () => {
    const s = makeSession();
    const p = manager.joinSession(s.id, 'u1', 'U1');
    expect(p).not.toBeNull();
    expect(p!.userId).toBe('u1');
    expect(p!.role).toBe('viewer');
    expect(p!.cursorColor).toBe(CURSOR_COLORS[1 % CURSOR_COLORS.length]);
  });

  it('joinSession：指定 role=editor', () => {
    const s = makeSession();
    const p = manager.joinSession(s.id, 'u1', 'U1', 'editor');
    expect(p!.role).toBe('editor');
  });

  it('joinSession：已存在返回既有参与者不新增', () => {
    const s = makeSession();
    const p1 = manager.joinSession(s.id, 'u1', 'U1', 'editor');
    const p2 = manager.joinSession(s.id, 'u1', 'U1', 'viewer');
    expect(p2).toBe(p1);
    expect(p2!.role).toBe('editor'); // 不改 role
    expect(manager.getSession(s.id)!.participants).toHaveLength(2);
  });

  it('joinSession：会话不存在返回 null', () => {
    expect(manager.joinSession('nope', 'u1', 'U1')).toBeNull();
  });

  it('joinSession：会话已 ended 返回 null', () => {
    const s = makeSession();
    manager.endSession(s.id);
    expect(manager.joinSession(s.id, 'u1', 'U1')).toBeNull();
  });

  it('joinSession：满员返回 null', () => {
    const s = makeSession();
    for (let i = 0; i < 9; i++) {
      expect(manager.joinSession(s.id, `u${i}`, `U${i}`)).not.toBeNull();
    }
    expect(manager.joinSession(s.id, 'overflow', 'O')).toBeNull();
  });

  it('leaveSession：非 host 离开仅移除', () => {
    const s = makeSession();
    manager.joinSession(s.id, 'u1', 'U1', 'editor');
    expect(manager.leaveSession(s.id, 'u1')).toBe(true);
    expect(manager.getSession(s.id)!.participants).toHaveLength(1);
  });

  it('leaveSession：host 离开且仍有人 → 转移 host 给 participants[0]', () => {
    const s = makeSession('file-1', 'host', 'H', 't-1');
    manager.joinSession(s.id, 'u1', 'U1', 'editor');
    expect(manager.leaveSession(s.id, 'host')).toBe(true);
    const updated = manager.getSession(s.id)!;
    expect(updated.hostUserId).toBe('u1');
    expect(updated.participants.find(p => p.userId === 'u1')!.role).toBe('host');
  });

  it('leaveSession：最后一人离开 → endSession', () => {
    const s = makeSession('file-1', 'host', 'H', 't-1');
    expect(manager.leaveSession(s.id, 'host')).toBe(true);
    expect(manager.getSession(s.id)!.status).toBe('ended');
    expect(manager.getSession(s.id)!.endedAt).toEqual(NOW);
  });

  it('leaveSession：会话不存在返回 false', () => {
    expect(manager.leaveSession('nope', 'u1')).toBe(false);
  });

  it('leaveSession：userId 不在会话返回 false', () => {
    const s = makeSession();
    expect(manager.leaveSession(s.id, 'nobody')).toBe(false);
  });

  it('endSession：置 ended + endedAt', () => {
    const s = makeSession();
    expect(manager.endSession(s.id)).toBe(true);
    expect(manager.getSession(s.id)!.status).toBe('ended');
  });

  it('endSession：不存在返回 false', () => {
    expect(manager.endSession('nope')).toBe(false);
  });

  it('getSession：不存在返回 null', () => {
    expect(manager.getSession('nope')).toBeNull();
  });

  it('getActiveSession：返回文件的活跃会话', () => {
    const s = makeSession('file-1', 'host', 'H', 't-1');
    expect(manager.getActiveSession('file-1')?.id).toBe(s.id);
  });

  it('getActiveSession：ended 会话不被返回', () => {
    const s = makeSession('file-1', 'host', 'H', 't-1');
    manager.endSession(s.id);
    expect(manager.getActiveSession('file-1')).toBeNull();
  });

  it('getActiveSession：无活跃返回 null', () => {
    expect(manager.getActiveSession('nope')).toBeNull();
  });
});

// ==================== 协作操作与冲突 ====================

describe('协作操作与冲突管理', () => {
  it('submitOperation：version 从 1 递增', () => {
    const s = makeSession();
    const op1 = manager.submitOperation(s.id, 'host', { type: 'insert', position: 0, content: 'a' });
    const op2 = manager.submitOperation(s.id, 'host', { type: 'insert', position: 1, content: 'b' });
    expect(op1!.version).toBe(1);
    expect(op2!.version).toBe(2);
    expect(op1!.sessionId).toBe(s.id);
    expect(op1!.userId).toBe('host');
    expect(op1!.timestamp).toBe(NOW_TS);
  });

  it('submitOperation：更新 session.lastActivityAt 与 participant.lastActiveAt', () => {
    const s = makeSession();
    manager.joinSession(s.id, 'u1', 'U1', 'editor');
    vi.setSystemTime(new Date(NOW_TS + 5000));
    manager.submitOperation(s.id, 'u1', { type: 'insert', position: 0, content: 'a' });
    const updated = manager.getSession(s.id)!;
    expect(updated.lastActivityAt.getTime()).toBe(NOW_TS + 5000);
    const p = updated.participants.find(p => p.userId === 'u1')!;
    expect(p.lastActiveAt.getTime()).toBe(NOW_TS + 5000);
  });

  it('submitOperation：会话不存在返回 null', () => {
    expect(manager.submitOperation('nope', 'u1', { type: 'insert' })).toBeNull();
  });

  it('submitOperation：会话 ended 返回 null', () => {
    const s = makeSession();
    manager.endSession(s.id);
    expect(manager.submitOperation(s.id, 'u1', { type: 'insert' })).toBeNull();
  });

  it('getOperations：返回全部', () => {
    const s = makeSession();
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 0, content: 'a' });
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 1, content: 'b' });
    expect(manager.getOperations(s.id)).toHaveLength(2);
  });

  it('getOperations：sinceVersion 过滤 version > sinceVersion', () => {
    const s = makeSession();
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 0, content: 'a' });
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 1, content: 'b' });
    manager.submitOperation(s.id, 'host', { type: 'insert', position: 2, content: 'c' });
    expect(manager.getOperations(s.id, 1)).toHaveLength(2);
    expect(manager.getOperations(s.id, 2)).toHaveLength(1);
  });

  it('getOperations：不存在会话返回 []', () => {
    expect(manager.getOperations('nope')).toEqual([]);
  });

  it('detectConflict：区间重叠 → 创建冲突', () => {
    const s = makeSession();
    const op1: CollaborationOperation = {
      id: 'op1', sessionId: s.id, userId: 'u1', type: 'insert',
      position: 0, length: 5, content: 'a', timestamp: NOW_TS, version: 1,
    };
    const op2: CollaborationOperation = {
      id: 'op2', sessionId: s.id, userId: 'u2', type: 'insert',
      position: 3, length: 4, content: 'b', timestamp: NOW_TS, version: 2,
    };
    const c = manager.detectConflict(s.id, op1, op2);
    expect(c).not.toBeNull();
    expect(c!.type).toBe('edit_conflict');
    expect(c!.user1Id).toBe('u1');
    expect(c!.user2Id).toBe('u2');
    expect(c!.resolved).toBe(false);
    expect(c!.fileId).toBe('file-1');
  });

  it('detectConflict：不重叠 → null 且不入库', () => {
    const s = makeSession();
    const op1: CollaborationOperation = {
      id: 'op1', sessionId: s.id, userId: 'u1', type: 'insert',
      position: 0, length: 5, timestamp: NOW_TS, version: 1,
    };
    const op2: CollaborationOperation = {
      id: 'op2', sessionId: s.id, userId: 'u2', type: 'insert',
      position: 10, length: 2, timestamp: NOW_TS, version: 2,
    };
    expect(manager.detectConflict(s.id, op1, op2)).toBeNull();
  });

  it('detectConflict：缺 length → null', () => {
    const s = makeSession();
    const op1: CollaborationOperation = {
      id: 'op1', sessionId: s.id, userId: 'u1', type: 'cursor',
      position: 0, timestamp: NOW_TS, version: 1,
    };
    const op2: CollaborationOperation = {
      id: 'op2', sessionId: s.id, userId: 'u2', type: 'cursor',
      position: 1, timestamp: NOW_TS, version: 2,
    };
    expect(manager.detectConflict(s.id, op1, op2)).toBeNull();
  });

  it('resolveConflict：标记 resolved + resolution', () => {
    const s = makeSession();
    const op1: CollaborationOperation = {
      id: 'op1', sessionId: s.id, userId: 'u1', type: 'insert',
      position: 0, length: 5, timestamp: NOW_TS, version: 1,
    };
    const op2: CollaborationOperation = {
      id: 'op2', sessionId: s.id, userId: 'u2', type: 'insert',
      position: 3, length: 4, timestamp: NOW_TS, version: 2,
    };
    const c = manager.detectConflict(s.id, op1, op2)!;
    expect(manager.resolveConflict(c.id, s.id, 'u1', 'merge')).toBe(true);
  });

  it('resolveConflict：已 resolved 再解返回 false', () => {
    const s = makeSession();
    const op1: CollaborationOperation = {
      id: 'op1', sessionId: s.id, userId: 'u1', type: 'insert',
      position: 0, length: 5, timestamp: NOW_TS, version: 1,
    };
    const op2: CollaborationOperation = {
      id: 'op2', sessionId: s.id, userId: 'u2', type: 'insert',
      position: 3, length: 4, timestamp: NOW_TS, version: 2,
    };
    const c = manager.detectConflict(s.id, op1, op2)!;
    manager.resolveConflict(c.id, s.id, 'u1', 'merge');
    expect(manager.resolveConflict(c.id, s.id, 'u1', 'merge')).toBe(false);
  });

  it('resolveConflict：会话无冲突记录返回 false', () => {
    expect(manager.resolveConflict('nope', 'nope', 'u1', 'merge')).toBe(false);
  });
});

// ==================== 编辑历史与版本对比 ====================

describe('编辑历史与版本对比', () => {
  it('recordEditHistory：unshift 插入最新在前', () => {
    fixRandom([0.1, 0.2]);
    const h1 = manager.recordEditHistory('file-1', 't-1', 'u1', 'A', 'insert', 'add line');
    vi.setSystemTime(new Date(NOW_TS + 1000));
    fixRandom([0.3]);
    manager.recordEditHistory('file-1', 't-1', 'u1', 'A', 'delete', 'del line');
    const list = manager.getEditHistory('file-1');
    expect(list).toHaveLength(2);
    expect(list[0].operation).toBe('delete');
    expect(list[1].operation).toBe('insert');
    expect(h1.id).toBe(`hist_${NOW_TS}_${suffixOf(0.1)}`);
  });

  it('recordEditHistory：带 changes/versionBefore/versionAfter', () => {
    manager.recordEditHistory('file-1', 't-1', 'u1', 'A', 'insert', 'desc', {
      changes: [{ type: 'insert' as const, position: 0, newContent: 'x' }],
      versionBefore: 'v1',
      versionAfter: 'v2',
    });
    const h = manager.getEditHistory('file-1')[0];
    expect(h.changes).toHaveLength(1);
    expect(h.versionBefore).toBe('v1');
    expect(h.versionAfter).toBe('v2');
  });

  it('getEditHistory：limit 截断', () => {
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(NOW_TS + i * 1000));
      manager.recordEditHistory('file-1', 't-1', 'u1', 'A', 'op', `d${i}`);
    }
    expect(manager.getEditHistory('file-1', 2)).toHaveLength(2);
  });

  it('getEditHistory：不存在返回 []', () => {
    expect(manager.getEditHistory('nope')).toEqual([]);
  });

  it('compareVersions：返回结构（简化实现，零变更）', () => {
    const diff = manager.compareVersions('file-1', 'v1', 'v2');
    expect(diff.fileId).toBe('file-1');
    expect(diff.version1).toBe('v1');
    expect(diff.version2).toBe('v2');
    expect(diff.changes).toEqual([]);
    expect(diff.stats).toEqual({ additions: 0, deletions: 0, modifications: 0 });
  });
});

// ==================== 任务管理 ====================

describe('任务管理', () => {
  it('createTask：id 格式 / 默认 status=todo / priority=medium / 空数组', () => {
    fixRandom([0.4]);
    const task = manager.createTask('t-1', 'creator-1', { title: 'T1' });
    expect(task.id).toBe(`task_${NOW_TS}_${suffixOf(0.4)}`);
    expect(task.tenantId).toBe('t-1');
    expect(task.createdBy).toBe('creator-1');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.tags).toEqual([]);
    expect(task.comments).toEqual([]);
    expect(task.subtasks).toEqual([]);
    expect(task.attachments).toEqual([]);
    expect(task.createdAt).toEqual(NOW);
    expect(task.updatedAt).toEqual(NOW);
  });

  it('createTask：透传 description/spaceId/fileId/dueDate/tags', () => {
    const due = new Date(NOW_TS + 86400000);
    const task = manager.createTask('t-1', 'c1', {
      title: 'T',
      description: 'desc',
      spaceId: 's1',
      fileId: 'f1',
      priority: 'high',
      dueDate: due,
      tags: ['a', 'b'],
    });
    expect(task.description).toBe('desc');
    expect(task.spaceId).toBe('s1');
    expect(task.fileId).toBe('f1');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toEqual(due);
    expect(task.tags).toEqual(['a', 'b']);
  });

  it('createTask：有 assignee → 发 task_assigned 通知', () => {
    manager.createTask('t-1', 'c1', { title: 'T', assignee: 'a1' });
    const notifs = manager.getUserNotifications('a1', 't-1');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_assigned');
    expect(notifs[0].data?.taskId).toBeDefined();
    expect(notifs[0].data?.fromUserId).toBe('c1');
  });

  it('createTask：无 assignee 不发通知', () => {
    manager.createTask('t-1', 'c1', { title: 'T' });
    // 无任何用户收到通知（此处检查 c1 自身也无）
    expect(manager.getUserNotifications('c1', 't-1')).toHaveLength(0);
  });

  it('getTask：命中 / 未命中 / 跨租户', () => {
    const task = makeTask('t-1', 'c1');
    expect(manager.getTask(task.id, 't-1')).not.toBeNull();
    expect(manager.getTask('nope', 't-1')).toBeNull();
    expect(manager.getTask(task.id, 't-other')).toBeNull();
  });

  it('updateTask：合并 + updatedAt', () => {
    const task = makeTask('t-1', 'c1');
    vi.setSystemTime(new Date(NOW_TS + 1000));
    const updated = manager.updateTask(task.id, 't-1', 'c1', { title: 'New', status: 'in_progress' });
    expect(updated!.title).toBe('New');
    expect(updated!.status).toBe('in_progress');
    expect(updated!.updatedAt.getTime()).toBe(NOW_TS + 1000);
  });

  it('updateTask：status→completed 设 completedAt 并通知 createdBy（非本人）', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'a1' });
    // a1 完成任务 → 通知 creator-1（非 a1 本人）
    manager.updateTask(task.id, 't-1', 'a1', { status: 'completed' });
    const creatorNotifs = manager.getUserNotifications('creator-1', 't-1')
      .filter(n => n.type === 'task_completed');
    expect(creatorNotifs).toHaveLength(1);
    expect(creatorNotifs[0].data?.fromUserId).toBe('a1');
    const stored = manager.getTask(task.id, 't-1')!;
    expect(stored.completedAt).toEqual(NOW);
  });

  it('updateTask：status→completed 由 createdBy 本人完成不通知', () => {
    const task = makeTask('t-1', 'creator-1');
    manager.updateTask(task.id, 't-1', 'creator-1', { status: 'completed' });
    expect(manager.getUserNotifications('creator-1', 't-1')
      .filter(n => n.type === 'task_completed')).toHaveLength(0);
  });

  it('updateTask：重复 completed 不再通知/不重置 completedAt', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T' });
    manager.updateTask(task.id, 't-1', 'a1', { status: 'completed' });
    const firstCompletedAt = manager.getTask(task.id, 't-1')!.completedAt;
    vi.setSystemTime(new Date(NOW_TS + 9999));
    manager.updateTask(task.id, 't-1', 'a1', { status: 'completed' });
    // 仍只 1 条完成通知
    expect(manager.getUserNotifications('creator-1', 't-1')
      .filter(n => n.type === 'task_completed')).toHaveLength(1);
    expect(manager.getTask(task.id, 't-1')!.completedAt).toEqual(firstCompletedAt);
  });

  it('updateTask：assignee 变更通知新 assignee', () => {
    const task = manager.createTask('t-1', 'c1', { title: 'T', assignee: 'a1' });
    // 清空 a1 已收到的 task_assigned 以隔离
    manager.updateTask(task.id, 't-1', 'c1', { assignee: 'a2' });
    const a2Notifs = manager.getUserNotifications('a2', 't-1').filter(n => n.type === 'task_assigned');
    expect(a2Notifs).toHaveLength(1);
  });

  it('updateTask：未命中 / 跨租户返回 null', () => {
    expect(manager.updateTask('nope', 't-1', 'c1', { title: 'x' })).toBeNull();
    const task = makeTask('t-1', 'c1');
    expect(manager.updateTask(task.id, 't-other', 'c1', { title: 'x' })).toBeNull();
  });

  it('deleteTask：仅 createdBy 可删', () => {
    const task = makeTask('t-1', 'c1');
    expect(manager.deleteTask(task.id, 't-1', 'other')).toBe(false);
    expect(manager.deleteTask(task.id, 't-1', 'c1')).toBe(true);
    expect(manager.getTask(task.id, 't-1')).toBeNull();
  });

  it('deleteTask：未命中 / 跨租户返回 false', () => {
    expect(manager.deleteTask('nope', 't-1', 'c1')).toBe(false);
    const task = makeTask('t-1', 'c1');
    expect(manager.deleteTask(task.id, 't-other', 'c1')).toBe(false);
  });

  it('queryTasks：tenantId 过滤', () => {
    makeTask('t-1', 'c1');
    makeTask('t-2', 'c1');
    expect(manager.queryTasks({ tenantId: 't-1' }).total).toBe(1);
    expect(manager.queryTasks({ tenantId: 't-2' }).total).toBe(1);
  });

  it('queryTasks：spaceId/assignee/status/priority 过滤', () => {
    manager.createTask('t-1', 'c1', { title: 'A', spaceId: 's1', assignee: 'a1', status: undefined, priority: 'high' });
    manager.createTask('t-1', 'c1', { title: 'B', spaceId: 's2', assignee: 'a2', priority: 'low' });
    expect(manager.queryTasks({ tenantId: 't-1', spaceId: 's1' }).total).toBe(1);
    expect(manager.queryTasks({ tenantId: 't-1', assignee: 'a1' }).total).toBe(1);
    // status 默认 todo
    expect(manager.queryTasks({ tenantId: 't-1', status: 'todo' }).total).toBe(2);
    expect(manager.queryTasks({ tenantId: 't-1', priority: 'high' }).total).toBe(1);
  });

  it('queryTasks：status/priority 数组过滤', () => {
    manager.createTask('t-1', 'c1', { title: 'A', priority: 'high' });
    manager.createTask('t-1', 'c1', { title: 'B', priority: 'low' });
    expect(manager.queryTasks({ tenantId: 't-1', priority: ['high', 'low'] }).total).toBe(2);
    expect(manager.queryTasks({ tenantId: 't-1', priority: ['urgent'] }).total).toBe(0);
  });

  it('queryTasks：dueDateFrom/dueDateTo 过滤', () => {
    const d1 = new Date(NOW_TS + 1000);
    const d2 = new Date(NOW_TS + 10000);
    manager.createTask('t-1', 'c1', { title: 'A', dueDate: d1 });
    manager.createTask('t-1', 'c1', { title: 'B', dueDate: d2 });
    expect(manager.queryTasks({ tenantId: 't-1', dueDateFrom: d1 }).total).toBe(2);
    expect(manager.queryTasks({ tenantId: 't-1', dueDateFrom: d2 }).total).toBe(1);
    expect(manager.queryTasks({ tenantId: 't-1', dueDateTo: d1 }).total).toBe(1);
  });

  it('queryTasks：tags some 过滤', () => {
    manager.createTask('t-1', 'c1', { title: 'A', tags: ['x', 'y'] });
    manager.createTask('t-1', 'c1', { title: 'B', tags: ['z'] });
    expect(manager.queryTasks({ tenantId: 't-1', tags: ['x'] }).total).toBe(1);
    expect(manager.queryTasks({ tenantId: 't-1', tags: ['x', 'z'] }).total).toBe(2);
    expect(manager.queryTasks({ tenantId: 't-1', tags: ['nope'] }).total).toBe(0);
  });

  it('queryTasks：排序 createdAt asc/desc', () => {
    vi.setSystemTime(new Date(NOW_TS));
    manager.createTask('t-1', 'c1', { title: 'first' });
    vi.setSystemTime(new Date(NOW_TS + 5000));
    manager.createTask('t-1', 'c1', { title: 'second' });
    const asc = manager.queryTasks({ tenantId: 't-1', sortBy: 'createdAt', sortOrder: 'asc' }).tasks;
    const desc = manager.queryTasks({ tenantId: 't-1', sortBy: 'createdAt', sortOrder: 'desc' }).tasks;
    expect(asc[0].title).toBe('first');
    expect(desc[0].title).toBe('second');
  });

  it('queryTasks：排序 priority（urgent<high<medium<low）', () => {
    manager.createTask('t-1', 'c1', { title: 'low', priority: 'low' });
    manager.createTask('t-1', 'c1', { title: 'urgent', priority: 'urgent' });
    manager.createTask('t-1', 'c1', { title: 'medium', priority: 'medium' });
    const asc = manager.queryTasks({ tenantId: 't-1', sortBy: 'priority', sortOrder: 'asc' }).tasks;
    expect(asc.map(t => t.title)).toEqual(['urgent', 'medium', 'low']);
  });

  it('queryTasks：排序 status（todo<in_progress<review<completed<cancelled）', () => {
    manager.createTask('t-1', 'c1', { title: 'c' });
    manager.createTask('t-1', 'c1', { title: 'a' });
    manager.updateTask(manager.queryTasks({ tenantId: 't-1' }).tasks.find(t => t.title === 'a')!.id, 't-1', 'c1', { status: 'in_progress' });
    const asc = manager.queryTasks({ tenantId: 't-1', sortBy: 'status', sortOrder: 'asc' }).tasks;
    expect(asc[0].status).toBe('todo');
    expect(asc[1].status).toBe('in_progress');
  });

  it('queryTasks：分页默认 page=1/pageSize=20', () => {
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(NOW_TS + i));
      makeTask('t-1', 'c1');
    }
    const r = manager.queryTasks({ tenantId: 't-1' });
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
    expect(r.total).toBe(25);
    expect(r.tasks).toHaveLength(20);
  });

  it('queryTasks：自定义分页', () => {
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(new Date(NOW_TS + i));
      makeTask('t-1', 'c1');
    }
    const r = manager.queryTasks({ tenantId: 't-1', page: 2, pageSize: 3 });
    expect(r.tasks).toHaveLength(3);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(3);
  });

  it('queryTasks：sortBy=dueDate（缺失 dueDate 视为 0）', () => {
    manager.createTask('t-1', 'c1', { title: 'noDue' });
    manager.createTask('t-1', 'c1', { title: 'withDue', dueDate: new Date(NOW_TS + 1000) });
    const asc = manager.queryTasks({ tenantId: 't-1', sortBy: 'dueDate', sortOrder: 'asc' }).tasks;
    // 缺失 dueDate（0）排在前
    expect(asc[0].title).toBe('noDue');
  });
});

// ==================== 任务评论与子任务（含修复点 3） ====================

describe('任务评论与子任务', () => {
  it('addTaskComment（修复点 3）：assignee + createdBy 收到 task_commented，评论者不收', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'assignee-1' });
    manager.addTaskComment(task.id, 't-1', 'commenter-1', 'CName', 'hello');
    const aNotifs = manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_commented');
    const cNotifs = manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented');
    expect(aNotifs).toHaveLength(1);
    expect(cNotifs).toHaveLength(1);
    // 评论者本人不收
    expect(manager.getUserNotifications('commenter-1', 't-1')).toHaveLength(0);
    expect(aNotifs[0].data?.action).toBe('commented');
    expect(aNotifs[0].data?.fromUserId).toBe('commenter-1');
  });

  it('addTaskComment（修复点 3）：评论者为 assignee 时仅 createdBy 收到', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'assignee-1' });
    manager.addTaskComment(task.id, 't-1', 'assignee-1', 'AName', 'reply');
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
    expect(manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(0);
  });

  it('addTaskComment（修复点 3）：assignee 与 createdBy 同一人只通知一次', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'creator-1' });
    manager.addTaskComment(task.id, 't-1', 'commenter-1', 'C', 'hi');
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
  });

  it('addTaskComment（修复点 3）：无 assignee 时仅 createdBy 收到（若非评论者）', () => {
    const task = makeTask('t-1', 'creator-1');
    manager.addTaskComment(task.id, 't-1', 'commenter-1', 'C', 'hi');
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
  });

  it('addTaskComment（修复点 3）：mentions 仍发 task_mentioned（与 task_commented 并存）', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'assignee-1' });
    manager.addTaskComment(task.id, 't-1', 'commenter-1', 'C', 'hi', { mentions: ['mention-1'] });
    const mentioned = manager.getUserNotifications('mention-1', 't-1').filter(n => n.type === 'task_mentioned');
    expect(mentioned).toHaveLength(1);
    // assignee/creator 仍收到 task_commented
    expect(manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
  });

  it('addTaskComment：未命中 / 跨租户返回 null', () => {
    expect(manager.addTaskComment('nope', 't-1', 'c', 'C', 'hi')).toBeNull();
    const task = makeTask('t-1', 'c1');
    expect(manager.addTaskComment(task.id, 't-other', 'c', 'C', 'hi')).toBeNull();
  });

  it('addTaskComment：评论写入 task.comments + updatedAt', () => {
    const task = makeTask('t-1', 'c1');
    vi.setSystemTime(new Date(NOW_TS + 1000));
    const c = manager.addTaskComment(task.id, 't-1', 'c1', 'C', 'hello', { mentions: ['x'] });
    expect(c).not.toBeNull();
    expect(c!.content).toBe('hello');
    expect(c!.mentions).toEqual(['x']);
    const stored = manager.getTask(task.id, 't-1')!;
    expect(stored.comments).toHaveLength(1);
    expect(stored.updatedAt.getTime()).toBe(NOW_TS + 1000);
  });

  it('addSubtask：写入 task.subtasks + updatedAt', () => {
    const task = makeTask('t-1', 'c1');
    const st = manager.addSubtask(task.id, 't-1', 'sub1');
    expect(st).not.toBeNull();
    expect(st!.title).toBe('sub1');
    expect(st!.completed).toBe(false);
    expect(manager.getTask(task.id, 't-1')!.subtasks).toHaveLength(1);
  });

  it('addSubtask：未命中 / 跨租户返回 null', () => {
    expect(manager.addSubtask('nope', 't-1', 'x')).toBeNull();
    const task = makeTask('t-1', 'c1');
    expect(manager.addSubtask(task.id, 't-other', 'x')).toBeNull();
  });

  it('updateSubtaskStatus：completed=true 设 completedAt', () => {
    const task = makeTask('t-1', 'c1');
    const st = manager.addSubtask(task.id, 't-1', 'sub1')!;
    expect(manager.updateSubtaskStatus(task.id, st.id, 't-1', true)).toBe(true);
    const stored = manager.getTask(task.id, 't-1')!.subtasks[0];
    expect(stored.completed).toBe(true);
    expect(stored.completedAt).toEqual(NOW);
  });

  it('updateSubtaskStatus：completed=false 清 completedAt', () => {
    const task = makeTask('t-1', 'c1');
    const st = manager.addSubtask(task.id, 't-1', 'sub1')!;
    manager.updateSubtaskStatus(task.id, st.id, 't-1', true);
    manager.updateSubtaskStatus(task.id, st.id, 't-1', false);
    const stored = manager.getTask(task.id, 't-1')!.subtasks[0];
    expect(stored.completed).toBe(false);
    expect(stored.completedAt).toBeUndefined();
  });

  it('updateSubtaskStatus：未命中 task / 跨租户 / 子任务不存在返回 false', () => {
    expect(manager.updateSubtaskStatus('nope', 's1', 't-1', true)).toBe(false);
    const task = makeTask('t-1', 'c1');
    expect(manager.updateSubtaskStatus(task.id, 's1', 't-other', true)).toBe(false);
    expect(manager.updateSubtaskStatus(task.id, 'nope', 't-1', true)).toBe(false);
  });
});

// ==================== 批注管理 ====================

describe('批注管理', () => {
  it('createAnnotation：id 格式 / resolved=false / replies=[]', () => {
    fixRandom([0.6]);
    const params: CreateAnnotationParams = {
      fileId: 'file-1',
      type: 'comment',
      content: 'note',
      position: { startOffset: 0, endOffset: 5 },
    };
    const ann = manager.createAnnotation('t-1', 'u1', 'A', params);
    expect(ann).not.toBeNull();
    expect(ann!.id).toBe(`ann_${NOW_TS}_${suffixOf(0.6)}`);
    expect(ann!.fileId).toBe('file-1');
    expect(ann!.tenantId).toBe('t-1');
    expect(ann!.userId).toBe('u1');
    expect(ann!.resolved).toBe(false);
    expect(ann!.replies).toEqual([]);
    expect(ann!.position?.startOffset).toBe(0);
  });

  it('getFileAnnotations：按 tenantId 过滤', () => {
    manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'a' });
    manager.createAnnotation('t-2', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'b' });
    expect(manager.getFileAnnotations('file-1', 't-1')).toHaveLength(1);
    expect(manager.getFileAnnotations('file-1', 't-2')).toHaveLength(1);
  });

  it('getFileAnnotations：不存在返回 []', () => {
    expect(manager.getFileAnnotations('nope', 't-1')).toEqual([]);
  });

  it('addAnnotationReply：写入 replies + updatedAt', () => {
    const ann = manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'c' })!;
    vi.setSystemTime(new Date(NOW_TS + 1000));
    const reply = manager.addAnnotationReply(ann.id, 'file-1', 't-1', 'u2', 'B', 'reply!');
    expect(reply).not.toBeNull();
    expect(reply!.content).toBe('reply!');
    const stored = manager.getFileAnnotations('file-1', 't-1')[0];
    expect(stored.replies).toHaveLength(1);
    expect(stored.updatedAt.getTime()).toBe(NOW_TS + 1000);
  });

  it('addAnnotationReply：批注不存在 / 跨租户返回 null', () => {
    expect(manager.addAnnotationReply('nope', 'file-1', 't-1', 'u2', 'B', 'r')).toBeNull();
    const ann = manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'c' })!;
    expect(manager.addAnnotationReply(ann.id, 'file-1', 't-other', 'u2', 'B', 'r')).toBeNull();
    // fileId 无记录
    expect(manager.addAnnotationReply(ann.id, 'nope', 't-1', 'u2', 'B', 'r')).toBeNull();
  });

  it('resolveAnnotation：标记 resolved/resolvedBy/resolvedAt', () => {
    const ann = manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'c' })!;
    expect(manager.resolveAnnotation(ann.id, 'file-1', 't-1', 'u2')).toBe(true);
    const stored = manager.getFileAnnotations('file-1', 't-1')[0];
    expect(stored.resolved).toBe(true);
    expect(stored.resolvedBy).toBe('u2');
    expect(stored.resolvedAt).toEqual(NOW);
  });

  it('resolveAnnotation：已 resolved 返回 false', () => {
    const ann = manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'c' })!;
    manager.resolveAnnotation(ann.id, 'file-1', 't-1', 'u2');
    expect(manager.resolveAnnotation(ann.id, 'file-1', 't-1', 'u3')).toBe(false);
  });

  it('resolveAnnotation：批注不存在 / 跨租户返回 false', () => {
    expect(manager.resolveAnnotation('nope', 'file-1', 't-1', 'u2')).toBe(false);
    const ann = manager.createAnnotation('t-1', 'u1', 'A', { fileId: 'file-1', type: 'comment', content: 'c' })!;
    expect(manager.resolveAnnotation(ann.id, 'file-1', 't-other', 'u2')).toBe(false);
    // fileId 无记录
    expect(manager.resolveAnnotation(ann.id, 'nope', 't-1', 'u2')).toBe(false);
  });
});

// ==================== 通知管理（含修复点 1） ====================

describe('通知管理', () => {
  it('sendNotification（修复点 1）：默认设置放行 task_assigned', () => {
    manager.sendNotification('u1', 't-1', {
      type: 'task_assigned',
      title: 'T',
      content: 'C',
      data: { fromUserId: 'u2', action: 'assigned' },
    });
    const notifs = manager.getUserNotifications('u1', 't-1');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_assigned');
    expect(notifs[0].isRead).toBe(false);
    expect(notifs[0].data?.fromUserId).toBe('u2');
  });

  it('sendNotification（修复点 1）：关闭 taskAssigned 后 task_assigned 被拦截', () => {
    manager.updateNotificationSettings('u1', { taskAssigned: false });
    manager.sendNotification('u1', 't-1', {
      type: 'task_assigned',
      title: 'T',
      content: 'C',
    });
    // 修复前：snake_case 'task_assigned' 不匹配 camelCase 'taskAssigned'，开关被忽略，仍收到
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(0);
  });

  it('sendNotification（修复点 1）：关闭 taskCompleted 后 task_completed 被拦截', () => {
    manager.updateNotificationSettings('u1', { taskCompleted: false });
    manager.sendNotification('u1', 't-1', { type: 'task_completed', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(0);
  });

  it('sendNotification（修复点 1）：file_edited 默认关闭（DEFAULT_NOTIFICATION_SETTINGS.fileEdited=false）', () => {
    // 默认 fileEdited=false → file_edited 被拦截
    manager.sendNotification('u1', 't-1', { type: 'file_edited', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(0);
    // 开启后放行
    manager.updateNotificationSettings('u1', { fileEdited: true });
    manager.sendNotification('u1', 't-1', { type: 'file_edited', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(1);
  });

  it('sendNotification（修复点 1）：开启 taskAssigned 后恢复接收', () => {
    manager.updateNotificationSettings('u1', { taskAssigned: false });
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(0);
    manager.updateNotificationSettings('u1', { taskAssigned: true });
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(1);
  });

  it('sendNotification（修复点 1）：不影响其它类型开关（仅关 task_mentioned 不影响 task_assigned）', () => {
    manager.updateNotificationSettings('u1', { taskMentioned: false });
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-1', { type: 'task_mentioned', title: 'T', content: 'C' });
    const notifs = manager.getUserNotifications('u1', 't-1');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('task_assigned');
  });

  it('sendNotification + addTaskComment（修复点 1+3 联动）：关闭 taskCommented 后该用户不收评论通知，他人仍收', () => {
    const task = manager.createTask('t-1', 'creator-1', { title: 'T', assignee: 'assignee-1' });
    manager.updateNotificationSettings('creator-1', { taskCommented: false });
    manager.addTaskComment(task.id, 't-1', 'commenter-1', 'C', 'hi');
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(0);
    // assignee-1 未关 taskCommented，仍收到
    expect(manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);
  });

  it('sendNotification：unshift 最新在前', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: '1', content: 'c' });
    vi.setSystemTime(new Date(NOW_TS + 1000));
    manager.sendNotification('u1', 't-1', { type: 'task_completed', title: '2', content: 'c' });
    const list = manager.getUserNotifications('u1', 't-1');
    expect(list[0].type).toBe('task_completed');
    expect(list[1].type).toBe('task_assigned');
  });

  it('getUserNotifications：tenantId 过滤', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-2', { type: 'task_assigned', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1')).toHaveLength(1);
    expect(manager.getUserNotifications('u1', 't-2')).toHaveLength(1);
  });

  it('getUserNotifications：unreadOnly / type / limit', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-1', { type: 'task_completed', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-1', { type: 'task_mentioned', title: 'T', content: 'C' });
    expect(manager.getUserNotifications('u1', 't-1', { unreadOnly: true })).toHaveLength(3);
    expect(manager.getUserNotifications('u1', 't-1', { type: 'task_completed' })).toHaveLength(1);
    expect(manager.getUserNotifications('u1', 't-1', { limit: 2 })).toHaveLength(2);
  });

  it('getUserNotifications：无通知返回 []', () => {
    expect(manager.getUserNotifications('nobody', 't-1')).toEqual([]);
  });

  it('markNotificationAsRead：标记 isRead + readAt', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    const id = manager.getUserNotifications('u1', 't-1')[0].id;
    expect(manager.markNotificationAsRead(id, 'u1', 't-1')).toBe(true);
    const n = manager.getUserNotifications('u1', 't-1')[0];
    expect(n.isRead).toBe(true);
    expect(n.readAt).toEqual(NOW);
  });

  it('markNotificationAsRead：未命中 / 跨租户 / 用户无通知返回 false', () => {
    expect(manager.markNotificationAsRead('nope', 'u1', 't-1')).toBe(false);
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    expect(manager.markNotificationAsRead('nope', 'u1', 't-1')).toBe(false);
    // 跨租户：通知 tenantId=t-1，传 t-2
    const id = manager.getUserNotifications('u1', 't-1')[0].id;
    expect(manager.markNotificationAsRead(id, 'u1', 't-other')).toBe(false);
  });

  it('markAllNotificationsAsRead：返回已读数并标记', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-1', { type: 'task_completed', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-2', { type: 'task_assigned', title: 'T', content: 'C' });
    const count = manager.markAllNotificationsAsRead('u1', 't-1');
    expect(count).toBe(2);
    expect(manager.getUnreadNotificationCount('u1', 't-1')).toBe(0);
    expect(manager.getUnreadNotificationCount('u1', 't-2')).toBe(1);
  });

  it('markAllNotificationsAsRead：无通知返回 0', () => {
    expect(manager.markAllNotificationsAsRead('nobody', 't-1')).toBe(0);
  });

  it('getUnreadNotificationCount：未读计数', () => {
    manager.sendNotification('u1', 't-1', { type: 'task_assigned', title: 'T', content: 'C' });
    manager.sendNotification('u1', 't-1', { type: 'task_completed', title: 'T', content: 'C' });
    expect(manager.getUnreadNotificationCount('u1', 't-1')).toBe(2);
    const id = manager.getUserNotifications('u1', 't-1')[0].id;
    manager.markNotificationAsRead(id, 'u1', 't-1');
    expect(manager.getUnreadNotificationCount('u1', 't-1')).toBe(1);
  });

  it('getNotificationSettings：未设置返回默认副本', () => {
    const s = manager.getNotificationSettings('u1');
    expect(s).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    // 副本：修改不影响后续默认
    s.taskAssigned = false;
    expect(manager.getNotificationSettings('u1').taskAssigned).toBe(true);
  });

  it('updateNotificationSettings：合并存储', () => {
    const s = manager.updateNotificationSettings('u1', { taskAssigned: false, emailNotifications: false });
    expect(s.taskAssigned).toBe(false);
    expect(s.emailNotifications).toBe(false);
    expect(s.taskCompleted).toBe(true); // 未改保留默认
    // 持久化
    expect(manager.getNotificationSettings('u1').taskAssigned).toBe(false);
  });

  it('updateNotificationSettings：多次合并', () => {
    manager.updateNotificationSettings('u1', { taskAssigned: false });
    manager.updateNotificationSettings('u1', { taskCompleted: false });
    const s = manager.getNotificationSettings('u1');
    expect(s.taskAssigned).toBe(false);
    expect(s.taskCompleted).toBe(false);
    expect(s.taskMentioned).toBe(true);
  });
});

// ==================== 权限检查 ====================

describe('权限检查', () => {
  it('checkPermission：owner 全部 true', () => {
    expect(manager.checkPermission('owner', 'canView')).toBe(true);
    expect(manager.checkPermission('owner', 'canEdit')).toBe(true);
    expect(manager.checkPermission('owner', 'canComment')).toBe(true);
    expect(manager.checkPermission('owner', 'canShare')).toBe(true);
    expect(manager.checkPermission('owner', 'canDelete')).toBe(true);
    expect(manager.checkPermission('owner', 'canManage')).toBe(true);
  });

  it('checkPermission：editor 可编辑/评论，不可分享/删除/管理', () => {
    expect(manager.checkPermission('editor', 'canView')).toBe(true);
    expect(manager.checkPermission('editor', 'canEdit')).toBe(true);
    expect(manager.checkPermission('editor', 'canComment')).toBe(true);
    expect(manager.checkPermission('editor', 'canShare')).toBe(false);
    expect(manager.checkPermission('editor', 'canDelete')).toBe(false);
    expect(manager.checkPermission('editor', 'canManage')).toBe(false);
  });

  it('checkPermission：commenter 仅可看/评论', () => {
    expect(manager.checkPermission('commenter', 'canView')).toBe(true);
    expect(manager.checkPermission('commenter', 'canEdit')).toBe(false);
    expect(manager.checkPermission('commenter', 'canComment')).toBe(true);
  });

  it('checkPermission：viewer 仅可看', () => {
    expect(manager.checkPermission('viewer', 'canView')).toBe(true);
    expect(manager.checkPermission('viewer', 'canEdit')).toBe(false);
    expect(manager.checkPermission('viewer', 'canComment')).toBe(false);
  });

  it('getRolePermissions：返回对应权限对象', () => {
    expect(manager.getRolePermissions('owner')).toEqual(COLLABORATION_ROLE_PERMISSIONS.owner);
    expect(manager.getRolePermissions('viewer').canView).toBe(true);
    expect(manager.getRolePermissions('viewer').canEdit).toBe(false);
  });
});

// ==================== 显示名称 ====================

describe('显示名称', () => {
  it('getTaskStatusDisplayName', () => {
    const cases: Record<TaskStatus, string> = {
      todo: '待办',
      in_progress: '进行中',
      review: '审核中',
      completed: '已完成',
      cancelled: '已取消',
    };
    (Object.keys(cases) as TaskStatus[]).forEach(s => {
      expect(manager.getTaskStatusDisplayName(s)).toBe(cases[s]);
    });
  });

  it('getTaskPriorityDisplayName', () => {
    const cases: Record<TaskPriority, string> = {
      low: '低',
      medium: '中',
      high: '高',
      urgent: '紧急',
    };
    (Object.keys(cases) as TaskPriority[]).forEach(p => {
      expect(manager.getTaskPriorityDisplayName(p)).toBe(cases[p]);
    });
  });

  it('getAnnotationTypeDisplayName', () => {
    const cases: Record<AnnotationType, string> = {
      text: '文本',
      highlight: '高亮',
      comment: '评论',
      suggestion: '建议',
    };
    (Object.keys(cases) as AnnotationType[]).forEach(t => {
      expect(manager.getAnnotationTypeDisplayName(t)).toBe(cases[t]);
    });
  });

  it('getRoleDisplayName', () => {
    const cases: Record<CollaborationRole, string> = {
      owner: '所有者',
      editor: '编辑者',
      commenter: '评论者',
      viewer: '查看者',
    };
    (Object.keys(cases) as CollaborationRole[]).forEach(r => {
      expect(manager.getRoleDisplayName(r)).toBe(cases[r]);
    });
  });
});

// ==================== 综合场景 ====================

describe('综合场景', () => {
  it('完整任务协作流：创建→分配→评论→完成→通知', () => {
    // creator 创建并分配给 assignee
    const task = manager.createTask('t-1', 'creator-1', { title: '协作任务', assignee: 'assignee-1' });
    expect(manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_assigned')).toHaveLength(1);

    // assignee 评论（creator 收到 task_commented）
    manager.addTaskComment(task.id, 't-1', 'assignee-1', 'A', '开始处理');
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);

    // creator @reviewer 评论（reviewer 收到 task_mentioned，assignee 收到 task_commented——评论者为 creator，assignee 是相关人）
    manager.addTaskComment(task.id, 't-1', 'creator-1', 'C', '请 reviewer 看下', { mentions: ['reviewer-1'] });
    expect(manager.getUserNotifications('reviewer-1', 't-1').filter(n => n.type === 'task_mentioned')).toHaveLength(1);
    // assignee 此前作为评论者不收 task_commented；本次 creator 评论，assignee 作为相关人收到第 1 条
    expect(manager.getUserNotifications('assignee-1', 't-1').filter(n => n.type === 'task_commented')).toHaveLength(1);

    // assignee 完成任务 → creator 收到 task_completed
    manager.updateTask(task.id, 't-1', 'assignee-1', { status: 'completed' });
    expect(manager.getUserNotifications('creator-1', 't-1').filter(n => n.type === 'task_completed')).toHaveLength(1);
    expect(manager.getTask(task.id, 't-1')!.completedAt).toEqual(NOW);
  });

  it('会话协作流：创建→加入→操作→冲突→解决→结束', () => {
    const s = manager.createSession('file-1', 'host', 'Host', 't-1');
    manager.joinSession(s.id, 'u1', 'U1', 'editor');
    const op1 = manager.submitOperation(s.id, 'u1', { type: 'insert', position: 0, length: 5, content: 'a' })!;
    const op2 = manager.submitOperation(s.id, 'host', { type: 'insert', position: 3, length: 4, content: 'b' })!;
    const conflict = manager.detectConflict(s.id, op1, op2);
    expect(conflict).not.toBeNull();
    expect(manager.resolveConflict(conflict!.id, s.id, 'host', 'user1')).toBe(true);
    // host 离开 → 转移给 u1
    manager.leaveSession(s.id, 'host');
    expect(manager.getSession(s.id)!.hostUserId).toBe('u1');
    // u1 离开 → 会话结束
    manager.leaveSession(s.id, 'u1');
    expect(manager.getSession(s.id)!.status).toBe('ended');
  });

  it('通知设置全类型映射生效（修复点 1 全覆盖）', () => {
    const types: Array<{ type: import('@/lib/collaboration/types').CollaborationNotificationType; key: keyof typeof DEFAULT_NOTIFICATION_SETTINGS }> = [
      { type: 'task_assigned', key: 'taskAssigned' },
      { type: 'task_completed', key: 'taskCompleted' },
      { type: 'task_commented', key: 'taskCommented' },
      { type: 'task_mentioned', key: 'taskMentioned' },
      { type: 'file_shared', key: 'fileShared' },
      { type: 'file_edited', key: 'fileEdited' },
      { type: 'file_commented', key: 'fileCommented' },
      { type: 'invitation', key: 'invitation' },
      { type: 'mention', key: 'mention' },
      { type: 'review_requested', key: 'reviewRequested' },
    ];
    for (const { type, key } of types) {
      const m = new CollaborationManager();
      // 关闭该类型 → 拦截
      m.updateNotificationSettings('u1', { [key]: false } as Partial<typeof DEFAULT_NOTIFICATION_SETTINGS>);
      m.sendNotification('u1', 't-1', { type, title: 'T', content: 'C' });
      expect(m.getUserNotifications('u1', 't-1'), `${type} 应被 ${String(key)}=false 拦截`).toHaveLength(0);
      // 开启该类型 → 放行
      m.updateNotificationSettings('u1', { [key]: true } as Partial<typeof DEFAULT_NOTIFICATION_SETTINGS>);
      m.sendNotification('u1', 't-1', { type, title: 'T', content: 'C' });
      expect(m.getUserNotifications('u1', 't-1'), `${type} 应在 ${String(key)}=true 时放行`).toHaveLength(1);
    }
  });
});
