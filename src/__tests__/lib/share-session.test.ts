/**
 * src/lib/share-session 单元测试
 *
 * 锁定第一百七十五轮「分享链接刷新免重输密码」修复契约：
 *   - issueShareSessionToken 签发的令牌可被 verifyShareSessionToken 验证通过（同一 shareToken）。
 *   - 令牌绑定到 shareToken：换一个 shareToken 校验须失败（防跨分享复用）。
 *   - 签名被篡改 → 失败。
 *   - 令牌过期 → 失败（通过修改 TOKEN_SECRET 模拟时间不可行，故直接构造过期 payload 签名）。
 *   - 空/undefined/格式错误令牌 → 失败，不抛异常。
 *   - 令牌过期时间不超过 shareExpiresAt（分享本身更早过期则令牌同步过期）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  issueShareSessionToken,
  verifyShareSessionToken,
} from "@/lib/share-session";

const SHARE_TOKEN = "share-token-abc12345";
const OTHER_TOKEN = "other-token-zzz99999";

const ORIGINAL_SECRET = process.env.TOKEN_SECRET;

function signWithSecret(payload: object): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.TOKEN_SECRET!)
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${sig.toString("base64url")}`;
}

describe("share-session issue/verify roundtrip", () => {
  beforeEach(() => {
    process.env.TOKEN_SECRET = "test-secret-key-for-unit-tests-only";
  });
  afterEach(() => {
    process.env.TOKEN_SECRET = ORIGINAL_SECRET;
  });

  it("签发并校验同一 shareToken → 通过", () => {
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    expect(verifyShareSessionToken(token, SHARE_TOKEN)).toBe(true);
  });

  it("令牌格式：payload.signature（两段）", () => {
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    expect(token.split(".")).toHaveLength(2);
  });

  it("不同 shareToken 校验 → 失败（绑定校验）", () => {
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    expect(verifyShareSessionToken(token, OTHER_TOKEN)).toBe(false);
  });

  it("篡改签名 → 失败", () => {
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    const [payloadB64, sigB64] = token.split(".");
    // 翻转签名首字符（非末字符）：base64url 末字符仅 4 个有效位、低 2 位为填充位，
    // A↔B 翻转是 no-op（解码字节不变），签名末字符恰好为 A 时"篡改"令牌仍通过验签 → 测试 flaky。
    // 首字符 6 位全部映射到签名首字节的高 6 位，翻转必改变解码首字节。
    const tamperedSig = (sigB64.startsWith("A") ? "B" : "A") + sigB64.slice(1);
    const tampered = `${payloadB64}.${tamperedSig}`;
    expect(verifyShareSessionToken(tampered, SHARE_TOKEN)).toBe(false);
  });

  it("篡改 payload 内 shareToken → 失败（签名不匹配）", () => {
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    const [payloadB64, sigB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    payload.t = OTHER_TOKEN;
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const tampered = `${tamperedPayloadB64}.${sigB64}`;
    expect(verifyShareSessionToken(tampered, OTHER_TOKEN)).toBe(false);
  });

  it("过期令牌 → 失败", () => {
    const expired = signWithSecret({ t: SHARE_TOKEN, exp: Date.now() - 1000 });
    expect(verifyShareSessionToken(expired, SHARE_TOKEN)).toBe(false);
  });

  it("空/undefined/格式错误令牌 → 失败，不抛异常", () => {
    expect(verifyShareSessionToken(null, SHARE_TOKEN)).toBe(false);
    expect(verifyShareSessionToken(undefined, SHARE_TOKEN)).toBe(false);
    expect(verifyShareSessionToken("", SHARE_TOKEN)).toBe(false);
    expect(verifyShareSessionToken("not-a-token", SHARE_TOKEN)).toBe(false);
    expect(verifyShareSessionToken("only.one.too.many", SHARE_TOKEN)).toBe(false);
    // expectedShareToken 为空 → false
    expect(verifyShareSessionToken(issueShareSessionToken(SHARE_TOKEN, null), "")).toBe(false);
  });

  it("分享本身更早过期 → 令牌 exp 不超过 shareExpiresAt", () => {
    const soon = new Date(Date.now() + 60 * 1000); // 1 分钟后过期
    const token = issueShareSessionToken(SHARE_TOKEN, soon);
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.exp).toBeLessThanOrEqual(soon.getTime());
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("分享无过期 → 令牌 exp 不超过 24h TTL", () => {
    const before = Date.now();
    const token = issueShareSessionToken(SHARE_TOKEN, null);
    const after = Date.now();
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    const ttl24h = before + 24 * 60 * 60 * 1000;
    expect(payload.exp).toBeGreaterThan(after);
    expect(payload.exp).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
    expect(payload.exp).toBeGreaterThanOrEqual(ttl24h - 5000);
  });

  it("用错误 TOKEN_SECRET 签发的令牌 → 失败", () => {
    const real = process.env.TOKEN_SECRET!;
    process.env.TOKEN_SECRET = "a-completely-different-secret";
    const forged = signWithSecret({ t: SHARE_TOKEN, exp: Date.now() + 60000 });
    process.env.TOKEN_SECRET = real;
    expect(verifyShareSessionToken(forged, SHARE_TOKEN)).toBe(false);
  });
});
