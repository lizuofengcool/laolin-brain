import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAiUsageStatus, AI_DAILY_LIMIT } from '@/lib/ai-usage';

/**
 * GET /api/ai/usage
 * 返回当前认证用户的 AI 调用用量信息（只读，不递增计数）
 */
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const status = getAiUsageStatus(auth.userId);

  return NextResponse.json({
    used: status.used,
    limit: status.limit,
    remaining: status.remaining,
    dailyLimit: AI_DAILY_LIMIT,
  });
}
