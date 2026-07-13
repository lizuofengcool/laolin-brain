/**
 * email 模块单测
 *
 * 锁定 src/lib/email/index.ts 的行为契约：
 *   - 8 个默认模板注册（id/name/subject/variables）。
 *   - renderTemplate：变量替换（subject + html）、未知模板返回 null、未提供变量保留 {{占位}}、
 *     多余变量忽略不报错、text 去除 HTML 标签并折叠空白。
 *   - init / isConfigured：init 前后状态翻转，init 透传 host/port/secure/auth 给 createTransport。
 *   - sendEmail：fire-and-forget 立即返回 true（sendMail reject 也不阻塞）；
 *     配置后经 processQueue 排干队列、按入队顺序调用 transporter.sendMail；
 *     未配置时清空队列并 console.warn、不调用 sendMail；
 *     sendMail reject 走 catch 记录 console.error、不外抛、isProcessing 复位后可继续发送。
 *   - sendTestEmail：未配置抛错；成功返回 true；sendMail reject 返回 false。
 *   - initEmailServiceFromEnv：env 齐全 → emailService.init 收到解析后的配置
 *     （端口数字、secure 布尔、from 回退、默认值）；env 缺失 → 不调用 init。
 *
 * 隔离策略：vi.mock('nodemailer') 拦截 createTransport；每用例 new EmailService() 取独立
 * 实例避免单例状态泄漏；initEmailServiceFromEnv 用例对单例 emailService.init 做
 * mockImplementation 拦截，不实际写入 transporter，单例状态不跨用例残留。
 * sendEmail 内 processQueue 为 fire-and-forget，故每用例后 await flushQueue()（排一个
 * setImmediate 宏任务）等待 sendMail 微任务 drain 与队列排干后再断言。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EmailService,
  emailService,
  initEmailServiceFromEnv,
} from "@/lib/email";
import type { EmailConfig } from "@/lib/email";

const { mockSendMail, mockCreateTransport } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockCreateTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => mockCreateTransport(...(args as [])),
  },
}));

// 排一个 setImmediate 宏任务，等待 sendEmail 内 fire-and-forget processQueue 排干
function flushQueue(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeConfig(overrides: Partial<EmailConfig> = {}): EmailConfig {
  return {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    user: "user@example.com",
    pass: "pass",
    from: "noreply@example.com",
    fromName: "第二大脑",
    ...overrides,
  };
}

describe("EmailService 模板注册", () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  it("构造时注册 8 个默认模板", () => {
    const templates = service.getTemplates();
    expect(templates).toHaveLength(8);
    const ids = templates.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        "alert-notification",
        "comment-notification",
        "payment-success",
        "password-reset",
        "share-notification",
        "storage-warning",
        "system-announcement",
        "welcome",
      ].sort()
    );
  });

  it("getTemplate 已知 id 返回对应模板", () => {
    const welcome = service.getTemplate("welcome");
    expect(welcome).toBeDefined();
    expect(welcome?.name).toBe("欢迎邮件");
    expect(welcome?.subject).toBe("欢迎使用个人私有第二大脑");
    expect(welcome?.variables).toEqual(["userName", "appUrl"]);
  });

  it("getTemplate 未知 id 返回 undefined", () => {
    expect(service.getTemplate("does-not-exist")).toBeUndefined();
  });
});

describe("EmailService init / isConfigured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("新实例 isConfigured 为 false", () => {
    const service = new EmailService();
    expect(service.isConfigured()).toBe(false);
  });

  it("init 后 isConfigured 为 true，且 createTransport 收到 host/port/secure/auth", () => {
    const service = new EmailService();
    service.init(makeConfig());

    expect(service.isConfigured()).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "user@example.com", pass: "pass" },
    });
  });
});

describe("EmailService renderTemplate", () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  it("未知模板 id 返回 null", () => {
    expect(service.renderTemplate("nope", {})).toBeNull();
  });

  it("welcome 替换 {{userName}}：subject 无占位保持不变，html 含替换结果，不含 {{userName}}", () => {
    const rendered = service.renderTemplate("welcome", {
      userName: "Alice",
      appUrl: "https://app.example.com",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("欢迎使用个人私有第二大脑");
    expect(rendered!.html).toContain("你好，Alice！");
    expect(rendered!.html).not.toContain("{{userName}}");
  });

  it("未提供的变量保留 {{占位}}（password-reset 缺 resetUrl）", () => {
    const rendered = service.renderTemplate("password-reset", {
      userName: "Bob",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.html).toContain("{{resetUrl}}");
    expect(rendered!.html).toContain("你好，Bob！");
  });

  it("多余变量忽略，不报错也不出现在输出", () => {
    const rendered = service.renderTemplate("welcome", {
      userName: "Alice",
      appUrl: "https://x",
      extraField: "SHOULD_NOT_APPEAR",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.html).not.toContain("SHOULD_NOT_APPEAR");
  });

  it("system-announcement 的 subject 本身是 {{title}}，被替换为实际标题", () => {
    const rendered = service.renderTemplate("system-announcement", {
      userName: "Bob",
      title: "升级公告",
      content: "将于今晚维护",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("升级公告");
    expect(rendered!.html).toContain("升级公告");
    expect(rendered!.html).toContain("将于今晚维护");
    expect(rendered!.html).toContain("你好，Bob！");
  });

  it("alert-notification 替换全部 8 个变量：subject 含 alertName+statusText，html 含各字段", () => {
    const rendered = service.renderTemplate("alert-notification", {
      alertName: "CPU 使用率过高",
      level: "critical",
      statusText: "触发",
      message: "CPU 使用率持续超过阈值",
      value: "92",
      threshold: "80",
      ruleId: "rule-cpu-001",
      timestamp: "2026-07-13T03:00:00.000Z",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.subject).toBe("[告警] CPU 使用率过高 触发");
    expect(rendered!.html).toContain("CPU 使用率过高");
    expect(rendered!.html).toContain("critical");
    expect(rendered!.html).toContain("触发");
    expect(rendered!.html).toContain("CPU 使用率持续超过阈值");
    expect(rendered!.html).toContain("92");
    expect(rendered!.html).toContain("80");
    expect(rendered!.html).toContain("rule-cpu-001");
    expect(rendered!.html).toContain("2026-07-13T03:00:00.000Z");
    // 无残留占位
    expect(rendered!.html).not.toContain("{{");
  });

  it("text 去除所有 HTML 标签并折叠空白（无 '<' 且含替换文本）", () => {
    const rendered = service.renderTemplate("welcome", {
      userName: "Alice",
      appUrl: "https://x",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.text).not.toContain("<");
    expect(rendered!.text).toContain("你好，Alice！");
    // 折叠空白后首尾无空白
    expect(rendered!.text).toBe(rendered!.text.trim());
  });

  it("变量值含 $ 反向引用串时按字面量替换（$& 不展开为匹配文本 {{userName}}）", () => {
    // 旧实现 html.replace(regex, value) 会把 $& 解释为"匹配到的子串"即 {{userName}}，
    // 导致渲染出 "你好，{{userName}}！"（占位符未被替换）。修复后应输出字面 "$&"。
    const rendered = service.renderTemplate("welcome", {
      userName: "$&",
      appUrl: "https://x",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.html).toContain("你好，$&！");
    expect(rendered!.html).not.toContain("{{userName}}");
    expect(rendered!.text).toContain("你好，$&！");
  });

  it("变量值含 $$ / $1 / $` / $' 时均按字面量原样输出", () => {
    // $$ 旧实现会折叠为单个 $；$1（无捕获组）旧实现会变为空串；
    // $` / $' 旧实现会插入匹配前/后的文本。修复后全部字面输出。
    const rendered = service.renderTemplate("welcome", {
      userName: "$$,$1,$`,$'",
      appUrl: "https://x",
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.html).toContain("你好，$$,$1,$`,$'！");
    expect(rendered!.html).not.toContain("{{userName}}");
  });

  it("subject 中变量值含 $& 时按字面量替换（system-announcement subject={{title}}）", () => {
    const rendered = service.renderTemplate("system-announcement", {
      userName: "Bob",
      title: "$&",
      content: "正文",
    });
    expect(rendered).not.toBeNull();
    // subject 整体就是 {{title}}，旧实现会回填匹配文本 {{title}}，修复后为字面 $&
    expect(rendered!.subject).toBe("$&");
    expect(rendered!.html).toContain(">$&<");
  });
});

describe("EmailService sendEmail / processQueue", () => {
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

  it("fire-and-forget：立即返回 true，即使 sendMail reject 也不外抛", async () => {
    const service = new EmailService();
    service.init(makeConfig());
    mockSendMail.mockRejectedValue(new Error("smtp down"));

    await expect(
      service.sendEmail("a@x.com", "welcome", { userName: "A", appUrl: "" })
    ).resolves.toBe(true);
    await flushQueue();

    // reject 在 processQueue 内被 catch，不外抛
    expect(console.error).toHaveBeenCalled();
  });

  it("配置后排干队列，transporter.sendMail 收到 from/to/subject/html/text", async () => {
    const service = new EmailService();
    service.init(makeConfig());

    await service.sendEmail("a@x.com", "welcome", {
      userName: "Alice",
      appUrl: "https://x",
    });
    await flushQueue();

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"第二大脑" <noreply@example.com>',
      to: "a@x.com",
      subject: "欢迎使用个人私有第二大脑",
      html: expect.stringContaining("你好，Alice！"),
      text: expect.any(String),
    });
    expect(console.log).toHaveBeenCalledWith("Email sent to a@x.com");
  });

  it("多封邮件按入队顺序发送（isProcessing 重入守卫，单循环排干）", async () => {
    const service = new EmailService();
    service.init(makeConfig());

    await service.sendEmail("a@x.com", "welcome", { userName: "A", appUrl: "" });
    await service.sendEmail("b@y.com", "welcome", { userName: "B", appUrl: "" });
    await flushQueue();

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0].to).toBe("a@x.com");
    expect(mockSendMail.mock.calls[1][0].to).toBe("b@y.com");
  });

  it("未配置时清空队列、console.warn、不调用 sendMail", async () => {
    const service = new EmailService();
    // 未调用 init → isConfigured false

    await service.sendEmail("a@x.com", "welcome", { userName: "A", appUrl: "" });
    await flushQueue();

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "Email service not configured, skipping queue"
    );
  });

  it("sendMail reject 后 isProcessing 复位，后续 sendEmail 可继续发送", async () => {
    const service = new EmailService();
    service.init(makeConfig());
    mockSendMail.mockRejectedValue(new Error("smtp down"));

    await service.sendEmail("a@x.com", "welcome", { userName: "A", appUrl: "" });
    await flushQueue();

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Failed to send email to a@x.com:",
      expect.any(Error)
    );

    // 复位为成功，再次发送应触发新的 processQueue
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({});

    await service.sendEmail("b@y.com", "welcome", { userName: "B", appUrl: "" });
    await flushQueue();

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe("b@y.com");
  });
});

describe("EmailService sendTestEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("未配置时抛 'Email service not configured'", async () => {
    const service = new EmailService();
    await expect(service.sendTestEmail("a@x.com")).rejects.toThrow(
      "Email service not configured"
    );
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("配置且 sendMail resolve → 返回 true，使用 welcome 模板与测试变量", async () => {
    const service = new EmailService();
    service.init(makeConfig());

    await expect(service.sendTestEmail("a@x.com")).resolves.toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({
      to: "a@x.com",
      subject: "欢迎使用个人私有第二大脑",
    });
    expect(mockSendMail.mock.calls[0][0].html).toContain("测试用户");
  });

  it("sendMail reject → 返回 false 并 console.error('Failed to send test email:')", async () => {
    const service = new EmailService();
    service.init(makeConfig());
    const err = new Error("smtp down");
    mockSendMail.mockRejectedValue(err);

    await expect(service.sendTestEmail("a@x.com")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("Failed to send test email:", err);
  });
});

describe("initEmailServiceFromEnv", () => {
  const savedEnv: NodeJS.ProcessEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // 清理所有 SMTP_* 环境变量，每用例自设
    Object.keys(process.env).forEach((k) => {
      if (k.startsWith("SMTP_")) delete process.env[k];
    });
    // 拦截单例 init，避免实际写入 transporter 造成跨用例状态残留
    vi.spyOn(emailService, "init").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // 恢复环境变量
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("SMTP_")) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it("env 齐全 → emailService.init 收到解析后的配置（端口数字、secure 布尔）", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "u@x.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "noreply@x.com";
    process.env.SMTP_FROM_NAME = "机器人";

    initEmailServiceFromEnv();

    expect(vi.mocked(emailService.init)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emailService.init)).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 2525,
      secure: true,
      user: "u@x.com",
      pass: "secret",
      from: "noreply@x.com",
      fromName: "机器人",
    });
    expect(console.log).toHaveBeenCalledWith("Email service initialized");
  });

  it("env 缺失（无 SMTP_HOST）→ 不调用 init，打印 not configured", () => {
    process.env.SMTP_USER = "u@x.com";
    process.env.SMTP_PASS = "secret";
    // SMTP_HOST 缺失 → 不满足 host && user && pass

    initEmailServiceFromEnv();

    expect(vi.mocked(emailService.init)).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "Email service not configured (SMTP settings missing)"
    );
  });

  it("SMTP_FROM 缺失时 from 回退到 SMTP_USER", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "u@x.com";
    process.env.SMTP_PASS = "secret";

    initEmailServiceFromEnv();

    expect(vi.mocked(emailService.init)).toHaveBeenCalledWith(
      expect.objectContaining({ from: "u@x.com" })
    );
  });

  it("SMTP_PORT / SMTP_SECURE / SMTP_FROM_NAME 缺失时使用默认值", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "u@x.com";
    process.env.SMTP_PASS = "secret";

    initEmailServiceFromEnv();

    expect(vi.mocked(emailService.init)).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        fromName: "个人私有第二大脑",
      })
    );
  });
});
