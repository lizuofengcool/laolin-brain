/**
 * 待办事项管理器
 * 负责任务的创建、管理和提醒
 */

import type {
  Todo,
  TodoList,
  TodoTag,
  SubTask,
  TodoSearchResult,
  TodoStats,
  TodoPriority,
  TodoStatus,
  CreateTodoListParams,
  CreateTodoParams,
  UpdateTodoParams,
  TodoSearchParams,
} from './types';

export class TodoManager {
  private static instance: TodoManager;
  private todos: Map<string, Todo> = new Map();
  private lists: Map<string, TodoList> = new Map();
  private tags: Map<string, TodoTag> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): TodoManager {
    if (!TodoManager.instance) {
      TodoManager.instance = new TodoManager();
    }
    return TodoManager.instance;
  }

  // ==================== 任务列表管理 ====================

  /**
   * 创建任务列表
   */
  public createList(
    params: CreateTodoListParams,
    userId: string,
    tenantId: string
  ): TodoList {
    const id = `tl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const list: TodoList = {
      id,
      name: params.name,
      description: params.description,
      icon: params.icon,
      color: params.color,
      taskCount: 0,
      completedCount: 0,
      sortOrder: 0,
      isDefault: false,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
      tenantId,
      userId,
    };

    this.lists.set(id, list);
    return list;
  }

  /**
   * 获取任务列表
   */
  public getList(id: string, userId: string, tenantId: string): TodoList | null {
    const list = this.lists.get(id);
    if (!list || list.userId !== userId || list.tenantId !== tenantId) return null;
    return list;
  }

  /**
   * 获取任务列表列表
   */
  public getListList(
    userId: string,
    tenantId: string,
    options?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): TodoList[] {
    let list = Array.from(this.lists.values()).filter(
      (l) => l.userId === userId && l.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'updatedAt';
    const sortOrder = options?.sortOrder || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof TodoList];
      const bVal = b[sortBy as keyof TodoList];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return list;
  }

  /**
   * 更新任务列表
   */
  public updateList(
    id: string,
    updates: Partial<TodoList>,
    userId: string,
    tenantId: string
  ): TodoList | null {
    const list = this.lists.get(id);
    if (!list || list.userId !== userId || list.tenantId !== tenantId) return null;

    Object.assign(list, updates, { updatedAt: new Date() });
    return list;
  }

  /**
   * 删除任务列表
   */
  public deleteList(id: string, userId: string, tenantId: string): boolean {
    const list = this.lists.get(id);
    if (!list || list.userId !== userId || list.tenantId !== tenantId) return false;

    // 将列表中的任务移到默认列表
    const tasksInList = Array.from(this.todos.values()).filter(
      (t) => t.listId === id && t.userId === userId && t.tenantId === tenantId
    );
    tasksInList.forEach((task) => {
      (task as any).listId = undefined;
    });

    this.lists.delete(id);
    return true;
  }

  // ==================== 任务管理 ====================

  /**
   * 创建任务
   */
  public createTask(
    params: CreateTodoParams,
    userId: string,
    tenantId: string
  ): Todo {
    const id = `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // 创建子任务
    const subTasks: SubTask[] = (params.subTasks || []).map((st, index) => ({
      id: `st_${Date.now()}_${index}`,
      title: st.title,
      completed: false,
      sortOrder: index,
      createdAt: now,
    }));

    const todo: Todo = {
      id,
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'medium',
      listId: params.listId,
      tags: params.tags || [],
      assigneeId: params.assigneeId,
      creatorId: userId,
      dueDate: params.dueDate,
      startDate: params.startDate,
      repeatType: params.repeatType || 'none',
      repeatInterval: params.repeatInterval,
      repeatEndDate: params.repeatEndDate,
      isAllDay: params.isAllDay || false,
      isFavorite: params.isFavorite || false,
      estimatedMinutes: params.estimatedMinutes,
      actualMinutes: 0,
      progress: 0,
      subTasks,
      attachments: [],
      comments: [],
      reminders: params.reminders || [],
      createdAt: now,
      updatedAt: now,
      tenantId,
      userId,
    };

    this.todos.set(id, todo);

    // 更新列表计数
    if (params.listId) {
      const list = this.lists.get(params.listId);
      if (list && list.userId === userId && list.tenantId === tenantId) {
        list.taskCount++;
        list.updatedAt = now;
      }
    }

    // 同步标签使用计数（仅 createTag 注册过的标签实体会计数，
    // 未注册的标签名静默跳过——todo.tags 为自由 string[]）
    this.applyTagCountDelta(todo.tags, userId, tenantId, 1);

    return todo;
  }

  /**
   * 获取任务
   */
  public getTask(id: string, userId: string, tenantId: string): Todo | null {
    const todo = this.todos.get(id);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return null;
    return todo;
  }

  /**
   * 获取任务列表
   */
  public getTaskList(
    userId: string,
    tenantId: string,
    options?: {
      listId?: string;
      tags?: string[];
      status?: TodoStatus;
      priority?: TodoPriority;
      isFavorite?: boolean;
      overdue?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
  ): { tasks: Todo[]; total: number } {
    let list = Array.from(this.todos.values()).filter(
      (todo) =>
        todo.userId === userId &&
        todo.tenantId === tenantId &&
        todo.status !== 'cancelled'
    );

    if (options?.listId) {
      list = list.filter((todo) => todo.listId === options.listId);
    }

    if (options?.tags && options.tags.length > 0) {
      list = list.filter((todo) =>
        options.tags!.every((tag) => todo.tags.includes(tag))
      );
    }

    if (options?.status) {
      list = list.filter((todo) => todo.status === options.status);
    }

    if (options?.priority) {
      list = list.filter((todo) => todo.priority === options.priority);
    }

    if (options?.isFavorite !== undefined) {
      list = list.filter((todo) => todo.isFavorite === options.isFavorite);
    }

    if (options?.overdue) {
      const now = new Date();
      list = list.filter(
        (todo) =>
          todo.dueDate &&
          todo.dueDate < now &&
          todo.status !== 'completed' &&
          todo.status !== 'cancelled'
      );
    }

    // 排序：优先级高的在前，然后按截止日期
    const priorityOrder: Record<TodoPriority, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    list.sort((a, b) => {
      const sortBy = options?.sortBy || 'dueDate';
      const sortOrder = options?.sortOrder || 'asc';

      if (sortBy === 'priority') {
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        return sortOrder === 'asc' ? aPriority - bPriority : bPriority - aPriority;
      }

      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return sortOrder === 'asc'
          ? a.dueDate.getTime() - b.dueDate.getTime()
          : b.dueDate.getTime() - a.dueDate.getTime();
      }

      const aVal = a[sortBy as keyof Todo];
      const bVal = b[sortBy as keyof Todo];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return 0;
    });

    const total = list.length;
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const tasks = list.slice(start, start + pageSize);

    return { tasks, total };
  }

  /**
   * 更新任务
   */
  public updateTask(
    id: string,
    updates: UpdateTodoParams,
    userId: string,
    tenantId: string
  ): Todo | null {
    const todo = this.todos.get(id);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return null;

    const now = new Date();

    // 计算有效旧/新 listId 与 status（Object.assign 前），用于统一维护列表计数。
    // 原实现将「完成计数 ++」「列表变更计数迁移」拆在 3 个独立 if 块中，存在两类 bug：
    //   1) uncompleteTask（completed → pending）不回退 completedCount（仅处理 →completed 方向）
    //   2) 列表变更 + 完成状态同时发生时，完成块对旧列表 ++ 但列表变更块按旧 status 迁移，
    //      导致旧列表 completedCount 多计、新列表 completedCount 漏计
    // 统一为 delta 逻辑后，按「旧/新 listId 是否相同」与「completed 状态是否翻转」两分支闭合。
    const oldListId = todo.listId;
    const oldStatus = todo.status;
    const newListId = updates.listId !== undefined ? updates.listId : oldListId;
    const newStatus = updates.status !== undefined ? updates.status : oldStatus;
    const wasCompleted = oldStatus === 'completed';
    const willBeCompleted = newStatus === 'completed';

    // 完成时间戳 / 实际用时（仅 status 由非 completed → completed 时设置）
    if (willBeCompleted && !wasCompleted) {
      (todo as any).completedAt = now;
      // 计算实际用时
      if (todo.startDate) {
        (todo as any).actualMinutes = Math.round(
          (now.getTime() - todo.startDate.getTime()) / 60000
        );
      }
    }

    // 取消时间戳（仅 status 由非 cancelled → cancelled 时设置）
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      (todo as any).cancelledAt = now;
    }

    // 列表计数维护（统一 delta 逻辑）
    if (newListId !== oldListId) {
      // 列表变更：旧列表 taskCount--（仅当旧任务为 completed 时 completedCount--），
      // 新列表 taskCount++（仅当新状态为 completed 时 completedCount++）
      if (oldListId) {
        const oldList = this.lists.get(oldListId);
        if (oldList && oldList.userId === userId && oldList.tenantId === tenantId) {
          oldList.taskCount = Math.max(0, oldList.taskCount - 1);
          if (wasCompleted) {
            oldList.completedCount = Math.max(0, oldList.completedCount - 1);
          }
        }
      }
      if (newListId) {
        const newList = this.lists.get(newListId);
        if (newList && newList.userId === userId && newList.tenantId === tenantId) {
          newList.taskCount++;
          if (willBeCompleted) {
            newList.completedCount++;
          }
        }
      }
    } else if (wasCompleted !== willBeCompleted) {
      // 同列表、completed 状态翻转：completedCount ++（→completed）/ --（→非 completed）
      // 修复原 uncompleteTask / completed→cancelled 不回退 completedCount 的 bug
      if (oldListId) {
        const list = this.lists.get(oldListId);
        if (list && list.userId === userId && list.tenantId === tenantId) {
          if (willBeCompleted) {
            list.completedCount++;
          } else {
            list.completedCount = Math.max(0, list.completedCount - 1);
          }
        }
      }
    }

    // 标签计数同步：先快照旧标签集（Object.assign 后 todo.tags 即被覆盖为新数组）
    const oldTagsSnapshot = todo.tags;
    const oldTagsLower = new Set(oldTagsSnapshot.map((t) => t.toLowerCase()));

    Object.assign(todo, updates, { updatedAt: now });

    // updates.listId === undefined 时 Object.assign 会把 listId 置为 undefined（清空），
    // 但上方计数迁移守卫按「未提供」处理（不迁移），二者不一致会致旧列表 taskCount 漂移。
    // 此处恢复 listId = oldListId，使「undefined 视为未提供」契约自洽（清空列表须显式经
    // deleteList，或调用方传 null —— 当前类型 listId?: string 不支持 null，故 undefined 即 no-op）。
    if (updates.listId === undefined) {
      todo.listId = oldListId;
    }

    // 标签计数同步：仅 updates.tags 显式提供时调整（避免 completeTask 等无关更新误触）
    if (updates.tags) {
      const newTags = updates.tags;
      const newTagsLower = new Set(newTags.map((t) => t.toLowerCase()));
      const removed = oldTagsSnapshot.filter((t) => !newTagsLower.has(t.toLowerCase()));
      const added = newTags.filter((t) => !oldTagsLower.has(t.toLowerCase()));
      this.applyTagCountDelta(removed, userId, tenantId, -1);
      this.applyTagCountDelta(added, userId, tenantId, 1);
    }

    return todo;
  }

  /**
   * 删除任务
   */
  public deleteTask(id: string, userId: string, tenantId: string): boolean {
    const todo = this.todos.get(id);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return false;

    // 更新列表计数
    if (todo.listId) {
      const list = this.lists.get(todo.listId);
      if (list && list.userId === userId && list.tenantId === tenantId) {
        list.taskCount = Math.max(0, list.taskCount - 1);
        if (todo.status === 'completed') {
          list.completedCount = Math.max(0, list.completedCount - 1);
        }
      }
    }

    // 同步标签使用计数（与 createTask 的 ++ 对称）
    this.applyTagCountDelta(todo.tags, userId, tenantId, -1);

    this.todos.delete(id);
    return true;
  }

  /**
   * 完成任务
   */
  public completeTask(id: string, userId: string, tenantId: string): Todo | null {
    return this.updateTask(id, { status: 'completed' }, userId, tenantId);
  }

  /**
   * 取消完成任务
   */
  public uncompleteTask(id: string, userId: string, tenantId: string): Todo | null {
    return this.updateTask(id, { status: 'pending' }, userId, tenantId);
  }

  // ==================== 子任务管理 ====================

  /**
   * 添加子任务
   */
  public addSubTask(
    taskId: string,
    title: string,
    userId: string,
    tenantId: string
  ): SubTask | null {
    const todo = this.todos.get(taskId);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return null;

    const subTask: SubTask = {
      id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      completed: false,
      sortOrder: todo.subTasks.length,
      createdAt: new Date(),
    };

    todo.subTasks.push(subTask);
    todo.updatedAt = new Date();

    // 更新进度
    this.updateTaskProgress(todo);

    return subTask;
  }

  /**
   * 切换子任务完成状态
   */
  public toggleSubTask(
    taskId: string,
    subTaskId: string,
    userId: string,
    tenantId: string
  ): SubTask | null {
    const todo = this.todos.get(taskId);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return null;

    const subTask = todo.subTasks.find((st) => st.id === subTaskId);
    if (!subTask) return null;

    subTask.completed = !subTask.completed;
    if (subTask.completed) {
      subTask.completedAt = new Date();
    } else {
      subTask.completedAt = undefined;
    }

    todo.updatedAt = new Date();

    // 更新进度
    this.updateTaskProgress(todo);

    return subTask;
  }

  /**
   * 删除子任务
   */
  public deleteSubTask(
    taskId: string,
    subTaskId: string,
    userId: string,
    tenantId: string
  ): boolean {
    const todo = this.todos.get(taskId);
    if (!todo || todo.userId !== userId || todo.tenantId !== tenantId) return false;

    const index = todo.subTasks.findIndex((st) => st.id === subTaskId);
    if (index === -1) return false;

    todo.subTasks.splice(index, 1);
    todo.updatedAt = new Date();

    // 更新进度
    this.updateTaskProgress(todo);

    return true;
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(todo: Todo): void {
    if (todo.subTasks.length === 0) {
      todo.progress = todo.status === 'completed' ? 100 : 0;
    } else {
      const completedCount = todo.subTasks.filter((st) => st.completed).length;
      todo.progress = Math.round((completedCount / todo.subTasks.length) * 100);
    }
  }

  // ==================== 标签管理 ====================

  /**
   * 同步标签使用计数（taskCount 增减）。
   * 按 name 大小写不敏感 + userId + tenantId 匹配已注册 TodoTag；
   * 单次调用内按 name 小写去重，防止 todo.tags 含重复名时双重计数；
   * max 0 保护防止负数；未注册标签名静默跳过（todo.tags 为自由 string[]，
   * 仅当用户显式 createTag 后才有 TodoTag 实体可计）。
   */
  private applyTagCountDelta(
    tagNames: string[],
    userId: string,
    tenantId: string,
    delta: 1 | -1
  ): void {
    const seen = new Set<string>();
    for (const name of tagNames) {
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const tag = Array.from(this.tags.values()).find(
        (t) =>
          t.userId === userId &&
          t.tenantId === tenantId &&
          t.name.toLowerCase() === lower
      );
      if (!tag) continue;

      tag.taskCount = Math.max(0, tag.taskCount + delta);
    }
  }

  /**
   * 创建标签
   */
  public createTag(
    name: string,
    userId: string,
    tenantId: string,
    options?: { color?: string }
  ): TodoTag {
    // 检查标签是否已存在
    const existing = Array.from(this.tags.values()).find(
      (t) =>
        t.userId === userId &&
        t.tenantId === tenantId &&
        t.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) return existing;

    const id = `tt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const tag: TodoTag = {
      id,
      name,
      color: options?.color,
      taskCount: 0,
      createdAt: now,
      tenantId,
      userId,
    };

    this.tags.set(id, tag);
    return tag;
  }

  /**
   * 获取标签列表
   */
  public getTagList(
    userId: string,
    tenantId: string,
    options?: { limit?: number; sortBy?: 'name' | 'count' }
  ): TodoTag[] {
    let list = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'count';
    if (sortBy === 'count') {
      list.sort((a, b) => b.taskCount - a.taskCount);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }

    return list;
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索任务
   */
  public search(
    params: TodoSearchParams,
    userId: string,
    tenantId: string
  ): TodoSearchResult {
    let list = Array.from(this.todos.values()).filter(
      (todo) =>
        todo.userId === userId &&
        todo.tenantId === tenantId &&
        todo.status !== 'cancelled'
    );

    // 关键词搜索
    if (params.query) {
      const query = params.query.toLowerCase();
      list = list.filter(
        (todo) =>
          todo.title.toLowerCase().includes(query) ||
          todo.description?.toLowerCase().includes(query) ||
          todo.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // 列表筛选
    if (params.listId) {
      list = list.filter((todo) => todo.listId === params.listId);
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      list = list.filter((todo) =>
        params.tags!.every((tag) => todo.tags.includes(tag))
      );
    }

    // 状态筛选
    if (params.status) {
      list = list.filter((todo) => todo.status === params.status);
    }

    // 优先级筛选
    if (params.priority) {
      list = list.filter((todo) => todo.priority === params.priority);
    }

    // 负责人筛选
    if (params.assigneeId) {
      list = list.filter((todo) => todo.assigneeId === params.assigneeId);
    }

    // 收藏筛选
    if (params.isFavorite !== undefined) {
      list = list.filter((todo) => todo.isFavorite === params.isFavorite);
    }

    // 过期筛选
    if (params.overdue) {
      const now = new Date();
      list = list.filter(
        (todo) =>
          todo.dueDate &&
          todo.dueDate < now &&
          todo.status !== 'completed' &&
          todo.status !== 'cancelled'
      );
    }

    // 时间范围筛选
    if (params.dateFrom) {
      list = list.filter((todo) => todo.createdAt >= params.dateFrom!);
    }

    if (params.dateTo) {
      list = list.filter((todo) => todo.createdAt <= params.dateTo!);
    }

    // 截止日期范围筛选
    if (params.dueDateFrom) {
      list = list.filter((todo) => todo.dueDate && todo.dueDate >= params.dueDateFrom!);
    }

    if (params.dueDateTo) {
      list = list.filter((todo) => todo.dueDate && todo.dueDate <= params.dueDateTo!);
    }

    // 排序
    const sortBy = params.sortBy || 'dueDate';
    const sortOrder = params.sortOrder || 'asc';
    list.sort((a, b) => {
      if (sortBy === 'priority') {
        const priorityOrder: Record<TodoPriority, number> = {
          urgent: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return sortOrder === 'asc'
          ? priorityOrder[a.priority] - priorityOrder[b.priority]
          : priorityOrder[b.priority] - priorityOrder[a.priority];
      }

      if (sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return sortOrder === 'asc'
          ? a.dueDate.getTime() - b.dueDate.getTime()
          : b.dueDate.getTime() - a.dueDate.getTime();
      }

      const aVal = a[sortBy as keyof Todo];
      const bVal = b[sortBy as keyof Todo];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return 0;
    });

    const total = list.length;
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const tasks = list.slice(start, start + pageSize);
    const hasMore = page < totalPages;

    return {
      tasks,
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  // ==================== 统计功能 ====================

  /**
   * 获取任务统计
   */
  public getStats(userId: string, tenantId: string): TodoStats {
    const todos = Array.from(this.todos.values()).filter(
      (todo) => todo.userId === userId && todo.tenantId === tenantId
    );

    const lists = Array.from(this.lists.values()).filter(
      (l) => l.userId === userId && l.tenantId === tenantId
    );

    const tags = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const pendingTasks = todos.filter((t) => t.status === 'pending').length;
    const inProgressTasks = todos.filter((t) => t.status === 'in-progress').length;
    const completedTasks = todos.filter((t) => t.status === 'completed').length;
    const cancelledTasks = todos.filter((t) => t.status === 'cancelled').length;

    const overdueTasks = todos.filter(
      (t) =>
        t.dueDate &&
        t.dueDate < now &&
        t.status !== 'completed' &&
        t.status !== 'cancelled'
    ).length;

    const todayTasks = todos.filter(
      (t) => t.dueDate && t.dueDate >= todayStart && t.dueDate < todayEnd
    ).length;

    const thisWeekTasks = todos.filter(
      (t) => t.dueDate && t.dueDate >= weekStart && t.dueDate < todayEnd
    ).length;

    const thisMonthTasks = todos.filter(
      (t) => t.dueDate && t.dueDate >= monthStart && t.dueDate < todayEnd
    ).length;

    const completedToday = todos.filter(
      (t) => t.completedAt && t.completedAt >= todayStart && t.completedAt < todayEnd
    ).length;

    const completedThisWeek = todos.filter(
      (t) => t.completedAt && t.completedAt >= weekStart && t.completedAt < todayEnd
    ).length;

    const completedThisMonth = todos.filter(
      (t) => t.completedAt && t.completedAt >= monthStart && t.completedAt < todayEnd
    ).length;

    const completionRate =
      todos.length > 0 ? completedTasks / todos.length : 0;

    // 计算平均完成时间
    const completedWithTime = todos.filter(
      (t) => t.status === 'completed' && t.startDate && t.completedAt
    );
    const averageCompletionTime =
      completedWithTime.length > 0
        ? completedWithTime.reduce((sum, t) => {
            const minutes = Math.round(
              ((t.completedAt?.getTime() || 0) - (t.startDate?.getTime() || 0)) /
                60000
            );
            return sum + minutes;
          }, 0) / completedWithTime.length
        : 0;

    // 热门列表
    const topLists = lists
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        name: l.name,
        count: l.taskCount,
        completed: l.completedCount,
      }));

    // 热门标签
    const topTags = tags
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 10)
      .map((t) => ({ id: t.id, name: t.name, count: t.taskCount }));

    // 优先级分布
    const priorityDistribution: Record<TodoPriority, number> = {
      urgent: todos.filter((t) => t.priority === 'urgent').length,
      high: todos.filter((t) => t.priority === 'high').length,
      medium: todos.filter((t) => t.priority === 'medium').length,
      low: todos.filter((t) => t.priority === 'low').length,
    };

    return {
      totalTasks: todos.length,
      totalLists: lists.length,
      totalTags: tags.length,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      cancelledTasks,
      overdueTasks,
      todayTasks,
      thisWeekTasks,
      thisMonthTasks,
      completedToday,
      completedThisWeek,
      completedThisMonth,
      completionRate,
      averageCompletionTime,
      topLists,
      topTags,
      priorityDistribution,
    };
  }
}

// 导出单例实例
export const todoManager = TodoManager.getInstance();
