import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  createChatSession,
  getChatSessions,
  getChatSession,
  deleteChatSession,
  addChatMessage,
} from "@/lib/ai/document-qna";

/**
 * 对话会话API
 * GET /api/ai/chat/sessions - 获取对话列表
 * POST /api/ai/chat/sessions - 创建对话
 */

// ─── GET /api/ai/chat/sessions — 获取对话列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const sessions = await getChatSessions(userId, tenantId, limit);

    return NextResponse.json({
      success: true,
      data: sessions,
      total: sessions.length,
    });
  } catch (error) {
    console.error("Failed to get chat sessions:", error);
    return NextResponse.json(
      { error: "获取对话列表失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/ai/chat/sessions — 创建对话 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileIds = [], title } = body;

    const session = await createChatSession(userId, tenantId, fileIds, title);

    return NextResponse.json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Failed to create chat session:", error);
    return NextResponse.json(
      { error: "创建对话失败" },
      { status: 500 }
    );
  }
}
