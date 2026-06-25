import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { initFTS5Index, rebuildFTS5Index, getFTS5Stats } from "@/lib/search/fts5";

/**
 * POST /api/search/init
 * 初始化/重建 FTS5 全文搜索索引
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const rebuild = body.rebuild === true;

    if (rebuild) {
      const result = await rebuildFTS5Index();
      return NextResponse.json({
        message: result.success ? "索引重建完成" : "索引重建失败",
        ...result,
      });
    }

    await initFTS5Index();
    const stats = await getFTS5Stats();

    return NextResponse.json({
      message: "FTS5 索引初始化完成",
      ...stats,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "初始化失败", detail: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/search/init
 * 获取 FTS5 索引状态
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const stats = await getFTS5Stats();
  return NextResponse.json(stats);
}
