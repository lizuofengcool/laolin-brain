import { NextRequest, NextResponse } from 'next/server';
import { describeImage } from '@/lib/ai/vision';
import { authenticateRequest } from '@/lib/api-auth';
import { checkAiQuotaAndTenant, incrementTenantAiUsage } from '@/lib/ai/ai-processor';

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

    const description = await describeImage(imageBase64);

    // 计入租户级 AI 用量（与 generate-tags 一致），保证 Tenant.aiUsed 反映全部 AI 调用
    await incrementTenantAiUsage(tenantId);

    const response = NextResponse.json({ description });
    response.headers.set('X-Ai-Usage-Remaining', String(quotaCheck.remaining));
    return response;
  } catch (error) {
    console.error('Describe API error:', error);
    return NextResponse.json(
      { error: 'Failed to describe image' },
      { status: 500 }
    );
  }
}
