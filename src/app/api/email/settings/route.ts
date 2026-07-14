import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { emailService } from "@/lib/email";
import { getEmailConfig, saveEmailConfig, maskEmailConfig } from "@/lib/email/settings-store";

/**
 * 邮件设置API
 * GET /api/email/settings - 获取邮件设置（按租户从 DB 读取，脱敏不含 pass）
 * POST /api/email/settings - 更新邮件设置（加密落库到租户 Setting，不再污染全局单例）
 * GET /api/email/templates - 获取邮件模板列表
 * GET /api/email/templates/[id] - 获取模板详情
 */

// ─── GET /api/email/settings — 获取邮件设置 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;

  // 只有管理员和所有者可以管理邮件设置
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "没有权限管理邮件设置" },
      { status: 403 }
    );
  }

  try {
    // 按租户从 DB 读取加密配置，解密后脱敏返回（不含 pass）
    const tenantConfig = await getEmailConfig(tenantId);
    if (tenantConfig) {
      return NextResponse.json({
        success: true,
        data: maskEmailConfig(tenantConfig),
      });
    }

    // 租户未配置时回退到环境变量（平台级 SMTP，只读），保持向后兼容
    const envConfigured =
      !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
    return NextResponse.json({
      success: true,
      data: {
        configured: envConfigured,
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER || "",
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
        fromName: process.env.SMTP_FROM_NAME || "个人私有第二大脑",
        hasPass: envConfigured,
        // 注意：不返回密码
      },
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
  const auth = await authenticateRequest(request);
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

    const config = {
      host,
      port: parseInt(port, 10),
      secure: !!secure,
      user,
      pass,
      from: from || user,
      fromName: fromName || "个人私有第二大脑",
    };

    // 加密落库到该租户的 Setting（AES-256-GCM，pass 不在 DB 文件中裸露），
    // 替代历史 emailService.init() 全局单例写法——避免租户 A 配置覆盖租户 B、
    // 且进程重启后配置从 DB 恢复。
    await saveEmailConfig(tenantId, config);

    // 配置变更后清租户 transporter 缓存，下次投递从 DB 重建 transporter
    emailService.invalidateTenant(tenantId);

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
      data: maskEmailConfig(config),
    });
  } catch (error) {
    console.error("Failed to update email settings:", error);
    return NextResponse.json(
      { error: "更新邮件设置失败" },
      { status: 500 }
    );
  }
}
