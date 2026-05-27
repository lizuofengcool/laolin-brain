import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImage } from '@/lib/ai/vision';
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

    const text = await extractTextFromImage(imageBase64);

    return NextResponse.json({ text });
  } catch (error) {
    console.error('OCR API error:', error);
    return NextResponse.json(
      { error: 'Failed to extract text from image' },
      { status: 500 }
    );
  }
}
