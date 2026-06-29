import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { isR2Configured } from "@/lib/cloud-sync/r2-storage";
import { downloadAndRestoreBackup, deleteBackup } from "@/lib/cloud-sync/sync-engine";
import { z } from "zod";

// 恢复备份请求验证
const restoreBackupSchema = z.object({
  password: z.string().min(1, "加密密码不能为空"),
});

/**
 * 判定存储层"对象不存在"错误。
 *
 * downloadAndRestoreBackup / deleteBackup 内部调用 storage.downloadObject /
 * deleteObject，当目标备份不存在时底层 SDK 抛出带结构化字段的对象不存在错误：
 *   - R2 / S3（@aws-sdk/client-s3）：error.name === 'NoSuchKey' | 'NotFound'，
 *     或 error.$metadata.httpStatusCode === 404
 *   - Aliyun OSS（ali-oss）：error.code === 'NoSuchKey'，或 error.status === 404
 *
 * 此处统一识别这些字段，供路由 catch 块将"备份不存在"映射为 404 而非 500。
 */
function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    e.code === "NoSuchKey" ||
    e.name === "NoSuchKey" ||
    e.name === "NotFound" ||
    e.status === 404 ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * 判定解密失败（密码错误）错误。
 *
 * downloadAndRestoreBackup 调用 decrypt（AES-256-GCM），密码错误时 GCM 认证标签
 * 校验失败，decipher.final() 抛错。Node 16+ 该错误带 code ===
 * 'ERR_CRYPTO_AUTHENTICATION_FAILED'；旧版 Node 未设 code，message 含
 * "Unsupported state or unable to authenticate data"。此处双重判定以兼容。
 *
 * 供路由 catch 块将"加密密码错误"映射为 401 而非 500。
 */
function isDecryptionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === "ERR_CRYPTO_AUTHENTICATION_FAILED") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return msg.includes("Unsupported state or unable to authenticate data");
}

// ─── POST /api/cloud-sync/backups/[id] — 恢复指定备份 ─────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { userId, tenantId } = auth;
  const backupId = id;

  try {
    // 按租户查询 DB 是否已配置 R2，避免此前进程级单例导致的跨租户误报
    if (!(await isR2Configured(tenantId))) {
      return NextResponse.json(
        { error: "云同步未配置，请先配置 Cloudflare R2" },
        { status: 400 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const validated = restoreBackupSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "请求格式无效", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { password } = validated.data;

    // 恢复备份
    const result = await downloadAndRestoreBackup(tenantId, userId, backupId, password);

    return NextResponse.json({
      success: true,
      message: "备份恢复成功",
      restored: result.restored,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("恢复备份失败:", error);
    // 备份不存在（存储层 NoSuchKey/NotFound/404）→ 404，区别于内部错误 500
    if (isStorageNotFoundError(error)) {
      return NextResponse.json(
        { error: "备份不存在" },
        { status: 404 }
      );
    }
    // 加密密码错误（GCM 认证标签校验失败）→ 401，区别于内部错误 500
    if (isDecryptionError(error)) {
      return NextResponse.json(
        { error: "加密密码错误" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "恢复备份失败：" + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/cloud-sync/backups/[id] — 删除指定备份 ─────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { tenantId } = auth;
  const backupId = id;

  try {
    if (!(await isR2Configured(tenantId))) {
      return NextResponse.json(
        { error: "云同步未配置，请先配置 Cloudflare R2" },
        { status: 400 }
      );
    }

    // 删除备份
    await deleteBackup(tenantId, backupId);

    return NextResponse.json({
      success: true,
      message: "备份删除成功",
    });
  } catch (error) {
    console.error("删除备份失败:", error);
    // 备份不存在（存储层 NoSuchKey/NotFound/404）→ 404，区别于内部错误 500。
    // 注意：R2/S3/OSS 的 deleteObject 对不存在的 key 通常幂等不抛错，
    // 此分支防御性覆盖个别 SDK/配置下抛出 NoSuchKey 的场景。
    if (isStorageNotFoundError(error)) {
      return NextResponse.json(
        { error: "备份不存在" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "删除备份失败：" + (error as Error).message },
      { status: 500 }
    );
  }
}
