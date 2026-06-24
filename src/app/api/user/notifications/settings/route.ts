import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 通知偏好设置API
 * GET /api/user/notifications/settings - 获取通知设置
 * PATCH /api/user/notifications/settings - 更新通知设置
 */

// 默认通知设置
const DEFAULT_NOTIFICATION_SETTINGS = {
  // 通知类型开关
  types: {
    system: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
    payment: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
    storage: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
    ai: {
      enabled: true,
      channels: { inApp: true, email: false, push: false },
    },
    share: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
    comment: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
    collaboration: {
      enabled: true,
      channels: { inApp: true, email: true, push: false },
    },
  },
  // 免打扰设置
  doNotDisturb: {
    enabled: false,
    startTime: "22:00",
    endTime: "08:00",
    allowImportant: true, // 重要通知不受免打扰限制
  },
  // 声音设置
  sound: {
    enabled: true,
    volume: 0.5,
  },
};

// ─── GET /api/user/notifications/settings — 获取通知设置 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    // 查询用户设置
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 解析用户设置
    let userSettings: any = {};
    if (user.settings) {
      try {
        userSettings = JSON.parse(user.settings);
      } catch {
        // 解析失败，使用空对象
      }
    }

    // 合并默认设置和用户设置
    const notificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(userSettings.notifications || {}),
    };

    // 深度合并类型设置
    if (userSettings.notifications?.types) {
      notificationSettings.types = {
        ...DEFAULT_NOTIFICATION_SETTINGS.types,
        ...userSettings.notifications.types,
      };
    }

    return NextResponse.json({
      success: true,
      data: notificationSettings,
    });
  } catch (error) {
    console.error("Failed to fetch notification settings:", error);
    return NextResponse.json(
      { error: "获取通知设置失败" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/user/notifications/settings — 更新通知设置 ─────────────
export async function PATCH(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = auth;

  try {
    const body = await request.json();
    const { types, doNotDisturb, sound } = body;

    // 查询现有设置
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 解析现有设置
    let userSettings: any = {};
    if (user.settings) {
      try {
        userSettings = JSON.parse(user.settings);
      } catch {
        // 解析失败，使用空对象
      }
    }

    // 构建新的通知设置
    const currentNotifications = userSettings.notifications || {};
    const newNotifications = { ...currentNotifications };

    if (types !== undefined) {
      newNotifications.types = {
        ...DEFAULT_NOTIFICATION_SETTINGS.types,
        ...currentNotifications.types,
        ...types,
      };
    }

    if (doNotDisturb !== undefined) {
      newNotifications.doNotDisturb = {
        ...DEFAULT_NOTIFICATION_SETTINGS.doNotDisturb,
        ...currentNotifications.doNotDisturb,
        ...doNotDisturb,
      };
    }

    if (sound !== undefined) {
      newNotifications.sound = {
        ...DEFAULT_NOTIFICATION_SETTINGS.sound,
        ...currentNotifications.sound,
        ...sound,
      };
    }

    // 更新用户设置
    const updatedSettings = {
      ...userSettings,
      notifications: newNotifications,
    };

    await db.user.update({
      where: { id: userId },
      data: { settings: JSON.stringify(updatedSettings) },
    });

    return NextResponse.json({
      success: true,
      data: newNotifications,
      message: "通知设置已更新",
    });
  } catch (error) {
    console.error("Failed to update notification settings:", error);
    return NextResponse.json(
      { error: "更新通知设置失败" },
      { status: 500 }
    );
  }
}
