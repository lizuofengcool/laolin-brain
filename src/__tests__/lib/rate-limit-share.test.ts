/**
 * 分享密码暴破防护限流器单元测试（真实实现，非 mock）
 *
 * 锁定 src/lib/rate-limit.ts 新增的 checkSharePasswordLimit /
 * recordSharePasswordFailure / clearSharePasswordLimit / clearAllSharePasswordLimits
 * 的契约：
 *   - 初始状态 → success=true, remaining=maxFailures(10)
 *   - 累计 maxFailures 次失败 → success=false（429 锁定）
 *   - 锁定后继续 record → 仍 locked
 *   - clearSharePasswordLimit(token) → 解锁该 token，其他 token 不受影响
 *   - 验证成功后 clear → 后续错误密码重新从 0 计数（合法用户误输不累积）
 *   - 不同 token 独立计数
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  checkSharePasswordLimit,
  recordSharePasswordFailure,
  clearSharePasswordLimit,
  clearAllSharePasswordLimits,
} from "@/lib/rate-limit";

const MAX_FAILURES = 10;

describe("分享密码暴破防护限流器", () => {
  beforeEach(() => {
    clearAllSharePasswordLimits();
  });

  it("初始状态 → success=true, remaining=maxFailures", () => {
    const r = checkSharePasswordLimit("token-a");
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(MAX_FAILURES);
  });

  it("累计 maxFailures 次失败 → 第 maxFailures+1 次 check 返回 success=false", () => {
    // 复刻路由真实流程：check（放行）→ record（失败）。前 maxFailures 次尝试均放行。
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(checkSharePasswordLimit("token-a").success).toBe(true);
      recordSharePasswordFailure("token-a");
    }
    // 第 maxFailures+1 次验证被锁
    const r = checkSharePasswordLimit("token-a");
    expect(r.success).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("锁定后继续 record → 仍 locked（不会因超计数而意外解锁）", () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      recordSharePasswordFailure("token-a");
    }
    expect(checkSharePasswordLimit("token-a").success).toBe(false);

    recordSharePasswordFailure("token-a");
    recordSharePasswordFailure("token-a");
    expect(checkSharePasswordLimit("token-a").success).toBe(false);
  });

  it("clearSharePasswordLimit(token) → 解锁该 token", () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      recordSharePasswordFailure("token-a");
    }
    expect(checkSharePasswordLimit("token-a").success).toBe(false);

    clearSharePasswordLimit("token-a");
    const r = checkSharePasswordLimit("token-a");
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(MAX_FAILURES);
  });

  it("验证成功后 clear → 后续错误密码重新从 0 计数", () => {
    // 模拟用户误输 5 次
    for (let i = 0; i < 5; i++) {
      recordSharePasswordFailure("token-a");
    }
    expect(checkSharePasswordLimit("token-a").remaining).toBe(MAX_FAILURES - 5);

    // 验证成功，清除计数
    clearSharePasswordLimit("token-a");

    // 后续错误密码重新从 0 计数
    recordSharePasswordFailure("token-a");
    expect(checkSharePasswordLimit("token-a").remaining).toBe(MAX_FAILURES - 1);
    expect(checkSharePasswordLimit("token-a").success).toBe(true);
  });

  it("不同 token 独立计数", () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      recordSharePasswordFailure("token-a");
    }
    expect(checkSharePasswordLimit("token-a").success).toBe(false);

    // token-b 未被触及，仍放行
    const r = checkSharePasswordLimit("token-b");
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(MAX_FAILURES);

    // 清除 token-a 不影响 token-b
    clearSharePasswordLimit("token-a");
    recordSharePasswordFailure("token-b");
    expect(checkSharePasswordLimit("token-b").remaining).toBe(MAX_FAILURES - 1);
  });

  it("remaining 随失败次数递减", () => {
    expect(checkSharePasswordLimit("token-a").remaining).toBe(MAX_FAILURES);

    recordSharePasswordFailure("token-a");
    expect(checkSharePasswordLimit("token-a").remaining).toBe(MAX_FAILURES - 1);

    recordSharePasswordFailure("token-a");
    expect(checkSharePasswordLimit("token-a").remaining).toBe(MAX_FAILURES - 2);
  });

  it("resetTime 为未来时间戳", () => {
    const before = Date.now();
    const r = checkSharePasswordLimit("token-a");
    const after = Date.now();
    expect(r.resetTime).toBeGreaterThanOrEqual(before);
    expect(r.resetTime).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
  });
});
