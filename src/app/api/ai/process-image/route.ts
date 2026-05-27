import { NextRequest, NextResponse } from 'next/server';
import { describeImage, extractTextFromImage } from '@/lib/ai/vision';
import { authenticateRequest } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

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

    // Run OCR and description in parallel
    const [ocrText, description] = await Promise.all([
      extractTextFromImage(imageBase64),
      describeImage(imageBase64),
    ]);

    // Generate tags from description
    const tags = description
      .split(/[,，、;；\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 8);

    return NextResponse.json({
      ocrText: ocrText === '无文字' ? '' : ocrText,
      description,
      tags,
    });
  } catch (error) {
    console.error('Process image API error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}
