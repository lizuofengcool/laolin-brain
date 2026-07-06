/**
 * 日历管理器
 * 负责日历和日程的创建、管理和提醒
 */

import type {
  Calendar,
  CalendarEvent,
  EventTag,
  EventReminder,
  EventInstance,
  CalendarSearchResult,
  CalendarStats,
  EventStatus,
  EventRepeatType,
  ReminderType,
  CreateCalendarParams,
  CreateEventParams,
  UpdateEventParams,
  EventSearchParams,
} from './types';

export class CalendarManager {
  private static instance: CalendarManager;
  private calendars: Map<string, Calendar> = new Map();
  private events: Map<string, CalendarEvent> = new Map();
  private tags: Map<string, EventTag> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): CalendarManager {
    if (!CalendarManager.instance) {
      CalendarManager.instance = new CalendarManager();
    }
    return CalendarManager.instance;
  }

  // ==================== 日历管理 ====================

  /**
   * 创建日历
   */
  public createCalendar(
    params: CreateCalendarParams,
    userId: string,
    tenantId: string
  ): Calendar {
    const id = `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const calendar: Calendar = {
      id,
      name: params.name,
      description: params.description,
      color: params.color || '#3b82f6',
      textColor: params.textColor || '#ffffff',
      isDefault: params.isDefault || false,
      isVisible: true,
      eventCount: 0,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      tenantId,
      userId,
    };

    this.calendars.set(id, calendar);
    return calendar;
  }

  /**
   * 获取日历
   */
  public getCalendar(id: string, userId: string, tenantId: string): Calendar | null {
    const calendar = this.calendars.get(id);
    if (!calendar || calendar.userId !== userId || calendar.tenantId !== tenantId) return null;
    return calendar;
  }

  /**
   * 获取日历列表
   */
  public getCalendarList(
    userId: string,
    tenantId: string,
    options?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): Calendar[] {
    let list = Array.from(this.calendars.values()).filter(
      (cal) => cal.userId === userId && cal.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'sortOrder';
    const sortOrder = options?.sortOrder || 'asc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof Calendar];
      const bVal = b[sortBy as keyof Calendar];
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
   * 更新日历
   */
  public updateCalendar(
    id: string,
    updates: Partial<Calendar>,
    userId: string,
    tenantId: string
  ): Calendar | null {
    const calendar = this.calendars.get(id);
    if (!calendar || calendar.userId !== userId || calendar.tenantId !== tenantId) return null;

    Object.assign(calendar, updates, { updatedAt: new Date() });
    return calendar;
  }

  /**
   * 删除日历
   */
  public deleteCalendar(id: string, userId: string, tenantId: string): boolean {
    const calendar = this.calendars.get(id);
    if (!calendar || calendar.userId !== userId || calendar.tenantId !== tenantId) return false;

    // 删除日历中的所有日程（同步递减标签使用计数，与 deleteEvent 对称）
    const eventsInCalendar = Array.from(this.events.values()).filter(
      (e) => e.calendarId === id && e.userId === userId && e.tenantId === tenantId
    );
    eventsInCalendar.forEach((event) => {
      this.applyTagCountDelta(event.tags, userId, tenantId, -1);
      this.events.delete(event.id);
    });

    this.calendars.delete(id);
    return true;
  }

  // ==================== 日程管理 ====================

  /**
   * 创建日程
   */
  public createEvent(
    params: CreateEventParams,
    userId: string,
    tenantId: string
  ): CalendarEvent {
    const id = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // 创建提醒
    const reminders: EventReminder[] = (params.reminders || []).map((r, index) => ({
      id: `rem_${Date.now()}_${index}`,
      eventId: id,
      type: r.type,
      minutesBefore: r.minutesBefore,
      isSent: false,
      createdAt: now,
    }));

    const event: CalendarEvent = {
      id,
      title: params.title,
      description: params.description,
      location: params.location,
      calendarId: params.calendarId,
      tags: params.tags || [],
      status: 'confirmed',
      startTime: params.startTime,
      endTime: params.endTime,
      isAllDay: params.isAllDay || false,
      isRecurring: params.isRecurring || false,
      repeatType: params.repeatType || 'none',
      repeatInterval: params.repeatInterval,
      repeatEndDate: params.repeatEndDate,
      repeatWeekdays: params.repeatWeekdays,
      repeatMonthDay: params.repeatMonthDay,
      repeatCount: params.repeatCount,
      organizerId: userId,
      attendees: params.attendees || [],
      reminders,
      color: params.color,
      isFavorite: params.isFavorite || false,
      attachments: params.attachments || [],
      createdAt: now,
      updatedAt: now,
      tenantId,
      userId,
    };

    this.events.set(id, event);

    // 更新日历计数
    const calendar = this.calendars.get(params.calendarId);
    if (calendar && calendar.userId === userId && calendar.tenantId === tenantId) {
      calendar.eventCount++;
      calendar.updatedAt = now;
    }

    // 同步标签使用计数（已通过 createTag 注册的同名标签 eventCount++）
    this.applyTagCountDelta(event.tags, userId, tenantId, 1);

    return event;
  }

  /**
   * 获取日程
   */
  public getEvent(id: string, userId: string, tenantId: string): CalendarEvent | null {
    const event = this.events.get(id);
    if (!event || event.userId !== userId || event.tenantId !== tenantId) return null;
    return event;
  }

  /**
   * 获取日程列表
   */
  public getEventList(
    userId: string,
    tenantId: string,
    options?: {
      calendarId?: string;
      tags?: string[];
      status?: EventStatus;
      isFavorite?: boolean;
      dateRange?: { start: Date; end: Date };
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
  ): { events: CalendarEvent[]; total: number } {
    let list = Array.from(this.events.values()).filter(
      (event) =>
        event.userId === userId &&
        event.tenantId === tenantId &&
        event.status !== 'cancelled'
    );

    if (options?.calendarId) {
      list = list.filter((event) => event.calendarId === options.calendarId);
    }

    if (options?.tags && options.tags.length > 0) {
      list = list.filter((event) =>
        options.tags!.every((tag) => event.tags.includes(tag))
      );
    }

    if (options?.status) {
      list = list.filter((event) => event.status === options.status);
    }

    if (options?.isFavorite !== undefined) {
      list = list.filter((event) => event.isFavorite === options.isFavorite);
    }

    if (options?.dateRange) {
      const { start, end } = options.dateRange;
      list = list.filter(
        (event) =>
          event.startTime <= end &&
          event.endTime >= start
      );
    }

    // 排序
    const sortBy = options?.sortBy || 'startTime';
    const sortOrder = options?.sortOrder || 'asc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof CalendarEvent];
      const bVal = b[sortBy as keyof CalendarEvent];
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
    const pageSize = options?.pageSize || 50;
    const start = (page - 1) * pageSize;
    const events = list.slice(start, start + pageSize);

    return { events, total };
  }

  /**
   * 更新日程
   */
  public updateEvent(
    id: string,
    updates: UpdateEventParams,
    userId: string,
    tenantId: string
  ): CalendarEvent | null {
    const event = this.events.get(id);
    if (!event || event.userId !== userId || event.tenantId !== tenantId) return null;

    const now = new Date();

    // 处理提醒更新（构建完整 EventReminder[]，须在 Object.assign 之后赋值，
    // 否则会被 updates.reminders 原始 {type,minutesBefore}[] 数组覆盖丢失 id/eventId/isSent/createdAt）
    let newReminders: EventReminder[] | null = null;
    if (updates.reminders) {
      newReminders = updates.reminders.map((r, index) => ({
        id: `rem_${Date.now()}_${index}`,
        eventId: id,
        type: r.type,
        minutesBefore: r.minutesBefore,
        isSent: false,
        createdAt: now,
      }));
    }

    // 处理日历变更
    if (updates.calendarId !== undefined && updates.calendarId !== event.calendarId) {
      // 从旧日历移除
      const oldCalendar = this.calendars.get(event.calendarId);
      if (oldCalendar && oldCalendar.userId === userId && oldCalendar.tenantId === tenantId) {
        oldCalendar.eventCount = Math.max(0, oldCalendar.eventCount - 1);
      }
      // 添加到新日历
      const newCalendar = this.calendars.get(updates.calendarId);
      if (newCalendar && newCalendar.userId === userId && newCalendar.tenantId === tenantId) {
        newCalendar.eventCount++;
      }
    }

    // 标签计数同步：先快照旧标签集（Object.assign 后 event.tags 即被覆盖为新数组）
    const oldTagsSnapshot = event.tags;
    const oldTagsLower = new Set(oldTagsSnapshot.map((t) => t.toLowerCase()));

    Object.assign(event, updates, { updatedAt: now });
    if (newReminders) {
      event.reminders = newReminders;
    }

    // 标签计数同步：仅 updates.tags 显式提供时调整（避免 cancelEvent 等无关更新误触）
    if (updates.tags) {
      const newTags = updates.tags;
      const newTagsLower = new Set(newTags.map((t) => t.toLowerCase()));
      const removed = oldTagsSnapshot.filter((t) => !newTagsLower.has(t.toLowerCase()));
      const added = newTags.filter((t) => !oldTagsLower.has(t.toLowerCase()));
      this.applyTagCountDelta(removed, userId, tenantId, -1);
      this.applyTagCountDelta(added, userId, tenantId, 1);
    }

    return event;
  }

  /**
   * 删除日程
   */
  public deleteEvent(id: string, userId: string, tenantId: string): boolean {
    const event = this.events.get(id);
    if (!event || event.userId !== userId || event.tenantId !== tenantId) return false;

    // 更新日历计数
    const calendar = this.calendars.get(event.calendarId);
    if (calendar && calendar.userId === userId && calendar.tenantId === tenantId) {
      calendar.eventCount = Math.max(0, calendar.eventCount - 1);
    }

    // 同步标签使用计数（与 createEvent 的 ++ 对称）
    this.applyTagCountDelta(event.tags, userId, tenantId, -1);

    this.events.delete(id);
    return true;
  }

  /**
   * 取消日程
   */
  public cancelEvent(id: string, userId: string, tenantId: string): CalendarEvent | null {
    return this.updateEvent(id, { status: 'cancelled' }, userId, tenantId);
  }

  // ==================== 重复日程展开 ====================

  /**
   * 展开重复日程为实例列表
   */
  public expandRecurringEvents(
    events: CalendarEvent[],
    startDate: Date,
    endDate: Date
  ): EventInstance[] {
    const instances: EventInstance[] = [];

    for (const event of events) {
      if (!event.isRecurring || event.repeatType === 'none') {
        // 非重复日程，直接添加
        if (event.startTime <= endDate && event.endTime >= startDate) {
          instances.push({
            id: event.id,
            eventId: event.id,
            title: event.title,
            description: event.description,
            location: event.location,
            calendarId: event.calendarId,
            tags: event.tags,
            status: event.status,
            startTime: event.startTime,
            endTime: event.endTime,
            isAllDay: event.isAllDay,
            color: event.color,
            isRecurring: false,
          });
        }
        continue;
      }

      // 重复日程，展开
      const duration = event.endTime.getTime() - event.startTime.getTime();
      let currentDate = new Date(event.startTime);
      let count = 0;
      const maxCount = event.repeatCount || 365; // 最多展开365次

      while (currentDate <= endDate && count < maxCount) {
        if (event.repeatEndDate && currentDate > event.repeatEndDate) break;

        const endTime = new Date(currentDate.getTime() + duration);

        if (endTime >= startDate) {
          instances.push({
            id: `${event.id}_${count}`,
            eventId: event.id,
            title: event.title,
            description: event.description,
            location: event.location,
            calendarId: event.calendarId,
            tags: event.tags,
            status: event.status,
            startTime: new Date(currentDate),
            endTime,
            isAllDay: event.isAllDay,
            color: event.color,
            isRecurring: true,
            recurrenceIndex: count,
          });
        }

        // 计算下一次
        const interval = event.repeatInterval || 1;
        switch (event.repeatType) {
          case 'daily':
            currentDate = new Date(currentDate.getTime() + interval * 24 * 60 * 60 * 1000);
            break;
          case 'weekly':
            currentDate = new Date(currentDate.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
            break;
          case 'monthly':
            currentDate = new Date(currentDate);
            currentDate.setMonth(currentDate.getMonth() + interval);
            break;
          case 'yearly':
            currentDate = new Date(currentDate);
            currentDate.setFullYear(currentDate.getFullYear() + interval);
            break;
          default:
            count = maxCount; // 退出循环
            break;
        }

        count++;
      }
    }

    // 按开始时间排序
    instances.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    return instances;
  }

  // ==================== 标签管理 ====================

  /**
   * 创建标签
   */
  public createTag(
    name: string,
    userId: string,
    tenantId: string,
    options?: { color?: string }
  ): EventTag {
    // 检查标签是否已存在
    const existing = Array.from(this.tags.values()).find(
      (t) =>
        t.userId === userId &&
        t.tenantId === tenantId &&
        t.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) return existing;

    const id = `et_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const tag: EventTag = {
      id,
      name,
      color: options?.color || '#3b82f6',
      eventCount: 0,
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
  ): EventTag[] {
    let list = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'count';
    if (sortBy === 'count') {
      list.sort((a, b) => b.eventCount - a.eventCount);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }

    return list;
  }

  // ==================== 标签计数同步（私有） ====================

  /**
   * 调整标签使用计数：按 name 大小写不敏感 + userId + tenantId 匹配已注册的 EventTag，
   * 命中则 eventCount += delta（max 0 保护，避免负数）。未注册的标签名静默跳过——
   * event.tags 为自由 string[]，仅当用户显式 createTag 后才有 EventTag 实体可计数。
   * 同一标签名在一次调用中按唯一计（去重，避免 event.tags 含重复名时双重计数）。
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

      tag.eventCount = Math.max(0, tag.eventCount + delta);
    }
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索日程
   */
  public search(
    params: EventSearchParams,
    userId: string,
    tenantId: string
  ): CalendarSearchResult {
    let list = Array.from(this.events.values()).filter(
      (event) =>
        event.userId === userId &&
        event.tenantId === tenantId &&
        event.status !== 'cancelled'
    );

    // 关键词搜索
    if (params.query) {
      const query = params.query.toLowerCase();
      list = list.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          event.description?.toLowerCase().includes(query) ||
          event.location?.toLowerCase().includes(query) ||
          event.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // 日历筛选
    if (params.calendarId) {
      list = list.filter((event) => event.calendarId === params.calendarId);
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      list = list.filter((event) =>
        params.tags!.every((tag) => event.tags.includes(tag))
      );
    }

    // 状态筛选
    if (params.status) {
      list = list.filter((event) => event.status === params.status);
    }

    // 收藏筛选
    if (params.isFavorite !== undefined) {
      list = list.filter((event) => event.isFavorite === params.isFavorite);
    }

    // 时间范围筛选
    if (params.startFrom) {
      list = list.filter((event) => event.startTime >= params.startFrom!);
    }

    if (params.startTo) {
      list = list.filter((event) => event.startTime <= params.startTo!);
    }

    if (params.endFrom) {
      list = list.filter((event) => event.endTime >= params.endFrom!);
    }

    if (params.endTo) {
      list = list.filter((event) => event.endTime <= params.endTo!);
    }

    if (params.dateRange) {
      const { start, end } = params.dateRange;
      list = list.filter(
        (event) =>
          event.startTime <= end &&
          event.endTime >= start
      );
    }

    // 排序
    const sortBy = params.sortBy || 'startTime';
    const sortOrder = params.sortOrder || 'asc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof CalendarEvent];
      const bVal = b[sortBy as keyof CalendarEvent];
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
    const events = list.slice(start, start + pageSize);
    const hasMore = page < totalPages;

    return {
      events,
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  // ==================== 统计功能 ====================

  /**
   * 获取日历统计
   */
  public getStats(userId: string, tenantId: string): CalendarStats {
    const events = Array.from(this.events.values()).filter(
      (event) => event.userId === userId && event.tenantId === tenantId
    );

    const calendars = Array.from(this.calendars.values()).filter(
      (cal) => cal.userId === userId && cal.tenantId === tenantId
    );

    const tags = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const upcomingEvents = events.filter(
      (e) => e.startTime >= now && e.status !== 'cancelled'
    ).length;

    const todayEvents = events.filter(
      (e) => e.startTime >= todayStart && e.startTime < todayEnd && e.status !== 'cancelled'
    ).length;

    const thisWeekEvents = events.filter(
      (e) => e.startTime >= weekStart && e.startTime < todayEnd && e.status !== 'cancelled'
    ).length;

    const thisMonthEvents = events.filter(
      (e) => e.startTime >= monthStart && e.startTime < todayEnd && e.status !== 'cancelled'
    ).length;

    const completedEvents = events.filter((e) => e.status === 'confirmed' && e.endTime < now).length;
    const cancelledEvents = events.filter((e) => e.status === 'cancelled').length;

    // 计算平均时长
    const averageDuration =
      events.length > 0
        ? events.reduce((sum, e) => {
            const minutes = Math.round(
              (e.endTime.getTime() - e.startTime.getTime()) / 60000
            );
            return sum + minutes;
          }, 0) / events.length
        : 0;

    // 热门日历
    const topCalendars = calendars
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 5)
      .map((cal) => ({
        id: cal.id,
        name: cal.name,
        count: cal.eventCount,
        color: cal.color,
      }));

    // 热门标签
    const topTags = tags
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        name: t.name,
        count: t.eventCount,
        color: t.color,
      }));

    return {
      totalCalendars: calendars.length,
      totalEvents: events.length,
      totalTags: tags.length,
      upcomingEvents,
      todayEvents,
      thisWeekEvents,
      thisMonthEvents,
      completedEvents,
      cancelledEvents,
      averageDuration,
      topCalendars,
      topTags,
    };
  }

  // ==================== 工具函数 ====================

  /**
   * 获取指定月份的日期列表
   */
  public getMonthDays(year: number, month: number): Date[] {
    const days: Date[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // 获取第一天是星期几
    const firstDayOfWeek = firstDay.getDay();

    // 添加上个月的日期
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push(date);
    }

    // 添加当月的日期
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    // 添加下个月的日期，填满6行
    const remaining = 42 - days.length; // 6行 * 7列
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  }

  /**
   * 获取指定周的日期列表
   */
  public getWeekDays(date: Date): Date[] {
    const days: Date[] = [];
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }

    return days;
  }
}

// 导出单例实例
export const calendarManager = CalendarManager.getInstance();
