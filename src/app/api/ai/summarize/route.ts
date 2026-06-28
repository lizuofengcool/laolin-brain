import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { checkAiQuotaAndTenant, incrementTenantAiUsage } from '@/lib/ai/ai-processor';
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

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId } = auth;

  // 检查AI配额和租户信息（与 generate-tags 一致：用户级 + 租户级双闸门，
  // tenantId 由 authenticateRequest 权威返回，避免函数内重复查 tenantUser）
  const quotaCheck = await checkAiQuotaAndTenant(userId, tenantId);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.error, resetTime: (quotaCheck as any).resetTime },
      { status: 429, headers: { 'X-Ai-Usage-Remaining': String(quotaCheck.remaining) } },
    );
  }

  try {
    const body = await request.json();
    const { content, fileName, fileType } = body;

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

    const zai = await getZAI();

    let systemPrompt: string;
    let userContent: string;

    if (fileType === 'image') {
      systemPrompt = `你是一个文档分析助手。请为以下图片文件生成摘要和建议标签。
请严格按照以下JSON格式返回，不要包含任何其他内容：
{"summary":"图片内容的简要描述","keyPoints":["关键点1","关键点2","关键点3"],"suggestedTags":["标签1","标签2","标签3"]}

要求：
- summary：用1-2句话描述图片内容
- keyPoints：3-5个关键观察点
- suggestedTags：3-5个中文标签，简短精炼`;

      userContent = `图片描述/OCR内容：${content || '(无文本内容)'}\n文件名：${fileName.slice(0, 200)}`;
    } else {
      systemPrompt = `你是一个文档分析助手。请为以下文档生成摘要、关键要点和建议标签。
请严格按照以下JSON格式返回，不要包含任何其他内容：
{"summary":"文档摘要","keyPoints":["关键要点1","关键要点2","关键要点3"],"suggestedTags":["标签1","标签2","标签3"]}

要求：
- summary：用2-3句话总结文档核心内容
- keyPoints：提取3-5个最重要的关键要点
- suggestedTags：根据文档内容推荐3-5个中文标签，简短精炼
- 如果是代码文件，描述功能和主要模块
- 如果是技术文档，总结技术要点`;

      userContent = `文件名：${fileName.slice(0, 200)}\n\n文档内容：\n${(content || '').slice(0, 8000)}`;
    }

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Parse the JSON response
    let parsed: { summary?: string; keyPoints?: string[]; suggestedTags?: string[] };

    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback: create a basic summary from the raw text
      parsed = {
        summary: responseText.slice(0, 200) || '无法生成摘要',
        keyPoints: [],
        suggestedTags: [],
      };
    }

    // 计入租户级 AI 用量（与 generate-tags 一致），保证 Tenant.aiUsed 反映全部 AI 调用
    await incrementTenantAiUsage(tenantId);

    return NextResponse.json({
      summary: parsed.summary || '无法生成摘要',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
    }, {
      headers: { 'X-Ai-Usage-Remaining': String(quotaCheck.remaining) },
    });
  } catch (error) {
    console.error('Summarize API error:', error);
    return NextResponse.json(
      { error: 'AI 摘要生成失败，请稍后再试' },
      { status: 500 }
    );
  }
}
