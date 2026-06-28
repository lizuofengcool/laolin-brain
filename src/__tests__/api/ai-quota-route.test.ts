/**
 * AI 路由租户级配额一致性 handler 级集成测试
 *
 * 锁定 summarize / ocr / describe 三个 AI 路由与 generate-tags 对齐后的配额契约：
 *   - 401 透传：authenticateRequest 返回 NextResponse 时直接返回，不触达
 *     checkAiQuotaAndTenant，也不触达 AI 提供方。
 *   - 租户配额耗尽 → 429：checkAiQuotaAndTenant 返回 {allowed:false} 时返回 429 +
 *     X-Ai-Usage-Remaining 头，不触达 AI 提供方，且不调用 incrementTenantAiUsage
 *     （失败/拒绝路径不计入用量，防止配额未消耗却被计数）。
 *   - 成功 → 200 + 计数：checkAiQuotaAndTenant 以 (userId, tenantId) 入参（锁定
 *     tenantId 取自 authenticateRequest 权威值、而非函数内重复查 tenantUser），
 *     AI 提供方被调用，incrementTenantAiUsage(tenantId) 被调用一次。
 *
 * 本轮（第三十三轮）修复点：这三个路由此前仅用 checkAiUsage（用户级内存配额），
 * 未走 checkAiQuotaAndTenant 的租户级 DB 闸门、也不调用 incrementTenantAiUsage，
 * 导致租户 AI 配额仅由 generate-tags 计入、可被其它三类路由绕过。本测试锁定修复
 * 后的控制流，防止回退。
 *
 * 复用第三十~三十二轮 vi.hoisted 共享 MockNextResponse + 全模块隔离范式；
 * MockNextResponse.headers 用 Map 以支持路由 `response.headers.set(...)` 调用。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  MockNextResponse,
  mockAuthenticate,
  mockCheckQuota,
  mockIncrement,
  mockExtractText,
  mockDescribeImage,
  mockChatCreate,
  mockZaiCreate,
} = vi.hoisted(() => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(
      body?: unknown,
      init?: { status?: number; headers?: Record<string, string> } | undefined,
    ) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    static json(
      body: unknown,
      init?: { status?: number; headers?: Record<string, string> } | undefined,
    ) {
      return new MockNextResponse(body, init);
    }
    async json(): Promise<unknown> {
      return this.body;
    }
  }
  // 稳定的 ZAI 实例：chat.completions.create 为可控 spy，便于逐用例设定返回值。
  // 路由内 getZAI() 会缓存 zaiPromise，稳定实例保证跨用例 spy 引用一致。
  const mockChatCreate = vi.fn();
  const mockZaiInstance = { chat: { completions: { create: mockChatCreate } } };
  return {
    MockNextResponse,
    mockAuthenticate: vi.fn(),
    mockCheckQuota: vi.fn(),
    mockIncrement: vi.fn(),
    mockExtractText: vi.fn(),
    mockDescribeImage: vi.fn(),
    mockChatCreate,
    mockZaiCreate: vi.fn(() => Promise.resolve(mockZaiInstance)),
  };
});

vi.mock("next/server", () => ({ NextResponse: MockNextResponse }));
vi.mock("@/lib/api-auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));
vi.mock("@/lib/ai/ai-processor", () => ({
  checkAiQuotaAndTenant: (...args: unknown[]) => mockCheckQuota(...args),
  incrementTenantAiUsage: (...args: unknown[]) => mockIncrement(...args),
}));
vi.mock("@/lib/ai/vision", () => ({
  extractTextFromImage: (...args: unknown[]) => mockExtractText(...args),
  describeImage: (...args: unknown[]) => mockDescribeImage(...args),
}));
vi.mock("z-ai-web-dev-sdk", () => ({
  default: { create: (...args: unknown[]) => mockZaiCreate(...args) },
}));

import { POST as summarizePOST } from "@/app/api/ai/summarize/route";
import { POST as ocrPOST } from "@/app/api/ai/ocr/route";
import { POST as describePOST } from "@/app/api/ai/describe/route";

// 默认 owner 身份（逐用例按需覆盖）
const ownerAuth = {
  userId: "user-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  role: "owner",
};

type MockRes = InstanceType<typeof MockNextResponse>;

function makePostRequest(body: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

function auth401(): MockRes {
  return new MockNextResponse({ error: "未授权" }, { status: 401 });
}

function quotaDenied() {
  return {
    allowed: false,
    error: "租户AI配额已用完，请升级套餐",
    remaining: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticate.mockResolvedValue(ownerAuth);
  // 默认放行（用户级 + 租户级双闸门均通过）
  mockCheckQuota.mockResolvedValue({
    allowed: true,
    tenantId: ownerAuth.tenantId,
    remaining: 199,
  });
  mockIncrement.mockResolvedValue(undefined);
  mockExtractText.mockResolvedValue("ocr-text");
  mockDescribeImage.mockResolvedValue("image-description");
  mockChatCreate.mockResolvedValue({
    choices: [
      {
        message: {
          content: '{"summary":"摘要","keyPoints":["k1"],"suggestedTags":["t1"]}',
        },
      },
    ],
  });
});

describe("AI 路由租户级配额一致性（summarize/ocr/describe 对齐 generate-tags）", () => {
  describe("POST /api/ai/summarize", () => {
    it("401 透传：authenticateRequest 返回 NextResponse 时不触达配额校验与 AI 模型", async () => {
      mockAuthenticate.mockResolvedValue(auth401());
      const res = (await summarizePOST(
        makePostRequest({ content: "x", fileName: "a.txt", fileType: "text" }),
      )) as MockRes;
      expect(res.status).toBe(401);
      expect(mockCheckQuota).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
      expect(mockChatCreate).not.toHaveBeenCalled();
    });

    it("租户配额耗尽 → 429，不触达 AI 模型且不计入用量", async () => {
      mockCheckQuota.mockResolvedValue(quotaDenied());
      const res = (await summarizePOST(
        makePostRequest({ content: "x", fileName: "a.txt", fileType: "text" }),
      )) as MockRes;
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("0");
      expect(mockChatCreate).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
    });

    it("成功 → 200，配额校验以 (userId, tenantId) 入参，AI 模型被调用且 incrementTenantAiUsage(tenantId) 被调用", async () => {
      const res = (await summarizePOST(
        makePostRequest({ content: "hello", fileName: "a.txt", fileType: "text" }),
      )) as MockRes;
      expect(res.status).toBe(200);
      expect(mockCheckQuota).toHaveBeenCalledWith("user-1", "tenant-1");
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      expect(mockIncrement).toHaveBeenCalledWith("tenant-1");
      expect(mockIncrement).toHaveBeenCalledTimes(1);
      const body = await res.json();
      expect(body).toHaveProperty("summary", "摘要");
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("199");
    });
  });

  describe("POST /api/ai/ocr", () => {
    it("401 透传：不触达配额校验与 extractTextFromImage", async () => {
      mockAuthenticate.mockResolvedValue(auth401());
      const res = (await ocrPOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(401);
      expect(mockCheckQuota).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
      expect(mockExtractText).not.toHaveBeenCalled();
    });

    it("租户配额耗尽 → 429，不触达 extractTextFromImage 且不计入用量", async () => {
      mockCheckQuota.mockResolvedValue(quotaDenied());
      const res = (await ocrPOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("0");
      expect(mockExtractText).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
    });

    it("成功 → 200，extractTextFromImage 被调用且 incrementTenantAiUsage(tenantId) 被调用", async () => {
      const res = (await ocrPOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(200);
      expect(mockCheckQuota).toHaveBeenCalledWith("user-1", "tenant-1");
      expect(mockExtractText).toHaveBeenCalledTimes(1);
      expect(mockIncrement).toHaveBeenCalledWith("tenant-1");
      expect(mockIncrement).toHaveBeenCalledTimes(1);
      const body = await res.json();
      expect(body).toHaveProperty("text", "ocr-text");
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("199");
    });
  });

  describe("POST /api/ai/describe", () => {
    it("401 透传：不触达配额校验与 describeImage", async () => {
      mockAuthenticate.mockResolvedValue(auth401());
      const res = (await describePOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(401);
      expect(mockCheckQuota).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
      expect(mockDescribeImage).not.toHaveBeenCalled();
    });

    it("租户配额耗尽 → 429，不触达 describeImage 且不计入用量", async () => {
      mockCheckQuota.mockResolvedValue(quotaDenied());
      const res = (await describePOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("0");
      expect(mockDescribeImage).not.toHaveBeenCalled();
      expect(mockIncrement).not.toHaveBeenCalled();
    });

    it("成功 → 200，describeImage 被调用且 incrementTenantAiUsage(tenantId) 被调用", async () => {
      const res = (await describePOST(
        makePostRequest({ imageBase64: "data:image/png;base64,xxx" }),
      )) as MockRes;
      expect(res.status).toBe(200);
      expect(mockCheckQuota).toHaveBeenCalledWith("user-1", "tenant-1");
      expect(mockDescribeImage).toHaveBeenCalledTimes(1);
      expect(mockIncrement).toHaveBeenCalledWith("tenant-1");
      expect(mockIncrement).toHaveBeenCalledTimes(1);
      const body = await res.json();
      expect(body).toHaveProperty("description", "image-description");
      expect(res.headers.get("X-Ai-Usage-Remaining")).toBe("199");
    });
  });
});
