import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  getConflictFiles,
  resolveConflict,
  resolveConflictsAuto,
} from "@/lib/cloud-sync/sync-engine";

/**
 * GET /api/cloud-sync/conflicts
 * 获取冲突文件列表
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // 获取冲突文件
    const conflicts = await getConflictFiles(tenantId);

    return NextResponse.json({
      success: true,
      data: conflicts,
    });
  } catch (error) {
    console.error("获取冲突文件失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取冲突文件失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cloud-sync/conflicts
 * 解决冲突（单个或批量）
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { fileId, resolution, password, auto } = body;

    if (auto) {
      // 批量自动解决：resolveConflictsAuto 内部对所有冲突执行 upload/download（均需 password 加解密），
      // password 缺失会以 undefined 透传并在 crypto 阶段抛 cryptic 错误 → 500。这里前置校验返回
      // 400，与 sync/route.ts 的 !password → 400 约定一致（前端 CloudSync.tsx 已 client-side 强制）
      if (!password) {
        return NextResponse.json({ error: "请提供加密密码" }, { status: 400 });
      }
      const resolved = await resolveConflictsAuto(
        tenantId,
        userId,
        password,
        'last_write_wins'
      );

      return NextResponse.json({
        success: true,
        data: { resolved },
      });
    } else if (fileId && resolution) {
      // 单个解决：local_wins/cloud_wins/keep_all 三分支均需 password 加解密，同理前置校验
      if (!password) {
        return NextResponse.json({ error: "请提供加密密码" }, { status: 400 });
      }
      await resolveConflict(
        tenantId,
        userId,
        fileId,
        resolution as 'local_wins' | 'cloud_wins' | 'keep_both',
        password
      );

      return NextResponse.json({
        success: true,
        message: "冲突已解决",
      });
    } else {
      return NextResponse.json(
        { error: "请提供fileId和resolution，或设置auto为true" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("解决冲突失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解决冲突失败" },
      { status: 500 }
    );
  }
}
