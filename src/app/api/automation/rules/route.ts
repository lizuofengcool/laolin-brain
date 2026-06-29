import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 自动化规则API
 * GET /api/automation/rules - 获取规则列表
 * POST /api/automation/rules - 创建规则
 */

// ─── GET /api/automation/rules — 获取规则列表 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeRaw = parseInt(searchParams.get('pageSize') || '20', 10);
    // 分页参数校验（defense-in-depth）：自动化规则为个人级数据（无 role 门控，按
    // userId+tenantId 双键作用域），门控直接置于解析后，避免 ?page=abc 透传 Prisma
    // skip/take（Math.min(100,NaN)=NaN → 未定义行为，崩溃被 try/catch 吞为 500）。
    if (isNaN(page) || page < 1) {
      return NextResponse.json({ error: 'page 必须 >= 1' }, { status: 400 });
    }
    if (isNaN(pageSizeRaw) || pageSizeRaw < 1) {
      return NextResponse.json({ error: 'pageSize 必须为正整数' }, { status: 400 });
    }
    const pageSize = Math.min(100, pageSizeRaw);
    const enabled = searchParams.get('enabled');
    const trigger = searchParams.get('trigger');

    // 构建查询条件
    const where: any = {
      tenantId,
      userId,
    };

    if (enabled !== null && enabled !== undefined) {
      where.enabled = enabled === 'true';
    }

    if (trigger) {
      where.trigger = trigger;
    }

    // 计算总数
    const total = await db.automationRule.count({ where });

    // 分页查询规则列表
    const rules = await db.automationRule.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 返回分页结果
    return NextResponse.json({
      data: rules.map(rule => ({
        id: rule.id,
        name: rule.name,
        trigger: rule.trigger,
        conditions: JSON.parse(rule.conditions || '{}'),
        actions: JSON.parse(rule.actions || '[]'),
        enabled: rule.enabled,
        priority: rule.priority,
        runCount: rule.runCount,
        lastRunAt: rule.lastRunAt,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    console.error('Failed to fetch automation rules:', error);
    return NextResponse.json(
      { error: '获取规则列表失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/automation/rules — 创建规则 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { name, trigger, conditions, actions, enabled = true, priority = 0 } = body;

    if (!name || !trigger) {
      return NextResponse.json(
        { error: 'name and trigger are required' },
        { status: 400 }
      );
    }

    // 创建规则
    const rule = await db.automationRule.create({
      data: {
        tenantId,
        userId,
        name,
        trigger,
        conditions: JSON.stringify(conditions || {}),
        actions: JSON.stringify(actions || []),
        enabled,
        priority,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        trigger: rule.trigger,
        conditions: JSON.parse(rule.conditions || '{}'),
        actions: JSON.parse(rule.actions || '[]'),
        enabled: rule.enabled,
        priority: rule.priority,
        runCount: rule.runCount,
        lastRunAt: rule.lastRunAt,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to create automation rule:', error);
    return NextResponse.json(
      { error: '创建规则失败' },
      { status: 500 }
    );
  }
}
