import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

/**
 * 单个自动化规则API
 * GET /api/automation/rules/[id] - 获取规则详情
 * PATCH /api/automation/rules/[id] - 更新规则
 * DELETE /api/automation/rules/[id] - 删除规则
 * POST /api/automation/rules/[id]/toggle - 启用/禁用规则
 */

// ─── GET /api/automation/rules/[id] — 获取规则详情 ─────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: ruleId } = await params;

  try {
    // 查询规则
    const rule = await db.automationRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
        userId,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: '规则不存在' },
        { status: 404 }
      );
    }

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
    console.error('Failed to fetch automation rule:', error);
    return NextResponse.json(
      { error: '获取规则详情失败' },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/automation/rules/[id] — 更新规则 ─────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: ruleId } = await params;

  try {
    const body = await request.json();
    const { name, conditions, actions, enabled, priority } = body;

    // 检查规则是否存在
    const existingRule = await db.automationRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
        userId,
      },
    });

    if (!existingRule) {
      return NextResponse.json(
        { error: '规则不存在' },
        { status: 404 }
      );
    }

    // 构建更新数据
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (conditions !== undefined) updateData.conditions = JSON.stringify(conditions);
    if (actions !== undefined) updateData.actions = JSON.stringify(actions);
    if (enabled !== undefined) updateData.enabled = enabled;
    if (priority !== undefined) updateData.priority = priority;

    // 更新规则
    const rule = await db.automationRule.update({
      where: { id: ruleId },
      data: updateData,
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
    console.error('Failed to update automation rule:', error);
    return NextResponse.json(
      { error: '更新规则失败' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/automation/rules/[id] — 删除规则 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;
  const { id: ruleId } = await params;

  try {
    // 检查规则是否存在
    const existingRule = await db.automationRule.findFirst({
      where: {
        id: ruleId,
        tenantId,
        userId,
      },
    });

    if (!existingRule) {
      return NextResponse.json(
        { error: '规则不存在' },
        { status: 404 }
      );
    }

    // 删除规则
    await db.automationRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({
      success: true,
      message: '规则已删除',
    });
  } catch (error) {
    console.error('Failed to delete automation rule:', error);
    return NextResponse.json(
      { error: '删除规则失败' },
      { status: 500 }
    );
  }
}
