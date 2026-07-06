/**
 * 协作管理器
 * 负责实时协作、任务管理、批注管理、通知管理
 */

import {
  OnlineUser,
  UserOnlineStatus,
  FileEditor,
  EditStatus,
  CollaborationSession,
  CollaborationParticipant,
  CollaborationOperation,
  CollaborationConflict,
  ConflictType,
  EditHistory,
  VersionDiff,
  DiffChange,
  ChangeTracking,
  CollaborationTask,
  TaskStatus,
  TaskPriority,
  Subtask,
  TaskComment,
  TaskAttachment,
  TaskList,
  CollaborationNotification,
  CollaborationNotificationType,
  NotificationSettings,
  Annotation,
  AnnotationType,
  AnnotationPosition,
  AnnotationReply,
  CollaborationRole,
  CollaborationPermissions,
  COLLABORATION_ROLE_PERMISSIONS,
  DEFAULT_NOTIFICATION_SETTINGS,
  CURSOR_COLORS,
  CreateTaskParams,
  UpdateTaskParams,
  TaskQueryParams,
  CreateAnnotationParams,
  CollaborationSessionConfig,
  DEFAULT_COLLABORATION_CONFIG,
} from './types';

/**
 * 协作管理器
 */
export class CollaborationManager {
  private onlineUsers: Map<string, OnlineUser> = new Map();
  private fileEditors: Map<string, FileEditor[]> = new Map();
  private sessions: Map<string, CollaborationSession> = new Map();
  private operations: Map<string, CollaborationOperation[]> = new Map();
  private conflicts: Map<string, CollaborationConflict[]> = new Map();
  private editHistories: Map<string, EditHistory[]> = new Map();
  private changeTrackings: Map<string, ChangeTracking[]> = new Map();
  private tasks: Map<string, CollaborationTask> = new Map();
  private taskLists: Map<string, TaskList> = new Map();
  private notifications: Map<string, CollaborationNotification[]> = new Map();
  private notificationSettings: Map<string, NotificationSettings> = new Map();
  private annotations: Map<string, Annotation[]> = new Map();
  private config: CollaborationSessionConfig = DEFAULT_COLLABORATION_CONFIG;

  constructor() {
    // 初始化
  }

  // ==================== 在线用户管理 ====================

  /**
   * 用户上线
   */
  userOnline(
    userId: string,
    userName: string,
    options?: { avatar?: string; device?: string; ipAddress?: string }
  ): OnlineUser {
    const user: OnlineUser = {
      userId,
      userName,
      userAvatar: options?.avatar,
      status: 'online',
      lastActiveAt: new Date(),
      device: options?.device,
      ipAddress: options?.ipAddress,
    };

    this.onlineUsers.set(userId, user);
    return user;
  }

  /**
   * 用户下线
   */
  userOffline(userId: string): void {
    const user = this.onlineUsers.get(userId);
    if (user) {
      user.status = 'offline';
      user.lastActiveAt = new Date();
    }

    // 从所有文件编辑者中移除
    for (const [fileId, editors] of this.fileEditors) {
      const index = editors.findIndex(e => e.userId === userId);
      if (index !== -1) {
        editors.splice(index, 1);
        this.fileEditors.set(fileId, editors);
      }
    }

    // 结束所有协作会话
    for (const [sessionId, session] of this.sessions) {
      if (session.hostUserId === userId) {
        this.endSession(sessionId);
      } else {
        const participantIndex = session.participants.findIndex(p => p.userId === userId);
        if (participantIndex !== -1) {
          session.participants.splice(participantIndex, 1);
          session.lastActivityAt = new Date();
        }
      }
    }
  }

  /**
   * 更新用户状态
   */
  updateUserStatus(userId: string, status: UserOnlineStatus): boolean {
    const user = this.onlineUsers.get(userId);
    if (!user) return false;

    user.status = status;
    user.lastActiveAt = new Date();
    return true;
  }

  /**
   * 获取在线用户列表
   */
  getOnlineUsers(spaceId?: string): OnlineUser[] {
    const users = Array.from(this.onlineUsers.values()).filter(u => u.status === 'online');

    if (spaceId) {
      return users.filter(u => u.currentSpaceId === spaceId);
    }

    return users;
  }

  /**
   * 获取用户在线状态
   */
  getUserOnlineStatus(userId: string): UserOnlineStatus {
    const user = this.onlineUsers.get(userId);
    return user?.status || 'offline';
  }

  /**
   * 更新用户当前文件
   */
  updateUserCurrentFile(userId: string, fileId?: string, spaceId?: string): void {
    const user = this.onlineUsers.get(userId);
    if (user) {
      user.currentFileId = fileId;
      user.currentSpaceId = spaceId;
      user.lastActiveAt = new Date();
    }
  }

  // ==================== 文件编辑者管理 ====================

  /**
   * 用户加入编辑
   */
  joinEditing(
    fileId: string,
    userId: string,
    userName: string,
    options?: { avatar?: string; status?: EditStatus }
  ): FileEditor {
    const editors = this.fileEditors.get(fileId) || [];

    // 检查是否已存在
    let editor = editors.find(e => e.userId === userId);

    if (editor) {
      editor.status = options?.status || 'editing';
      editor.lastActiveAt = new Date();
    } else {
      editor = {
        userId,
        userName,
        userAvatar: options?.avatar,
        fileId,
        status: options?.status || 'editing',
        joinedAt: new Date(),
        lastActiveAt: new Date(),
      };
      editors.push(editor);
    }

    this.fileEditors.set(fileId, editors);

    // 更新用户当前文件（保留 currentSpaceId：此前不传 spaceId 会将其清空为 undefined，
    // 致 getOnlineUsers(spaceId) 过滤失效——用户加入编辑后反而失去 space 归属）
    const currentUser = this.onlineUsers.get(userId);
    this.updateUserCurrentFile(userId, fileId, currentUser?.currentSpaceId);

    return editor;
  }

  /**
   * 用户离开编辑
   */
  leaveEditing(fileId: string, userId: string): boolean {
    const editors = this.fileEditors.get(fileId);
    if (!editors) return false;

    const index = editors.findIndex(e => e.userId === userId);
    if (index === -1) return false;

    editors.splice(index, 1);
    this.fileEditors.set(fileId, editors);

    // 更新用户当前文件
    this.updateUserCurrentFile(userId, undefined);

    return true;
  }

  /**
   * 获取文件编辑者列表
   */
  getFileEditors(fileId: string): FileEditor[] {
    return this.fileEditors.get(fileId) || [];
  }

  /**
   * 更新光标位置
   */
  updateCursorPosition(
    fileId: string,
    userId: string,
    position: { line: number; column: number; offset?: number }
  ): boolean {
    const editors = this.fileEditors.get(fileId);
    if (!editors) return false;

    const editor = editors.find(e => e.userId === userId);
    if (!editor) return false;

    editor.cursorPosition = position;
    editor.lastActiveAt = new Date();
    return true;
  }

  // ==================== 协作会话管理 ====================

  /**
   * 创建协作会话
   */
  createSession(
    fileId: string,
    hostUserId: string,
    hostUserName: string,
    tenantId: string,
    options?: { spaceId?: string }
  ): CollaborationSession {
    const sessionId = `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: CollaborationSession = {
      id: sessionId,
      fileId,
      spaceId: options?.spaceId,
      tenantId,
      hostUserId,
      participants: [
        {
          userId: hostUserId,
          userName: hostUserName,
          role: 'host',
          joinedAt: new Date(),
          lastActiveAt: new Date(),
          cursorColor: CURSOR_COLORS[0],
        },
      ],
      status: 'active',
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.operations.set(sessionId, []);
    this.conflicts.set(sessionId, []);

    return session;
  }

  /**
   * 加入协作会话
   */
  joinSession(
    sessionId: string,
    userId: string,
    userName: string,
    role: 'editor' | 'viewer' = 'viewer'
  ): CollaborationParticipant | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return null;

    // 检查是否已存在
    const existing = session.participants.find(p => p.userId === userId);
    if (existing) return existing;

    // 检查最大参与者数
    if (session.participants.length >= this.config.maxParticipants) return null;

    const participant: CollaborationParticipant = {
      userId,
      userName,
      role,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      cursorColor: CURSOR_COLORS[session.participants.length % CURSOR_COLORS.length],
    };

    session.participants.push(participant);
    session.lastActivityAt = new Date();

    return participant;
  }

  /**
   * 离开协作会话
   */
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const index = session.participants.findIndex(p => p.userId === userId);
    if (index === -1) return false;

    session.participants.splice(index, 1);
    session.lastActivityAt = new Date();

    // 如果是主持人离开，转移给第一个参与者
    if (session.hostUserId === userId && session.participants.length > 0) {
      const newHost = session.participants[0];
      newHost.role = 'host';
      session.hostUserId = newHost.userId;
    }

    // 如果没有参与者了，结束会话
    if (session.participants.length === 0) {
      this.endSession(sessionId);
    }

    return true;
  }

  /**
   * 结束协作会话
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'ended';
    session.endedAt = new Date();

    return true;
  }

  /**
   * 获取协作会话
   */
  getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取文件的活跃会话
   */
  getActiveSession(fileId: string): CollaborationSession | null {
    for (const session of this.sessions.values()) {
      if (session.fileId === fileId && session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  // ==================== 协作操作管理 ====================

  /**
   * 提交协作操作
   */
  submitOperation(
    sessionId: string,
    userId: string,
    operation: Omit<CollaborationOperation, 'id' | 'sessionId' | 'userId' | 'timestamp' | 'version'>
  ): CollaborationOperation | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return null;

    const operations = this.operations.get(sessionId) || [];

    const op: CollaborationOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      userId,
      ...operation,
      timestamp: Date.now(),
      version: operations.length + 1,
    };

    operations.push(op);
    this.operations.set(sessionId, operations);

    // 更新最后活动时间
    session.lastActivityAt = new Date();

    // 更新参与者最后活动时间
    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.lastActiveAt = new Date();
    }

    return op;
  }

  /**
   * 获取操作历史
   */
  getOperations(sessionId: string, sinceVersion?: number): CollaborationOperation[] {
    const operations = this.operations.get(sessionId) || [];

    if (sinceVersion !== undefined) {
      return operations.filter(op => op.version > sinceVersion);
    }

    return operations;
  }

  /**
   * 检测冲突
   */
  detectConflict(
    sessionId: string,
    op1: CollaborationOperation,
    op2: CollaborationOperation
  ): CollaborationConflict | null {
    // 简单的冲突检测：如果两个操作位置重叠
    if (
      op1.position !== undefined &&
      op2.position !== undefined &&
      op1.length !== undefined &&
      op2.length !== undefined
    ) {
      const op1End = op1.position + op1.length;
      const op2End = op2.position + op2.length;

      if (op1.position < op2End && op2.position < op1End) {
        const conflict: CollaborationConflict = {
          id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId,
          fileId: this.sessions.get(sessionId)?.fileId || '',
          type: 'edit_conflict',
          user1Id: op1.userId,
          user2Id: op2.userId,
          operation1: op1,
          operation2: op2,
          resolved: false,
          createdAt: new Date(),
        };

        const conflicts = this.conflicts.get(sessionId) || [];
        conflicts.push(conflict);
        this.conflicts.set(sessionId, conflicts);

        return conflict;
      }
    }

    return null;
  }

  /**
   * 解决冲突
   */
  resolveConflict(
    conflictId: string,
    sessionId: string,
    resolvedBy: string,
    resolution: 'user1' | 'user2' | 'merge' | 'manual'
  ): boolean {
    const conflicts = this.conflicts.get(sessionId);
    if (!conflicts) return false;

    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict || conflict.resolved) return false;

    conflict.resolved = true;
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = new Date();
    conflict.resolution = resolution;

    return true;
  }

  // ==================== 编辑历史管理 ====================

  /**
   * 记录编辑历史
   */
  recordEditHistory(
    fileId: string,
    tenantId: string,
    userId: string,
    userName: string,
    operation: string,
    description: string,
    options?: { changes?: any[]; versionBefore?: string; versionAfter?: string }
  ): EditHistory {
    const history: EditHistory = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileId,
      tenantId,
      userId,
      userName,
      operation,
      description,
      changes: options?.changes,
      versionBefore: options?.versionBefore,
      versionAfter: options?.versionAfter,
      createdAt: new Date(),
    };

    const histories = this.editHistories.get(fileId) || [];
    histories.unshift(history);
    this.editHistories.set(fileId, histories);

    return history;
  }

  /**
   * 获取编辑历史
   */
  getEditHistory(fileId: string, limit?: number): EditHistory[] {
    const histories = this.editHistories.get(fileId) || [];
    return limit ? histories.slice(0, limit) : histories;
  }

  /**
   * 对比版本
   */
  compareVersions(fileId: string, version1: string, version2: string): VersionDiff {
    // 简化的版本对比实现
    const changes: DiffChange[] = [];

    // 这里可以实现真正的diff算法
    return {
      fileId,
      version1,
      version2,
      changes,
      stats: {
        additions: 0,
        deletions: 0,
        modifications: 0,
      },
    };
  }

  // ==================== 任务管理 ====================

  /**
   * 创建任务
   */
  createTask(
    tenantId: string,
    userId: string,
    params: CreateTaskParams
  ): CollaborationTask {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const task: CollaborationTask = {
      id: taskId,
      title: params.title,
      description: params.description,
      spaceId: params.spaceId,
      fileId: params.fileId,
      tenantId,
      createdBy: userId,
      assignee: params.assignee,
      status: 'todo',
      priority: params.priority || 'medium',
      dueDate: params.dueDate,
      tags: params.tags || [],
      comments: [],
      subtasks: [],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, task);

    // 如果有负责人，发送通知
    if (params.assignee) {
      this.sendNotification(params.assignee, tenantId, {
        type: 'task_assigned',
        title: '任务分配',
        content: `您被分配了新任务：${params.title}`,
        data: {
          taskId,
          fromUserId: userId,
          action: 'assigned',
        },
      });
    }

    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string, tenantId: string): CollaborationTask | null {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return null;
    return task;
  }

  /**
   * 更新任务
   */
  updateTask(
    taskId: string,
    tenantId: string,
    userId: string,
    updates: UpdateTaskParams
  ): CollaborationTask | null {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return null;

    const updatedTask: CollaborationTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    // 如果状态变为已完成
    if (updates.status === 'completed' && task.status !== 'completed') {
      updatedTask.completedAt = new Date();

      // 通知创建者
      if (task.createdBy !== userId) {
        this.sendNotification(task.createdBy, tenantId, {
          type: 'task_completed',
          title: '任务完成',
          content: `任务「${task.title}」已完成`,
          data: {
            taskId,
            fromUserId: userId,
            action: 'completed',
          },
        });
      }
    }

    // 如果负责人变更
    if (updates.assignee && updates.assignee !== task.assignee) {
      this.sendNotification(updates.assignee, tenantId, {
        type: 'task_assigned',
        title: '任务分配',
        content: `您被分配了新任务：${task.title}`,
        data: {
          taskId,
          fromUserId: userId,
          action: 'assigned',
        },
      });
    }

    this.tasks.set(taskId, updatedTask);
    return updatedTask;
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string, tenantId: string, userId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return false;

    // 只有创建者可以删除
    if (task.createdBy !== userId) return false;

    return this.tasks.delete(taskId);
  }

  /**
   * 查询任务列表
   */
  queryTasks(params: TaskQueryParams & { tenantId: string }): {
    tasks: CollaborationTask[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const { tenantId, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = params;

    let tasks = Array.from(this.tasks.values()).filter(t => t.tenantId === tenantId);

    // 过滤
    if (params.spaceId) {
      tasks = tasks.filter(t => t.spaceId === params.spaceId);
    }

    if (params.assignee) {
      tasks = tasks.filter(t => t.assignee === params.assignee);
    }

    if (params.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      tasks = tasks.filter(t => statuses.includes(t.status));
    }

    if (params.priority) {
      const priorities = Array.isArray(params.priority) ? params.priority : [params.priority];
      tasks = tasks.filter(t => priorities.includes(t.priority));
    }

    if (params.dueDateFrom) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate >= params.dueDateFrom!);
    }

    if (params.dueDateTo) {
      tasks = tasks.filter(t => t.dueDate && t.dueDate <= params.dueDateTo!);
    }

    if (params.tags && params.tags.length > 0) {
      tasks = tasks.filter(t => params.tags!.some(tag => t.tags.includes(tag)));
    }

    // 排序
    tasks.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'dueDate':
          comparison = (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0);
          break;
        case 'priority':
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
          break;
        case 'status':
          const statusOrder = { todo: 0, in_progress: 1, review: 2, completed: 3, cancelled: 4 };
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = tasks.length;
    const start = (page - 1) * pageSize;
    const paginatedTasks = tasks.slice(start, start + pageSize);

    return { tasks: paginatedTasks, total, page, pageSize };
  }

  /**
   * 添加任务评论
   */
  addTaskComment(
    taskId: string,
    tenantId: string,
    userId: string,
    userName: string,
    content: string,
    options?: { mentions?: string[] }
  ): TaskComment | null {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return null;

    const comment: TaskComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName,
      content,
      mentions: options?.mentions,
      createdAt: new Date(),
    };

    task.comments.push(comment);
    task.updatedAt = new Date();

    // 通知任务相关人（assignee / createdBy）有新评论——此前从未发送 task_commented 通知，
    // 致 CollaborationNotificationType 中的该类型与 NotificationSettings.taskCommented 开关
    // 形同虚设。排除评论者本人，去重。
    const recipients = new Set<string>();
    if (task.assignee) recipients.add(task.assignee);
    if (task.createdBy) recipients.add(task.createdBy);
    recipients.delete(userId);
    for (const recipientId of recipients) {
      this.sendNotification(recipientId, tenantId, {
        type: 'task_commented',
        title: '任务评论',
        content: `${userName}在任务「${task.title}」中发表了评论`,
        data: {
          taskId,
          fromUserId: userId,
          fromUserName: userName,
          action: 'commented',
        },
      });
    }

    // 通知被@的人
    if (options?.mentions) {
      for (const mentionedUserId of options.mentions) {
        // 被@的人若已是评论相关人，task_commented 已通知；此处再发 task_mentioned，
        // 两类通知语义不同（评论 vs 提及），故不跳过。
        this.sendNotification(mentionedUserId, tenantId, {
          type: 'task_mentioned',
          title: '任务提及',
          content: `${userName}在任务「${task.title}」中提到了您`,
          data: {
            taskId,
            fromUserId: userId,
            fromUserName: userName,
            action: 'mentioned',
          },
        });
      }
    }

    return comment;
  }

  /**
   * 添加子任务
   */
  addSubtask(
    taskId: string,
    tenantId: string,
    title: string
  ): Subtask | null {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return null;

    const subtask: Subtask = {
      id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      completed: false,
      createdAt: new Date(),
    };

    task.subtasks.push(subtask);
    task.updatedAt = new Date();

    return subtask;
  }

  /**
   * 更新子任务状态
   */
  updateSubtaskStatus(
    taskId: string,
    subtaskId: string,
    tenantId: string,
    completed: boolean
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return false;

    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return false;

    subtask.completed = completed;
    subtask.completedAt = completed ? new Date() : undefined;
    task.updatedAt = new Date();

    return true;
  }

  // ==================== 批注管理 ====================

  /**
   * 创建批注
   */
  createAnnotation(
    tenantId: string,
    userId: string,
    userName: string,
    params: CreateAnnotationParams
  ): Annotation | null {
    const annotation: Annotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileId: params.fileId,
      tenantId,
      userId,
      userName,
      type: params.type,
      content: params.content,
      position: params.position,
      resolved: false,
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const annotations = this.annotations.get(params.fileId) || [];
    annotations.push(annotation);
    this.annotations.set(params.fileId, annotations);

    return annotation;
  }

  /**
   * 获取文件批注
   */
  getFileAnnotations(fileId: string, tenantId: string): Annotation[] {
    const annotations = this.annotations.get(fileId) || [];
    return annotations.filter(a => a.tenantId === tenantId);
  }

  /**
   * 添加批注回复
   */
  addAnnotationReply(
    annotationId: string,
    fileId: string,
    tenantId: string,
    userId: string,
    userName: string,
    content: string
  ): AnnotationReply | null {
    const annotations = this.annotations.get(fileId);
    if (!annotations) return null;

    const annotation = annotations.find(a => a.id === annotationId && a.tenantId === tenantId);
    if (!annotation) return null;

    const reply: AnnotationReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName,
      content,
      createdAt: new Date(),
    };

    annotation.replies.push(reply);
    annotation.updatedAt = new Date();

    return reply;
  }

  /**
   * 解决批注
   */
  resolveAnnotation(
    annotationId: string,
    fileId: string,
    tenantId: string,
    userId: string
  ): boolean {
    const annotations = this.annotations.get(fileId);
    if (!annotations) return false;

    const annotation = annotations.find(a => a.id === annotationId && a.tenantId === tenantId);
    if (!annotation || annotation.resolved) return false;

    annotation.resolved = true;
    annotation.resolvedBy = userId;
    annotation.resolvedAt = new Date();
    annotation.updatedAt = new Date();

    return true;
  }

  // ==================== 通知管理 ====================

  /**
   * 发送通知
   */
  sendNotification(
    userId: string,
    tenantId: string,
    notification: Omit<CollaborationNotification, 'id' | 'userId' | 'tenantId' | 'isRead' | 'createdAt'>
  ): void {
    // 检查用户通知设置
    const settings = this.getNotificationSettings(userId);
    // notification.type 为 snake_case（如 'task_assigned'），NotificationSettings 的 key 为
    // camelCase（如 taskAssigned）。此前直接 `typeKey in settings` 永远为 false，致用户开关
    // 形同虚设；改为显式映射后尊重用户设置。
    const settingsKey = this.notificationTypeToSettingsKey(notification.type);
    if (settingsKey && !settings[settingsKey]) {
      return; // 用户关闭了该类型通知
    }

    const notificationRecord: CollaborationNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      tenantId,
      ...notification,
      isRead: false,
      createdAt: new Date(),
    };

    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.unshift(notificationRecord);
    this.notifications.set(userId, userNotifications);
  }

  /**
   * 获取用户通知
   */
  getUserNotifications(
    userId: string,
    tenantId: string,
    options?: { unreadOnly?: boolean; limit?: number; type?: CollaborationNotificationType }
  ): CollaborationNotification[] {
    const notifications = this.notifications.get(userId) || [];
    let filtered = notifications.filter(n => n.tenantId === tenantId);

    if (options?.unreadOnly) {
      filtered = filtered.filter(n => !n.isRead);
    }

    if (options?.type) {
      filtered = filtered.filter(n => n.type === options.type);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * 标记通知为已读
   */
  markNotificationAsRead(
    notificationId: string,
    userId: string,
    tenantId: string
  ): boolean {
    const notifications = this.notifications.get(userId);
    if (!notifications) return false;

    const notification = notifications.find(
      n => n.id === notificationId && n.tenantId === tenantId
    );

    if (!notification) return false;

    notification.isRead = true;
    notification.readAt = new Date();

    return true;
  }

  /**
   * 标记所有通知为已读
   */
  markAllNotificationsAsRead(userId: string, tenantId: string): number {
    const notifications = this.notifications.get(userId) || [];
    let count = 0;

    for (const notification of notifications) {
      if (notification.tenantId === tenantId && !notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        count++;
      }
    }

    return count;
  }

  /**
   * 获取未读通知数量
   */
  getUnreadNotificationCount(userId: string, tenantId: string): number {
    const notifications = this.notifications.get(userId) || [];
    return notifications.filter(n => n.tenantId === tenantId && !n.isRead).length;
  }

  /**
   * 获取通知设置
   */
  getNotificationSettings(userId: string): NotificationSettings {
    return this.notificationSettings.get(userId) || { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  /**
   * 将通知类型（snake_case）映射为 NotificationSettings 的 key（camelCase）。
   * 不在映射表中的类型（理论上不存在）返回 null，表示无对应开关、放行。
   */
  private notificationTypeToSettingsKey(
    type: CollaborationNotificationType
  ): keyof NotificationSettings | null {
    const map: Record<CollaborationNotificationType, keyof NotificationSettings> = {
      task_assigned: 'taskAssigned',
      task_completed: 'taskCompleted',
      task_commented: 'taskCommented',
      task_mentioned: 'taskMentioned',
      file_shared: 'fileShared',
      file_edited: 'fileEdited',
      file_commented: 'fileCommented',
      invitation: 'invitation',
      mention: 'mention',
      review_requested: 'reviewRequested',
    };
    return map[type] ?? null;
  }

  /**
   * 更新通知设置
   */
  updateNotificationSettings(
    userId: string,
    updates: Partial<NotificationSettings>
  ): NotificationSettings {
    const current = this.getNotificationSettings(userId);
    const updated = { ...current, ...updates };
    this.notificationSettings.set(userId, updated);
    return updated;
  }

  // ==================== 权限检查 ====================

  /**
   * 检查协作权限
   */
  checkPermission(
    role: CollaborationRole,
    permission: keyof CollaborationPermissions
  ): boolean {
    const permissions = COLLABORATION_ROLE_PERMISSIONS[role];
    return permissions?.[permission] || false;
  }

  /**
   * 获取角色权限
   */
  getRolePermissions(role: CollaborationRole): CollaborationPermissions {
    return COLLABORATION_ROLE_PERMISSIONS[role];
  }

  // ==================== 工具方法 ====================

  /**
   * 获取任务状态显示名称
   */
  getTaskStatusDisplayName(status: TaskStatus): string {
    const statusNames: Record<TaskStatus, string> = {
      todo: '待办',
      in_progress: '进行中',
      review: '审核中',
      completed: '已完成',
      cancelled: '已取消',
    };
    return statusNames[status] || status;
  }

  /**
   * 获取任务优先级显示名称
   */
  getTaskPriorityDisplayName(priority: TaskPriority): string {
    const priorityNames: Record<TaskPriority, string> = {
      low: '低',
      medium: '中',
      high: '高',
      urgent: '紧急',
    };
    return priorityNames[priority] || priority;
  }

  /**
   * 获取批注类型显示名称
   */
  getAnnotationTypeDisplayName(type: AnnotationType): string {
    const typeNames: Record<AnnotationType, string> = {
      text: '文本',
      highlight: '高亮',
      comment: '评论',
      suggestion: '建议',
    };
    return typeNames[type] || type;
  }

  /**
   * 获取角色显示名称
   */
  getRoleDisplayName(role: CollaborationRole): string {
    const roleNames: Record<CollaborationRole, string> = {
      owner: '所有者',
      editor: '编辑者',
      commenter: '评论者',
      viewer: '查看者',
    };
    return roleNames[role] || role;
  }
}

// 导出单例
export const collaborationManager = new CollaborationManager();
