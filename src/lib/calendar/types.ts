/**
 * 日历类型定义
 */

// 日历视图类型
export type CalendarView = 'month' | 'week' | 'day' | 'list' | 'agenda';

// 日程状态
export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

// 日程重复类型
export type EventRepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

// 提醒类型
export type ReminderType = 'popup' | 'email' | 'sms' | 'notification';

// 日历
export interface Calendar {
  id: string;
  name: string;
  description?: string;
  color: string;
  textColor?: string;
  isDefault: boolean;
  isVisible: boolean;
  eventCount: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  userId: string;
}

// 日程标签
export interface EventTag {
  id: string;
  name: string;
  color: string;
  eventCount: number;
  createdAt: Date;
  tenantId: string;
  userId: string;
}

// 提醒
export interface EventReminder {
  id: string;
  eventId: string;
  type: ReminderType;
  minutesBefore: number;
  isSent: boolean;
  sentAt?: Date;
  createdAt: Date;
}

// 日程
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  calendarId: string;
  tags: string[];
  status: EventStatus;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isRecurring: boolean;
  repeatType: EventRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  repeatWeekdays?: number[]; // 0-6, 0 is Sunday
  repeatMonthDay?: number; // 1-31
  repeatCount?: number;
  organizerId: string;
  attendees: string[];
  reminders: EventReminder[];
  color?: string;
  isFavorite: boolean;
  attachments: string[];
  recurrenceId?: string;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  userId: string;
}

// 日历事件实例（用于重复事件展开）
export interface EventInstance {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  location?: string;
  calendarId: string;
  tags: string[];
  status: EventStatus;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  color?: string;
  isRecurring: boolean;
  recurrenceIndex?: number;
}

// 日历搜索结果
export interface CalendarSearchResult {
  events: CalendarEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// 日历统计
export interface CalendarStats {
  totalCalendars: number;
  totalEvents: number;
  totalTags: number;
  upcomingEvents: number;
  todayEvents: number;
  thisWeekEvents: number;
  thisMonthEvents: number;
  completedEvents: number;
  cancelledEvents: number;
  averageDuration: number; // 分钟
  topCalendars: { id: string; name: string; count: number; color: string }[];
  topTags: { id: string; name: string; count: number; color: string }[];
}

// 创建日历参数
export interface CreateCalendarParams {
  name: string;
  description?: string;
  color?: string;
  textColor?: string;
  isDefault?: boolean;
}

// 创建日程参数
export interface CreateEventParams {
  title: string;
  description?: string;
  location?: string;
  calendarId: string;
  tags?: string[];
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  isRecurring?: boolean;
  repeatType?: EventRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  repeatWeekdays?: number[];
  repeatMonthDay?: number;
  repeatCount?: number;
  attendees?: string[];
  reminders?: { type: ReminderType; minutesBefore: number }[];
  color?: string;
  isFavorite?: boolean;
  attachments?: string[];
}

// 更新日程参数
export interface UpdateEventParams {
  title?: string;
  description?: string;
  location?: string;
  calendarId?: string;
  tags?: string[];
  status?: EventStatus;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  isRecurring?: boolean;
  repeatType?: EventRepeatType;
  repeatInterval?: number;
  repeatEndDate?: Date;
  repeatWeekdays?: number[];
  repeatMonthDay?: number;
  repeatCount?: number;
  attendees?: string[];
  reminders?: { type: ReminderType; minutesBefore: number }[];
  color?: string;
  isFavorite?: boolean;
  attachments?: string[];
}

// 日程搜索参数
export interface EventSearchParams {
  query?: string;
  calendarId?: string;
  tags?: string[];
  status?: EventStatus;
  isFavorite?: boolean;
  startFrom?: Date;
  startTo?: Date;
  endFrom?: Date;
  endTo?: Date;
  dateRange?: { start: Date; end: Date };
  sortBy?: 'startTime' | 'endTime' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// 节假日
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'public' | 'observance' | 'optional';
  country?: string;
}

// 农历日期
export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
  zodiac: string;
  lunarMonthName: string;
  lunarDayName: string;
  solarTerm?: string;
}
