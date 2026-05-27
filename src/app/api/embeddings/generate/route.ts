import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { safeJsonParseArray } from '@/lib/safe-json-parse';

// Rate limiting: max 50 files per call
const MAX_FILES_PER_CALL = 50;

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { fileIds } = body;

    const { db } = await import('@/lib/db');
    const {
      generateEmbedding,
      createFileEmbeddingText,
      serializeEmbedding,
      getEmbeddingCacheSize,
      clearEmbeddingCache,
    } = await import('@/lib/ai/embeddings');

    // Find files that need embeddings
    let targetFileIds: string[] = [];

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      // Specific files requested
      if (fileIds.length > MAX_FILES_PER_CALL) {
        return NextResponse.json(
          { error: `单次最多处理 ${MAX_FILES_PER_CALL} 个文件` },
          { status: 400 }
        );
      }

      // Filter out files that already have embeddings
      const existingEmbeddings = await db.fileEmbedding.findMany({
        where: {
          fileId: { in: fileIds },
          userId,
        },
        select: { fileId: true },
      });

      const existingSet = new Set(existingEmbeddings.map((e) => e.fileId));
      targetFileIds = fileIds.filter((id: string) => !existingSet.has(id));
    } else {
      // Process all files without embeddings
      const existingEmbeddings = await db.fileEmbedding.findMany({
        where: { userId },
        select: { fileId: true },
      });

      const existingSet = new Set(existingEmbeddings.map((e) => e.fileId));

      const filesWithoutEmbeddings = await db.file.findMany({
        where: {
          userId,
          isDeleted: false,
          id: { notIn: Array.from(existingSet) },
        },
        select: { id: true },
        take: MAX_FILES_PER_CALL,
      });

      targetFileIds = filesWithoutEmbeddings.map((f) => f.id);
    }

    if (targetFileIds.length === 0) {
      return NextResponse.json({
        generated: 0,
        message: '所有文件已有向量索引',
        cacheSize: getEmbeddingCacheSize(),
      });
    }

    // Fetch file data for target files
    const files = await db.file.findMany({
      where: {
        id: { in: targetFileIds },
        userId,
      },
    });

    let generatedCount = 0;
    const errors: string[] = [];

    // Process each file: generate embedding and store it
    for (const file of files) {
      try {
        // Create combined text for embedding
        const tags = safeJsonParseArray(file.tags) as string[];
        const embeddingText = createFileEmbeddingText({
          fileName: file.fileName,
          fileType: file.fileType,
          textContent: file.textContent,
          tags,
          summary: file.summary,
        });

        // Generate embedding
        const embedding = await generateEmbedding(embeddingText);

        // Check for zero vector
        if (embedding.every((v) => v === 0)) {
          errors.push(`文件 "${file.fileName}" 向量生成失败`);
          continue;
        }

        // Upsert embedding
        await db.fileEmbedding.upsert({
          where: { fileId: file.id },
          update: {
            embedding: serializeEmbedding(embedding),
          },
          create: {
            fileId: file.id,
            userId: file.userId,
            embedding: serializeEmbedding(embedding),
          },
        });

        generatedCount++;
      } catch (err) {
        console.error(`Failed to generate embedding for file ${file.id}:`, err);
        errors.push(`文件 "${file.fileName}" 处理失败`);
      }
    }

    // Clear in-memory cache periodically to prevent memory leaks
    if (getEmbeddingCacheSize() > 500) {
      clearEmbeddingCache();
    }

    return NextResponse.json({
      generated: generatedCount,
      total: files.length,
      errors: errors.length > 0 ? errors : undefined,
      remaining: Array.isArray(fileIds) ? 0 : undefined,
      cacheSize: getEmbeddingCacheSize(),
    });
  } catch (error) {
    console.error('Embedding generation error:', error);
    return NextResponse.json(
      { error: '向量生成失败，请稍后再试' },
      { status: 500 }
    );
  }
}

// GET endpoint to check embedding status
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { db } = await import('@/lib/db');

    const totalFiles = await db.file.count({
      where: { userId, isDeleted: false },
    });

    const totalEmbeddings = await db.fileEmbedding.count({
      where: { userId },
    });

    return NextResponse.json({
      totalFiles,
      totalEmbeddings,
      withoutEmbeddings: Math.max(0, totalFiles - totalEmbeddings),
      coverage: totalFiles > 0 ? Math.round((totalEmbeddings / totalFiles) * 100) : 0,
    });
  } catch (error) {
    console.error('Embedding status error:', error);
    return NextResponse.json(
      { error: '获取向量状态失败' },
      { status: 500 }
    );
  }
}
