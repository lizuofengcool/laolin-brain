import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import bcrypt from "bcryptjs";

/**
 * 安全设置API - 密码管理
 * POST /api/user/security/change-password - 修改密码
 */

// 密码强度检查
function checkPasswordStrength(password: string): {
  score: number;
  level: string;
  suggestions: string[];
} {
  let score = 0;
  const suggestions: string[] = [];

  // 长度检查
  if (password.length >= 8) score += 1;
  else suggestions.push("密码长度至少8位");

  if (password.length >= 12) score += 1;

  // 复杂度检查
  if (/[a-z]/.test(password)) score += 1;
  else suggestions.push("包含小写字母");

  if (/[A-Z]/.test(password)) score += 1;
  else suggestions.push("包含大写字母");

  if (/\d/.test(password)) score += 1;
  else suggestions.push("包含数字");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else suggestions.push("包含特殊字符");

  // 评级
  let level = "weak";
  if (score >= 5) level = "strong";
  else if (score >= 3) level = "medium";

  return { score, level, suggestions };
}

// ─── POST /api/user/security/change-password — 修改密码 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { oldPassword, newPassword } = body;

    // 验证输入
    if (!oldPassword || !newPassword) {
      return NextResponse.json(
        { error: "旧密码和新密码都不能为空" },
        { status: 400 }
      );
    }

    // 检查新密码强度
    const strength = checkPasswordStrength(newPassword);
    if (strength.score < 3) {
      return NextResponse.json(
        {
          error: "密码强度不足",
          strength,
        },
        { status: 400 }
      );
    }

    // 查询用户
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.password
    );

    if (!isOldPasswordValid) {
      return NextResponse.json(
        { error: "旧密码不正确" },
        { status: 400 }
      );
    }

    // 检查新密码是否与旧密码相同
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "新密码不能与旧密码相同" },
        { status: 400 }
      );
    }

    // 哈希新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 更新密码
    await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 记录活动日志
    try {
      const ip = request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const userAgent = request.headers.get("user-agent") || "unknown";

      await db.activityLog.create({
        data: {
          tenantId: "", // 密码修改不关联特定租户
          userId,
          action: "password_changed",
          resourceType: "user",
          resourceId: userId,
          details: JSON.stringify({ ip, userAgent }),
          ipAddress: ip,
          userAgent,
        },
      });
    } catch (logError) {
      console.error("Failed to log password change:", logError);
      // 日志记录失败不影响主流程
    }

    return NextResponse.json({
      success: true,
      message: "密码修改成功",
    });
  } catch (error) {
    console.error("Failed to change password:", error);
    return NextResponse.json(
      { error: "修改密码失败" },
      { status: 500 }
    );
  }
}
