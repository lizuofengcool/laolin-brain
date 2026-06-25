/**
 * 待办事项类型定义
 */

// 任务优先级
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';

// 任务状态
export type TodoStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';

// 任务重复类型
export type TodoRepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

// 任务列表
export interface TodoList {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  taskCount: number;
  completedCount: number;
  sortOrder: number;
  isDefault: boolean;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  userId: string;
}

// 任务标签
export interface TodoTag {
  id: string;
  name: string;
  color?: string;
  taskCount: number;
  createdAt: Date;
  tenantId: string;
  userId: string;
}

// 子任务
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: Date;
  sortOrder: number;
  createdAt: Date;
}

// 任务评论
export interface TodoComment {
  id: string;
  taskId: string;
  content: string;
  authorId: string;
  createdAt: Date;
  tenantId: string;
}

// 任务附件
export interface TodoAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  uploadedBy: string;
  createdAt: Date;
  tenantId: string;
}

// 任务提醒
export interface TodoReminder {
  id: string;
  taskId: string;
  remindAt: Date;
  isSent: boolean;
  sentAt?: Date;
  createdAt: Date;
  tenantId: string;
}

// 任务
export interface Todo {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TodoPriority;
  listId?: string;
  tags: string[];
  assigneeId?: string;
  creatorId: string;
  dueDate?: Date;
  startDate?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  repeatType: TodoRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  isAllDay: boolean;
  isFavorite: boolean;
  estimatedMinutes?: number;
  actualMinutes?: number;
  progress: number; // 0-100
  subTasks: SubTask[];
  attachments: string[];
  comments: string[];
  reminders: Date[];
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  userId: string;
}

// 任务搜索结果
export interface TodoSearchResult {
  tasks: Todo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// 任务统计
export interface TodoStats {
  totalTasks: number;
  totalLists: number;
  totalTags: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  cancelledTasks: number;
  overdueTasks: number;
  todayTasks: number;
  thisWeekTasks: number;
  thisMonthTasks: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  completionRate: number;
  averageCompletionTime: number; // 分钟
  topLists: { id: string; name: string; count: number; completed: number }[];
  topTags: { id: string; name: string; count: number }[];
  priorityDistribution: Record<TodoPriority, number>;
}

// 创建任务列表参数
export interface CreateTodoListParams {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

// 创建任务参数
export interface CreateTodoParams {
  title: string;
  description?: string;
  priority?: TodoPriority;
  listId?: string;
  tags?: string[];
  assigneeId?: string;
  dueDate?: Date;
  startDate?: Date;
  repeatType?: TodoRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  isAllDay?: boolean;
  isFavorite?: boolean;
  estimatedMinutes?: number;
  subTasks?: { title: string }[];
  reminders?: Date[];
}

// 更新任务参数
export interface UpdateTodoParams {
  title?: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  listId?: string;
  tags?: string[];
  assigneeId?: string;
  dueDate?: Date;
  startDate?: Date;
  repeatType?: TodoRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  isAllDay?: boolean;
  isFavorite?: boolean;
  estimatedMinutes?: number;
  actualMinutes?: number;
  progress?: number;
}

// 任务搜索参数
export interface TodoSearchParams {
  query?: string;
  listId?: string;
  tags?: string[];
  status?: TodoStatus;
  priority?: TodoPriority;
  assigneeId?: string;
  isFavorite?: boolean;
  overdue?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// 任务重复规则
export interface TodoRepeatRule {
  type: TodoRepeatType;
  interval: number;
  endDate?: Date;
  weekdays?: number[]; // 0-6, 0 is Sunday
  monthDay?: number; // 1-31
}
