import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/** GET /api/chat/conversations/[id]/messages - 获取对话消息 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const { id } = await params;

  const conv = await db.chatConversation.findFirst({
    where: { id, userId, tenantId },
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  if (!conv) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  const messages = conv.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.getTime(),
    toolResults: m.toolResults ? JSON.parse(m.toolResults) : undefined,
    isStreaming: false,
  }));

  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      provider: conv.provider,
      createdAt: conv.createdAt.getTime(),
      updatedAt: conv.updatedAt.getTime(),
    },
    messages,
  });
}

/** POST /api/chat/conversations/[id]/messages - 保存消息 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const { id } = await params;

  const conv = await db.chatConversation.findFirst({ where: { id, userId, tenantId } });
  if (!conv) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { messages, title } = body as {
      messages: Array<{
        id: string;
        role: string;
        content: string;
        timestamp: number;
        toolResults?: unknown;
        isStreaming?: boolean;
      }>;
      title?: string;
    };

    if (title && title !== conv.title) {
      await db.chatConversation.update({
        where: { id },
        data: { title },
      });
    }

    await db.chatMessage.deleteMany({ where: { conversationId: id, tenantId } });

    if (messages.length > 0) {
      await db.chatMessage.createMany({
        data: messages.map((m) => ({
          conversationId: id,
          tenantId,
          userId,
          role: m.role,
          content: m.content,
          toolResults: m.toolResults ? JSON.stringify(m.toolResults) : null,
          isStreaming: false,
          timestamp: new Date(m.timestamp),
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "保存消息失败" }, { status: 500 });
  }
}
