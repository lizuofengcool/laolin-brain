/**
 * EmailService 租户级投递单测
 *
 * 锁定第一百八十轮 sendEmail 租户隔离行为（修复"单例 transporter 跨租户污染"）：
 *   - tenantId 非空 → resolveTransporter 从 settings-store.getEmailConfig 读取该租户配置，
 *     用该配置建独立 transporter（createTransport 收到租户 host/auth），sendMail.from 为租户 from；
 *     同租户二次投递命中缓存（getEmailConfig/createTransport 不再调用）。
 *   - invalidateTenant → 清缓存，下次投递重新从 DB 加载。
 *   - 租户无配置（getEmailConfig → null）→ warn + 不调用 sendMail（不跨租户回退到单例）。
 *   - getEmailConfig 抛错 → console.error + 跳过，不外抛。
 *   - tenantId 空 → 走平台单例（init 配置），不调用 getEmailConfig（平台/监控告警路径不变）。
 *   - 租户隔离：tenant-A 缓存后投递 tenant-B → tenant-B 各自从 DB 取配置，A 的 from 不串到 B。
 *
 * 隔离策略：vi.mock('nodemailer') + vi.mock('@/lib/email/settings-store')；每用例 new EmailService()
 * 取独立实例，避免 tenantTransporters 缓存跨用例残留；flushQueue 排宏任务等待 fire-and-forget
 * processQueue 排干（含动态 import 与 getEmailConfig 的微任务链）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EmailService } from "@/lib/email";
import type { EmailConfig } from "@/lib/email";

const { mockSendMail, mockCreateTransport, mockGetEmailConfig } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockCreateTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  mockGetEmailConfig: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => mockCreateTransport(...(args as [])),
  },
}));
vi.mock("@/lib/email/settings-store", () => ({
  getEmailConfig: (...args: unknown[]) => mockGetEmailConfig(...args),
}));

// 排宏任务等待 processQueue（fire-and-forget）排干；动态 import + getEmailConfig 均为微任务链，
// 单个 setImmediate 在所有待决微任务结算后触发，足够排干。补一次保险 flush 防偶发抖动。
function flushQueue(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
async function flushTwice(): Promise<void> {
  await flushQueue();
  await flushQueue();
}

const tenantA: EmailConfig = {
  host: "smtp.a.com",
  port: 465,
  secure: true,
  user: "a@a.com",
  pass: "pass-a",
  from: "noreply@a.com",
  fromName: "A 团队",
};
const tenantB: EmailConfig = {
  host: "smtp.b.com",
  port: 587,
  secure: false,
  user: "b@b.com",
  pass: "pass-b",
  from: "noreply@b.com",
  fromName: "B 团队",
};

describe("EmailService 租户级投递", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tenantId 非空 → getEmailConfig(tenantId) 取配置，建独立 transporter，sendMail.from 为租户 from", async () => {
    mockGetEmailConfig.mockResolvedValue(tenantA);
    const service = new EmailService();

    await service.sendEmail("to@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();

    expect(mockGetEmailConfig).toHaveBeenCalledTimes(1);
    expect(mockGetEmailConfig).toHaveBeenCalledWith("tenant-A");
    // createTransport 收到租户 A 的 host/auth
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    const transportArg = mockCreateTransport.mock.calls[0][0];
    expect(transportArg).toMatchObject({
      host: "smtp.a.com",
      port: 465,
      auth: { user: "a@a.com", pass: "pass-a" },
    });
    // sendMail.from 使用租户 A 的 fromName/from
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].from).toBe('"A 团队" <noreply@a.com>');
    expect(mockSendMail.mock.calls[0][0].to).toBe("to@x.com");
  });

  it("同租户二次投递命中缓存 → getEmailConfig/createTransport 不再调用", async () => {
    mockGetEmailConfig.mockResolvedValue(tenantA);
    const service = new EmailService();

    await service.sendEmail("to1@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();
    await service.sendEmail("to2@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();

    expect(mockGetEmailConfig).toHaveBeenCalledTimes(1);
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0].to).toBe("to1@x.com");
    expect(mockSendMail.mock.calls[1][0].to).toBe("to2@x.com");
  });

  it("invalidateTenant → 清缓存，下次投递重新从 DB 加载", async () => {
    mockGetEmailConfig.mockResolvedValue(tenantA);
    const service = new EmailService();

    await service.sendEmail("to1@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();

    service.invalidateTenant("tenant-A");
    // 配置变更（模拟）
    const updated: EmailConfig = { ...tenantA, fromName: "A 新团队", from: "new@a.com" };
    mockGetEmailConfig.mockResolvedValue(updated);

    await service.sendEmail("to2@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();

    expect(mockGetEmailConfig).toHaveBeenCalledTimes(2);
    expect(mockCreateTransport).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[1][0].from).toBe('"A 新团队" <new@a.com>');
  });

  it("租户无配置（getEmailConfig → null）→ warn + 不调用 sendMail（不跨租户回退）", async () => {
    mockGetEmailConfig.mockResolvedValue(null);
    const service = new EmailService();
    // 即便单例已 init（平台配置），租户投递也不应回退到单例
    service.init(tenantB);

    await service.sendEmail("to@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();

    expect(mockGetEmailConfig).toHaveBeenCalledWith("tenant-A");
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("Email service not configured, skipping queue");
  });

  it("getEmailConfig 抛错 → console.error + 跳过，不外抛", async () => {
    mockGetEmailConfig.mockRejectedValue(new Error("db down"));
    const service = new EmailService();

    await expect(
      service.sendEmail("to@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A")
    ).resolves.toBe(true);
    await flushTwice();

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Failed to resolve email transporter for tenant tenant-A:",
      expect.any(Error)
    );
  });

  it("tenantId 空 → 走平台单例（init 配置），不调用 getEmailConfig", async () => {
    const service = new EmailService();
    service.init(tenantB);

    await service.sendEmail("to@x.com", "welcome", { userName: "U", appUrl: "" });
    await flushTwice();

    expect(mockGetEmailConfig).not.toHaveBeenCalled();
    expect(mockCreateTransport).toHaveBeenCalledTimes(1); // init 的 createTransport
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    // 单例 from 为 init 的 tenantB
    expect(mockSendMail.mock.calls[0][0].from).toBe('"B 团队" <noreply@b.com>');
  });

  it("租户隔离：tenant-A 缓存后投递 tenant-B → B 各自从 DB 取配置，A 的 from 不串到 B", async () => {
    mockGetEmailConfig.mockImplementation((tenantId: string) =>
      tenantId === "tenant-A" ? Promise.resolve(tenantA) : Promise.resolve(tenantB)
    );
    const service = new EmailService();

    await service.sendEmail("to-a@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-A");
    await flushTwice();
    await service.sendEmail("to-b@x.com", "welcome", { userName: "U", appUrl: "" }, "tenant-B");
    await flushTwice();

    expect(mockGetEmailConfig).toHaveBeenCalledTimes(2);
    expect(mockGetEmailConfig).toHaveBeenNthCalledWith(1, "tenant-A");
    expect(mockGetEmailConfig).toHaveBeenNthCalledWith(2, "tenant-B");
    // 两个独立 transporter
    expect(mockCreateTransport).toHaveBeenCalledTimes(2);
    expect(mockCreateTransport.mock.calls[0][0].host).toBe("smtp.a.com");
    expect(mockCreateTransport.mock.calls[1][0].host).toBe("smtp.b.com");
    // A 投递用 A 的 from，B 投递用 B 的 from（不串）
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0].from).toBe('"A 团队" <noreply@a.com>');
    expect(mockSendMail.mock.calls[1][0].from).toBe('"B 团队" <noreply@b.com>');
  });
});
