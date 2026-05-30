import { NextRequest, NextResponse } from 'next/server';
import { askAboutDocument, askAboutImage } from '@/lib/ai/vision';
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
    const { type, content, question } = body;

    if (!type || !question) {
      return NextResponse.json(
        { error: 'type and question are required' },
        { status: 400 }
      );
    }

    // Validate type against allowed values
    const allowedTypes = ['document', 'image'];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: 'type must be "document" or "image"' },
        { status: 400 }
      );
    }

    if (type === 'document') {
      if (!content) {
        return NextResponse.json(
          { error: 'content is required for document type' },
          { status: 400 }
        );
      }
      if (typeof content !== 'string') {
        return NextResponse.json({ error: 'content must be a string for document type' }, { status: 400 });
      }
      // Truncate content to 50000 chars to avoid excessive token usage
      const truncatedContent = typeof content === 'string' && content.length > 50000
        ? content.slice(0, 50000)
        : content;
      const answer = await askAboutDocument(truncatedContent, question);
      const response = NextResponse.json({ answer });
      response.headers.set('X-Ai-Usage-Remaining', String(usage.remaining));
      return response;
    }

    if (type === 'image') {
      if (!content) {
        return NextResponse.json(
          { error: 'content (imageBase64) is required for image type' },
          { status: 400 }
        );
      }
      if (typeof content !== 'string' || content.length > 26_600_000) {
        return NextResponse.json(
          { error: 'imageBase64 exceeds maximum size limit (20MB)' },
          { status: 400 }
        );
      }
      const answer = await askAboutImage(content, question);
      const response = NextResponse.json({ answer });
      response.headers.set('X-Ai-Usage-Remaining', String(usage.remaining));
      return response;
    }

    return NextResponse.json(
      { error: 'type must be "document" or "image"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Ask API error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI answer' },
      { status: 500 }
    );
  }
}
