import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { checkAiUsage, AI_DAILY_LIMIT } from '@/lib/ai-usage';
import ZAI from 'z-ai-web-dev-sdk';
import { getTenantDbFromUserId } from '@/lib/db';

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
    const { fileId, files } = body;

    if (!fileId || !files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'fileId 和 files 参数不能为空' },
        { status: 400 }
      );
    }

    // Filter out the current file and files without content
    const otherFiles = files.filter(
      (f: { id: string; textContent?: string; fileName?: string }) =>
        f.id !== fileId && (f.textContent || f.fileName)
    );

    // Verify file IDs belong to the current tenant
    const tenantDb = await getTenantDbFromUserId(auth.userId);
    const allFileIds = [...otherFiles.map(f => f.id), fileId];
    const dbFiles = await tenantDb.file.findMany({
      where: { id: { in: allFileIds }, isDeleted: false },
      select: { id: true, userId: true },
    });
    const userFileIds = new Set(dbFiles.filter(f => f.userId === auth.userId).map(f => f.id));
    const verifiedOtherFiles = otherFiles.filter(f => userFileIds.has(f.id));
    if (!userFileIds.has(fileId)) {
      return NextResponse.json({ relatedFiles: [], reasons: {} });
    }

    if (verifiedOtherFiles.length === 0) {
      return NextResponse.json({ relatedFiles: [], reasons: {} });
    }

    // Find the current file
    const currentFile = files.find((f: { id: string }) => f.id === fileId);
    if (!currentFile) {
      return NextResponse.json({ relatedFiles: [], reasons: {} });
    }

    const zai = await getZAI();

    // Build a compact file list for the AI
    const fileListStr = verifiedOtherFiles
      .slice(0, 30) // Limit to 30 files to avoid context overflow
      .map((f: { id: string; fileName?: string; textContent?: string; tags?: string[] }, index: number) => {
        const contentPreview = (f.textContent || '').slice(0, 200);
        const tagsStr = Array.isArray(f.tags) ? f.tags.join(', ') : '';
        return `[${index}] ID:${f.id} | 文件名:${f.fileName || '未知'} | 标签:${tagsStr} | 内容摘要:${contentPreview || '(无文本内容)'}`;
      })
      .join('\n');

    const currentContentPreview = (currentFile.textContent || '').slice(0, 500);
    const currentTags = Array.isArray(currentFile.tags) ? currentFile.tags.join(', ') : '';

    const prompt = `根据以下文件列表，找出与指定文件最相关的3-5个文件。

当前文件：
ID:${currentFile.id} | 文件名:${currentFile.fileName || '未知'} | 标签:${currentTags} | 内容摘要:${currentContentPreview || '(无文本内容)'}

候选文件列表：
${fileListStr}

请分析文件之间的内容相似度、主题关联性和标签匹配度。只返回JSON格式，不要包含任何其他内容：
{"relatedFiles":[{"id":"文件ID","reason":"推荐原因"}]}

要求：
- 返回3-5个最相关的文件
- reason用简短的中文说明关联原因（10个字以内）
- 按相关性从高到低排序`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: '你是一个文档关联分析助手。根据文件内容找出最相关的文档。' },
        { role: 'user', content: prompt },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '';

    let parsed: { relatedFiles?: Array<{ id: string; reason?: string }> };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch {
      parsed = { relatedFiles: [] };
    }

    const relatedFiles = Array.isArray(parsed.relatedFiles)
      ? parsed.relatedFiles
          .filter((f) => f.id && f.id !== fileId)
          .slice(0, 5)
      : [];

    // Build reasons map
    const reasons: Record<string, string> = {};
    for (const rf of relatedFiles) {
      if (rf.reason) {
        reasons[rf.id] = rf.reason;
      }
    }

    const response = NextResponse.json({
      relatedFiles: relatedFiles.map((f) => f.id),
      reasons,
    });
    response.headers.set('X-Ai-Usage-Remaining', String(usage.remaining));
    return response;
  } catch (error) {
    console.error('Related files API error:', error);
    return NextResponse.json(
      { error: '推荐相关文件失败' },
      { status: 500 }
    );
  }
}
