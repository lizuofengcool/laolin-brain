/**
 * incrementTenantAiUsage 单元测试
 *
 * 锁定第三十四轮改动：自增 Tenant.aiUsed 与写入 AiUsageLog 明细在单个
 * db.$transaction（数组形式）内原子执行，保证配额计数与按类型拆分明细一致。
 *   - 成功：$transaction 收到长度 2 的数组；tenant.update 以
 *     { where:{id:tenantId}, data:{ aiUsed:{ increment:1 } } } 调用；
 *     aiUsageLog.create 以 { data:{ tenantId, userId, operation } } 调用。
 *   - 失败：$transaction reject 时函数不抛出（try/catch 吞没并 console.error），
 *     避免单次计数失败打断 AI 路由的成功响应。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockTransaction,
  mockTenantUpdate,
  mockAiUsageLogCreate,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockTenantUpdate: vi.fn(),
  mockAiUsageLogCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    tenant: { update: (...args: unknown[]) => mockTenantUpdate(...args) },
    aiUsageLog: { create: (...args: unknown[]) => mockAiUsageLogCreate(...args) },
  },
}));

import { incrementTenantAiUsage } from "@/lib/ai/ai-processor";

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantUpdate.mockResolvedValue({});
  mockAiUsageLogCreate.mockResolvedValue({});
  mockTransaction.mockResolvedValue([{}, {}]);
});

describe("incrementTenantAiUsage —— 原子自增 aiUsed + 写 AiUsageLog", () => {
  it("成功：$transaction 数组形式同时执行 tenant.update 与 aiUsageLog.create", async () => {
    await incrementTenantAiUsage("tenant-1", "summary", "user-1");

    // tenant.update 自增 aiUsed
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: { aiUsed: { increment: 1 } },
    });
    // aiUsageLog.create 写入明细（tenantId/userId/operation）
    expect(mockAiUsageLogCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", userId: "user-1", operation: "summary" },
    });
    // 二者在单个 $transaction 数组内原子提交
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const txArg = mockTransaction.mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2);
  });

  it("operation 透传：tags/ocr/describe 均按入参落库", async () => {
    await incrementTenantAiUsage("tenant-2", "tags", "user-2");
    expect(mockAiUsageLogCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-2", userId: "user-2", operation: "tags" },
    });

    await incrementTenantAiUsage("tenant-2", "ocr", "user-3");
    expect(mockAiUsageLogCreate).toHaveBeenLastCalledWith({
      data: { tenantId: "tenant-2", userId: "user-3", operation: "ocr" },
    });
  });

  it("失败不抛出：$transaction reject 时函数 resolve（避免打断 AI 路由成功响应）", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockTransaction.mockRejectedValue(new Error("db down"));
    await expect(
      incrementTenantAiUsage("tenant-1", "describe", "user-1"),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
