import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

type SearchMode = "keyword" | "semantic" | "hybrid";

// Keyword search - the original search logic
async function keywordSearch(
  q: string,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  const files = await db.file.findMany({
    where: {
      userId,
      storageMode: "cloud",
      isDeleted: false,
      OR: [
        { fileName: { contains: q } },
        { textContent: { contains: q } },
        { tags: { contains: q } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return files.map((f) => ({
    ...f,
    tags: safeJsonParseArray(f.tags),
    matchType: "keyword",
    similarityScore: 0,
  }));
}

// Semantic search using embeddings
async function semanticSearch(
  q: string,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  const {
    generateEmbedding,
    cosineSimilarity,
    deserializeEmbedding,
  } = await import("@/lib/ai/embeddings");

  const queryEmbedding = await generateEmbedding(q.trim());

  // Check if query embedding is a zero vector
  const isZeroVector = queryEmbedding.every((v) => v === 0);
  if (isZeroVector) {
    return [];
  }

  const fileEmbeddings = await db.fileEmbedding.findMany({
    where: { userId },
  });

  if (fileEmbeddings.length === 0) {
    return [];
  }

  // Compute similarity scores
  const scoredResults: Array<{ fileId: string; score: number }> = [];

  for (const fe of fileEmbeddings) {
    const fileEmbedding = deserializeEmbedding(fe.embedding);
    const score = cosineSimilarity(queryEmbedding, fileEmbedding);
    scoredResults.push({ fileId: fe.fileId, score });
  }

  scoredResults.sort((a, b) => b.score - a.score);
  const topResults = scoredResults.slice(0, 30);

  const matchedFileIds = topResults.map((r) => r.fileId);
  const files = await db.file.findMany({
    where: {
      id: { in: matchedFileIds },
      isDeleted: false,
    },
  });

  const scoreMap = new Map(topResults.map((r) => [r.fileId, r.score]));

  return files
    .map((f) => ({
      ...f,
      tags: safeJsonParseArray(f.tags),
      similarityScore: scoreMap.get(f.id) || 0,
      matchType: "semantic",
    }))
    .filter((f) => f.similarityScore > 0.1)
    .sort((a, b) => b.similarityScore - a.similarityScore);
}

// Hybrid search - combine keyword and semantic results
async function hybridSearch(
  q: string,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  // Run both searches in parallel
  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(q, userId),
    semanticSearch(q, userId),
  ]);

  // Weighted scoring: 0.4 * keyword + 0.6 * semantic
  const resultScores = new Map<string, { data: Record<string, unknown>; score: number; matchTypes: string[] }>();

  // Add keyword results (max score of 0.6 for keyword matches)
  for (const result of keywordResults) {
    const id = result.id as string;
    resultScores.set(id, {
      data: result,
      score: 0.6,
      matchTypes: ["keyword"],
    });
  }

  // Add/merge semantic results
  for (const result of semanticResults) {
    const id = result.id as string;
    const semanticScore = (result.similarityScore as number) * 0.6;

    if (resultScores.has(id)) {
      const existing = resultScores.get(id)!;
      existing.score += semanticScore;
      existing.matchTypes.push("semantic");
      existing.data = {
        ...result,
        matchType: "both",
        similarityScore: (existing.data.similarityScore as number) + semanticScore,
      };
    } else {
      resultScores.set(id, {
        data: result,
        score: semanticScore,
        matchTypes: ["semantic"],
      });
    }
  }

  // Sort by combined score and return top 50
  const mergedResults = Array.from(resultScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  return mergedResults.map((r) => ({
    ...r.data,
    combinedScore: r.score,
  }));
}

// Face group name search - find photos by person name
async function faceSearch(
  q: string,
  userId: string
): Promise<Array<Record<string, unknown>>> {
  // Find face groups whose name matches the query
  const matchingGroups = await db.faceGroup.findMany({
    where: {
      userId,
      name: { contains: q },
    },
    include: { faces: { select: { fileId: true } } },
  });

  if (matchingGroups.length === 0) {
    return [];
  }

  // Collect unique file IDs from all matching face groups
  const fileIdSet = new Set<string>();
  for (const group of matchingGroups) {
    for (const face of group.faces) {
      fileIdSet.add(face.fileId);
    }
  }

  const fileIds = Array.from(fileIdSet);
  if (fileIds.length === 0) return [];

  const files = await db.file.findMany({
    where: {
      id: { in: fileIds },
      isDeleted: false,
    },
  });

  const matchedGroupNames = matchingGroups
    .filter((g) => g.name)
    .map((g) => g.name);

  return files.map((f) => ({
    ...f,
    tags: safeJsonParseArray(f.tags),
    matchType: "face",
    similarityScore: 0,
    matchedFaceNames: matchedGroupNames,
  }));
}

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const mode = (searchParams.get("mode") || "hybrid") as SearchMode;

    if (!q) {
      return NextResponse.json([]);
    }

    if (q.length > 500) {
      return NextResponse.json(
        { error: "Search query too long (max 500 characters)" },
        { status: 400 }
      );
    }

    let results: Array<Record<string, unknown>>;

    switch (mode) {
      case "semantic":
        results = await semanticSearch(q, userId);
        break;
      case "keyword":
        results = await keywordSearch(q, userId);
        break;
      case "hybrid":
      default:
        results = await hybridSearch(q, userId);
        break;
    }

    // Also search face groups by name
    const faceResults = await faceSearch(q, userId);

    // Merge face results into main results (avoid duplicates)
    const existingIds = new Set(results.map((r) => r.id as string));
    for (const faceResult of faceResults) {
      if (!existingIds.has(faceResult.id as string)) {
        results.push(faceResult);
      }
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
