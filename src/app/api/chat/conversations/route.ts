import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/** GET /api/chat/conversations - 获取对话列表 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const conversations = await db.chatConversation.findMany({
    where: { userId, tenantId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      provider: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ conversations });
}

/** POST /api/chat/conversations - 创建对话 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  try {
    const body = await request.json();
    const { title, provider } = body as { title?: string; provider?: string };

    const conversation = await db.chatConversation.create({
      data: {
        userId,
        tenantId,
        title: title || "新对话",
        provider: provider || "zhipu",
      },
    });

    return NextResponse.json({ conversation });
  } catch {
    return NextResponse.json({ error: "创建对话失败" }, { status: 500 });
  }
}

/** DELETE /api/chat/conversations?id=xxx - 删除对话 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId } = auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少对话ID" }, { status: 400 });
  }

  const conv = await db.chatConversation.findFirst({ where: { id, userId, tenantId } });
  if (!conv) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  await db.chatConversation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
