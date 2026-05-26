import { NextRequest, NextResponse } from 'next/server';
import { askAboutDocument, askAboutImage } from '@/lib/ai/vision';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content, question } = body;

    if (!type || !question) {
      return NextResponse.json(
        { error: 'type and question are required' },
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
      const answer = await askAboutDocument(content, question);
      return NextResponse.json({ answer });
    }

    if (type === 'image') {
      if (!content) {
        return NextResponse.json(
          { error: 'content (imageBase64) is required for image type' },
          { status: 400 }
        );
      }
      const answer = await askAboutImage(content, question);
      return NextResponse.json({ answer });
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
