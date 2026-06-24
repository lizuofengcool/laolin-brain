import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  getHomeRecommendations,
  getRelatedRecommendations,
  getSearchRecommendations,
  getDailyRecommendations,
  getUserInterestTags,
  recordUserAction,
} from "@/lib/ai/recommendation";

/**
 * 推荐系统API
 * GET /api/recommendations - 获取推荐
 * GET /api/recommendations/interest-tags - 获取用户兴趣标签
 * POST /api/recommendations/feedback - 推荐反馈
 */

// ─── GET /api/recommendations — 获取推荐 ─────────────
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "home"; // home, related, search, daily
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const fileId = searchParams.get("fileId") || "";
    const query = searchParams.get("q") || "";

    let recommendations;

    switch (type) {
      case "home":
        recommendations = await getHomeRecommendations(userId, tenantId, limit);
        break;

      case "related":
        if (!fileId) {
          return NextResponse.json(
            { error: "缺少fileId参数" },
            { status: 400 }
          );
        }
        recommendations = await getRelatedRecommendations(
          fileId,
          userId,
          tenantId,
          limit
        );
        break;

      case "search":
        if (!query) {
          return NextResponse.json(
            { error: "缺少查询词" },
            { status: 400 }
          );
        }
        recommendations = await getSearchRecommendations(
          query,
          userId,
          tenantId,
          limit
        );
        break;

      case "daily":
        recommendations = await getDailyRecommendations(userId, tenantId, limit);
        break;

      default:
        return NextResponse.json(
          { error: "无效的推荐类型" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: recommendations,
      type,
      count: recommendations.length,
    });
  } catch (error) {
    console.error("Failed to get recommendations:", error);
    return NextResponse.json(
      { error: "获取推荐失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/recommendations — 记录用户行为 ─────────────
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId } = auth;

  try {
    const body = await request.json();
    const { fileId, action, details } = body;

    if (!fileId || !action) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 记录用户行为
    await recordUserAction(userId, tenantId, fileId, action, details);

    return NextResponse.json({
      success: true,
      message: "行为已记录",
    });
  } catch (error) {
    console.error("Failed to record user action:", error);
    return NextResponse.json(
      { error: "记录行为失败" },
      { status: 500 }
    );
  }
}
