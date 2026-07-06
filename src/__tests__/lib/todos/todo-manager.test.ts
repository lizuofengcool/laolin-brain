/**
 * todos/todo-manager TodoManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/todos/todo-manager.ts。该模块为纯内存态的待办管理器单例
 * （任务列表 / 任务 / 标签 3 个 Map），无任何运行时外部 import，可直接对实例做白盒断言。
 *
 * 关键控制流：
 * - 单例：private constructor + static getInstance；模块导出 todoManager = getInstance()
 * - 任务列表 CRUD：
 *   · createList id=`tl_${ts}_${rand}`；默认 taskCount=0 / completedCount=0 / sortOrder=0 /
 *     isDefault=false / isFavorite=false；params 透传 name/description/icon/color
 *   · getList 命中返回同引用；未命中 / 跨租户 / 跨用户 → null
 *   · getListList 按 userId+tenantId 过滤；排序支持 Date/string/number 三分支，
 *     默认 sortBy='updatedAt' / sortOrder='desc'
 *   · updateList 浅合并（Object.assign，updatedAt 永远覆盖；id/tenantId/userId 可被
 *     updates 覆写——实际行为，记录而非断言"保留"）；跨租户返回 null
 *   · deleteList 将列表内任务的 listId 置为 undefined（移到「无列表」），再删除列表；
 *     未命中 / 跨租户 → false
 * - 任务 CRUD：
 *   · createTask id=`todo_${ts}_${rand}`；子任务构建为完整 SubTask（id=`st_${ts}_${index}` /
 *     completed=false / sortOrder=index / createdAt）；默认 status='pending' /
 *     priority='medium' / actualMinutes=0 / progress=0 / repeatType='none' /
 *     isAllDay=false / isFavorite=false / attachments=[] / comments=[]；
 *     若 listId 命中且属主匹配 → list.taskCount++ + list.updatedAt 刷新；
 *     本轮修复：同步递增已注册标签（createTag 注册过）的 taskCount（按 name 大小写不敏感 +
 *     userId + tenantId 匹配；tags 含重复名时按唯一计；未注册标签名静默跳过）
 *   · getTask 命中返回同引用；未命中 / 跨租户 / 跨用户 → null
 *   · getTaskList 预过滤 status !== 'cancelled'；支持 listId / tags(every) / status /
 *     priority / isFavorite / overdue 过滤；排序 priority(urgent=0..low=3) / dueDate(无 dueDate 沉底) /
 *     通用 Date/string 三分支；默认 sortBy='dueDate' / sortOrder='asc'；分页 page 默认 1 /
 *     pageSize 默认 20，返回 { tasks, total }
 *   · updateTask（本轮修复重点）：原实现将「完成计数 ++」「取消时间戳」「列表变更计数迁移」
 *     拆在 3 个独立 if 块，存在两类 bug：① uncompleteTask（completed→pending）不回退
 *     completedCount；② 列表变更 + 完成状态同时发生时完成块对旧列表 ++ 但列表变更块按旧 status
 *     迁移，致旧列表多计、新列表漏计。修复后统一为 delta 逻辑（按旧/新 listId 是否相同 +
 *     completed 状态是否翻转两分支闭合）；completed→非 completed（pending/cancelled）均回退
 *     completedCount。标签计数同步：updates.tags 显式提供时按集合差集同步（旧-新减 / 新-旧加 /
 *     共同不变），updates.tags 未提供（如 completeTask 仅改 status）时不动标签计数
 *   · deleteTask list.taskCount--（max 0，若 completed 同时 completedCount-- max 0）；
 *     本轮修复：同步递减已注册标签 taskCount（与 createTask ++ 对称）；返回 true；
 *     未命中 / 跨租户 → false
 *   · completeTask → updateTask({status:'completed'})；uncompleteTask → updateTask({status:'pending'})
 * - 子任务管理：addSubTask id=`st_${ts}_${rand}` / completed=false / sortOrder=当前长度 /
 *   createdAt；toggleSubTask 翻转 completed 并 set/clear completedAt；deleteSubTask splice；
 *   三者均触发 updateTaskProgress（无子任务→status===completed?100:0；有子任务→
 *   round(completed/total*100)）；跨租户 → null/false
 * - 标签管理：createTag 按 name 小写 + userId + tenantId 去重（命中返回已存在项）；
 *   taskCount 初始 0；getTagList sortBy 'count'(默认，本轮修复后有真实计数)/'name'(localeCompare)，
 *   limit 截断
 * - 搜索：query 小写匹配 title/description/tags(any)；tags 用 every（须全含）；
 *   支持 listId / status / priority / assigneeId / isFavorite / overdue / dateFrom / dateTo /
 *   dueDateFrom / dueDateTo 过滤；排序 priority/dueDate/通用；分页 page 默认 1 / pageSize 默认 20，
 *   返回 total/totalPages/hasMore
 * - 统计：getStats totalTasks/totalLists/totalTags/pendingTasks/inProgressTasks/completedTasks/
 *   cancelledTasks/overdueTasks/todayTasks/thisWeekTasks/thisMonthTasks/completedToday/
 *   completedThisWeek/completedThisMonth/completionRate/averageCompletionTime(分钟)/
 *   topLists(按 taskCount desc 取前 5)/topTags(按 taskCount desc 取前 10，本轮修复后有真实计数)/
 *   priorityDistribution
 *
 * 状态策略：TodoManager 构造器私有无法 new；每个用例前 vi.resetModules() + await import 取全新单例
 * （fresh class → fresh instance → fresh todos/lists/tags Maps）。依赖 Date.now() 的
 * id/时间戳断言用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；Math.random 在精确 id
 * 断言用例中 spy 固定返回值，期望后缀用同一表达式计算保证匹配。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Todo,
  TodoList,
  TodoTag,
  SubTask,
  TodoStats,
  CreateTodoListParams,
  CreateTodoParams,
  UpdateTodoParams,
  TodoSearchParams,
} from '@/lib/todos/types';

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

let TodoManager: typeof import('@/lib/todos/todo-manager')['TodoManager'];
let todoManager: import('@/lib/todos/todo-manager')['TodoManager'];

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@/lib/todos/todo-manager');
  TodoManager = mod.TodoManager;
  todoManager = mod.todoManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 构造一个最小可用的 CreateTodoParams，overrides 覆盖默认值 */
function makeTaskParams(overrides: Partial<CreateTodoParams> = {}): CreateTodoParams {
  return {
    title: overrides.title ?? 'task',
    ...overrides,
  };
}

describe('todos/todo-manager TodoManager', () => {
  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('todoManager 为 TodoManager 实例', () => {
      expect(todoManager).toBeInstanceOf(TodoManager);
    });

    it('getInstance 多次返回同一实例（单例）', () => {
      expect(TodoManager.getInstance()).toBe(todoManager);
    });

    it('resetModules 后取全新单例，状态隔离', async () => {
      const mod1 = await import('@/lib/todos/todo-manager');
      mod1.todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(mod1.todoManager.getListList('u-a', 't-a')).toHaveLength(1);

      vi.resetModules();
      const mod2 = await import('@/lib/todos/todo-manager');
      expect(mod2.todoManager.getListList('u-a', 't-a')).toHaveLength(0);
      expect(mod2.todoManager).not.toBe(mod1.todoManager);
    });
  });

  // ─── 任务列表管理 ───────────────────────────────────────────

  describe('createList', () => {
    it('id 形如 tl_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.123456789;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const list = todoManager.createList({ name: 'L1' }, 'u-a', 't-a');
      expect(list.id).toBe(`tl_${NOW_TS}_${expectedSuffix}`);
      expect(list.name).toBe('L1');
      expect(list.description).toBeUndefined();
      expect(list.icon).toBeUndefined();
      expect(list.color).toBeUndefined();
      expect(list.taskCount).toBe(0);
      expect(list.completedCount).toBe(0);
      expect(list.sortOrder).toBe(0);
      expect(list.isDefault).toBe(false);
      expect(list.isFavorite).toBe(false);
      expect(list.tenantId).toBe('t-a');
      expect(list.userId).toBe('u-a');
      expect(list.createdAt).toEqual(NOW);
      expect(list.updatedAt).toEqual(NOW);
    });

    it('params 透传覆盖默认值', () => {
      const list = todoManager.createList(
        { name: 'N', description: 'd', icon: 'i', color: '#ff0000' },
        'u-a',
        't-a'
      );
      expect(list.name).toBe('N');
      expect(list.description).toBe('d');
      expect(list.icon).toBe('i');
      expect(list.color).toBe('#ff0000');
    });
  });

  describe('getList', () => {
    it('命中返回同引用', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(todoManager.getList(list.id, 'u-a', 't-a')).toBe(list);
    });

    it('未命中返回 null', () => {
      expect(todoManager.getList('nope', 'u-a', 't-a')).toBeNull();
    });

    it('跨用户返回 null', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(todoManager.getList(list.id, 'u-b', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(todoManager.getList(list.id, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('getListList', () => {
    it('按 userId+tenantId 过滤', () => {
      todoManager.createList({ name: 'a' }, 'u-a', 't-a');
      todoManager.createList({ name: 'b' }, 'u-a', 't-a');
      todoManager.createList({ name: 'c' }, 'u-b', 't-a');
      todoManager.createList({ name: 'd' }, 'u-a', 't-b');
      expect(todoManager.getListList('u-a', 't-a')).toHaveLength(2);
    });

    it('默认 sortBy=updatedAt / sortOrder=desc', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const l1 = todoManager.createList({ name: 'a' }, 'u-a', 't-a');
      vi.setSystemTime(new Date(NOW_TS + 1000)); // 推进 1s 避免 same-ms 时序巧合
      const l2 = todoManager.createList({ name: 'b' }, 'u-a', 't-a');
      const res = todoManager.getListList('u-a', 't-a', { sortBy: 'updatedAt', sortOrder: 'desc' });
      expect(res[0].id).toBe(l2.id);
      expect(res[1].id).toBe(l1.id);
    });

    it('sortBy=name / sortOrder=asc 按 localeCompare', () => {
      todoManager.createList({ name: 'banana' }, 'u-a', 't-a');
      todoManager.createList({ name: 'apple' }, 'u-a', 't-a');
      todoManager.createList({ name: 'cherry' }, 'u-a', 't-a');
      const res = todoManager.getListList('u-a', 't-a', { sortBy: 'name', sortOrder: 'asc' });
      expect(res.map((l) => l.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('sortBy=name / sortOrder=desc 反序', () => {
      todoManager.createList({ name: 'banana' }, 'u-a', 't-a');
      todoManager.createList({ name: 'apple' }, 'u-a', 't-a');
      todoManager.createList({ name: 'cherry' }, 'u-a', 't-a');
      const res = todoManager.getListList('u-a', 't-a', { sortBy: 'name', sortOrder: 'desc' });
      expect(res.map((l) => l.name)).toEqual(['cherry', 'banana', 'apple']);
    });

    it('sortBy=taskCount 数字分支', () => {
      const l1 = todoManager.createList({ name: 'a' }, 'u-a', 't-a');
      const l2 = todoManager.createList({ name: 'b' }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', listId: l1.id }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', listId: l1.id }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', listId: l2.id }, 'u-a', 't-a');
      const res = todoManager.getListList('u-a', 't-a', { sortBy: 'taskCount', sortOrder: 'desc' });
      expect(res[0].id).toBe(l1.id);
      expect(res[0].taskCount).toBe(2);
      expect(res[1].id).toBe(l2.id);
      expect(res[1].taskCount).toBe(1);
    });

    it('跨租户/跨用户不返回', () => {
      todoManager.createList({ name: 'a' }, 'u-a', 't-a');
      expect(todoManager.getListList('u-b', 't-a')).toHaveLength(0);
      expect(todoManager.getListList('u-a', 't-b')).toHaveLength(0);
    });
  });

  describe('updateList', () => {
    it('浅合并 updates + updatedAt 刷新', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const updated = todoManager.updateList(list.id, { name: 'L2', color: '#000' }, 'u-a', 't-a');
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('L2');
      expect(updated!.color).toBe('#000');
      expect(updated!.description).toBeUndefined();
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(list.updatedAt.getTime());
    });

    it('未命中返回 null', () => {
      expect(todoManager.updateList('nope', { name: 'x' }, 'u-a', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(todoManager.updateList(list.id, { name: 'x' }, 'u-a', 't-b')).toBeNull();
    });

    it('id/tenantId/userId 可被 updates 覆写（实际行为）', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const updated = todoManager.updateList(list.id, { name: 'L2' }, 'u-a', 't-a');
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('L2');
    });
  });

  describe('deleteList', () => {
    it('删除列表并将列表内任务 listId 置空', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', listId: list.id }, 'u-a', 't-a');
      expect(todoManager.deleteList(list.id, 'u-a', 't-a')).toBe(true);
      expect(todoManager.getList(list.id, 'u-a', 't-a')).toBeNull();
      // 任务仍在，但 listId 被置为 undefined
      const t = todoManager.getTask(task.id, 'u-a', 't-a');
      expect(t).not.toBeNull();
      expect(t!.listId).toBeUndefined();
    });

    it('未命中返回 false', () => {
      expect(todoManager.deleteList('nope', 'u-a', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      expect(todoManager.deleteList(list.id, 'u-a', 't-b')).toBe(false);
      expect(todoManager.getList(list.id, 'u-a', 't-a')).not.toBeNull();
    });
  });

  // ─── 任务管理 ───────────────────────────────────────────

  describe('createTask', () => {
    it('id 形如 todo_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.987654321;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const task = todoManager.createTask(makeTaskParams(), 'u-a', 't-a');
      expect(task.id).toBe(`todo_${NOW_TS}_${expectedSuffix}`);
      expect(task.title).toBe('task');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
      expect(task.listId).toBeUndefined();
      expect(task.tags).toEqual([]);
      expect(task.creatorId).toBe('u-a');
      expect(task.repeatType).toBe('none');
      expect(task.isAllDay).toBe(false);
      expect(task.isFavorite).toBe(false);
      expect(task.actualMinutes).toBe(0);
      expect(task.progress).toBe(0);
      expect(task.subTasks).toEqual([]);
      expect(task.attachments).toEqual([]);
      expect(task.comments).toEqual([]);
      expect(task.reminders).toEqual([]);
      expect(task.tenantId).toBe('t-a');
      expect(task.userId).toBe('u-a');
      expect(task.createdAt).toEqual(NOW);
      expect(task.updatedAt).toEqual(NOW);
    });

    it('params 透传覆盖默认值', () => {
      const due = new Date('2026-07-10T09:00:00Z');
      const start = new Date('2026-07-09T09:00:00Z');
      const task = todoManager.createTask(
        {
          title: 'T',
          description: 'd',
          priority: 'urgent',
          tags: ['a', 'b'],
          dueDate: due,
          startDate: start,
          isAllDay: true,
          isFavorite: true,
          estimatedMinutes: 30,
          repeatType: 'daily',
          repeatInterval: 2,
        },
        'u-a',
        't-a'
      );
      expect(task.title).toBe('T');
      expect(task.description).toBe('d');
      expect(task.priority).toBe('urgent');
      expect(task.tags).toEqual(['a', 'b']);
      expect(task.dueDate).toBe(due);
      expect(task.startDate).toBe(start);
      expect(task.isAllDay).toBe(true);
      expect(task.isFavorite).toBe(true);
      expect(task.estimatedMinutes).toBe(30);
      expect(task.repeatType).toBe('daily');
      expect(task.repeatInterval).toBe(2);
    });

    it('子任务构建为完整 SubTask（id=st_${ts}_${index}/completed=false/sortOrder=index/createdAt）', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const task = todoManager.createTask(
        { title: 'T', subTasks: [{ title: 's1' }, { title: 's2' }] },
        'u-a',
        't-a'
      );
      expect(task.subTasks).toHaveLength(2);
      expect(task.subTasks[0].id).toBe(`st_${NOW_TS}_0`);
      expect(task.subTasks[1].id).toBe(`st_${NOW_TS}_1`);
      expect(task.subTasks[0].title).toBe('s1');
      expect(task.subTasks[0].completed).toBe(false);
      expect(task.subTasks[0].sortOrder).toBe(0);
      expect(task.subTasks[1].sortOrder).toBe(1);
      expect(task.subTasks[0].createdAt).toEqual(NOW);
    });

    it('listId 命中且属主匹配 → list.taskCount++ + updatedAt 刷新', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const before = list.updatedAt.getTime();
      const task = todoManager.createTask({ title: 't', listId: list.id }, 'u-a', 't-a');
      expect(task.listId).toBe(list.id);
      expect(list.taskCount).toBe(1);
      expect(list.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('listId 跨租户不增计数（task.listId 仍被赋值）', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', listId: list.id }, 'u-a', 't-b');
      expect(task.listId).toBe(list.id);
      expect(list.taskCount).toBe(0);
    });

    it('【修复】已注册标签 taskCount 同步递增（大小写不敏感 + 去重）', () => {
      const tagWork = todoManager.createTag('Work', 'u-a', 't-a');
      const tagUrgent = todoManager.createTag('urgent', 'u-a', 't-a');
      expect(tagWork.taskCount).toBe(0);
      // tags 含 'work'(小写)、'WORK'(大写)、'urgent'（重复名按唯一计）
      todoManager.createTask(
        { title: 't', tags: ['work', 'WORK', 'urgent', 'unregistered'] },
        'u-a',
        't-a'
      );
      expect(tagWork.taskCount).toBe(1); // work + WORK 去重为 1
      expect(tagUrgent.taskCount).toBe(1);
    });

    it('【修复】未注册标签名静默跳过（不创建实体）', () => {
      todoManager.createTask({ title: 't', tags: ['foo', 'bar'] }, 'u-a', 't-a');
      expect(todoManager.getTagList('u-a', 't-a')).toHaveLength(0);
    });

    it('【修复】跨租户/跨用户的同名标签不被递增', () => {
      todoManager.createTag('Work', 'u-a', 't-a');
      const tagB = todoManager.createTag('work', 'u-b', 't-a');
      todoManager.createTask({ title: 't', tags: ['work'] }, 'u-a', 't-a');
      expect(tagB.taskCount).toBe(0);
    });
  });

  describe('getTask', () => {
    it('命中返回同引用', () => {
      const task = todoManager.createTask(makeTaskParams(), 'u-a', 't-a');
      expect(todoManager.getTask(task.id, 'u-a', 't-a')).toBe(task);
    });

    it('未命中返回 null', () => {
      expect(todoManager.getTask('nope', 'u-a', 't-a')).toBeNull();
    });

    it('跨用户返回 null', () => {
      const task = todoManager.createTask(makeTaskParams(), 'u-a', 't-a');
      expect(todoManager.getTask(task.id, 'u-b', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const task = todoManager.createTask(makeTaskParams(), 'u-a', 't-a');
      expect(todoManager.getTask(task.id, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('getTaskList', () => {
    it('预过滤 cancelled 任务', () => {
      const t1 = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      todoManager.updateTask(t2.id, { status: 'cancelled' }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a');
      expect(res.total).toBe(1);
      expect(res.tasks.map((t) => t.id)).toEqual([t1.id]);
    });

    it('listId 过滤', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const t1 = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a', { listId: list.id });
      expect(res.total).toBe(1);
      expect(res.tasks[0].id).toBe(t1.id);
    });

    it('tags 过滤用 every（须全含）', () => {
      todoManager.createTask({ title: 'a', tags: ['x'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b', tags: ['x', 'y'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 'c', tags: ['y'] }, 'u-a', 't-a');
      expect(todoManager.getTaskList('u-a', 't-a', { tags: ['x'] }).total).toBe(2);
      expect(todoManager.getTaskList('u-a', 't-a', { tags: ['x', 'y'] }).total).toBe(1);
    });

    it('status / priority / isFavorite 过滤', () => {
      todoManager.createTask({ title: 'a', priority: 'high' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b', priority: 'low', isFavorite: true }, 'u-a', 't-a');
      const t3 = todoManager.createTask({ title: 'c', priority: 'low' }, 'u-a', 't-a');
      todoManager.updateTask(t3.id, { status: 'in-progress' }, 'u-a', 't-a');
      expect(todoManager.getTaskList('u-a', 't-a', { status: 'in-progress' }).total).toBe(1);
      expect(todoManager.getTaskList('u-a', 't-a', { priority: 'high' }).total).toBe(1);
      expect(todoManager.getTaskList('u-a', 't-a', { isFavorite: true }).total).toBe(1);
    });

    it('overdue 过滤（dueDate<now 且未完成/未取消）', () => {
      const past = new Date('2020-01-01T00:00:00Z');
      const future = new Date('2030-01-01T00:00:00Z');
      const t1 = todoManager.createTask({ title: 'a', dueDate: past }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b', dueDate: future }, 'u-a', 't-a');
      const t3 = todoManager.createTask({ title: 'c', dueDate: past }, 'u-a', 't-a');
      todoManager.updateTask(t3.id, { status: 'completed' }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a', { overdue: true });
      expect(res.total).toBe(1);
      expect(res.tasks[0].id).toBe(t1.id);
    });

    it('sortBy=priority / asc（urgent=0..low=3）', () => {
      const t1 = todoManager.createTask({ title: 'a', priority: 'low' }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'b', priority: 'urgent' }, 'u-a', 't-a');
      const t3 = todoManager.createTask({ title: 'c', priority: 'medium' }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a', { sortBy: 'priority', sortOrder: 'asc' });
      expect(res.tasks.map((t) => t.id)).toEqual([t2.id, t3.id, t1.id]);
    });

    it('sortBy=dueDate / asc：无 dueDate 沉底', () => {
      const d1 = new Date('2026-07-05T00:00:00Z');
      const d2 = new Date('2026-07-10T00:00:00Z');
      const t1 = todoManager.createTask({ title: 'a', dueDate: d1 }, 'u-a', 't-a');
      const tNo = todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'c', dueDate: d2 }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a', { sortBy: 'dueDate', sortOrder: 'asc' });
      expect(res.tasks.map((t) => t.id)).toEqual([t1.id, t2.id, tNo.id]);
    });

    it('sortBy=title 字符串分支', () => {
      todoManager.createTask({ title: 'banana' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'apple' }, 'u-a', 't-a');
      const res = todoManager.getTaskList('u-a', 't-a', { sortBy: 'title', sortOrder: 'asc' });
      expect(res.tasks.map((t) => t.title)).toEqual(['apple', 'banana']);
    });

    it('分页 page 默认 1 / pageSize 默认 20', () => {
      for (let i = 0; i < 25; i++) {
        todoManager.createTask({ title: `t${i}` }, 'u-a', 't-a');
      }
      const res = todoManager.getTaskList('u-a', 't-a');
      expect(res.total).toBe(25);
      expect(res.tasks).toHaveLength(20);
      const res2 = todoManager.getTaskList('u-a', 't-a', { page: 2, pageSize: 20 });
      expect(res2.tasks).toHaveLength(5);
    });

    it('跨租户不返回', () => {
      todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.getTaskList('u-b', 't-a').total).toBe(0);
    });
  });

  describe('updateTask', () => {
    it('浅合并 updates + updatedAt 刷新', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      const before = task.updatedAt.getTime();
      const updated = todoManager.updateTask(task.id, { title: 'b', priority: 'high' }, 'u-a', 't-a');
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('b');
      expect(updated!.priority).toBe('high');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('未命中返回 null', () => {
      expect(todoManager.updateTask('nope', { title: 'x' }, 'u-a', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.updateTask(task.id, { title: 'x' }, 'u-a', 't-b')).toBeNull();
    });

    it('完成（pending→completed）：设 completedAt + actualMinutes（有 startDate）+ completedCount++', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      vi.useFakeTimers();
      const start = new Date('2026-07-01T08:00:00Z');
      vi.setSystemTime(start);
      const task = todoManager.createTask(
        { title: 'a', listId: list.id, startDate: start },
        'u-a',
        't-a'
      );
      const completeAt = new Date('2026-07-01T10:00:00Z'); // +120min
      vi.setSystemTime(completeAt);
      const updated = todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toEqual(completeAt);
      expect(updated!.actualMinutes).toBe(120);
      expect(list.completedCount).toBe(1);
      expect(list.taskCount).toBe(1);
    });

    it('完成无 startDate：completedAt 设置、actualMinutes 不动', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      const updated = todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(updated!.completedAt).toBeInstanceOf(Date);
      expect(updated!.actualMinutes).toBe(0);
      expect(list.completedCount).toBe(1);
    });

    it('【修复】uncomplete（completed→pending）：completedCount 回退', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(1);
      todoManager.updateTask(task.id, { status: 'pending' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(0); // 修复前：仍为 1
    });

    it('【修复】completed→cancelled：completedCount 回退', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(1);
      todoManager.updateTask(task.id, { status: 'cancelled' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(0); // 修复前：仍为 1
    });

    it('重复完成（completed→completed）：completedCount 不重复递增', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(1);
    });

    it('取消（pending→cancelled）：设 cancelledAt', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      const updated = todoManager.updateTask(task.id, { status: 'cancelled' }, 'u-a', 't-a');
      expect(updated!.status).toBe('cancelled');
      expect(updated!.cancelledAt).toBeInstanceOf(Date);
    });

    it('列表变更（pending→新列表）：旧 taskCount-- / 新 taskCount++', () => {
      const l1 = todoManager.createList({ name: 'L1' }, 'u-a', 't-a');
      const l2 = todoManager.createList({ name: 'L2' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: l1.id }, 'u-a', 't-a');
      expect(l1.taskCount).toBe(1);
      todoManager.updateTask(task.id, { listId: l2.id }, 'u-a', 't-a');
      expect(l1.taskCount).toBe(0);
      expect(l2.taskCount).toBe(1);
    });

    it('列表变更 + 同时完成（pending→completed + 旧→新）：旧列表 completedCount 不动、新列表 completedCount++', () => {
      const l1 = todoManager.createList({ name: 'L1' }, 'u-a', 't-a');
      const l2 = todoManager.createList({ name: 'L2' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: l1.id }, 'u-a', 't-a');
      // 修复前：完成块对 l1 completedCount++（任务已离开 l1，多计），l2 completedCount 漏计
      todoManager.updateTask(
        task.id,
        { listId: l2.id, status: 'completed' },
        'u-a',
        't-a'
      );
      expect(l1.taskCount).toBe(0);
      expect(l1.completedCount).toBe(0); // 修复前：1
      expect(l2.taskCount).toBe(1);
      expect(l2.completedCount).toBe(1); // 修复前：0
    });

    it('列表变更 + 同时取消完成（completed→pending + 旧→新）：旧 completedCount-- / 新不++', () => {
      const l1 = todoManager.createList({ name: 'L1' }, 'u-a', 't-a');
      const l2 = todoManager.createList({ name: 'L2' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: l1.id }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(l1.completedCount).toBe(1);
      todoManager.updateTask(
        task.id,
        { listId: l2.id, status: 'pending' },
        'u-a',
        't-a'
      );
      expect(l1.taskCount).toBe(0);
      expect(l1.completedCount).toBe(0);
      expect(l2.taskCount).toBe(1);
      expect(l2.completedCount).toBe(0);
    });

    it('listId 传 undefined 视为未提供（no-op，不迁移计数）—— 实际契约', () => {
      const l1 = todoManager.createList({ name: 'L1' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: l1.id }, 'u-a', 't-a');
      // updates.listId !== undefined 守卫：传 undefined 等同未提供，不触发列表迁移
      // （清空列表仅经 deleteList 直接置 listId=undefined 实现）
      todoManager.updateTask(task.id, { listId: undefined }, 'u-a', 't-a');
      expect(l1.taskCount).toBe(1);
      expect(task.listId).toBe(l1.id);
    });

    it('【修复】updates.tags 显式提供时按集合差集同步标签计数', () => {
      const tagA = todoManager.createTag('a', 'u-a', 't-a');
      const tagB = todoManager.createTag('b', 'u-a', 't-a');
      const tagC = todoManager.createTag('c', 'u-a', 't-a');
      const task = todoManager.createTask(
        { title: 't', tags: ['a', 'b'] },
        'u-a',
        't-a'
      );
      expect(tagA.taskCount).toBe(1);
      expect(tagB.taskCount).toBe(1);
      expect(tagC.taskCount).toBe(0);
      // ['a','b'] → ['b','c']：a 减、b 不变、c 加
      todoManager.updateTask(task.id, { tags: ['b', 'c'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(0);
      expect(tagB.taskCount).toBe(1);
      expect(tagC.taskCount).toBe(1);
    });

    it('【修复】updates.tags 大小写不敏感差集', () => {
      const tagA = todoManager.createTag('Work', 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', tags: ['work'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1);
      // 'work' → 'WORK'：小写相同，视为不变
      todoManager.updateTask(task.id, { tags: ['WORK'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1);
    });

    it('【修复】updates.tags 未提供时不动标签计数（completeTask 不误触）', () => {
      const tagA = todoManager.createTag('a', 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', tags: ['a'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1);
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1); // 不动
    });

    it('updates.tags 含重复名按唯一计（不双计）', () => {
      const tagA = todoManager.createTag('a', 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't' }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { tags: ['a', 'A', 'a'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1);
    });
  });

  describe('deleteTask', () => {
    it('删除任务并回退 list.taskCount', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      expect(list.taskCount).toBe(1);
      expect(todoManager.deleteTask(task.id, 'u-a', 't-a')).toBe(true);
      expect(todoManager.getTask(task.id, 'u-a', 't-a')).toBeNull();
      expect(list.taskCount).toBe(0);
    });

    it('删除 completed 任务同时回退 completedCount', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(list.completedCount).toBe(1);
      todoManager.deleteTask(task.id, 'u-a', 't-a');
      expect(list.taskCount).toBe(0);
      expect(list.completedCount).toBe(0);
    });

    it('【修复】同步递减已注册标签 taskCount（与 createTask ++ 对称）', () => {
      const tagA = todoManager.createTag('a', 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', tags: ['a'] }, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(1);
      todoManager.deleteTask(task.id, 'u-a', 't-a');
      expect(tagA.taskCount).toBe(0); // 修复前：仍为 1
    });

    it('删除后标签计数不低于 0（max 0 保护）', () => {
      const tagA = todoManager.createTag('a', 'u-a', 't-a');
      const task = todoManager.createTask({ title: 't', tags: ['a'] }, 'u-a', 't-a');
      todoManager.deleteTask(task.id, 'u-a', 't-a');
      todoManager.deleteTask(task.id, 'u-a', 't-a'); // 已删除，noop
      expect(tagA.taskCount).toBe(0);
    });

    it('未命中返回 false', () => {
      expect(todoManager.deleteTask('nope', 'u-a', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.deleteTask(task.id, 'u-a', 't-b')).toBe(false);
      expect(todoManager.getTask(task.id, 'u-a', 't-a')).not.toBeNull();
    });
  });

  describe('completeTask / uncompleteTask', () => {
    it('completeTask → updateTask({status:completed})', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      const res = todoManager.completeTask(task.id, 'u-a', 't-a');
      expect(res).not.toBeNull();
      expect(res!.status).toBe('completed');
      expect(list.completedCount).toBe(1);
    });

    it('uncompleteTask → updateTask({status:pending})，回退 completedCount', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      const task = todoManager.createTask({ title: 'a', listId: list.id }, 'u-a', 't-a');
      todoManager.completeTask(task.id, 'u-a', 't-a');
      expect(list.completedCount).toBe(1);
      todoManager.uncompleteTask(task.id, 'u-a', 't-a');
      expect(list.completedCount).toBe(0);
    });

    it('completeTask 跨租户返回 null', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.completeTask(task.id, 'u-a', 't-b')).toBeNull();
    });
  });

  // ─── 子任务管理 ───────────────────────────────────────────

  describe('addSubTask', () => {
    it('构建完整 SubTask（id/completed=false/sortOrder=长度/createdAt）并更新进度', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      const st = todoManager.addSubTask(task.id, 's1', 'u-a', 't-a');
      expect(st).not.toBeNull();
      expect(st!.id).toMatch(/^st_\d+_/);
      expect(st!.title).toBe('s1');
      expect(st!.completed).toBe(false);
      expect(st!.sortOrder).toBe(0);
      expect(st!.createdAt).toEqual(NOW);
      expect(task.progress).toBe(0); // 0/1
    });

    it('sortOrder 跟随当前子任务长度', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }, { title: 's2' }] },
        'u-a',
        't-a'
      );
      const st = todoManager.addSubTask(task.id, 's3', 'u-a', 't-a');
      expect(st!.sortOrder).toBe(2);
    });

    it('未命中返回 null', () => {
      expect(todoManager.addSubTask('nope', 's', 'u-a', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.addSubTask(task.id, 's', 'u-a', 't-b')).toBeNull();
    });
  });

  describe('toggleSubTask', () => {
    it('翻转 completed 并 set completedAt', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }] },
        'u-a',
        't-a'
      );
      const stId = task.subTasks[0].id;
      const st = todoManager.toggleSubTask(task.id, stId, 'u-a', 't-a');
      expect(st!.completed).toBe(true);
      expect(st!.completedAt).toBeInstanceOf(Date);
      expect(task.progress).toBe(100); // 1/1
    });

    it('再翻转回 false 清除 completedAt', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }] },
        'u-a',
        't-a'
      );
      const stId = task.subTasks[0].id;
      todoManager.toggleSubTask(task.id, stId, 'u-a', 't-a');
      const st = todoManager.toggleSubTask(task.id, stId, 'u-a', 't-a');
      expect(st!.completed).toBe(false);
      expect(st!.completedAt).toBeUndefined();
      expect(task.progress).toBe(0);
    });

    it('进度按比例：2 个子任务完成 1 个 → 50', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }, { title: 's2' }] },
        'u-a',
        't-a'
      );
      todoManager.toggleSubTask(task.id, task.subTasks[0].id, 'u-a', 't-a');
      expect(task.progress).toBe(50);
    });

    it('子任务未命中返回 null', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.toggleSubTask(task.id, 'nope', 'u-a', 't-a')).toBeNull();
    });

    it('任务未命中返回 null', () => {
      expect(todoManager.toggleSubTask('nope', 'x', 'u-a', 't-a')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }] },
        'u-a',
        't-a'
      );
      expect(
        todoManager.toggleSubTask(task.id, task.subTasks[0].id, 'u-a', 't-b')
      ).toBeNull();
    });
  });

  describe('deleteSubTask', () => {
    it('splice 子任务并更新进度', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }, { title: 's2' }] },
        'u-a',
        't-a'
      );
      const stId = task.subTasks[0].id;
      expect(todoManager.deleteSubTask(task.id, stId, 'u-a', 't-a')).toBe(true);
      expect(task.subTasks).toHaveLength(1);
      expect(task.subTasks[0].title).toBe('s2');
    });

    it('子任务未命中返回 false', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.deleteSubTask(task.id, 'nope', 'u-a', 't-a')).toBe(false);
    });

    it('任务未命中返回 false', () => {
      expect(todoManager.deleteSubTask('nope', 'x', 'u-a', 't-a')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }] },
        'u-a',
        't-a'
      );
      expect(
        todoManager.deleteSubTask(task.id, task.subTasks[0].id, 'u-a', 't-b')
      ).toBe(false);
    });
  });

  describe('updateTaskProgress（私有，经子任务操作触发）', () => {
    it('无子任务时 updateTask 改 status 不触发 updateTaskProgress（progress 保持 0）—— 实际契约', () => {
      // updateTaskProgress 仅经 addSubTask / toggleSubTask / deleteSubTask 触发；
      // updateTask 即便将 status 置 completed 也不刷新 progress（latent gap，记入下一轮候选）
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      todoManager.updateTask(task.id, { status: 'completed' }, 'u-a', 't-a');
      expect(task.progress).toBe(0);
    });

    it('无子任务的 pending 任务 progress=0', () => {
      const task = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(task.progress).toBe(0);
    });

    it('3 个子任务完成 1 个 → round(1/3*100)=33', () => {
      const task = todoManager.createTask(
        { title: 'a', subTasks: [{ title: 's1' }, { title: 's2' }, { title: 's3' }] },
        'u-a',
        't-a'
      );
      todoManager.toggleSubTask(task.id, task.subTasks[0].id, 'u-a', 't-a');
      expect(task.progress).toBe(33);
    });
  });

  // ─── 标签管理 ───────────────────────────────────────────

  describe('createTag', () => {
    it('id 形如 tt_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.456789123;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const tag = todoManager.createTag('Work', 'u-a', 't-a');
      expect(tag.id).toBe(`tt_${NOW_TS}_${expectedSuffix}`);
      expect(tag.name).toBe('Work');
      expect(tag.color).toBeUndefined();
      expect(tag.taskCount).toBe(0);
      expect(tag.tenantId).toBe('t-a');
      expect(tag.userId).toBe('u-a');
      expect(tag.createdAt).toEqual(NOW);
    });

    it('options.color 透传', () => {
      const tag = todoManager.createTag('Work', 'u-a', 't-a', { color: '#ff0000' });
      expect(tag.color).toBe('#ff0000');
    });

    it('按 name 小写 + userId + tenantId 去重（命中返回已存在项）', () => {
      const t1 = todoManager.createTag('Work', 'u-a', 't-a');
      const t2 = todoManager.createTag('WORK', 'u-a', 't-a');
      expect(t2).toBe(t1);
    });

    it('跨租户/跨用户同名独立', () => {
      const t1 = todoManager.createTag('Work', 'u-a', 't-a');
      const t2 = todoManager.createTag('work', 'u-b', 't-a');
      const t3 = todoManager.createTag('work', 'u-a', 't-b');
      expect(t1).not.toBe(t2);
      expect(t1).not.toBe(t3);
      expect(t2).not.toBe(t3);
    });
  });

  describe('getTagList', () => {
    it('按 userId+tenantId 过滤', () => {
      todoManager.createTag('a', 'u-a', 't-a');
      todoManager.createTag('b', 'u-a', 't-a');
      todoManager.createTag('c', 'u-b', 't-a');
      expect(todoManager.getTagList('u-a', 't-a')).toHaveLength(2);
    });

    it('sortBy=count（默认）按 taskCount desc（修复后有真实计数）', () => {
      const tA = todoManager.createTag('a', 'u-a', 't-a');
      const tB = todoManager.createTag('b', 'u-a', 't-a');
      const tC = todoManager.createTag('c', 'u-a', 't-a');
      todoManager.createTask({ title: 't', tags: ['b', 'b'] }, 'u-a', 't-a'); // b=1
      todoManager.createTask({ title: 't', tags: ['a'] }, 'u-a', 't-a'); // a=1
      todoManager.createTask({ title: 't', tags: ['b', 'c'] }, 'u-a', 't-a'); // b=2, c=1
      const res = todoManager.getTagList('u-a', 't-a', { sortBy: 'count' });
      expect(res.map((t) => t.name)).toEqual(['b', 'a', 'c']);
      expect(res[0].taskCount).toBe(2);
    });

    it('sortBy=name 按 localeCompare asc', () => {
      todoManager.createTag('banana', 'u-a', 't-a');
      todoManager.createTag('apple', 'u-a', 't-a');
      todoManager.createTag('cherry', 'u-a', 't-a');
      const res = todoManager.getTagList('u-a', 't-a', { sortBy: 'name' });
      expect(res.map((t) => t.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('limit 截断', () => {
      todoManager.createTag('a', 'u-a', 't-a');
      todoManager.createTag('b', 'u-a', 't-a');
      todoManager.createTag('c', 'u-a', 't-a');
      const res = todoManager.getTagList('u-a', 't-a', { limit: 2 });
      expect(res).toHaveLength(2);
    });
  });

  // ─── 搜索 ───────────────────────────────────────────

  describe('search', () => {
    it('query 小写匹配 title / description / tags(any)', () => {
      todoManager.createTask({ title: 'Buy Milk', description: 'grocery' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'Workout', description: 'gym session' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'Read', tags: ['milk-book'] }, 'u-a', 't-a');
      expect(todoManager.search({ query: 'milk' }, 'u-a', 't-a').total).toBe(2);
      expect(todoManager.search({ query: 'gym' }, 'u-a', 't-a').total).toBe(1);
    });

    it('预过滤 cancelled', () => {
      const t = todoManager.createTask({ title: 'findme' }, 'u-a', 't-a');
      todoManager.updateTask(t.id, { status: 'cancelled' }, 'u-a', 't-a');
      expect(todoManager.search({ query: 'findme' }, 'u-a', 't-a').total).toBe(0);
    });

    it('listId / tags(every) / status / priority / assigneeId / isFavorite 过滤', () => {
      const list = todoManager.createList({ name: 'L' }, 'u-a', 't-a');
      todoManager.createTask(
        { title: 'a', listId: list.id, tags: ['x', 'y'], priority: 'high', assigneeId: 'as1', isFavorite: true },
        'u-a',
        't-a'
      );
      todoManager.createTask({ title: 'b', tags: ['x'] }, 'u-a', 't-a');
      expect(todoManager.search({ listId: list.id }, 'u-a', 't-a').total).toBe(1);
      expect(todoManager.search({ tags: ['x', 'y'] }, 'u-a', 't-a').total).toBe(1);
      expect(todoManager.search({ priority: 'high' }, 'u-a', 't-a').total).toBe(1);
      expect(todoManager.search({ assigneeId: 'as1' }, 'u-a', 't-a').total).toBe(1);
      expect(todoManager.search({ isFavorite: true }, 'u-a', 't-a').total).toBe(1);
    });

    it('overdue 过滤', () => {
      const past = new Date('2020-01-01T00:00:00Z');
      todoManager.createTask({ title: 'a', dueDate: past }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      expect(todoManager.search({ overdue: true }, 'u-a', 't-a').total).toBe(1);
    });

    it('dateFrom / dateTo（按 createdAt）', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      const t1 = todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
      const t2 = todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      const from = new Date('2026-07-01T00:00:00Z');
      const to = new Date('2026-09-01T00:00:00Z');
      const res = todoManager.search({ dateFrom: from, dateTo: to }, 'u-a', 't-a');
      expect(res.total).toBe(1);
      expect(res.tasks[0].id).toBe(t2.id);
    });

    it('dueDateFrom / dueDateTo', () => {
      todoManager.createTask({ title: 'a', dueDate: new Date('2026-07-05T00:00:00Z') }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b', dueDate: new Date('2026-08-05T00:00:00Z') }, 'u-a', 't-a');
      const res = todoManager.search(
        {
          dueDateFrom: new Date('2026-07-01T00:00:00Z'),
          dueDateTo: new Date('2026-07-31T00:00:00Z'),
        },
        'u-a',
        't-a'
      );
      expect(res.total).toBe(1);
      expect(res.tasks[0].title).toBe('a');
    });

    it('sortBy=priority / sortOrder=asc', () => {
      const t1 = todoManager.createTask({ title: 'a', priority: 'low' }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'b', priority: 'urgent' }, 'u-a', 't-a');
      const res = todoManager.search({ sortBy: 'priority', sortOrder: 'asc' }, 'u-a', 't-a');
      expect(res.tasks.map((t) => t.id)).toEqual([t2.id, t1.id]);
    });

    it('分页返回 total / totalPages / hasMore', () => {
      for (let i = 0; i < 25; i++) {
        todoManager.createTask({ title: `t${i}` }, 'u-a', 't-a');
      }
      const res1 = todoManager.search({ page: 1, pageSize: 20 }, 'u-a', 't-a');
      expect(res1.total).toBe(25);
      expect(res1.page).toBe(1);
      expect(res1.pageSize).toBe(20);
      expect(res1.totalPages).toBe(2);
      expect(res1.hasMore).toBe(true);
      expect(res1.tasks).toHaveLength(20);
      const res2 = todoManager.search({ page: 2, pageSize: 20 }, 'u-a', 't-a');
      expect(res2.hasMore).toBe(false);
      expect(res2.tasks).toHaveLength(5);
    });

    it('跨租户不返回', () => {
      todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      expect(todoManager.search({}, 'u-b', 't-a').total).toBe(0);
    });
  });

  // ─── 统计 ───────────────────────────────────────────

  describe('getStats', () => {
    it('空数据全 0', () => {
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.totalTasks).toBe(0);
      expect(stats.totalLists).toBe(0);
      expect(stats.totalTags).toBe(0);
      expect(stats.pendingTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.averageCompletionTime).toBe(0);
      expect(stats.topLists).toEqual([]);
      expect(stats.topTags).toEqual([]);
      expect(stats.priorityDistribution).toEqual({
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    });

    it('跨租户聚合：仅本租户数据计入', () => {
      todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b' }, 'u-b', 't-a'); // 不同用户同租户
      todoManager.createTask({ title: 'c' }, 'u-a', 't-b'); // 不同租户
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.totalTasks).toBe(1);
    });

    it('状态分布 + completionRate', () => {
      todoManager.createTask({ title: 'a' }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'b' }, 'u-a', 't-a');
      const t3 = todoManager.createTask({ title: 'c' }, 'u-a', 't-a');
      const t4 = todoManager.createTask({ title: 'd' }, 'u-a', 't-a');
      todoManager.updateTask(t2.id, { status: 'in-progress' }, 'u-a', 't-a');
      todoManager.updateTask(t3.id, { status: 'completed' }, 'u-a', 't-a');
      todoManager.updateTask(t4.id, { status: 'cancelled' }, 'u-a', 't-a');
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.totalTasks).toBe(4);
      expect(stats.pendingTasks).toBe(1);
      expect(stats.inProgressTasks).toBe(1);
      expect(stats.completedTasks).toBe(1);
      expect(stats.cancelledTasks).toBe(1);
      expect(stats.completionRate).toBeCloseTo(0.25, 5);
    });

    it('overdueTasks 统计未完成且过期的', () => {
      const past = new Date('2020-01-01T00:00:00Z');
      todoManager.createTask({ title: 'a', dueDate: past }, 'u-a', 't-a');
      const t2 = todoManager.createTask({ title: 'b', dueDate: past }, 'u-a', 't-a');
      todoManager.updateTask(t2.id, { status: 'completed' }, 'u-a', 't-a');
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.overdueTasks).toBe(1);
    });

    it('priorityDistribution 按优先级聚合', () => {
      todoManager.createTask({ title: 'a', priority: 'urgent' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'b', priority: 'high' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'c', priority: 'high' }, 'u-a', 't-a');
      todoManager.createTask({ title: 'd', priority: 'medium' }, 'u-a', 't-a');
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.priorityDistribution).toEqual({
        urgent: 1,
        high: 2,
        medium: 1,
        low: 0,
      });
    });

    it('topLists 按 taskCount desc 取前 5', () => {
      for (let i = 0; i < 6; i++) {
        const l = todoManager.createList({ name: `L${i}` }, 'u-a', 't-a');
        todoManager.createTask({ title: 't', listId: l.id }, 'u-a', 't-a');
      }
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.topLists).toHaveLength(5);
      expect(stats.topLists[0].count).toBeGreaterThanOrEqual(1);
    });

    it('【修复】topTags 按 taskCount desc 取前 10（修复后有真实计数）', () => {
      for (let i = 0; i < 12; i++) {
        todoManager.createTag(`tag${i}`, 'u-a', 't-a');
      }
      // tag0 出现在 3 个任务、tag1 在 2 个、其余 1 个
      todoManager.createTask({ title: 't', tags: ['tag0'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', tags: ['tag0'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', tags: ['tag0'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', tags: ['tag1'] }, 'u-a', 't-a');
      todoManager.createTask({ title: 't', tags: ['tag1'] }, 'u-a', 't-a');
      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.topTags).toHaveLength(10); // 12 标签但仅前 10
      expect(stats.topTags[0].name).toBe('tag0');
      expect(stats.topTags[0].count).toBe(3); // 修复前：0
      expect(stats.topTags[1].name).toBe('tag1');
      expect(stats.topTags[1].count).toBe(2); // 修复前：0
    });

    it('averageCompletionTime（分钟，有 startDate + completed）', () => {
      vi.useFakeTimers();
      const start1 = new Date('2026-07-01T08:00:00Z');
      vi.setSystemTime(start1);
      const t1 = todoManager.createTask({ title: 'a', startDate: start1 }, 'u-a', 't-a');
      vi.setSystemTime(new Date('2026-07-01T09:00:00Z')); // +60min
      todoManager.updateTask(t1.id, { status: 'completed' }, 'u-a', 't-a');

      const start2 = new Date('2026-07-01T08:00:00Z');
      vi.setSystemTime(start2);
      const t2 = todoManager.createTask({ title: 'b', startDate: start2 }, 'u-a', 't-a');
      vi.setSystemTime(new Date('2026-07-01T10:00:00Z')); // +120min
      todoManager.updateTask(t2.id, { status: 'completed' }, 'u-a', 't-a');

      const stats = todoManager.getStats('u-a', 't-a');
      expect(stats.averageCompletionTime).toBe(90); // (60+120)/2
    });
  });
});
