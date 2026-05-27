import ZAI from 'z-ai-web-dev-sdk';
import { cosineSimilarity } from '@/lib/math-utils';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// In-memory cache for embeddings
const embeddingCache = new Map<string, number[]>();

const EMBEDDING_DIMENSIONS = 64;
const SYSTEM_PROMPT = `你是一个文本向量化助手。你的任务是将给定的文本转换为一个${EMBEDDING_DIMENSIONS}维的归一化浮点向量，用于语义搜索和相似度计算。

规则：
1. 输出必须是一个合法的JSON数组，包含恰好${EMBEDDING_DIMENSIONS}个浮点数
2. 每个数值在-1.0到1.0之间
3. 语义相似的文本应该产生相似的向量
4. 向量需要进行归一化处理（L2范数接近1.0）
5. 只输出JSON数组，不要包含任何其他文字或markdown标记
6. 考虑文本的主题、关键词、情感和领域特征`;

/**
 * Generate a text embedding using AI chat completions.
 * The AI converts text into a 64-dimensional vector for semantic similarity.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    return createZeroVector();
  }

  const cacheKey = text.trim().toLowerCase();
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const zai = await getZAI();
    const truncatedText = text.length > 4000 ? text.slice(0, 4000) : text;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `请将以下文本转换为${EMBEDDING_DIMENSIONS}维向量：\n\n${truncatedText}`,
        },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse the embedding from the response
    const embedding = parseEmbedding(responseText);

    // Cache the result
    embeddingCache.set(cacheKey, embedding);

    return embedding;
  } catch (e) {
    console.error('Embedding generation failed:', e);
    return createZeroVector();
  }
}

/**
 * Parse embedding vector from AI response text.
 * Handles various formats: pure JSON array, markdown code block, etc.
 */
function parseEmbedding(responseText: string): number[] {
  try {
    // Try to extract JSON array from the response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length === EMBEDDING_DIMENSIONS) {
        const valid = parsed.every(
          (v) => typeof v === 'number' && isFinite(v) && Math.abs(v) <= 10
        );
        if (valid) {
          return normalizeVector(parsed);
        }
      }

      // If dimension count doesn't match, pad or truncate
      if (Array.isArray(parsed) && parsed.length > 0) {
        const numbers = parsed.filter(
          (v) => typeof v === 'number' && isFinite(v)
        );
        const adjusted = resizeVector(numbers, EMBEDDING_DIMENSIONS);
        return normalizeVector(adjusted);
      }
    }
  } catch {
    // Fall through to zero vector
  }

  console.warn('Failed to parse embedding from AI response, using zero vector');
  return createZeroVector();
}

/**
 * Resize a vector to the target dimension by truncating or padding with zeros.
 */
function resizeVector(vec: number[], targetDim: number): number[] {
  if (vec.length >= targetDim) {
    return vec.slice(0, targetDim);
  }
  const result = [...vec];
  while (result.length < targetDim) {
    result.push(0);
  }
  return result;
}

/**
 * Normalize a vector to unit length (L2 normalization).
 */
function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

/**
 * Create a zero vector of the embedding dimension.
 */
function createZeroVector(): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(0);
}

export { cosineSimilarity };

/**
 * Generate embeddings for multiple texts with concurrency control.
 */
export async function batchGenerateEmbeddings(
  texts: string[],
  concurrency: number = 3
): Promise<number[][]> {
  const results: number[][] = [];
  const queue = [...texts];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const text = queue.shift();
      if (text !== undefined) {
        const embedding = await generateEmbedding(text);
        results.push(embedding);
      }
    }
  };

  // Launch workers with concurrency limit
  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () =>
    worker()
  );
  await Promise.all(workers);

  return results;
}

/**
 * Create a combined text representation of a file for embedding.
 * Uses file name, tags, summary, and a preview of text content.
 */
export function createFileEmbeddingText(params: {
  fileName: string;
  fileType?: string;
  textContent?: string | null;
  tags?: string[];
  summary?: string | null;
}): string {
  const { fileName, fileType, textContent, tags, summary } = params;
  const parts: string[] = [];

  parts.push(`文件名: ${fileName}`);
  if (fileType) parts.push(`类型: ${fileType}`);
  if (summary) parts.push(`摘要: ${summary}`);
  if (tags && tags.length > 0) parts.push(`标签: ${tags.join(', ')}`);
  if (textContent) {
    // Use first 2000 chars of text content for embedding
    parts.push(`内容: ${textContent.slice(0, 2000)}`);
  }

  return parts.join('\n');
}

/**
 * Serialize an embedding vector to a JSON string for storage.
 */
export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * Deserialize an embedding vector from a JSON string.
 */
export function deserializeEmbedding(json: string): number[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (typeof v === 'number' ? v : 0));
    }
  } catch {
    console.warn('Failed to deserialize embedding');
  }
  return createZeroVector();
}

/**
 * Get the embedding cache size (useful for monitoring).
 */
export function getEmbeddingCacheSize(): number {
  return embeddingCache.size;
}

/**
 * Clear the embedding cache.
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
