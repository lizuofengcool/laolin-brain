/**
 * instrumentation register() 接线测试
 *
 * 核心契约：register 是 Next.js 启动钩子，仅在 Node.js runtime 下调用
 * initEmailServiceFromEnv() 接线平台级邮件单例；非 Node.js runtime（Edge）跳过，
 * 不加载 email 模块（避免 nodemailer 进入 Edge bundle）。
 *
 * 用 vi.hoisted + vi.mock("@/lib/email") 拦截动态 import，断言调用次数，而非
 * 真正触发 emailService.init（nodemailer 在沙箱可能未装）。register 在 vitest 下
 * 不会自动执行，需显式调用并按 NEXT_RUNTIME 分支断言。
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const { mockInitEmailServiceFromEnv } = vi.hoisted(() => ({
  mockInitEmailServiceFromEnv: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  initEmailServiceFromEnv: (...args: unknown[]) => mockInitEmailServiceFromEnv(...args),
}));

import { register } from "@/instrumentation";

describe("instrumentation register()", () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
    vi.clearAllMocks();
  });

  it("Node.js runtime 下调用 initEmailServiceFromEnv 接线平台邮件单例", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    await register();

    expect(mockInitEmailServiceFromEnv).toHaveBeenCalledTimes(1);
  });

  it("非 Node.js runtime（Edge）下跳过，不加载 email 模块", async () => {
    process.env.NEXT_RUNTIME = "edgejs";

    await register();

    expect(mockInitEmailServiceFromEnv).not.toHaveBeenCalled();
  });

  it("NEXT_RUNTIME 未设置时同样跳过（保守：未明确为 nodejs 不初始化）", async () => {
    delete process.env.NEXT_RUNTIME;

    await register();

    expect(mockInitEmailServiceFromEnv).not.toHaveBeenCalled();
  });
});
