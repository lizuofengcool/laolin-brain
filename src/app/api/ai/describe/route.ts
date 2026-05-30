import { NextRequest, NextResponse } from 'next/server';
import { describeImage } from '@/lib/ai/vision';
import { authenticateRequest } from '@/lib/api-auth';
import { checkAiUsage, AI_DAILY_LIMIT } from '@/lib/ai-usage';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  // Per-user daily AI usage check
  const usage = checkAiUsage(auth.userId);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `AI调用已达每日限额(${AI_DAILY_LIMIT}次)，请明天再试`, resetTime: usage.resetTime },
      { status: 429, headers: { 'X-Ai-Usage-Remaining': '0' } },
    );
  }

  try {
    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    if (typeof imageBase64 !== 'string' || imageBase64.length > 26_600_000) {
      return NextResponse.json(
        { error: 'imageBase64 无效或超过大小限制(20MB)' },
        { status: 400 }
      );
    }

    const description = await describeImage(imageBase64);

    const response = NextResponse.json({ description });
    response.headers.set('X-Ai-Usage-Remaining', String(usage.remaining));
    return response;
  } catch (error) {
    console.error('Describe API error:', error);
    return NextResponse.json(
      { error: 'Failed to describe image' },
      { status: 500 }
    );
  }
}
