import { describe, it, expect, beforeEach } from "vitest";
import { CalendarManager } from "@/lib/calendar/calendar-manager";
import type { Calendar, CalendarEvent } from "@/lib/calendar/types";

describe("日历模块测试", () => {
  let manager: CalendarManager;
  const tenantId = "test-tenant-1";
  const userId = "test-user-1";

  beforeEach(() => {
    manager = new CalendarManager();
  });

  describe("日历管理", () => {
    it("应该创建日历", async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "测试日历",
        description: "这是一个测试日历",
        color: "#3b82f6",
      });

      expect(calendar).toBeDefined();
      expect(calendar.id).toBeDefined();
      expect(calendar.name).toBe("测试日历");
      expect(calendar.tenantId).toBe(tenantId);
      expect(calendar.userId).toBe(userId);
    });

    it("应该获取日历列表", async () => {
      await manager.createCalendar(tenantId, userId, { name: "日历1" });
      await manager.createCalendar(tenantId, userId, { name: "日历2" });

      const result = await manager.getCalendars(tenantId, userId);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该更新日历", async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "原始名称",
      });

      const updated = await manager.updateCalendar(tenantId, userId, calendar.id, {
        name: "更新后的名称",
      });

      expect(updated.name).toBe("更新后的名称");
    });

    it("应该删除日历", async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "待删除",
      });

      const result = await manager.deleteCalendar(tenantId, userId, calendar.id);
      expect(result).toBe(true);
    });
  });

  describe("日程管理", () => {
    let calendarId: string;

    beforeEach(async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "测试日历",
      });
      calendarId = calendar.id;
    });

    it("应该创建日程", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "测试日程",
        description: "这是测试日程描述",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.title).toBe("测试日程");
    });

    it("应该获取日程列表", async () => {
      await manager.createEvent(tenantId, userId, {
        title: "日程1",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });
      await manager.createEvent(tenantId, userId, {
        title: "日程2",
        calendarId,
        startTime: new Date("2026-06-26T10:00:00"),
        endTime: new Date("2026-06-26T11:00:00"),
      });

      const result = await manager.getEvents(tenantId, userId, {
        startDate: new Date("2026-06-24"),
        endDate: new Date("2026-06-27"),
      });

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该获取单个日程", async () => {
      const created = await manager.createEvent(tenantId, userId, {
        title: "测试日程",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });

      const event = await manager.getEvent(tenantId, userId, created.id);
      expect(event).toBeDefined();
      expect(event?.title).toBe("测试日程");
    });

    it("应该更新日程", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "原始标题",
        description: "原始描述",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });

      const updated = await manager.updateEvent(tenantId, userId, event.id, {
        title: "更新后的标题",
        description: "更新后的描述",
      });

      expect(updated.title).toBe("更新后的标题");
      expect(updated.description).toBe("更新后的描述");
    });

    it("应该删除日程", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "待删除",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });

      const result = await manager.deleteEvent(tenantId, userId, event.id);
      expect(result).toBe(true);
    });

    it("应该搜索日程", async () => {
      await manager.createEvent(tenantId, userId, {
        title: "团队会议",
        description: "讨论项目进度",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
      });
      await manager.createEvent(tenantId, userId, {
        title: "产品会议",
        description: "讨论产品需求",
        calendarId,
        startTime: new Date("2026-06-26T10:00:00"),
        endTime: new Date("2026-06-26T11:00:00"),
      });

      const result = await manager.searchEvents(tenantId, userId, "会议");
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("日程标签", () => {
    let calendarId: string;

    beforeEach(async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "测试日历",
      });
      calendarId = calendar.id;
    });

    it("应该为日程添加标签", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "测试日程",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
        tags: ["工作", "重要"],
      });

      expect(event.tags).toContain("工作");
      expect(event.tags).toContain("重要");
    });

    it("应该按标签筛选日程", async () => {
      await manager.createEvent(tenantId, userId, {
        title: "工作会议",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
        tags: ["工作"],
      });
      await manager.createEvent(tenantId, userId, {
        title: "个人活动",
        calendarId,
        startTime: new Date("2026-06-26T10:00:00"),
        endTime: new Date("2026-06-26T11:00:00"),
        tags: ["个人"],
      });

      const result = await manager.getEventsByTag(tenantId, userId, "工作");
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("工作会议");
    });
  });

  describe("重复日程", () => {
    let calendarId: string;

    beforeEach(async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "测试日历",
      });
      calendarId = calendar.id;
    });

    it("应该创建每日重复日程", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "每日站会",
        calendarId,
        startTime: new Date("2026-06-25T09:00:00"),
        endTime: new Date("2026-06-25T09:30:00"),
        recurrence: {
          type: "daily",
          interval: 1,
        },
      });

      expect(event.recurrence).toBeDefined();
      expect(event.recurrence?.type).toBe("daily");
    });

    it("应该创建每周重复日程", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "周例会",
        calendarId,
        startTime: new Date("2026-06-25T14:00:00"),
        endTime: new Date("2026-06-25T15:00:00"),
        recurrence: {
          type: "weekly",
          interval: 1,
          weekdays: [1, 3, 5], // 周一、周三、周五
        },
      });

      expect(event.recurrence).toBeDefined();
      expect(event.recurrence?.type).toBe("weekly");
    });
  });

  describe("提醒功能", () => {
    let calendarId: string;

    beforeEach(async () => {
      const calendar = await manager.createCalendar(tenantId, userId, {
        name: "测试日历",
      });
      calendarId = calendar.id;
    });

    it("应该设置日程提醒", async () => {
      const event = await manager.createEvent(tenantId, userId, {
        title: "重要会议",
        calendarId,
        startTime: new Date("2026-06-25T10:00:00"),
        endTime: new Date("2026-06-25T11:00:00"),
        reminders: [
          { type: "popup", minutes: 15 },
          { type: "email", minutes: 60 },
        ],
      });

      expect(event.reminders).toBeDefined();
      expect(event.reminders?.length).toBe(2);
    });
  });

  describe("多租户隔离", () => {
    it("不同租户的数据应该隔离", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      const calendar1 = await manager.createCalendar(tenant1Id, "user-1", {
        name: "租户1的日历",
      });

      const calendar2 = await manager.createCalendar(tenant2Id, "user-2", {
        name: "租户2的日历",
      });

      const result1 = await manager.getCalendars(tenant1Id, "user-1");
      const result2 = await manager.getCalendars(tenant2Id, "user-2");

      // 租户1看不到租户2的数据
      const tenant1Calendars = result1.items.filter((c) => c.name === "租户2的日历");
      expect(tenant1Calendars.length).toBe(0);

      // 租户2看不到租户1的数据
      const tenant2Calendars = result2.items.filter((c) => c.name === "租户1的日历");
      expect(tenant2Calendars.length).toBe(0);
    });
  });
});
