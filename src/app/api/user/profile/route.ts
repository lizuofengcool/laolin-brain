import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 个人信息管理API
 * GET /api/user/profile - 获取个人信息
 * PATCH /api/user/profile - 更新个人信息
 */

// 默认个人设置
const DEFAULT_SETTINGS = {
  language: "zh-CN",
  theme: "system", // light / dark / system
  timezone: "Asia/Shanghai",
  dateFormat: "YYYY-MM-DD",
  timeFormat: "HH:mm:ss",
  notifications: {
    email: true,
    push: true,
    system: true,
  },
};

// ─── GET /api/user/profile — 获取个人信息 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    // 查询用户信息
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        storageMode: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 解析设置，合并默认值
    let userSettings = DEFAULT_SETTINGS;
    if (user.settings) {
      try {
        userSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(user.settings) };
      } catch {
        // 解析失败，使用默认值
      }
    }

    // 查询用户的租户信息
    const tenantUsers = await db.tenantUser.findMany({
      where: { userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            plan: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        storageMode: user.storageMode,
        settings: userSettings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        tenants: tenantUsers.map(tu => ({
          id: tu.tenant.id,
          name: tu.tenant.name,
          plan: tu.tenant.plan,
          status: tu.tenant.status,
          role: tu.role,
          joinedAt: tu.joinedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return NextResponse.json(
      { error: "获取个人信息失败" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/user/profile — 更新个人信息 ─────────────
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { name, avatar, settings, storageMode } = body;

    // 验证输入
    if (name !== undefined && !name.trim()) {
      return NextResponse.json(
        { error: "姓名不能为空" },
        { status: 400 }
      );
    }

    // 构建更新数据
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }

    if (storageMode !== undefined) {
      updateData.storageMode = storageMode;
    }

    if (settings !== undefined) {
      // 合并现有设置和新设置
      const existingUser = await db.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });

      let existingSettings = {};
      if (existingUser?.settings) {
        try {
          existingSettings = JSON.parse(existingUser.settings);
        } catch {
          // 解析失败，使用空对象
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };
      updateData.settings = JSON.stringify(mergedSettings);
    }

    // 更新用户信息
    const user = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        storageMode: true,
        settings: true,
        updatedAt: true,
      },
    });

    // 解析设置
    let userSettings = DEFAULT_SETTINGS;
    if (user.settings) {
      try {
        userSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(user.settings) };
      } catch {
        // 解析失败，使用默认值
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        storageMode: user.storageMode,
        settings: userSettings,
        updatedAt: user.updatedAt,
      },
      message: "个人信息已更新",
    });
  } catch (error) {
    console.error("Failed to update user profile:", error);
    return NextResponse.json(
      { error: "更新个人信息失败" },
      { status: 500 }
    );
  }
}
