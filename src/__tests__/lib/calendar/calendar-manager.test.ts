/**
 * calendar/calendar-manager CalendarManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/calendar/calendar-manager.ts。该模块为纯内存态的日历管理器单例
 * （日历 / 日程 / 标签 3 个 Map），无任何运行时外部 import，可直接对实例做白盒断言。
 *
 * 关键控制流：
 * - 单例：private constructor + static getInstance；模块导出 calendarManager = getInstance()
 * - 日历 CRUD：
 *   · createCalendar id=`cal_${ts}_${rand}`；默认 color=#3b82f6 / textColor=#ffffff / isVisible=true /
 *     eventCount=0 / sortOrder=0 / isDefault=false；params 透传覆盖默认值
 *   · getCalendar 命中返回同引用；未命中 / 跨租户 / 跨用户 → null
 *   · getCalendarList 按 userId+tenantId 过滤；排序支持 Date/string/number 三分支，
 *     默认 sortBy='sortOrder' / sortOrder='asc'
 *   · updateCalendar 浅合并（Object.assign，updatedAt 永远覆盖；id/tenantId/userId 可被
 *     updates 覆写——实际行为，记录而非断言"保留"）；跨租户返回 null
 *   · deleteCalendar 级联删除日历内全部日程（本轮修复：同步递减被删日程的标签使用计数）；
 *     未命中 / 跨租户 → false
 * - 日程 CRUD：
 *   · createEvent id=`evt_${ts}_${rand}`；reminders 构建完整 EventReminder（id/eventId/isSent=false/
 *     createdAt）；默认 status='confirmed' / repeatType='none' / isAllDay=false / isRecurring=false /
 *     isFavorite=false / tags=[] / attendees=[] / attachments=[]；
 *     若 calendarId 命中且属主匹配 → calendar.eventCount++ + updatedAt 刷新；
 *     本轮修复：同步递增已注册标签（createTag 注册过）的 eventCount（按 name 大小写不敏感 +
 *     userId + tenantId 匹配；event.tags 含重复名时按唯一计；未注册标签名静默跳过）
 *   · getEvent 命中返回同引用；未命中 / 跨租户 / 跨用户 → null
 *   · getEventList 预过滤 status !== 'cancelled'；支持 calendarId / tags(every) / status /
 *     isFavorite / dateRange(区间重叠 startTime<=end && endTime>=start) 过滤；排序 Date/string/number
 *     三分支；默认 sortBy='startTime' / sortOrder='asc'；分页 page 默认 1 / pageSize 默认 50
 *   · updateEvent（本轮修复重点 A）：原实现构建完整 reminders 后用 (event as any).reminders 赋值，
 *     但随后 Object.assign(event, updates, { updatedAt }) 会用 updates.reminders 原始
 *     {type,minutesBefore}[] 覆盖丢失 id/eventId/isSent/createdAt。修复后改为先构建、
 *     Object.assign 后再赋值。calendarId 变更时旧 calendar.eventCount--（max 0）/ 新 calendar.eventCount++；
 *     本轮修复 B：updates.tags 显式提供时同步标签计数（集合差集：旧-新减 / 新-旧加 / 共同不变），
 *     updates.tags 未提供（如 cancelEvent 仅改 status）时不动标签计数
 *   · deleteEvent 软删（直接 events.delete）；calendar.eventCount--（max 0）；
 *     本轮修复：同步递减已注册标签 eventCount（与 createEvent ++ 对称）
 *   · cancelEvent 通过 updateEvent({status:'cancelled'})；不动 calendar/标签计数（updates.tags 未提供）
 * - 重复展开：expandRecurringEvents 非重复事件单实例；重复事件按 daily/weekly/monthly/yearly 展开；
 *   repeatEndDate / repeatCount 边界；按 startTime 排序
 * - 标签管理：createTag 按 name 小写 + userId + tenantId 去重（命中返回已存在项）；默认 color=#3b82f6；
 *   eventCount 初始 0；getTagList sortBy 'count'(默认，本轮修复后有真实计数)/'name'(localeCompare)，limit 截断
 * - 搜索：query 小写匹配 title/description/location/tags(any)；tags 用 every（须全含）；
 *   支持 calendarId / status / isFavorite / startFrom / startTo / endFrom / endTo / dateRange 过滤；
 *   排序 Date/string 三分支；分页 page 默认 1 / pageSize 默认 20，返回 total/totalPages/hasMore
 * - 统计：getStats totalCalendars/totalEvents/totalTags/upcomingEvents/todayEvents/thisWeekEvents/
 *   thisMonthEvents/completedEvents/cancelledEvents/averageDuration(分钟)；
 *   topCalendars 按 eventCount desc 取前 5；topTags 按 eventCount desc 取前 10（本轮修复后有真实计数）
 * - 工具：getMonthDays 返回 42 天（6 行 × 7 列，含上月末与下月初填充）；
 *   getWeekDays 返回 7 天（从给定日期所在周的周日开始）
 *
 * 状态策略：CalendarManager 构造器私有无法 new；每个用例前 vi.resetModules() + await import 取全新单例
 * （fresh class → fresh instance → fresh calendars/events/tags Maps）。依赖 Date.now() 的
 * id/时间戳断言用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；Math.random 在精确 id
 * 断言用例中 spy 固定返回值，期望后缀用同一表达式计算保证匹配。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Calendar,
  CalendarEvent,
  EventTag,
  EventInstance,
  CalendarStats,
  CreateCalendarParams,
  CreateEventParams,
  UpdateEventParams,
  EventSearchParams,
} from '@/lib/calendar/types';

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date('2026-07-01T10:00:00Z');
const NOW_TS = NOW.getTime();

let CalendarManager: typeof import('@/lib/calendar/calendar-manager')['CalendarManager'];
let calendarManager: import('@/lib/calendar/calendar-manager')['CalendarManager'];

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('@/lib/calendar/calendar-manager');
  CalendarManager = mod.CalendarManager;
  calendarManager = mod.calendarManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 构造一个最小可用的 CreateEventParams，overrides 覆盖默认值 */
function makeEventParams(
  overrides: Partial<CreateEventParams> & { calendarId: string }
): CreateEventParams {
  return {
    title: overrides.title ?? `evt-${overrides.calendarId}`,
    startTime: overrides.startTime ?? new Date('2026-07-10T09:00:00Z'),
    endTime: overrides.endTime ?? new Date('2026-07-10T10:00:00Z'),
    ...overrides,
  };
}

describe('calendar/calendar-manager CalendarManager', () => {
  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('calendarManager 为 CalendarManager 实例', () => {
      expect(calendarManager).toBeInstanceOf(CalendarManager);
    });

    it('getInstance 多次返回同一实例（单例）', () => {
      expect(CalendarManager.getInstance()).toBe(calendarManager);
      expect(CalendarManager.getInstance()).toBe(CalendarManager.getInstance());
    });

    it('resetModules 后 calendarManager 为全新实例（状态隔离）', async () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, title: 'before-reset' }),
        'u-a',
        't-a'
      );
      vi.resetModules();
      const mod2 = await import('@/lib/calendar/calendar-manager');
      expect(mod2.calendarManager).not.toBe(calendarManager);
      expect(mod2.calendarManager.getCalendarList('u-a', 't-a')).toHaveLength(0);
      expect(mod2.calendarManager.getEventList('u-a', 't-a').total).toBe(0);
    });
  });

  // ─── 日历管理 ───────────────────────────────────────────

  describe('createCalendar', () => {
    it('id 形如 cal_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.123456789;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const cal = calendarManager.createCalendar({ name: 'cal1' }, 'u-a', 't-a');
      expect(cal.id).toBe(`cal_${NOW_TS}_${expectedSuffix}`);
      expect(cal.name).toBe('cal1');
      expect(cal.description).toBeUndefined();
      expect(cal.color).toBe('#3b82f6');
      expect(cal.textColor).toBe('#ffffff');
      expect(cal.isDefault).toBe(false);
      expect(cal.isVisible).toBe(true);
      expect(cal.eventCount).toBe(0);
      expect(cal.sortOrder).toBe(0);
      expect(cal.tenantId).toBe('t-a');
      expect(cal.userId).toBe('u-a');
      expect(cal.createdAt).toEqual(NOW);
      expect(cal.updatedAt).toEqual(NOW);
    });

    it('params 透传覆盖默认值', () => {
      const cal = calendarManager.createCalendar(
        {
          name: 'N',
          description: 'd',
          color: '#ff0000',
          textColor: '#000000',
          isDefault: true,
        },
        'u-a',
        't-a'
      );
      expect(cal).toMatchObject({
        name: 'N',
        description: 'd',
        color: '#ff0000',
        textColor: '#000000',
        isDefault: true,
      });
    });
  });

  describe('getCalendar', () => {
    it('命中返回日历同引用，未命中返回 null', () => {
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      expect(calendarManager.getCalendar(cal.id, 'u-a', 't-a')).toBe(cal);
      expect(calendarManager.getCalendar('nope', 'u-a', 't-a')).toBeNull();
    });

    it('跨租户 / 跨用户访问返回 null（即使 id 存在）', () => {
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      expect(calendarManager.getCalendar(cal.id, 'u-b', 't-a')).toBeNull();
      expect(calendarManager.getCalendar(cal.id, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('getCalendarList', () => {
    it('按 userId + tenantId 过滤（跨租户/跨用户隔离）', () => {
      calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      calendarManager.createCalendar({ name: 'b' }, 'u-b', 't-a');
      calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-b');
      expect(calendarManager.getCalendarList('u-a', 't-a').map((c) => c.name)).toEqual(['a']);
      expect(calendarManager.getCalendarList('u-a', 't-b').map((c) => c.name)).toEqual(['c']);
      expect(calendarManager.getCalendarList('u-b', 't-a').map((c) => c.name)).toEqual(['b']);
      expect(calendarManager.getCalendarList('u-x', 't-x')).toHaveLength(0);
    });

    it('默认 sortBy=sortOrder + sortOrder=asc', () => {
      calendarManager.createCalendar({ name: 'a' }, 'u', 't'); // sortOrder 0
      calendarManager.createCalendar({ name: 'b' }, 'u', 't'); // sortOrder 0
      // 同 sortOrder 时稳定（插入序）
      expect(calendarManager.getCalendarList('u', 't').map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('sortBy=name 走 string 分支（localeCompare），sortOrder=desc 降序', () => {
      calendarManager.createCalendar({ name: 'banana' }, 'u', 't');
      calendarManager.createCalendar({ name: 'apple' }, 'u', 't');
      calendarManager.createCalendar({ name: 'cherry' }, 'u', 't');
      const desc = calendarManager.getCalendarList('u', 't', {
        sortBy: 'name',
        sortOrder: 'desc',
      });
      expect(desc.map((c) => c.name)).toEqual(['cherry', 'banana', 'apple']);
      const asc = calendarManager.getCalendarList('u', 't', {
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(asc.map((c) => c.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('sortBy=eventCount 走 number 分支', () => {
      const c1 = calendarManager.createCalendar({ name: 'a' }, 'u', 't');
      const c2 = calendarManager.createCalendar({ name: 'b' }, 'u', 't');
      calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      calendarManager.createEvent(makeEventParams({ calendarId: c2.id }), 'u', 't');
      const asc = calendarManager.getCalendarList('u', 't', {
        sortBy: 'eventCount',
        sortOrder: 'asc',
      });
      // eventCount: c1=2, c2=1 → asc [b(1), a(2)]
      expect(asc.map((c) => c.name)).toEqual(['b', 'a']);
    });
  });

  describe('updateCalendar', () => {
    it('浅合并 updates，updatedAt 永远覆盖为 new Date', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u', 't');
      const before = cal.updatedAt;
      vi.setSystemTime(new Date(NOW_TS + 1000));
      const updated = calendarManager.updateCalendar(
        cal.id,
        { name: 'A', color: '#000' },
        'u',
        't'
      );
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('A');
      expect(updated!.color).toBe('#000');
      expect(updated!.updatedAt).not.toEqual(before);
    });

    it('未命中 / 跨租户返回 null', () => {
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      expect(calendarManager.updateCalendar('nope', { name: 'x' }, 'u-a', 't-a')).toBeNull();
      expect(calendarManager.updateCalendar(cal.id, { name: 'x' }, 'u-b', 't-a')).toBeNull();
      expect(calendarManager.updateCalendar(cal.id, { name: 'x' }, 'u-a', 't-b')).toBeNull();
    });

    it('id/tenantId/userId 可被 updates 覆写（实际行为，浅合并无白名单保护）', () => {
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      const updated = calendarManager.updateCalendar(
        cal.id,
        { id: 'forged', tenantId: 't-b', userId: 'u-b' } as Partial<Calendar>,
        'u-a',
        't-a'
      );
      expect(updated!.id).toBe('forged');
      expect(updated!.tenantId).toBe('t-b');
      expect(updated!.userId).toBe('u-b');
    });
  });

  describe('deleteCalendar', () => {
    it('删除日历并级联删除其下全部日程', () => {
      const c1 = calendarManager.createCalendar({ name: 'a' }, 'u', 't');
      const c2 = calendarManager.createCalendar({ name: 'b' }, 'u', 't');
      const e1 = calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      const e2 = calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      const e3 = calendarManager.createEvent(makeEventParams({ calendarId: c2.id }), 'u', 't');
      expect(calendarManager.deleteCalendar(c1.id, 'u', 't')).toBe(true);
      expect(calendarManager.getCalendar(c1.id, 'u', 't')).toBeNull();
      expect(calendarManager.getEvent(e1.id, 'u', 't')).toBeNull();
      expect(calendarManager.getEvent(e2.id, 'u', 't')).toBeNull();
      expect(calendarManager.getEvent(e3.id, 'u', 't')).not.toBeNull(); // c2 的日程保留
    });

    it('未命中 / 跨租户返回 false', () => {
      const cal = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      expect(calendarManager.deleteCalendar('nope', 'u-a', 't-a')).toBe(false);
      expect(calendarManager.deleteCalendar(cal.id, 'u-b', 't-a')).toBe(false);
      expect(calendarManager.deleteCalendar(cal.id, 'u-a', 't-b')).toBe(false);
    });

    it('级联删除日程时同步递减已注册标签 eventCount（本轮修复）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const tag = calendarManager.createTag('Work', 'u', 't');
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work', 'meeting'] }),
        'u',
        't'
      );
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work'] }),
        'u',
        't'
      );
      expect(tag.eventCount).toBe(2);
      calendarManager.deleteCalendar(cal.id, 'u', 't');
      expect(tag.eventCount).toBe(0);
    });
  });

  // ─── 日程管理 ───────────────────────────────────────────

  describe('createEvent', () => {
    it('id 形如 evt_${ts}_${rand}，默认值兜底', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.987654321;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id }),
        'u',
        't'
      );
      expect(evt.id).toBe(`evt_${NOW_TS}_${expectedSuffix}`);
      expect(evt.status).toBe('confirmed');
      expect(evt.isAllDay).toBe(false);
      expect(evt.isRecurring).toBe(false);
      expect(evt.repeatType).toBe('none');
      expect(evt.isFavorite).toBe(false);
      expect(evt.tags).toEqual([]);
      expect(evt.attendees).toEqual([]);
      expect(evt.attachments).toEqual([]);
      expect(evt.organizerId).toBe('u');
      expect(evt.tenantId).toBe('t');
      expect(evt.userId).toBe('u');
      expect(evt.createdAt).toEqual(NOW);
      expect(evt.updatedAt).toEqual(NOW);
    });

    it('reminders 构建完整 EventReminder（id/eventId/isSent=false/createdAt）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          reminders: [
            { type: 'popup', minutesBefore: 10 },
            { type: 'email', minutesBefore: 60 },
          ],
        }),
        'u',
        't'
      );
      expect(evt.reminders).toHaveLength(2);
      expect(evt.reminders[0]).toMatchObject({
        id: expect.stringMatching(/^rem_\d+_0$/),
        eventId: evt.id,
        type: 'popup',
        minutesBefore: 10,
        isSent: false,
      });
      expect(evt.reminders[0].createdAt).toBeInstanceOf(Date);
      expect(evt.reminders[1]).toMatchObject({
        id: expect.stringMatching(/^rem_\d+_1$/),
        eventId: evt.id,
        type: 'email',
        minutesBefore: 60,
        isSent: false,
      });
    });

    it('params 透传覆盖默认值（tags/isAllDay/isRecurring/repeatType/attendees 等）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          tags: ['work'],
          isAllDay: true,
          isRecurring: true,
          repeatType: 'daily',
          repeatInterval: 2,
          attendees: ['a@x.com'],
          isFavorite: true,
          color: '#abc',
          attachments: ['file1'],
          location: 'Office',
          description: 'desc',
        }),
        'u',
        't'
      );
      expect(evt).toMatchObject({
        tags: ['work'],
        isAllDay: true,
        isRecurring: true,
        repeatType: 'daily',
        repeatInterval: 2,
        attendees: ['a@x.com'],
        isFavorite: true,
        color: '#abc',
        attachments: ['file1'],
        location: 'Office',
        description: 'desc',
      });
    });

    it('calendarId 命中且属主匹配 → calendar.eventCount++ + updatedAt 刷新', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const before = cal.updatedAt;
      calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      expect(cal.eventCount).toBe(1);
      expect(cal.updatedAt).not.toBe(before);
    });

    it('calendarId 不匹配属主 → event 仍创建但 calendar.eventCount 不递增', () => {
      const calA = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      // 用 u-b/t-b 创建 event 但指向 u-a 的 calendar
      calendarManager.createEvent(makeEventParams({ calendarId: calA.id }), 'u-b', 't-b');
      expect(calA.eventCount).toBe(0);
    });

    it('同步递增已注册标签 eventCount（本轮修复）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('Work', 'u', 't');
      const meeting = calendarManager.createTag('Meeting', 'u', 't');
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work', 'meeting'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1);
      expect(meeting.eventCount).toBe(1);
    });

    it('标签匹配大小写不敏感（与 createTag 去重一致）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('Work', 'u', 't'); // name 存储为 'Work'
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['WORK', 'work'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1); // 大小写不敏感 + 去重，计 1
    });

    it('event.tags 含重复名 → 同一标签按唯一计（去重）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work', 'work', 'work'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1);
    });

    it('未通过 createTag 注册的标签名静默跳过（无 EventTag 实体可计）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const registered = calendarManager.createTag('registered', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['unregistered', 'registered'] }),
        'u',
        't'
      );
      expect(evt.tags).toEqual(['unregistered', 'registered']); // 标签名仍写入 event
      expect(registered.eventCount).toBe(1);
    });

    it('标签计数按 userId + tenantId 隔离（跨租户同名标签不串扰）', () => {
      const calA = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const calB = calendarManager.createCalendar({ name: 'c' }, 'u-b', 't-b');
      const tagA = calendarManager.createTag('work', 'u-a', 't-a');
      const tagB = calendarManager.createTag('work', 'u-b', 't-b');
      calendarManager.createEvent(
        makeEventParams({ calendarId: calA.id, tags: ['work'] }),
        'u-a',
        't-a'
      );
      expect(tagA.eventCount).toBe(1);
      expect(tagB.eventCount).toBe(0); // 跨租户不串扰
      void calB;
      void tagB;
    });
  });

  describe('getEvent', () => {
    it('命中返回日程同引用，未命中返回 null', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      expect(calendarManager.getEvent(evt.id, 'u', 't')).toBe(evt);
      expect(calendarManager.getEvent('nope', 'u', 't')).toBeNull();
    });

    it('跨租户 / 跨用户访问返回 null', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u-a', 't-a');
      expect(calendarManager.getEvent(evt.id, 'u-b', 't-a')).toBeNull();
      expect(calendarManager.getEvent(evt.id, 'u-a', 't-b')).toBeNull();
    });
  });

  describe('getEventList', () => {
    function seed() {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const e1 = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          title: 'standup',
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T09:30:00Z'),
          tags: ['work'],
        }),
        'u',
        't'
      );
      const e2 = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          title: 'review',
          startTime: new Date('2026-07-11T14:00:00Z'),
          endTime: new Date('2026-07-11T15:00:00Z'),
          tags: ['work', 'review'],
          isFavorite: true,
        }),
        'u',
        't'
      );
      const e3 = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          title: 'cancelled-one',
          startTime: new Date('2026-07-12T09:00:00Z'),
          endTime: new Date('2026-07-12T10:00:00Z'),
        }),
        'u',
        't'
      );
      calendarManager.cancelEvent(e3.id, 'u', 't');
      return { cal, e1, e2, e3 };
    }

    it('预过滤 status !== "cancelled"（cancelled 不返回）', () => {
      const { e1, e2, e3 } = seed();
      const list = calendarManager.getEventList('u', 't');
      const ids = list.events.map((e) => e.id);
      expect(ids).toContain(e1.id);
      expect(ids).toContain(e2.id);
      expect(ids).not.toContain(e3.id);
      expect(list.total).toBe(2);
    });

    it('按 userId + tenantId 过滤（跨租户/跨用户隔离）', () => {
      seed();
      expect(calendarManager.getEventList('u-b', 't').total).toBe(0);
      expect(calendarManager.getEventList('u', 't-b').total).toBe(0);
    });

    it('calendarId 过滤', () => {
      const { cal, e1 } = seed();
      const other = calendarManager.createCalendar({ name: 'o' }, 'u', 't');
      calendarManager.createEvent(makeEventParams({ calendarId: other.id }), 'u', 't');
      const list = calendarManager.getEventList('u', 't', { calendarId: cal.id });
      expect(list.total).toBe(2);
      expect(list.events.map((e) => e.id)).toContain(e1.id);
    });

    it('tags 过滤用 every（须全含）', () => {
      const { e2 } = seed();
      const both = calendarManager.getEventList('u', 't', { tags: ['work', 'review'] });
      expect(both.events.map((e) => e.id)).toEqual([e2.id]);
      const onlyWork = calendarManager.getEventList('u', 't', { tags: ['work'] });
      expect(onlyWork.total).toBe(2);
    });

    it('status 过滤', () => {
      seed();
      const tentative = calendarManager.getEventList('u', 't', { status: 'tentative' });
      expect(tentative.total).toBe(0);
    });

    it('isFavorite 过滤', () => {
      const { e2 } = seed();
      const fav = calendarManager.getEventList('u', 't', { isFavorite: true });
      expect(fav.events.map((e) => e.id)).toEqual([e2.id]);
    });

    it('dateRange 区间重叠过滤（startTime<=end && endTime>=start）', () => {
      const { e1, e2 } = seed();
      const list = calendarManager.getEventList('u', 't', {
        dateRange: { start: new Date('2026-07-10T00:00:00Z'), end: new Date('2026-07-10T23:59:59Z') },
      });
      expect(list.events.map((e) => e.id)).toEqual([e1.id]);
      void e2;
    });

    it('默认 sortBy=startTime + sortOrder=asc', () => {
      const { e1, e2 } = seed();
      const list = calendarManager.getEventList('u', 't');
      expect(list.events.map((e) => e.id)).toEqual([e1.id, e2.id]);
    });

    it('sortBy=title 走 string 分支 + sortOrder=desc 降序', () => {
      const { e1, e2 } = seed();
      // title: e1='standup' / e2='review'（r<s，review 字母序在前）
      // desc = 反字母序 = standup 在前 = [e1, e2]
      const list = calendarManager.getEventList('u', 't', { sortBy: 'title', sortOrder: 'desc' });
      expect(list.events.map((e) => e.id)).toEqual([e1.id, e2.id]);
    });

    it('分页 page 默认 1 / pageSize 默认 50', () => {
      seed();
      const list = calendarManager.getEventList('u', 't');
      expect(list.events).toHaveLength(2);
      expect(list.total).toBe(2);
    });

    it('分页 page + pageSize 截断', () => {
      seed();
      const page1 = calendarManager.getEventList('u', 't', { page: 1, pageSize: 1 });
      expect(page1.events).toHaveLength(1);
      expect(page1.total).toBe(2);
      const page2 = calendarManager.getEventList('u', 't', { page: 2, pageSize: 1 });
      expect(page2.events).toHaveLength(1);
    });
  });

  describe('updateEvent', () => {
    it('浅合并 updates，updatedAt 永远覆盖', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      const before = evt.updatedAt;
      vi.setSystemTime(new Date(NOW_TS + 1000)); // 推进 1s 避免 same-ms 时序巧合
      const updated = calendarManager.updateEvent(
        evt.id,
        { title: 'new-title', location: 'Office' },
        'u',
        't'
      );
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('new-title');
      expect(updated!.location).toBe('Office');
      expect(updated!.updatedAt).not.toEqual(before);
    });

    it('未命中 / 跨租户返回 null', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u-a', 't-a');
      expect(calendarManager.updateEvent('nope', { title: 'x' }, 'u-a', 't-a')).toBeNull();
      expect(calendarManager.updateEvent(evt.id, { title: 'x' }, 'u-b', 't-a')).toBeNull();
      expect(calendarManager.updateEvent(evt.id, { title: 'x' }, 'u-a', 't-b')).toBeNull();
    });

    it('reminders 更新后保留完整 EventReminder 字段（本轮修复：不再被 Object.assign 覆盖）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          reminders: [{ type: 'popup', minutesBefore: 5 }],
        }),
        'u',
        't'
      );
      const updated = calendarManager.updateEvent(
        evt.id,
        { reminders: [{ type: 'email', minutesBefore: 30 }] },
        'u',
        't'
      );
      expect(updated!.reminders).toHaveLength(1);
      // 修复前：会丢失 id/eventId/isSent/createdAt（被 updates.reminders 原始数组覆盖）
      expect(updated!.reminders[0]).toMatchObject({
        id: expect.stringMatching(/^rem_\d+_0$/),
        eventId: evt.id,
        type: 'email',
        minutesBefore: 30,
        isSent: false,
      });
      expect(updated!.reminders[0].createdAt).toBeInstanceOf(Date);
    });

    it('reminders 不在 updates 中时保持原样', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          reminders: [{ type: 'popup', minutesBefore: 5 }],
        }),
        'u',
        't'
      );
      const origReminderId = evt.reminders[0].id;
      calendarManager.updateEvent(evt.id, { title: 'x' }, 'u', 't');
      expect(evt.reminders).toHaveLength(1);
      expect(evt.reminders[0].id).toBe(origReminderId);
    });

    it('calendarId 变更：旧 calendar.eventCount-- / 新 calendar.eventCount++', () => {
      const c1 = calendarManager.createCalendar({ name: 'a' }, 'u', 't');
      const c2 = calendarManager.createCalendar({ name: 'b' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      expect(c1.eventCount).toBe(1);
      calendarManager.updateEvent(evt.id, { calendarId: c2.id }, 'u', 't');
      expect(c1.eventCount).toBe(0);
      expect(c2.eventCount).toBe(1);
    });

    it('calendarId 同 id 不动计数', () => {
      const c1 = calendarManager.createCalendar({ name: 'a' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u', 't');
      calendarManager.updateEvent(evt.id, { calendarId: c1.id }, 'u', 't');
      expect(c1.eventCount).toBe(1);
    });

    it('calendarId 变更但目标 calendar 属主不匹配 → 仅旧 calendar--，新不 ++', () => {
      const c1 = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      const c2 = calendarManager.createCalendar({ name: 'b' }, 'u-b', 't-b');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: c1.id }), 'u-a', 't-a');
      calendarManager.updateEvent(evt.id, { calendarId: c2.id }, 'u-a', 't-a');
      expect(c1.eventCount).toBe(0);
      expect(c2.eventCount).toBe(0);
    });

    it('updates.tags 显式提供时同步标签计数（旧-新减 / 新-旧加 / 共同不变）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      const meeting = calendarManager.createTag('meeting', 'u', 't');
      const personal = calendarManager.createTag('personal', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work', 'meeting'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1);
      expect(meeting.eventCount).toBe(1);
      expect(personal.eventCount).toBe(0);

      // ['work','meeting'] → ['work','personal']：work 共同不变，meeting -- ，personal ++
      calendarManager.updateEvent(evt.id, { tags: ['work', 'personal'] }, 'u', 't');
      expect(work.eventCount).toBe(1); // 共同，不变
      expect(meeting.eventCount).toBe(0); // 旧-新减
      expect(personal.eventCount).toBe(1); // 新-旧加
    });

    it('updates.tags 清空数组 → 全部旧标签 --', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work'] }),
        'u',
        't'
      );
      calendarManager.updateEvent(evt.id, { tags: [] }, 'u', 't');
      expect(work.eventCount).toBe(0);
    });

    it('updates.tags 未提供（如 cancelEvent）→ 不动标签计数', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1);
      calendarManager.cancelEvent(evt.id, 'u', 't');
      expect(work.eventCount).toBe(1); // cancelEvent 不触标签计数同步
    });

    it('标签计数同步按 userId + tenantId 隔离（跨租户同名标签不串扰）', () => {
      const calA = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const calB = calendarManager.createCalendar({ name: 'c' }, 'u-b', 't-b');
      const tagA = calendarManager.createTag('work', 'u-a', 't-a');
      const tagB = calendarManager.createTag('work', 'u-b', 't-b');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: calA.id, tags: ['work'] }),
        'u-a',
        't-a'
      );
      calendarManager.updateEvent(evt.id, { tags: [] }, 'u-a', 't-a');
      expect(tagA.eventCount).toBe(0);
      expect(tagB.eventCount).toBe(0); // 跨租户不受影响
      void calB;
    });
  });

  describe('deleteEvent', () => {
    it('删除日程并 calendar.eventCount--（max 0）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      expect(cal.eventCount).toBe(1);
      expect(calendarManager.deleteEvent(evt.id, 'u', 't')).toBe(true);
      expect(cal.eventCount).toBe(0);
      expect(calendarManager.getEvent(evt.id, 'u', 't')).toBeNull();
    });

    it('未命中 / 跨租户返回 false', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u-a', 't-a');
      expect(calendarManager.deleteEvent('nope', 'u-a', 't-a')).toBe(false);
      expect(calendarManager.deleteEvent(evt.id, 'u-b', 't-a')).toBe(false);
      expect(calendarManager.deleteEvent(evt.id, 'u-a', 't-b')).toBe(false);
    });

    it('calendar.eventCount 不会降至负数（max 0 保护）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      cal.eventCount = 0; // 手动置 0
      calendarManager.deleteEvent(evt.id, 'u', 't');
      expect(cal.eventCount).toBe(0); // max(0, 0-1) = 0
    });

    it('同步递减已注册标签 eventCount（本轮修复：与 createEvent ++ 对称）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      const meeting = calendarManager.createTag('meeting', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work', 'meeting'] }),
        'u',
        't'
      );
      expect(work.eventCount).toBe(1);
      expect(meeting.eventCount).toBe(1);
      calendarManager.deleteEvent(evt.id, 'u', 't');
      expect(work.eventCount).toBe(0);
      expect(meeting.eventCount).toBe(0);
    });

    it('标签计数递减按 userId + tenantId 隔离', () => {
      const calA = calendarManager.createCalendar({ name: 'c' }, 'u-a', 't-a');
      const calB = calendarManager.createCalendar({ name: 'c' }, 'u-b', 't-b');
      const tagA = calendarManager.createTag('work', 'u-a', 't-a');
      const tagB = calendarManager.createTag('work', 'u-b', 't-b');
      calendarManager.createEvent(makeEventParams({ calendarId: calA.id, tags: ['work'] }), 'u-a', 't-a');
      calendarManager.createEvent(makeEventParams({ calendarId: calB.id, tags: ['work'] }), 'u-b', 't-b');
      const evtA = calendarManager.getEventList('u-a', 't-a').events[0];
      calendarManager.deleteEvent(evtA.id, 'u-a', 't-a');
      expect(tagA.eventCount).toBe(0);
      expect(tagB.eventCount).toBe(1); // 跨租户不受影响
    });

    it('标签计数递减 max 0 保护（不会降至负数）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const work = calendarManager.createTag('work', 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({ calendarId: cal.id, tags: ['work'] }),
        'u',
        't'
      );
      work.eventCount = 0; // 手动置 0
      calendarManager.deleteEvent(evt.id, 'u', 't');
      expect(work.eventCount).toBe(0); // max(0, 0-1) = 0
    });
  });

  describe('cancelEvent', () => {
    it('通过 updateEvent 设置 status=cancelled', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      const cancelled = calendarManager.cancelEvent(evt.id, 'u', 't');
      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe('cancelled');
    });

    it('cancelEvent 不动 calendar.eventCount（cancelled 仍计入 calendar 计数）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      expect(cal.eventCount).toBe(1);
      calendarManager.cancelEvent(evt.id, 'u', 't');
      expect(cal.eventCount).toBe(1); // 与 getStats.totalEvents（含 cancelled）一致
    });
  });

  // ─── 重复日程展开 ───────────────────────────────────────

  describe('expandRecurringEvents', () => {
    it('非重复事件 → 单实例（id === event.id）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-07-31T23:59:59Z')
      );
      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe(evt.id);
      expect(instances[0].isRecurring).toBe(false);
    });

    it('非重复事件落在区间外 → 不返回', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-31T23:59:59Z')
      );
      expect(instances).toHaveLength(0);
    });

    it('daily 重复展开多实例，id 形如 ${eventId}_${count}', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'daily',
          repeatInterval: 1,
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-07-13T23:59:59Z')
      );
      // 7/10, 7/11, 7/12, 7/13 → 4 实例
      expect(instances).toHaveLength(4);
      expect(instances[0].id).toBe(`${evt.id}_0`);
      expect(instances[1].startTime.getDate()).toBe(11);
      expect(instances.every((i) => i.isRecurring)).toBe(true);
    });

    it('repeatCount 限制展开次数', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'daily',
          repeatInterval: 1,
          repeatCount: 3,
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-12-31T23:59:59Z')
      );
      expect(instances).toHaveLength(3);
    });

    it('repeatEndDate 边界：超出则停止', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'daily',
          repeatInterval: 1,
          repeatEndDate: new Date('2026-07-11T23:59:59Z'),
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-12-31T23:59:59Z')
      );
      // 7/10, 7/11（7/12 超过 repeatEndDate → break）
      expect(instances).toHaveLength(2);
    });

    it('instances 按 startTime 升序排序', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const evt = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'daily',
          repeatInterval: 1,
        }),
        'u',
        't'
      );
      const instances = calendarManager.expandRecurringEvents(
        [evt],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-07-13T23:59:59Z')
      );
      const times = instances.map((i) => i.startTime.getTime());
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    });

    it('weekly / monthly / yearly 展开（不抛错）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const weekly = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'weekly',
          repeatInterval: 1,
        }),
        'u',
        't'
      );
      const monthly = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'monthly',
          repeatInterval: 1,
        }),
        'u',
        't'
      );
      const yearly = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T10:00:00Z'),
          isRecurring: true,
          repeatType: 'yearly',
          repeatInterval: 1,
        }),
        'u',
        't'
      );
      const wInst = calendarManager.expandRecurringEvents(
        [weekly],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-07-31T23:59:59Z')
      );
      expect(wInst.length).toBeGreaterThan(1);
      const mInst = calendarManager.expandRecurringEvents(
        [monthly],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2026-12-31T23:59:59Z')
      );
      expect(mInst.length).toBeGreaterThan(1);
      const yInst = calendarManager.expandRecurringEvents(
        [yearly],
        new Date('2026-07-10T00:00:00Z'),
        new Date('2028-12-31T23:59:59Z')
      );
      expect(yInst.length).toBeGreaterThan(1);
    });
  });

  // ─── 标签管理 ───────────────────────────────────────────

  describe('createTag', () => {
    it('id 形如 et_${ts}_${rand}，默认 color=#3b82f6，eventCount=0', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const r = 0.555555555;
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const expectedSuffix = r.toString(36).substr(2, 9);
      const tag = calendarManager.createTag('work', 'u-a', 't-a');
      expect(tag.id).toBe(`et_${NOW_TS}_${expectedSuffix}`);
      expect(tag.name).toBe('work');
      expect(tag.color).toBe('#3b82f6');
      expect(tag.eventCount).toBe(0);
      expect(tag.tenantId).toBe('t-a');
      expect(tag.userId).toBe('u-a');
      expect(tag.createdAt).toEqual(NOW);
    });

    it('按 name 小写 + userId + tenantId 去重（命中返回已存在项同引用）', () => {
      const t1 = calendarManager.createTag('Work', 'u', 't');
      const t2 = calendarManager.createTag('WORK', 'u', 't');
      const t3 = calendarManager.createTag('work', 'u', 't');
      expect(t2).toBe(t1);
      expect(t3).toBe(t1);
    });

    it('跨租户 / 跨用户同名标签各自独立', () => {
      const tA = calendarManager.createTag('work', 'u-a', 't-a');
      const tB = calendarManager.createTag('work', 'u-b', 't-a');
      const tC = calendarManager.createTag('work', 'u-a', 't-b');
      expect(tA).not.toBe(tB);
      expect(tA).not.toBe(tC);
      expect(tB).not.toBe(tC);
    });

    it('options.color 透传覆盖默认值', () => {
      const tag = calendarManager.createTag('work', 'u', 't', { color: '#ff0000' });
      expect(tag.color).toBe('#ff0000');
    });
  });

  describe('getTagList', () => {
    it('按 userId + tenantId 过滤（跨租户/跨用户隔离）', () => {
      calendarManager.createTag('a', 'u-a', 't-a');
      calendarManager.createTag('b', 'u-b', 't-a');
      calendarManager.createTag('c', 'u-a', 't-b');
      expect(calendarManager.getTagList('u-a', 't-a').map((t) => t.name)).toEqual(['a']);
      expect(calendarManager.getTagList('u-b', 't-a').map((t) => t.name)).toEqual(['b']);
      expect(calendarManager.getTagList('u-a', 't-b').map((t) => t.name)).toEqual(['c']);
    });

    it('默认 sortBy=count 降序（本轮修复后有真实计数）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const w = calendarManager.createTag('work', 'u', 't');
      calendarManager.createTag('meeting', 'u', 't');
      calendarManager.createTag('personal', 'u', 't');
      // work 被 2 个 event 使用，其余 0
      calendarManager.createEvent(makeEventParams({ calendarId: cal.id, tags: ['work'] }), 'u', 't');
      calendarManager.createEvent(makeEventParams({ calendarId: cal.id, tags: ['work'] }), 'u', 't');
      const list = calendarManager.getTagList('u', 't');
      expect(list[0].id).toBe(w.id); // count 最高排首位
      expect(list[0].eventCount).toBe(2);
    });

    it('sortBy=name 走 localeCompare 升序', () => {
      calendarManager.createTag('banana', 'u', 't');
      calendarManager.createTag('apple', 'u', 't');
      calendarManager.createTag('cherry', 'u', 't');
      const list = calendarManager.getTagList('u', 't', { sortBy: 'name' });
      expect(list.map((t) => t.name)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('limit 截断', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      calendarManager.createTag('a', 'u', 't');
      calendarManager.createTag('b', 'u', 't');
      // 给 a 计数以使其排前
      calendarManager.createEvent(makeEventParams({ calendarId: cal.id, tags: ['a'] }), 'u', 't');
      const list = calendarManager.getTagList('u', 't', { limit: 1 });
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('a');
    });
  });

  // ─── 搜索 ───────────────────────────────────────────────

  describe('search', () => {
    function seedSearch() {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const e1 = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          title: 'Standup Meeting',
          description: 'Daily team sync',
          location: 'Room A',
          tags: ['work'],
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T09:30:00Z'),
        }),
        'u',
        't'
      );
      const e2 = calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          title: 'Lunch',
          description: 'With client',
          location: 'Cafe',
          tags: ['personal'],
          startTime: new Date('2026-07-11T12:00:00Z'),
          endTime: new Date('2026-07-11T13:00:00Z'),
          isFavorite: true,
        }),
        'u',
        't'
      );
      return { cal, e1, e2 };
    }

    it('query 匹配 title（小写）', () => {
      const { e1 } = seedSearch();
      const r = calendarManager.search({ query: 'standup' }, 'u', 't');
      expect(r.events.map((e) => e.id)).toEqual([e1.id]);
    });

    it('query 匹配 description / location / tags(any)', () => {
      const { e1 } = seedSearch();
      expect(
        calendarManager.search({ query: 'sync' }, 'u', 't').events.map((e) => e.id)
      ).toEqual([e1.id]); // description
      expect(
        calendarManager.search({ query: 'room' }, 'u', 't').events.map((e) => e.id)
      ).toEqual([e1.id]); // location
      expect(
        calendarManager.search({ query: 'work' }, 'u', 't').events.map((e) => e.id)
      ).toEqual([e1.id]); // tags
    });

    it('预过滤 status !== "cancelled"', () => {
      const { e1 } = seedSearch();
      calendarManager.cancelEvent(e1.id, 'u', 't');
      const r = calendarManager.search({ query: 'standup' }, 'u', 't');
      expect(r.total).toBe(0);
    });

    it('calendarId 过滤', () => {
      const { cal, e1 } = seedSearch();
      const r = calendarManager.search({ calendarId: cal.id }, 'u', 't');
      expect(r.total).toBe(2);
      expect(r.events.map((e) => e.id)).toContain(e1.id);
    });

    it('tags 过滤用 every', () => {
      seedSearch();
      const r = calendarManager.search({ tags: ['work'] }, 'u', 't');
      expect(r.total).toBe(1);
    });

    it('status / isFavorite 过滤', () => {
      const { e2 } = seedSearch();
      const fav = calendarManager.search({ isFavorite: true }, 'u', 't');
      expect(fav.events.map((e) => e.id)).toEqual([e2.id]);
    });

    it('startFrom / startTo 过滤', () => {
      const { e1, e2 } = seedSearch();
      const r = calendarManager.search(
        { startFrom: new Date('2026-07-11T00:00:00Z') },
        'u',
        't'
      );
      expect(r.events.map((e) => e.id)).toEqual([e2.id]);
      void e1;
    });

    it('endFrom / endTo 过滤', () => {
      const { e1 } = seedSearch();
      const r = calendarManager.search(
        { endTo: new Date('2026-07-10T10:00:00Z') },
        'u',
        't'
      );
      expect(r.events.map((e) => e.id)).toEqual([e1.id]);
    });

    it('dateRange 区间重叠过滤', () => {
      const { e1 } = seedSearch();
      const r = calendarManager.search(
        {
          dateRange: {
            start: new Date('2026-07-10T00:00:00Z'),
            end: new Date('2026-07-10T23:59:59Z'),
          },
        },
        'u',
        't'
      );
      expect(r.events.map((e) => e.id)).toEqual([e1.id]);
    });

    it('默认 sortBy=startTime + sortOrder=asc', () => {
      const { e1, e2 } = seedSearch();
      const r = calendarManager.search({}, 'u', 't');
      expect(r.events.map((e) => e.id)).toEqual([e1.id, e2.id]);
    });

    it('sortBy=title 走 string 分支', () => {
      const { e1, e2 } = seedSearch();
      const r = calendarManager.search({ sortBy: 'title', sortOrder: 'asc' }, 'u', 't');
      // Lunch < Standup Meeting
      expect(r.events.map((e) => e.id)).toEqual([e2.id, e1.id]);
    });

    it('分页：page 默认 1 / pageSize 默认 20，返回 total/totalPages/hasMore', () => {
      seedSearch();
      const r = calendarManager.search({}, 'u', 't');
      expect(r.total).toBe(2);
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
      expect(r.totalPages).toBe(1);
      expect(r.hasMore).toBe(false);
    });

    it('分页跨页：hasMore=true 当 page < totalPages', () => {
      seedSearch();
      const r = calendarManager.search({ page: 1, pageSize: 1 }, 'u', 't');
      expect(r.total).toBe(2);
      expect(r.totalPages).toBe(2);
      expect(r.hasMore).toBe(true);
      expect(r.events).toHaveLength(1);
    });
  });

  // ─── 统计 ───────────────────────────────────────────────

  describe('getStats', () => {
    it('空数据返回全 0 统计', () => {
      const stats = calendarManager.getStats('u', 't');
      expect(stats.totalCalendars).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalTags).toBe(0);
      expect(stats.upcomingEvents).toBe(0);
      expect(stats.completedEvents).toBe(0);
      expect(stats.cancelledEvents).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.topCalendars).toEqual([]);
      expect(stats.topTags).toEqual([]);
    });

    it('按 userId + tenantId 聚合', () => {
      const calA = calendarManager.createCalendar({ name: 'a' }, 'u-a', 't-a');
      calendarManager.createEvent(makeEventParams({ calendarId: calA.id }), 'u-a', 't-a');
      const calB = calendarManager.createCalendar({ name: 'b' }, 'u-b', 't-a');
      calendarManager.createEvent(makeEventParams({ calendarId: calB.id }), 'u-b', 't-a');
      const statsA = calendarManager.getStats('u-a', 't-a');
      const statsB = calendarManager.getStats('u-b', 't-a');
      expect(statsA.totalCalendars).toBe(1);
      expect(statsA.totalEvents).toBe(1);
      expect(statsB.totalCalendars).toBe(1);
      expect(statsB.totalEvents).toBe(1);
    });

    it('totalEvents 含 cancelled（与 calendar.eventCount 一致）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      const e1 = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      const e2 = calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
      calendarManager.cancelEvent(e2.id, 'u', 't');
      const stats = calendarManager.getStats('u', 't');
      expect(stats.totalEvents).toBe(2);
      expect(stats.cancelledEvents).toBe(1);
      void e1;
    });

    it('completedEvents = status=confirmed && endTime < now', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2020-01-01T09:00:00Z'),
          endTime: new Date('2020-01-01T10:00:00Z'),
        }),
        'u',
        't'
      );
      const stats = calendarManager.getStats('u', 't');
      expect(stats.completedEvents).toBe(1);
    });

    it('topCalendars 按 eventCount desc 取前 5', () => {
      for (let i = 0; i < 6; i++) {
        const cal = calendarManager.createCalendar({ name: `c${i}` }, 'u', 't');
        for (let j = 0; j <= i; j++) {
          calendarManager.createEvent(makeEventParams({ calendarId: cal.id }), 'u', 't');
        }
      }
      const stats = calendarManager.getStats('u', 't');
      expect(stats.topCalendars).toHaveLength(5);
      // eventCount 降序：c5(6) > c4(5) > ... > c1(2)
      expect(stats.topCalendars[0].count).toBeGreaterThanOrEqual(
        stats.topCalendars[1].count
      );
    });

    it('topTags 按 eventCount desc 取前 10（本轮修复后有真实计数）', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      for (let i = 0; i < 11; i++) {
        calendarManager.createTag(`tag${i}`, 'u', 't');
      }
      // 给 tag0 最多使用
      const tag0 = calendarManager.getTagList('u', 't', { sortBy: 'name' }).find((t) => t.name === 'tag0');
      for (let i = 0; i < 3; i++) {
        calendarManager.createEvent(
          makeEventParams({ calendarId: cal.id, tags: ['tag0'] }),
          'u',
          't'
        );
      }
      const stats = calendarManager.getStats('u', 't');
      expect(stats.topTags).toHaveLength(10); // 取前 10，tag10 被截断
      expect(stats.topTags[0].id).toBe(tag0!.id);
      expect(stats.topTags[0].count).toBe(3);
    });

    it('averageDuration 单位为分钟', () => {
      const cal = calendarManager.createCalendar({ name: 'c' }, 'u', 't');
      calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T09:00:00Z'),
          endTime: new Date('2026-07-10T09:30:00Z'),
        }),
        'u',
        't'
      );
      calendarManager.createEvent(
        makeEventParams({
          calendarId: cal.id,
          startTime: new Date('2026-07-10T10:00:00Z'),
          endTime: new Date('2026-07-10T11:30:00Z'),
        }),
        'u',
        't'
      );
      // (30 + 90) / 2 = 60 分钟
      const stats = calendarManager.getStats('u', 't');
      expect(stats.averageDuration).toBe(60);
    });
  });

  // ─── 工具函数 ───────────────────────────────────────────

  describe('getMonthDays', () => {
    it('返回 42 天（6 行 × 7 列，含上月末与下月初填充）', () => {
      const days = calendarManager.getMonthDays(2026, 6); // 2026-07（month 索引 6）
      expect(days).toHaveLength(42);
    });

    it('当月日期完整覆盖 1 日到月末', () => {
      const days = calendarManager.getMonthDays(2026, 6); // 2026-07 有 31 天
      const dayNumbers = days.map((d) => d.getDate());
      for (let i = 1; i <= 31; i++) {
        expect(dayNumbers).toContain(i);
      }
    });

    it('首日为周日时无上月填充（首日就是当月 1 日）', () => {
      // 2026-11-01 是周日
      const days = calendarManager.getMonthDays(2026, 10); // 2026-11
      expect(days[0].getDate()).toBe(1);
      expect(days[0].getMonth()).toBe(10);
    });
  });

  describe('getWeekDays', () => {
    it('返回 7 天，从给定日期所在周的周日开始', () => {
      // 2026-07-15 是周三
      const wed = new Date(2026, 6, 15);
      const days = calendarManager.getWeekDays(wed);
      expect(days).toHaveLength(7);
      expect(days[0].getDate()).toBe(12); // 周日 = 7/12
      expect(days[6].getDate()).toBe(18); // 周六 = 7/18
    });

    it('不修改输入 date', () => {
      const wed = new Date(2026, 6, 15);
      const original = wed.getDate();
      calendarManager.getWeekDays(wed);
      expect(wed.getDate()).toBe(original);
    });
  });
});
