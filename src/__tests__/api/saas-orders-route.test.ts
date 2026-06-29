/**
 * saas/orders 路由 handler 级集成测试
 *
 * 锁定 /api/saas/orders 两个 handler 的安全与控制流契约：
 *   - GET：未认证 401 透传；无 orderId → getTenantOrders(auth.tenantId) 列表；有 orderId →
 *     getOrder(orderId)（用 query 的 orderId 非 tenantId），订单不存在 → 404；订单存在但
 *     属于他租户（order.tenantId !== auth.tenantId）→ 404（纵深防御，不泄漏跨租户订单存在性）；
 *     任一服务抛错 → 500
 *   - POST：未认证 401 透传；校验顺序为 !plan||!interval（400 缺少必要参数）→ plan 合法性
 *     （400 无效的套餐类型）→ interval 合法性（400 无效的订阅周期），三道校验任一失败均不触达
 *     createOrder；通过后 createOrder(auth.tenantId, plan, interval, quantity)（tenantId 取自
 *     可信 auth，忽略 body 中 tenantId；quantity 缺省=1）+ getPaymentParams(order.id, 'alipay')，
 *     返回 { order, paymentParams, message }；createOrder/getPaymentParams 抛错 → 500
 *
 * Mock 策略：authenticateRequest / billing.service / next/server 全部隔离，不触达真实数据库。
 * 路由经服务层访问数据（无直接 db 依赖），故无需 mock @/lib/db。复用 saas-subscription-route
 * 的 vi.hoisted + MockNextResponse 范式，使路由的 `auth instanceof NextResponse` 与 mock 的
 * authenticateRequest 返回值共用同一构造器。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCreateOrder,
  mockGetOrder,
  mockGetTenantOrders,
  mockGetPaymentParams,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body?: unknown, init?: { status?: number } | undefined) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number } | undefined) {
      return new MockNextResponse(body, init);
    }
  }
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockCreateOrder: vi.fn(),
    mockGetOrder: vi.fn(),
    mockGetTenantOrders: vi.fn(),
    mockGetPaymentParams: vi.fn(),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/saas/billing.service", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
  getTenantOrders: (...args: unknown[]) => mockGetTenantOrders(...args),
  getPaymentParams: (...args: unknown[]) => mockGetPaymentParams(...args),
}));

import { GET, POST } from "@/app/api/saas/orders/route";

function makeRequest(url: string, method: string = "GET", body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as NextRequest;
}

type MockRes = InstanceType<typeof MockNextResponse>;

const FIXED_END = new Date("2026-07-15T00:00:00Z");

describe("saas/orders 路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 authenticateRequest 成功返回 owner 身份；逐用例按需覆盖
    mockAuthenticate.mockResolvedValue({
      userId: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "owner",
    });
  });

  describe("GET /api/saas/orders", () => {
    it("未认证 → 401 透传，不触达任一订单服务", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "未提供身份认证令牌" }, { status: 401 })
      );

      const res = (await GET(makeRequest("http://localhost/api/saas/orders"))) as MockRes;

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "未提供身份认证令牌" });
      expect(mockGetOrder).not.toHaveBeenCalled();
      expect(mockGetTenantOrders).not.toHaveBeenCalled();
    });

    it("无 orderId → getTenantOrders 以 auth.tenantId 调用，返回 { orders }", async () => {
      const orders = [
        { id: "order-1", tenantId: "tenant-1", plan: "pro", interval: "month", amount: 9900 },
        { id: "order-2", tenantId: "tenant-1", plan: "enterprise", interval: "year", amount: 99000 },
      ];
      mockGetTenantOrders.mockResolvedValue(orders);

      const res = (await GET(makeRequest("http://localhost/api/saas/orders"))) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ orders });
      // 列表路径以 auth.tenantId 作用域，不读 query 的 orderId
      expect(mockGetTenantOrders).toHaveBeenCalledWith("tenant-1");
      expect(mockGetOrder).not.toHaveBeenCalled();
    });

    it("有 orderId 且订单存在且属本租户 → getOrder(orderId) 调用，返回 { order }", async () => {
      const order = {
        id: "order-99",
        tenantId: "tenant-1",
        plan: "pro",
        interval: "month",
        amount: 9900,
        status: "pending",
        currentPeriodEnd: FIXED_END,
      };
      mockGetOrder.mockResolvedValue(order);

      const res = (await GET(
        makeRequest("http://localhost/api/saas/orders?orderId=order-99")
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ order });
      // getOrder 用 query 的 orderId（非 tenantId）——单订单读取按订单号定位
      expect(mockGetOrder).toHaveBeenCalledWith("order-99");
      expect(mockGetTenantOrders).not.toHaveBeenCalled();
    });

    it("有 orderId 但订单不存在 → 404 订单不存在", async () => {
      mockGetOrder.mockResolvedValue(null);

      const res = (await GET(
        makeRequest("http://localhost/api/saas/orders?orderId=order-missing")
      )) as MockRes;

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "订单不存在" });
      expect(mockGetOrder).toHaveBeenCalledWith("order-missing");
    });

    it("有 orderId 订单存在但属他租户 → 404（纵深防御，不泄漏跨租户订单）", async () => {
      // 订单存在但 tenantId 是另一个租户——路由须以 404 拒绝而非返回订单数据
      const crossTenantOrder = {
        id: "order-77",
        tenantId: "tenant-other",
        plan: "pro",
        interval: "month",
        amount: 9900,
      };
      mockGetOrder.mockResolvedValue(crossTenantOrder);

      const res = (await GET(
        makeRequest("http://localhost/api/saas/orders?orderId=order-77")
      )) as MockRes;

      expect(res.status).toBe(404);
      // 关键：不返回他租户订单数据，统一以"订单不存在"措辞拒绝（不泄漏存在性）
      expect(res.body).toEqual({ error: "订单不存在" });
      expect(mockGetOrder).toHaveBeenCalledWith("order-77");
    });

    it("getTenantOrders 抛错 → 500 获取订单失败", async () => {
      mockGetTenantOrders.mockRejectedValue(new Error("db down"));

      const res = (await GET(makeRequest("http://localhost/api/saas/orders"))) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订单失败" });
    });

    it("getOrder 抛错 → 500 获取订单失败", async () => {
      mockGetOrder.mockRejectedValue(new Error("db down"));

      const res = (await GET(
        makeRequest("http://localhost/api/saas/orders?orderId=order-99")
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "获取订单失败" });
    });
  });

  describe("POST /api/saas/orders", () => {
    it("未认证 → 401 透传，不触达 createOrder", async () => {
      mockAuthenticate.mockResolvedValue(
        MockNextResponse.json({ error: "令牌无效或已过期" }, { status: 401 })
      );

      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "pro", interval: "month" })
      )) as MockRes;

      expect(res.status).toBe(401);
      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockGetPaymentParams).not.toHaveBeenCalled();
    });

    it("缺 plan → 400 缺少必要参数，不触达 createOrder（plan 校验先于 interval 校验）", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { interval: "month" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "缺少必要参数" });
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("缺 interval（plan 存在）→ 400 缺少必要参数", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "pro" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "缺少必要参数" });
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("无效 plan（'gold'）→ 400 无效的套餐类型，不触达 createOrder", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "gold", interval: "month" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "无效的套餐类型" });
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("无效 interval（'weekly'，plan 合法）→ 400 无效的订阅周期，不触达 createOrder", async () => {
      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "pro", interval: "weekly" })
      )) as MockRes;

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "无效的订阅周期" });
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it("成功（quantity 缺省）→ createOrder 以 (tenantId, plan, interval, 1) 调用，quantity 默认 1；getPaymentParams(order.id, 'alipay')", async () => {
      const order = {
        id: "order-new",
        tenantId: "tenant-1",
        plan: "pro",
        interval: "month",
        amount: 9900,
        status: "pending",
      };
      const paymentParams = { appId: "demo-app", sign: "demo-sign", outTradeNo: "order-new" };
      mockCreateOrder.mockResolvedValue(order);
      mockGetPaymentParams.mockResolvedValue(paymentParams);

      // body 带他租户 tenantId —— 路由须忽略 body.tenantId，用 auth.tenantId
      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", {
          plan: "pro",
          interval: "month",
          tenantId: "tenant-evil",
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        order,
        paymentParams,
        message: "订单创建成功，请完成支付",
      });
      // createOrder 第一参为 auth.tenantId（忽略 body.tenantId），quantity 缺省=1
      expect(mockCreateOrder).toHaveBeenCalledWith("tenant-1", "pro", "month", 1);
      expect(mockGetPaymentParams).toHaveBeenCalledWith("order-new", "alipay");
    });

    it("成功（带 quantity=5）→ createOrder 以 body 中的 quantity 调用", async () => {
      const order = {
        id: "order-bulk",
        tenantId: "tenant-1",
        plan: "enterprise",
        interval: "year",
        amount: 495000,
        status: "pending",
      };
      mockCreateOrder.mockResolvedValue(order);
      mockGetPaymentParams.mockResolvedValue({ outTradeNo: "order-bulk" });

      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", {
          plan: "enterprise",
          interval: "year",
          quantity: 5,
        })
      )) as MockRes;

      expect(res.status).toBe(200);
      expect(mockCreateOrder).toHaveBeenCalledWith("tenant-1", "enterprise", "year", 5);
      expect(mockGetPaymentParams).toHaveBeenCalledWith("order-bulk", "alipay");
    });

    it("createOrder 抛错 → 500 创建订单失败，getPaymentParams 不触达", async () => {
      mockCreateOrder.mockRejectedValue(new Error("create failed"));

      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "pro", interval: "month" })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "创建订单失败" });
      expect(mockGetPaymentParams).not.toHaveBeenCalled();
    });

    it("getPaymentParams 抛错 → 500 创建订单失败", async () => {
      mockCreateOrder.mockResolvedValue({
        id: "order-x",
        tenantId: "tenant-1",
        plan: "pro",
        interval: "month",
        amount: 9900,
      });
      mockGetPaymentParams.mockRejectedValue(new Error("payment params failed"));

      const res = (await POST(
        makeRequest("http://localhost/api/saas/orders", "POST", { plan: "pro", interval: "month" })
      )) as MockRes;

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "创建订单失败" });
    });
  });
});
