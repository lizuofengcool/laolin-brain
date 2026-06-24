import { NextRequest, NextResponse } from "next/server";
import { emailService } from "@/lib/email";

/**
 * 邮件模板API
 * GET /api/email/templates - 获取邮件模板列表
 * GET /api/email/templates/[id] - 获取模板详情
 */

// ─── GET /api/email/templates — 获取邮件模板列表 ─────────────
export async function GET(request: NextRequest) {
  try {
    const templates = emailService.getTemplates();

    return NextResponse.json({
      success: true,
      data: templates.map((template) => ({
        id: template.id,
        name: template.name,
        subject: template.subject,
        variables: template.variables,
      })),
      total: templates.length,
    });
  } catch (error) {
    console.error("Failed to fetch email templates:", error);
    return NextResponse.json(
      { error: "获取邮件模板失败" },
      { status: 500 }
    );
  }
}
