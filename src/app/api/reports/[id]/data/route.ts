import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { reportManager } from "@/lib/reports";
import type { Report } from "@/lib/reports/types";
import { fetchReportData } from "@/lib/reports/data-fetcher";

/**
 * 报表数据 API
 * GET /api/reports/[id]/data - 拉取报表所有 widget 的真实数据
 *
 * 当前轮仅支持内置模板（BUILTIN_REPORT_TEMPLATES）。用户自定义报表的拉取
 * 依赖 reportManager.getReport(id, tenantId)（内存态，重启即失，留待后续轮接
 * Prisma 持久化后再启用）。
 *
 * 权限：与 /api/stats 一致，仅 owner/admin 可访问。报表数据底层经
 * lib/stats/stats-service 查询租户级统计，member 角色无权读取。
 *
 * 返回格式：
 *   {
 *     success: true,
 *     data: {
 *       [widgetId: string]: {
 *         chartData?: DataPoint[],
 *         metricValue?: number | string,
 *         tableRows?: Record<string, unknown>[],
 *       }
 *     }
 *   }
 *
 * 未声明 dataConfig 的 widget 不出现在 data 中（前端按需回退到 mock）。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, role } = auth;

  // 权限校验：与 /api/stats 对齐，仅 owner/admin 可访问租户级统计数据
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json(
      { error: '没有权限查看报表数据' },
      { status: 403 }
    );
  }

  const { id: rawId } = await params;
  // 路径片段已由 Next.js URL-decode；额外 trim 防止手工输入带空格的 id 误命中失败分支
  const id = rawId?.trim() ?? '';

  if (!id) {
    return NextResponse.json(
      { error: '缺少报表 id' },
      { status: 400 }
    );
  }

  // 本轮仅接入内置模板；用户自定义报表留待后续轮（依赖持久化层）
  const template = reportManager.getTemplate(id);
  if (!template) {
    return NextResponse.json(
      { error: '报表不存在或已被删除' },
      { status: 404 }
    );
  }

  // 把内置模板适配为 Report 形态以供 fetchReportData 消费
  // （template 本身没有 tenant/createdBy 等字段，与详情页 templateToReport 一致）
  const now = new Date();
  const report: Report = {
    id: template.id,
    name: template.name,
    description: template.description,
    type: template.type,
    status: 'published',
    permission: 'public',
    category: template.category,
    layout: template.layout,
    parameters: template.parameters,
    dataConfig: undefined,
    coverImage: undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system',
    updatedBy: 'system',
    tenantId,
    isFavorite: false,
    viewCount: 0,
    lastViewedAt: undefined,
  };

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  try {
    const data = await fetchReportData(report, tenantId, dateFrom, dateTo);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch report data:', error);
    return NextResponse.json(
      { error: '拉取报表数据失败' },
      { status: 500 }
    );
  }
}
