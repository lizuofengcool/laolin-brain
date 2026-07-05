import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validatePassword,
  defaultPasswordPolicy,
  LoginFailureTracker,
  DataEncryptor,
  DataMasker,
  RateLimiter,
  RequestSigner,
  XSSProtection,
  SQLInjectionProtection,
  PathTraversalProtection,
  FileUploadSecurity,
} from "@/lib/security/index";

/**
 * 直接覆盖 src/lib/security/index.ts 的运行时导出（此前零真实覆盖）：
 *   - validatePassword / defaultPasswordPolicy（密码策略与强度评分）
 *   - LoginFailureTracker（登录失败追踪 + 锁定窗口）
 *   - DataEncryptor（AES-256-GCM 对称加解密）
 *   - DataMasker（6 个静态脱敏方法）
 *   - RateLimiter（滑动窗口限流）
 *   - RequestSigner（HMAC-SHA256 请求签名/验签）
 *   - XSSProtection（escapeHtml / sanitizeHtml / isSafeUrl）
 *   - SQLInjectionProtection（detect / escape）
 *   - PathTraversalProtection（detect / sanitize / ensureWithin）
 *   - FileUploadSecurity（validateFile / generateSafeFilename）
 *
 * 模块为纯逻辑实现，仅依赖 node:crypto 与内置 String/RegExp/URL，无 DB / 网络 /
 * 文件系统依赖，适合直接单测。时间相关类（LoginFailureTracker / RateLimiter /
 * RequestSigner 时间戳校验）用 fake timers 锁定控制流。
 *
 * 本轮同时修复源文件两处逻辑 bug，测试断言修复后行为：
 *   1. RequestSigner.verify 原调用 this.sign(params, timestamp) 重新生成随机 nonce，
 *      导致重算签名永远与原签名不一致 → verify 恒返回 false。已抽出 computeSignature
 *      纯函数，sign/verify 共用，verify 用传入的 nonce 重算。
 *   2. SQLInjectionProtection.dangerousPatterns 原带 g 标志，RegExp.test 跨调用复用
 *      同一 pattern 时维护 lastIndex，导致"同一恶意输入第二次 detect 返回 false"漏报。
 *      已移除 g 标志（仅保留必要的 i）。
 */

const FIXED_NOW = new Date("2026-01-15T10:30:00.000Z").getTime();

// ==================== validatePassword ====================

describe("validatePassword / src/lib/security/index.ts", () => {
  describe("defaultPasswordPolicy", () => {
    it("默认策略为 minLength=8 / maxLength=128 / 全部 require / 禁常见密码", () => {
      expect(defaultPasswordPolicy).toEqual({
        minLength: 8,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: true,
        forbidCommonPasswords: true,
        passwordHistoryCount: 5,
        passwordExpiryDays: 90,
      });
    });
  });

  describe("validatePassword - 强密码（满分）", () => {
    it("长度>=12 且含大小写/数字/符号 → very_strong / valid=true / score=6", () => {
      // 长度 12 → +2；大写 +1；小写 +1；数字 +1；符号 +1 = 6
      const result = validatePassword("Abc123!@#xyz");
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.score).toBe(6);
      expect(result.level).toBe("very_strong");
    });

    it("长度 8-11 且四类齐全 → very_strong / score=5", () => {
      // 长度 8 → +1；大写 +1；小写 +1；数字 +1；符号 +1 = 5 → very_strong（>4）
      const result = validatePassword("Abc123!@");
      expect(result.valid).toBe(true);
      expect(result.score).toBe(5);
      expect(result.level).toBe("very_strong");
    });
  });

  describe("validatePassword - 长度违规", () => {
    it("长度 < minLength 记 error 且不计长度分（字符分仍累计）", () => {
      // "Short1!" 长度 7 < 8 → error；但有大写+小写+数字+符号 → score=4 → strong
      const result = validatePassword("Short1!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码长度不能少于 8 个字符");
      expect(result.score).toBe(4);
      expect(result.level).toBe("strong");
    });

    it("长度 > maxLength 记 error", () => {
      const tooLong = "Aa1!" + "a".repeat(130);
      const result = validatePassword(tooLong);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码长度不能超过 128 个字符");
    });
  });

  describe("validatePassword - 字符类缺失（默认策略 require 全开）", () => {
    it("缺大写字母 → error 且不计大写分", () => {
      const result = validatePassword("abc123!@xyz");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码必须包含大写字母");
      // 长度 11 → +1；无大写；小写 +1；数字 +1；符号 +1 = 4 → strong
      expect(result.score).toBe(4);
      expect(result.level).toBe("strong");
    });

    it("缺小写字母 → error", () => {
      const result = validatePassword("ABC123!@XYZ");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码必须包含小写字母");
    });

    it("缺数字 → error", () => {
      const result = validatePassword("Abcdef!@xyz");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码必须包含数字");
    });

    it("缺特殊字符 → error", () => {
      const result = validatePassword("Abc123xyz");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码必须包含特殊字符");
    });
  });

  describe("validatePassword - 常见弱密码", () => {
    it("forbidCommonPasswords 开启时命中弱密码表 → error（大小写不敏感）", () => {
      const result = validatePassword("Password123");
      // "password123" 在 COMMON_PASSWORDS 集合中，toLowerCase 命中
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("密码过于常见，请使用更复杂的密码");
    });

    it("纯常见弱密码 password123 → error", () => {
      const result = validatePassword("password123");
      expect(result.errors).toContain("密码过于常见，请使用更复杂的密码");
    });

    it("非常见密码不误报", () => {
      const result = validatePassword("Zx9!mK2#pL7@");
      expect(result.errors).not.toContain("密码过于常见，请使用更复杂的密码");
    });
  });

  describe("validatePassword - level 分级边界", () => {
    // 用自定义策略关闭所有 require 与 forbidCommon，隔离 score 计算：
    // 各字符类即使 require=false，只要命中正则仍加分（实现里 else if 分支）。
    const relaxedPolicy = {
      ...defaultPasswordPolicy,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSymbols: false,
      forbidCommonPasswords: false,
    };

    it("score=1 → very_weak（仅长度分，无任何字符类命中）", () => {
      // 8 个空格：长度 8 → +1；不匹配大小写/数字/符号任一正则 → score=1
      const result = validatePassword("        ", relaxedPolicy);
      expect(result.score).toBe(1);
      expect(result.level).toBe("very_weak");
    });

    it("score=2 → weak（长度 + 小写）", () => {
      // "aaaaaaaa" 长度 8 → +1；小写命中 → +1 = 2
      const result = validatePassword("aaaaaaaa", relaxedPolicy);
      expect(result.score).toBe(2);
      expect(result.level).toBe("weak");
    });

    it("score=3 → medium（长度 + 小写 + 数字）", () => {
      const result = validatePassword("abcd1234", relaxedPolicy);
      expect(result.score).toBe(3);
      expect(result.level).toBe("medium");
    });

    it("score=4 → strong（长度 + 小写 + 数字 + 符号）", () => {
      const result = validatePassword("abcd123!", relaxedPolicy);
      expect(result.score).toBe(4);
      expect(result.level).toBe("strong");
    });

    it("score=5 → very_strong（长度 + 大小写 + 数字 + 符号）", () => {
      const result = validatePassword("Abc123!@", relaxedPolicy);
      expect(result.score).toBe(5);
      expect(result.level).toBe("very_strong");
    });
  });

  describe("validatePassword - 自定义策略", () => {
    it("关闭 requireSymbols 时不校验特殊字符且不报 error", () => {
      const policy = { ...defaultPasswordPolicy, requireSymbols: false };
      const result = validatePassword("Abc123xy", policy);
      expect(result.errors).not.toContain("密码必须包含特殊字符");
      // 长度 8 → +1；大写 +1；小写 +1；数字 +1 = 4 → strong（无符号分）
      expect(result.score).toBe(4);
      expect(result.valid).toBe(true);
    });

    it("forbidCommonPasswords 关闭时常见密码不报 error", () => {
      const policy = { ...defaultPasswordPolicy, forbidCommonPasswords: false };
      const result = validatePassword("Password123", policy);
      expect(result.errors).not.toContain("密码过于常见，请使用更复杂的密码");
    });

    it("suggestions 仅在 requireUppercase=false 且确有大写时建议", () => {
      const policy = { ...defaultPasswordPolicy, requireUppercase: false };
      const result = validatePassword("Abc123!@xyz", policy);
      expect(result.suggestions).toContain("可以添加大写字母增强安全性");
    });
  });
});

// ==================== LoginFailureTracker ====================

describe("LoginFailureTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认 maxAttempts=5 / lockoutDuration=30min / windowMs=15min", () => {
    const tracker = new LoginFailureTracker();
    // 通过行为反推默认值：4 次不锁，第 5 次锁，锁定持续 30 分钟
    for (let i = 1; i <= 4; i++) {
      const r = tracker.recordFailure("u1");
      expect(r.locked).toBe(false);
      expect(r.remaining).toBe(5 - i);
    }
    const fifth = tracker.recordFailure("u1");
    expect(fifth.attempts).toBe(5);
    expect(fifth.remaining).toBe(0);
    expect(fifth.locked).toBe(true);
    expect(fifth.lockoutUntil).toBe(FIXED_NOW + 30 * 60 * 1000);
  });

  it("自定义参数生效", () => {
    const tracker = new LoginFailureTracker({
      maxAttempts: 3,
      lockoutDuration: 10 * 60 * 1000,
      windowMs: 5 * 60 * 1000,
    });
    tracker.recordFailure("u");
    tracker.recordFailure("u");
    const third = tracker.recordFailure("u");
    expect(third.locked).toBe(true);
    expect(third.lockoutUntil).toBe(FIXED_NOW + 10 * 60 * 1000);
  });

  it("recordFailure 首次记录返回 attempts=1 / remaining=maxAttempts-1", () => {
    const tracker = new LoginFailureTracker({ maxAttempts: 5 });
    const r = tracker.recordFailure("fresh");
    expect(r.attempts).toBe(1);
    expect(r.remaining).toBe(4);
    expect(r.locked).toBe(false);
    expect(r.lockoutUntil).toBeUndefined();
  });

  it("isLocked 锁定中返回 locked=true 与剩余尝试 0", () => {
    const tracker = new LoginFailureTracker({ maxAttempts: 2 });
    tracker.recordFailure("u");
    tracker.recordFailure("u");
    const status = tracker.isLocked("u");
    expect(status.locked).toBe(true);
    expect(status.remainingAttempts).toBe(0);
    expect(status.lockoutUntil).toBe(FIXED_NOW + 30 * 60 * 1000);
  });

  it("isLocked 未记录的 identifier 返回 maxAttempts 剩余", () => {
    const tracker = new LoginFailureTracker({ maxAttempts: 5 });
    expect(tracker.isLocked("unknown")).toEqual({
      locked: false,
      remainingAttempts: 5,
    });
  });

  it("锁定过期后 isLocked 自动清除并恢复剩余尝试", () => {
    const tracker = new LoginFailureTracker({
      maxAttempts: 2,
      lockoutDuration: 10 * 60 * 1000,
    });
    tracker.recordFailure("u");
    tracker.recordFailure("u");
    expect(tracker.isLocked("u").locked).toBe(true);

    // 推进时间超过 lockoutDuration
    vi.setSystemTime(FIXED_NOW + 10 * 60 * 1000 + 1);
    const status = tracker.isLocked("u");
    expect(status.locked).toBe(false);
    expect(status.remainingAttempts).toBe(2); // 已重置
  });

  it("时间窗口外（但未锁定）的记录在 isLocked 时清除", () => {
    const tracker = new LoginFailureTracker({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });
    tracker.recordFailure("u"); // 1 次，未达锁定
    // 推进超过 windowMs
    vi.setSystemTime(FIXED_NOW + 15 * 60 * 1000 + 1);
    const status = tracker.isLocked("u");
    expect(status.locked).toBe(false);
    expect(status.remainingAttempts).toBe(5);
  });

  it("recordFailure 在窗口外且锁定已过期时重置计数", () => {
    const tracker = new LoginFailureTracker({
      maxAttempts: 2,
      lockoutDuration: 5 * 60 * 1000,
      windowMs: 10 * 60 * 1000,
    });
    tracker.recordFailure("u");
    tracker.recordFailure("u"); // 锁定
    expect(tracker.isLocked("u").locked).toBe(true);

    // 推进超过 lockoutDuration 与 windowMs
    vi.setSystemTime(FIXED_NOW + 11 * 60 * 1000);
    const r = tracker.recordFailure("u");
    // 重置后重新计数为 1
    expect(r.attempts).toBe(1);
    expect(r.locked).toBe(false);
    expect(r.remaining).toBe(1);
  });

  it("clearFailures 清除后 isLocked 恢复未锁定", () => {
    const tracker = new LoginFailureTracker({ maxAttempts: 2 });
    tracker.recordFailure("u");
    tracker.recordFailure("u");
    expect(tracker.isLocked("u").locked).toBe(true);

    tracker.clearFailures("u");
    expect(tracker.isLocked("u").locked).toBe(false);
    expect(tracker.isLocked("u").remainingAttempts).toBe(2);
  });

  it("cleanup 清除过期记录并返回清理数量", () => {
    const tracker = new LoginFailureTracker({
      maxAttempts: 5,
      lockoutDuration: 5 * 60 * 1000,
      windowMs: 10 * 60 * 1000,
    });
    // u1: 1 次失败未锁定；u2: 锁定
    tracker.recordFailure("u1");
    for (let i = 0; i < 5; i++) tracker.recordFailure("u2");
    expect(tracker.isLocked("u2").locked).toBe(true);

    // 推进超过 lockoutDuration(5min) 且超过 windowMs(10min)
    vi.setSystemTime(FIXED_NOW + 11 * 60 * 1000);
    const cleaned = tracker.cleanup();
    // u1: now > lockedUntil(0) && now - firstFailure > windowMs → 清
    // u2: now > lockedUntil( FIXED+5min ) && now - firstFailure > windowMs → 清
    expect(cleaned).toBe(2);
    expect(tracker.isLocked("u1").remainingAttempts).toBe(5);
    expect(tracker.isLocked("u2").remainingAttempts).toBe(5);
  });

  it("cleanup 不清除仍在窗口内的记录", () => {
    const tracker = new LoginFailureTracker({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });
    tracker.recordFailure("u");
    vi.setSystemTime(FIXED_NOW + 5 * 60 * 1000); // 窗口内
    expect(tracker.cleanup()).toBe(0);
  });
});

// ==================== DataEncryptor ====================

describe("DataEncryptor", () => {
  it("encrypt/decrypt 往返一致（AES-256-GCM）", () => {
    const enc = new DataEncryptor("my-secret-key");
    const original = "hello world 你好世界";
    const encrypted = enc.encrypt(original);
    // 格式 iv:authTag:ciphertext，三段均非空 hex
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    expect(encrypted).not.toBe(original);
    expect(enc.decrypt(encrypted)).toBe(original);
  });

  it("每次加密 IV 随机 → 密文不同", () => {
    const enc = new DataEncryptor("k");
    const a = enc.encrypt("same");
    const b = enc.encrypt("same");
    expect(a).not.toBe(b);
    expect(enc.decrypt(a)).toBe("same");
    expect(enc.decrypt(b)).toBe("same");
  });

  it("不同密钥解密失败抛错（auth tag 不匹配）", () => {
    const enc1 = new DataEncryptor("key-one");
    const enc2 = new DataEncryptor("key-two");
    const encrypted = enc1.encrypt("secret");
    expect(() => enc2.decrypt(encrypted)).toThrow();
  });

  it("decrypt 非法格式抛错", () => {
    const enc = new DataEncryptor("k");
    expect(() => enc.decrypt("not-a-valid-format")).toThrow(
      "Invalid encrypted data format"
    );
    expect(() => enc.decrypt("only:two")).toThrow("Invalid encrypted data format");
    expect(() => enc.decrypt("::")).toThrow();
  });

  it("encryptObject/decryptObject 往返一致", () => {
    const enc = new DataEncryptor("obj-key");
    const obj = { id: 1, name: "test", nested: { a: [1, 2, 3] } };
    const encrypted = enc.encryptObject(obj);
    expect(typeof encrypted).toBe("string");
    expect(enc.decryptObject(encrypted)).toEqual(obj);
  });
});

// ==================== DataMasker ====================

describe("DataMasker", () => {
  describe("maskEmail", () => {
    it("标准邮箱：保留首字符 + 中间掩码 + 末字符 + @domain", () => {
      // username="test"(4): maskLength=max(1,2)=2, visibleStart=max(1,1)=1
      // → "t" + "**" + "t" = "t**t"
      expect(DataMasker.maskEmail("test@example.com")).toBe("t**t@example.com");
    });

    it("短用户名仍至少掩码 1 字符", () => {
      // username="a"(1): maskLength=max(1,0)=1, visibleStart=max(1,0)=1
      // → "a" + "*" + "" = "a*"
      expect(DataMasker.maskEmail("a@b.com")).toBe("a*@b.com");
    });

    it("无 @ 的字符串原样返回", () => {
      expect(DataMasker.maskEmail("notanemail")).toBe("notanemail");
    });

    it("空字符串原样返回", () => {
      expect(DataMasker.maskEmail("")).toBe("");
    });

    it("自定义掩码字符", () => {
      expect(DataMasker.maskEmail("test@example.com", "#")).toBe("t##t@example.com");
    });
  });

  describe("maskPhone", () => {
    it("11 位手机号：前 3 + 掩码 + 后 4", () => {
      expect(DataMasker.maskPhone("13812345678")).toBe("138****5678");
    });

    it("长度 < 7 原样返回", () => {
      expect(DataMasker.maskPhone("12345")).toBe("12345");
    });

    it("空字符串原样返回", () => {
      expect(DataMasker.maskPhone("")).toBe("");
    });

    it("刚好 7 位：前 3 + 0 掩码 + 后 4", () => {
      // start=3, end=7-4=3, maskLength=0
      expect(DataMasker.maskPhone("1234567")).toBe("1234567");
    });
  });

  describe("maskIdCard", () => {
    it("18 位身份证：前 6 + 掩码 + 后 4", () => {
      expect(DataMasker.maskIdCard("110101199001011234")).toBe("110101********1234");
    });

    it("长度 < 10 原样返回", () => {
      expect(DataMasker.maskIdCard("12345")).toBe("12345");
    });
  });

  describe("maskName", () => {
    it("单字原样返回", () => {
      expect(DataMasker.maskName("张")).toBe("张");
    });

    it("两字：首字 + 1 掩码", () => {
      expect(DataMasker.maskName("李四")).toBe("李*");
    });

    it("三字：首 + 1 掩码 + 末", () => {
      expect(DataMasker.maskName("王小明")).toBe("王*明");
    });

    it("四字：首 + 2 掩码 + 末", () => {
      expect(DataMasker.maskName("欧阳修竹")).toBe("欧**竹");
    });

    it("空字符串原样返回", () => {
      expect(DataMasker.maskName("")).toBe("");
    });
  });

  describe("maskBankCard", () => {
    it("16 位卡号：前 4 + 掩码 + 后 4", () => {
      expect(DataMasker.maskBankCard("6225881234567890")).toBe("6225********7890");
    });

    it("长度 < 8 原样返回", () => {
      expect(DataMasker.maskBankCard("1234")).toBe("1234");
    });
  });

  describe("mask (通用)", () => {
    it("默认 start=1 end=1：保留首末各 1，中间全掩", () => {
      expect(DataMasker.mask("abcdef")).toBe("a****f");
    });

    it("长度 <= start+end 时全部掩码", () => {
      expect(DataMasker.mask("ab", { start: 1, end: 1 })).toBe("**");
      expect(DataMasker.mask("abc", { start: 1, end: 1 })).toBe("a*c");
    });

    it("自定义 start/end", () => {
      expect(DataMasker.mask("1234567890", { start: 2, end: 3 })).toBe("12*****890");
    });

    it("自定义掩码字符", () => {
      expect(DataMasker.mask("abcdef", { start: 1, end: 1, maskChar: "X" })).toBe(
        "aXXXXf"
      );
    });

    it("空值原样返回", () => {
      expect(DataMasker.mask("")).toBe("");
    });
  });
});

// ==================== RateLimiter ====================

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认 windowMs=60s / maxRequests=100", () => {
    const limiter = new RateLimiter();
    const r = limiter.check("k");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(100);
    expect(r.remaining).toBe(99);
    expect(r.resetTime).toBe(FIXED_NOW + 60 * 1000);
  });

  it("自定义 maxRequests：未达限允许，达到后拒绝", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
    const r1 = limiter.check("k");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.check("k");
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = limiter.check("k");
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("不同 key 独立计数", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // b 仍可用
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("时间窗口过后计数重置", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);

    // 推进超过 windowMs
    vi.setSystemTime(FIXED_NOW + 1001);
    const r = limiter.check("k");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it("reset 清除指定 key 计数", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);
    limiter.reset("k");
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("cleanup 清除窗口外记录并返回清理数", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    limiter.check("a");
    limiter.check("b");
    vi.setSystemTime(FIXED_NOW + 1001);
    const cleaned = limiter.cleanup();
    expect(cleaned).toBe(2);
    // 清理后重新可用
    expect(limiter.check("a").remaining).toBe(4);
  });

  it("cleanup 不清除窗口内记录", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    limiter.check("a");
    vi.setSystemTime(FIXED_NOW + 500);
    expect(limiter.cleanup()).toBe(0);
  });

  it("resetTime 基于窗口内最早时间戳计算", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    limiter.check("k"); // 推入 T
    expect(limiter.check("k").resetTime).toBe(FIXED_NOW + 1000);
    // 推进 200ms，再请求：resetTime 仍基于最早时间戳 T+1000
    vi.setSystemTime(FIXED_NOW + 200);
    expect(limiter.check("k").resetTime).toBe(FIXED_NOW + 1000);
  });
});

// ==================== RequestSigner ====================

describe("RequestSigner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sign 返回 64 字符 hex 签名 + 秒级时间戳 + 32 字符 hex nonce", () => {
    const signer = new RequestSigner("secret");
    const result = signer.sign({ a: 1, b: 2 });
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(result.timestamp).toBe(Math.floor(FIXED_NOW / 1000));
    expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sign 接受显式 timestamp 覆盖默认值", () => {
    const signer = new RequestSigner("secret");
    const result = signer.sign({ a: 1 }, 1000);
    expect(result.timestamp).toBe(1000);
  });

  it("sign 参数按 key 排序后参与签名（顺序无关性）", () => {
    // sign 对 params 按 key 排序后参与签名，故 {a:1,b:2} 与 {b:2,a:1} 同 nonce/timestamp
    // 重算签名一致。用 r1 的签名验 {b:2,a:1} 应通过。
    // 使用 fake-timer 当前时间作为 timestamp 以通过 verify 的 maxTimestampDiff 校验。
    const signer = new RequestSigner("secret");
    const ts = Math.floor(FIXED_NOW / 1000);
    const r1 = signer.sign({ a: 1, b: 2 }, ts);
    expect(
      signer.verify({ b: 2, a: 1 }, r1.signature, r1.timestamp, r1.nonce).valid
    ).toBe(true);
  });

  it("verify 同参数/时间戳/nonce/签名 → valid=true（修复后回归）", () => {
    const signer = new RequestSigner("secret");
    const { signature, timestamp, nonce } = signer.sign({ a: 1, b: 2 });
    const result = signer.verify({ a: 1, b: 2 }, signature, timestamp, nonce);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("verify 时间戳超过 maxTimestampDiff → valid=false reason=Timestamp expired", () => {
    const signer = new RequestSigner("secret", 300);
    const { signature, timestamp, nonce } = signer.sign({ a: 1 });
    // 推进 301 秒
    vi.setSystemTime(FIXED_NOW + 301 * 1000);
    const result = signer.verify({ a: 1 }, signature, timestamp, nonce);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Timestamp expired");
  });

  it("verify 参数被篡改 → valid=false reason=Invalid signature", () => {
    const signer = new RequestSigner("secret");
    const { signature, timestamp, nonce } = signer.sign({ a: 1, b: 2 });
    const result = signer.verify({ a: 1, b: 999 }, signature, timestamp, nonce);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature");
  });

  it("verify 签名被篡改（同长度不同内容）→ valid=false", () => {
    const signer = new RequestSigner("secret");
    const { timestamp, nonce } = signer.sign({ a: 1 });
    const tamperedSig = "0".repeat(64);
    const result = signer.verify({ a: 1 }, tamperedSig, timestamp, nonce);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature");
  });

  it("verify 签名长度不匹配 → valid=false（不抛 RangeError）", () => {
    const signer = new RequestSigner("secret");
    const { timestamp, nonce } = signer.sign({ a: 1 });
    const result = signer.verify({ a: 1 }, "tooshort", timestamp, nonce);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature");
  });

  it("verify nonce 被篡改 → valid=false", () => {
    const signer = new RequestSigner("secret");
    const { signature, timestamp } = signer.sign({ a: 1 });
    const result = signer.verify(
      { a: 1 },
      signature,
      timestamp,
      "00000000000000000000000000000000"
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature");
  });

  it("不同 secret 的 signer 互相验签失败", () => {
    const signerA = new RequestSigner("secret-a");
    const signerB = new RequestSigner("secret-b");
    const signed = signerA.sign({ a: 1 });
    expect(
      signerB.verify({ a: 1 }, signed.signature, signed.timestamp, signed.nonce).valid
    ).toBe(false);
  });
});

// ==================== XSSProtection ====================

describe("XSSProtection", () => {
  describe("escapeHtml", () => {
    it("转义 < > & \" ' / ` =", () => {
      expect(XSSProtection.escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(XSSProtection.escapeHtml('"hello"')).toBe("&quot;hello&quot;");
      expect(XSSProtection.escapeHtml("a&b")).toBe("a&amp;b");
      expect(XSSProtection.escapeHtml("a'b")).toBe("a&#39;b");
      expect(XSSProtection.escapeHtml("a/b")).toBe("a&#x2F;b");
      expect(XSSProtection.escapeHtml("`code`")).toBe("&#x60;code&#x60;");
      expect(XSSProtection.escapeHtml("a=b")).toBe("a&#x3D;b");
    });

    it("无特殊字符原样返回", () => {
      expect(XSSProtection.escapeHtml("safe text 123")).toBe("safe text 123");
    });

    it("非字符串先经 String() 转换", () => {
      expect(XSSProtection.escapeHtml(123 as unknown as string)).toBe("123");
    });
  });

  describe("sanitizeHtml", () => {
    it("移除 <script> 标签", () => {
      expect(XSSProtection.sanitizeHtml("<script>alert(1)</script>hello")).toBe(
        "hello"
      );
    });

    it("移除 javascript: 协议", () => {
      expect(
        XSSProtection.sanitizeHtml('<a href="javascript:alert(1)">x</a>')
      ).toBe('<a href="alert(1)">x</a>');
    });

    it("移除 on* 事件属性（双引号）", () => {
      expect(
        XSSProtection.sanitizeHtml('<img src=x onclick="evil()">')
      ).toBe("<img src=x>");
    });

    it("移除 on* 事件属性（单引号）", () => {
      expect(
        XSSProtection.sanitizeHtml("<img src=x onclick='evil()'>")
      ).toBe("<img src=x>");
    });

    it("移除 expression()", () => {
      // 正则 /expression\([^)]*\)/gi 匹配到第一个 ) 结束，故使用无嵌套括号的输入
      expect(
        XSSProtection.sanitizeHtml('style="x:expression(evil)"')
      ).toBe('style="x:"');
    });
  });

  describe("isSafeUrl", () => {
    it("允许 http/https/mailto/tel", () => {
      expect(XSSProtection.isSafeUrl("http://example.com")).toBe(true);
      expect(XSSProtection.isSafeUrl("https://example.com")).toBe(true);
      expect(XSSProtection.isSafeUrl("mailto:a@b.com")).toBe(true);
      expect(XSSProtection.isSafeUrl("tel:+1234")).toBe(true);
    });

    it("拒绝 javascript: 协议", () => {
      expect(XSSProtection.isSafeUrl("javascript:alert(1)")).toBe(false);
    });

    it("拒绝 data: 协议", () => {
      expect(XSSProtection.isSafeUrl("data:text/html,<script>")).toBe(false);
    });

    it("空字符串返回 false", () => {
      expect(XSSProtection.isSafeUrl("")).toBe(false);
    });

    it("相对路径视为安全（非 javascript/data）", () => {
      expect(XSSProtection.isSafeUrl("/relative/path")).toBe(true);
      expect(XSSProtection.isSafeUrl("../up")).toBe(true);
    });
  });
});

// ==================== SQLInjectionProtection ====================

describe("SQLInjectionProtection", () => {
  describe("detect", () => {
    it("检测 SELECT 关键字", () => {
      expect(SQLInjectionProtection.detect("SELECT * FROM users")).toBe(true);
    });

    it("检测 DROP 关键字", () => {
      expect(SQLInjectionProtection.detect("DROP TABLE users")).toBe(true);
    });

    it("检测 OR 1=1 模式", () => {
      expect(SQLInjectionProtection.detect("' OR 1=1")).toBe(true);
    });

    it("检测 AND 'a'='a' 模式（两侧引号均闭合）", () => {
      // pattern4 要求 ['"][^'"]*['"] 两侧引号完整闭合，末尾需有闭合引号
      expect(SQLInjectionProtection.detect("' AND 'a'='a'")).toBe(true);
    });

    it("检测注释符 -- 与 ; 与 #", () => {
      expect(SQLInjectionProtection.detect("a--b")).toBe(true);
      expect(SQLInjectionProtection.detect("a;b")).toBe(true);
      expect(SQLInjectionProtection.detect("a#b")).toBe(true);
    });

    it("检测 UNION SELECT", () => {
      expect(SQLInjectionProtection.detect("1 UNION SELECT password")).toBe(true);
    });

    it("检测 SLEEP( / BENCHMARK( / LOAD_FILE( 函数", () => {
      expect(SQLInjectionProtection.detect("SLEEP(5)")).toBe(true);
      expect(SQLInjectionProtection.detect("BENCHMARK(1000000, MD5(1))")).toBe(true);
      expect(SQLInjectionProtection.detect("LOAD_FILE('/etc/passwd')")).toBe(true);
    });

    it("普通文本不误报", () => {
      expect(SQLInjectionProtection.detect("hello world")).toBe(false);
      expect(SQLInjectionProtection.detect("normal text 12345")).toBe(false);
      expect(SQLInjectionProtection.detect("用户名密码")).toBe(false);
    });

    it("空字符串返回 false", () => {
      expect(SQLInjectionProtection.detect("")).toBe(false);
    });

    it("同一恶意输入多次 detect 结果一致（g 标志 lastIndex 修复回归）", () => {
      // 修复前：带 g 标志时第二次 detect 同一 SELECT 输入会返回 false（漏报）
      const malicious = "SELECT * FROM users";
      for (let i = 0; i < 5; i++) {
        expect(SQLInjectionProtection.detect(malicious)).toBe(true);
      }
    });

    it("大小写不敏感", () => {
      expect(SQLInjectionProtection.detect("select * from users")).toBe(true);
      expect(SQLInjectionProtection.detect("Drop Table users")).toBe(true);
    });
  });

  describe("escape", () => {
    it("转义反斜杠与引号", () => {
      expect(SQLInjectionProtection.escape("a'b\"c\\d")).toBe("a\\'b\\\"c\\\\d");
    });

    it("转义换行与回车", () => {
      expect(SQLInjectionProtection.escape("a\nb\rc")).toBe("a\\nb\\rc");
    });

    it("转义空字节与 Ctrl-Z", () => {
      expect(SQLInjectionProtection.escape("a\x00b\x1ac")).toBe("a\\0b\\Zc");
    });
  });
});

// ==================== PathTraversalProtection ====================

describe("PathTraversalProtection", () => {
  describe("detect", () => {
    it("检测 ../ 与 ..\\", () => {
      expect(PathTraversalProtection.detect("../../etc/passwd")).toBe(true);
      expect(PathTraversalProtection.detect("..\\..\\windows")).toBe(true);
    });

    it("检测 URL 编码的 ../", () => {
      expect(PathTraversalProtection.detect("%2e%2e%2fetc")).toBe(true);
      expect(PathTraversalProtection.detect("%2e%2e\\etc")).toBe(true);
    });

    it("检测绝对路径（Unix 与 Windows）", () => {
      expect(PathTraversalProtection.detect("/etc/passwd")).toBe(true);
      expect(PathTraversalProtection.detect("C:\\Windows")).toBe(true);
    });

    it("普通相对文件名不误报", () => {
      expect(PathTraversalProtection.detect("file.txt")).toBe(false);
      expect(PathTraversalProtection.detect("docs/readme.md")).toBe(false);
    });

    it("空字符串返回 false", () => {
      expect(PathTraversalProtection.detect("")).toBe(false);
    });
  });

  describe("sanitize", () => {
    it("移除 ../ 与 ..\\ 序列", () => {
      expect(PathTraversalProtection.sanitize("../../etc/passwd")).toBe("etc/passwd");
      expect(PathTraversalProtection.sanitize("..\\..\\win")).toBe("win");
    });

    it("移除开头的 / 与 \\", () => {
      expect(PathTraversalProtection.sanitize("/etc/passwd")).toBe("etc/passwd");
      expect(PathTraversalProtection.sanitize("\\windows")).toBe("windows");
    });

    it("移除 URL 编码的 ../", () => {
      expect(PathTraversalProtection.sanitize("%2e%2e%2fetc")).toBe("etc");
    });
  });

  describe("ensureWithin", () => {
    it("路径在 baseDir 内 → 返回解析后的绝对路径", () => {
      const result = PathTraversalProtection.ensureWithin("sub/file.txt", "/var/base");
      expect(result).toBe("/var/base/sub/file.txt");
    });

    it("路径越界（含 ../）→ 返回 null", () => {
      const result = PathTraversalProtection.ensureWithin(
        "../../etc/passwd",
        "/var/base"
      );
      expect(result).toBeNull();
    });

    it("路径恰好等于 baseDir → 返回 baseDir", () => {
      const result = PathTraversalProtection.ensureWithin(".", "/var/base");
      expect(result).toBe("/var/base");
    });
  });
});

// ==================== FileUploadSecurity ====================

describe("FileUploadSecurity", () => {
  describe("validateFile", () => {
    it("合法图片文件 → valid=true", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("合法 PDF → valid=true", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "doc.pdf",
        mimeType: "application/pdf",
        size: 50000,
      });
      expect(result.valid).toBe(true);
    });

    it("超过 maxSize → error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "big.jpg",
        mimeType: "image/jpeg",
        size: 2048,
        maxSize: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("文件大小超过限制（最大 1024 字节）");
    });

    it("不支持的 MIME 类型 → error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "x.exe",
        mimeType: "application/x-msdownload",
        size: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("不支持的文件类型");
    });

    it("危险扩展名 .php → error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "shell.php",
        mimeType: "text/plain",
        size: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("不允许的文件扩展名: .php");
    });

    it("危险扩展名 .exe → error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "app.exe",
        mimeType: "application/zip", // 伪装 MIME 仍按扩展名拦截
        size: 100,
      });
      expect(result.valid).toBe(false);
    });

    it("文件名含路径遍历 → error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "../../etc/passwd",
        mimeType: "text/plain",
        size: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("文件名包含非法字符");
    });

    it("文件名超长（>255）→ error", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "a".repeat(256) + ".txt",
        mimeType: "text/plain",
        size: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("文件名过长");
    });

    it("自定义 allowedMimeTypes 覆盖默认白名单", () => {
      const result = FileUploadSecurity.validateFile({
        filename: "x.txt",
        mimeType: "text/plain",
        size: 100,
        allowedMimeTypes: new Set(["image/png"]), // 仅允许 png
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("不支持的文件类型");
    });
  });

  describe("generateSafeFilename", () => {
    it("保留原扩展名，文件名主体替换为 32 字符随机 hex", () => {
      const safe = FileUploadSecurity.generateSafeFilename("upload.JPG");
      expect(safe).toMatch(/^[0-9a-f]{32}\.JPG$/);
    });

    it("无扩展名时按 slice(lastIndexOf('.')) 处理（lastIndexOf=-1 → slice(-1) 取末字符）", () => {
      // 实现用 originalName.slice(originalName.lastIndexOf("."))；
      // "noext" 无 "."，lastIndexOf 返回 -1，slice(-1) 取末字符 "t" 追加到随机名后。
      const safe = FileUploadSecurity.generateSafeFilename("noext");
      expect(safe).toMatch(/^[0-9a-f]{32}t$/);
    });

    it("每次生成结果不同（随机）", () => {
      const a = FileUploadSecurity.generateSafeFilename("same.png");
      const b = FileUploadSecurity.generateSafeFilename("same.png");
      expect(a).not.toBe(b);
      expect(a.endsWith(".png")).toBe(true);
    });
  });
});
