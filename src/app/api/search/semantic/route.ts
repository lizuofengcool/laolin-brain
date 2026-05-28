import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { safeJsonParseArray } from '@/lib/safe-json-parse';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: '查询过长（最多500字符）' },
        { status: 400 }
      );
    }

    // Use authenticated userId for security — never trust client-sent userId
    const authenticatedUserId = auth.userId;

    const { db } = await import('@/lib/db');
    const {
      generateEmbedding,
      cosineSimilarity,
      deserializeEmbedding,
    } = await import('@/lib/ai/embeddings');

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query.trim());

    // Check if query embedding is a zero vector (generation failed)
    const isZeroVector = queryEmbedding.every((v) => v === 0);
    if (isZeroVector) {
      return NextResponse.json({
        results: [],
        message: '向量生成失败，请尝试使用关键词搜索',
      });
    }

    // Fetch all embeddings for this user
    const fileEmbeddings = await db.fileEmbedding.findMany({
      where: { userId: authenticatedUserId },
    });

    if (fileEmbeddings.length === 0) {
      return NextResponse.json({
        results: [],
        message: '暂无向量索引，请先生成文件向量',
      });
    }

    // Compute similarity scores
    const scoredResults: Array<{
      fileId: string;
      score: number;
    }> = [];

    for (const fe of fileEmbeddings) {
      const fileEmbedding = deserializeEmbedding(fe.embedding);
      const score = cosineSimilarity(queryEmbedding, fileEmbedding);
      scoredResults.push({
        fileId: fe.fileId,
        score,
      });
    }

    // Sort by similarity score (descending) and take top 20
    scoredResults.sort((a, b) => b.score - a.score);
    const topResults = scoredResults.slice(0, 20);

    // Fetch file data for matched results (only non-deleted files)
    if (topResults.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const matchedFileIds = topResults.map((r) => r.fileId);
    const files = await db.file.findMany({
      where: {
        id: { in: matchedFileIds },
        isDeleted: false,
      },
    });

    // Map score to file data
    const scoreMap = new Map(topResults.map((r) => [r.fileId, r.score]));

    const results = files
      .map((f) => ({
        ...f,
        tags: safeJsonParseArray(f.tags),
        similarityScore: scoreMap.get(f.id) || 0,
        matchType: 'semantic' as const,
      }))
      .filter((f) => f.similarityScore > 0.1) // Filter out very low relevance results
      .sort((a, b) => b.similarityScore - a.similarityScore);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Semantic search error:', error);
    return NextResponse.json(
      { error: '语义搜索失败，请稍后再试' },
      { status: 500 }
    );
  }
}
