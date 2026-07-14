/**
 * reusePendingOrder 单元测试
 *
 * 直接测试 src/lib/billing/subscription.ts 的 reusePendingOrder 控制流，覆盖
 * worklog 第一百六十九轮「下一轮候选 #5」：切换 payMethod 时记录审计日志。
 *
 * 控制流分支：
 *   1. 订单不存在（findFirst 返回 null）→ 抛 "订单不存在"，不 update、不审计
 *   2. 非待支付订单（status !== 'pending'）→ 抛 "仅待支付订单可复用"，不 update、不审计
 *   3. payMethod 切换（order.payMethod !== 入参）→ db.order.update 刷新 payMethod，
 *      logger.audit 记录 {tenantId, orderId, orderNo, previousPayMethod, newPayMethod, amount}，
 *      返回 update 结果
 *   4. payMethod 不变 → 不 update、不审计，原样返回 order
 *
 * Mock 策略：vi.mock('@/lib/db') 隔离 Prisma；logger 为 @/lib/logging 单例，
 * vi.spyOn(logger, 'audit') 拦截审计调用断言字段，afterEach restoreAllMocks 防泄漏。
 * 路由级测试（payment-create-route）整体 mock 掉 reusePendingOrder，不触达此处，
 * 故本文件是 reusePendingOrder 真实实现的唯一直接测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { reusePendingOrder } from "@/lib/billing/subscription";
import { logger } from "@/lib/logging";
import { db } from "@/lib/db";

const tenantId = "tenant-001";
const orderId = "order-abc";

function makeOrder(overrides: Partial<{
  id: string;
  tenantId: string;
  orderNo: string;
  amount: number;
  status: string;
  payMethod: string | null;
  plan: string;
  interval: string;
}> = {}) {
  return {
    id: orderId,
    tenantId,
    orderNo: "NO-2024-0001",
    amount: 9900,
    status: "pending",
    payMethod: "alipay",
    plan: "pro",
    interval: "year",
    ...overrides,
  };
}

describe("reusePendingOrder", () => {
  let auditSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    auditSpy = vi.spyOn(logger, "audit").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("订单不存在 → 抛「订单不存在」，不 update、不审计", async () => {
    (db.order.findFirst as any).mockResolvedValue(null);

    await expect(
      reusePendingOrder(tenantId, orderId, "wechat")
    ).rejects.toThrow("订单不存在");

    expect(db.order.update).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("非待支付订单 → 抛「仅待支付订单可复用」，不 update、不审计", async () => {
    (db.order.findFirst as any).mockResolvedValue(makeOrder({ status: "paid" }));

    await expect(
      reusePendingOrder(tenantId, orderId, "wechat")
    ).rejects.toThrow("仅待支付订单可复用");

    expect(db.order.update).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("payMethod 切换 alipay→wechat → update 刷新并记审计（含前后支付方式与金额）", async () => {
    const existing = makeOrder({ payMethod: "alipay", amount: 9900 });
    (db.order.findFirst as any).mockResolvedValue(existing);
    const updated = { ...existing, payMethod: "wechat" };
    (db.order.update as any).mockResolvedValue(updated);

    const result = await reusePendingOrder(tenantId, orderId, "wechat");

    expect(result).toEqual(updated);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { payMethod: "wechat" },
    });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith("支付方式切换", {
      tenantId,
      orderId,
      orderNo: "NO-2024-0001",
      previousPayMethod: "alipay",
      newPayMethod: "wechat",
      amount: 9900,
    });
  });

  it("payMethod 切换 wechat→alipay → 审计字段方向正确", async () => {
    const existing = makeOrder({ payMethod: "wechat" });
    (db.order.findFirst as any).mockResolvedValue(existing);
    (db.order.update as any).mockResolvedValue({ ...existing, payMethod: "alipay" });

    await reusePendingOrder(tenantId, orderId, "alipay");

    expect(auditSpy).toHaveBeenCalledWith("支付方式切换", expect.objectContaining({
      previousPayMethod: "wechat",
      newPayMethod: "alipay",
    }));
  });

  it("payMethod 不变 → 不 update、不审计，原样返回 order", async () => {
    const existing = makeOrder({ payMethod: "alipay" });
    (db.order.findFirst as any).mockResolvedValue(existing);

    const result = await reusePendingOrder(tenantId, orderId, "alipay");

    expect(result).toBe(existing);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("findFirst 按 id + tenantId 定位（跨租户不命中）", async () => {
    (db.order.findFirst as any).mockResolvedValue(makeOrder());

    await reusePendingOrder(tenantId, orderId, "wechat").catch(() => {});

    expect(db.order.findFirst).toHaveBeenCalledWith({
      where: { id: orderId, tenantId },
    });
  });
});
