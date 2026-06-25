import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { checkAiQuotaAndTenant, incrementTenantAiUsage, safeParseAiJsonResponse } from '@/lib/ai/ai-processor';
import { db } from '@/lib/db';
import { safeJsonParseArray } from '@/lib/safe-json-parse';
import ZAI from 'z-ai-web-dev-sdk';

let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

function getZAI() {
  if (!zaiPromise) {
    zaiPromise = ZAI.create().catch((err) => {
      zaiPromise = null;
      throw err;
    });
  }
  return zaiPromise;
}

/**
 * 智能标签生成API
 * POST /api/ai/generate-tags
 * 
 * 功能：
 * - 分析文件内容，自动生成相关标签
 * - 支持多种文件类型（文档、图片等）
 * - 标签数量可配置（默认5-10个）
 * - 支持将生成的标签直接保存到文件
 */

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    // 检查AI配额和租户信息
    const quotaCheck = await checkAiQuotaAndTenant(userId);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: quotaCheck.error, resetTime: (quotaCheck as any).resetTime },
        { status: 429, headers: { 'X-Ai-Usage-Remaining': String(quotaCheck.remaining) } }
      );
    }

    const { tenantId } = quotaCheck as { allowed: true; tenantId: string; remaining: number };

    const body = await request.json();
    const { content, fileName, fileType, fileId, tagCount = 8, saveToFile = false } = body;

    if (!content && fileType !== 'image') {
      return NextResponse.json(
        { error: '内容不能为空' },
        { status: 400 }
      );
    }

    if (!fileName) {
      return NextResponse.json(
        { error: '文件名不能为空' },
        { status: 400 }
      );
    }

    // 如果要保存到文件，验证文件存在且属于当前用户和租户
    if (saveToFile && fileId) {
      const file = await db.file.findUnique({ where: { id: fileId } });
      if (!file || file.userId !== userId || file.tenantId !== tenantId) {
        return NextResponse.json(
          { error: '文件不存在或无权访问' },
          { status: 404 }
        );
      }
    }

    const zai = await getZAI();

    const systemPrompt = `你是一个智能标签生成助手。请根据文件内容生成相关的中文标签。
请严格按照以下JSON格式返回，不要包含任何其他内容：
{"tags":["标签1","标签2","标签3"]}

要求：
- 生成 ${tagCount} 个左右的标签
- 标签要简短精炼，通常2-4个字
- 标签要能准确反映文件内容
- 包含主题、类型、关键词等不同维度的标签
- 如果是技术文档，包含技术栈相关标签
- 如果是图片，根据图片内容生成描述性标签
- 标签按重要程度排序，最重要的在前`;

    const userContent = `文件名：${fileName.slice(0, 200)}
文件类型：${fileType || 'unknown'}

文件内容：
${(content || '').slice(0, 6000)}`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // 解析JSON响应
    const parsed = safeParseAiJsonResponse(responseText);
    let tags: string[] = [];

    if (parsed && Array.isArray(parsed.tags)) {
      tags = parsed.tags.filter((tag: any) => typeof tag === 'string' && tag.length > 0);
    } else {
      // Fallback: 从文本中提取关键词
      tags = extractTagsFromText(responseText, tagCount);
    }

    // 限制标签数量
    tags = tags.slice(0, tagCount);

    // 如果需要保存到文件
    if (saveToFile && fileId && tags.length > 0) {
      const file = await db.file.findUnique({ where: { id: fileId } });
      if (file) {
        const existingTags = safeJsonParseArray(file.tags as any);
        // 合并标签并去重
        const mergedTags = [...new Set([...existingTags, ...tags])];
        await db.file.update({
          where: { id: fileId },
          data: { tags: JSON.stringify(mergedTags) },
        });
      }
    }

    // 记录租户AI使用量
    await incrementTenantAiUsage(tenantId);

    return NextResponse.json({
      tags,
      tagCount: tags.length,
      savedToFile: saveToFile && fileId,
    }, {
      headers: { 'X-Ai-Usage-Remaining': String((quotaCheck.remaining || 0) - 1) },
    });
  } catch (error) {
    console.error('Generate tags API error:', error);
    return NextResponse.json(
      { error: '智能标签生成失败，请稍后再试' },
      { status: 500 }
    );
  }
}

/**
 * 从文本中提取标签（fallback方法）
 */
function extractTagsFromText(text: string, count: number): string[] {
  // 简单的关键词提取
  const words = text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2 && word.length <= 10);

  // 统计词频
  const wordCount = new Map<string, number>();
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  }

  // 按词频排序，取前N个
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}
