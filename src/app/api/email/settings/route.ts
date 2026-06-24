import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { emailService, initEmailServiceFromEnv } from "@/lib/email";

/**
 * 邮件设置API
 * GET /api/email/settings - 获取邮件设置
 * POST /api/email/settings - 更新邮件设置
 * POST /api/email/test - 发送测试邮件
 * GET /api/email/templates - 获取邮件模板列表
 * GET /api/email/templates/[id] - 获取模板详情
 */

// ─── GET /api/email/settings — 获取邮件设置 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  // 只有管理员和所有者可以管理邮件设置
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "没有权限管理邮件设置" },
      { status: 403 }
    );
  }

  try {
    // 从环境变量获取当前配置（不返回密码）
    const settings = {
      configured: emailService.isConfigured(),
      host: process.env.SMTP_HOST || "",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER || "",
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
      fromName: process.env.SMTP_FROM_NAME || "个人私有第二大脑",
      // 注意：不返回密码
    };

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Failed to fetch email settings:", error);
    return NextResponse.json(
      { error: "获取邮件设置失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/email/settings — 更新邮件设置 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  // 只有管理员和所有者可以管理邮件设置
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "没有权限管理邮件设置" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { host, port, secure, user, pass, from, fromName } = body;

    // 验证输入
    if (!host || !user || !pass) {
      return NextResponse.json(
        { error: "SMTP服务器地址、用户名和密码不能为空" },
        { status: 400 }
      );
    }

    // 注意：实际生产环境中，应该将配置保存到数据库或环境变量
    // 这里只是演示，实际需要根据部署方式来处理
    // 可以保存到租户设置中

    // 临时初始化邮件服务用于测试
    try {
      emailService.init({
        host,
        port: parseInt(port, 10),
        secure: !!secure,
        user,
        pass,
        from: from || user,
        fromName: fromName || "个人私有第二大脑",
      });
    } catch (initError) {
      console.error("Failed to init email service:", initError);
      return NextResponse.json(
        { error: "邮件服务配置失败，请检查SMTP设置" },
        { status: 400 }
      );
    }

    // 记录活动日志
    try {
      await db.activityLog.create({
        data: {
          tenantId,
          userId,
          action: "email_settings_updated",
          resourceType: "setting",
          details: JSON.stringify({ host, port, user }),
        },
      });
    } catch (logError) {
      console.error("Failed to log email settings update:", logError);
    }

    return NextResponse.json({
      success: true,
      message: "邮件设置已更新",
      data: {
        configured: true,
        host,
        port: parseInt(port, 10),
        secure: !!secure,
        user,
        from: from || user,
        fromName: fromName || "个人私有第二大脑",
      },
    });
  } catch (error) {
    console.error("Failed to update email settings:", error);
    return NextResponse.json(
      { error: "更新邮件设置失败" },
      { status: 500 }
    );
  }
}
