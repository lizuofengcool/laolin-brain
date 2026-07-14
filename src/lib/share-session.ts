/**
 * 分享链接会话令牌（share session token）
 *
 * 用于密码保护分享在密码验证成功后的「无密码重访问」场景：
 *   - 用户在 /share/[token] 页面 POST 密码验证成功后，服务端签发一个短期、绑定到该
 *     share token 的 HMAC 令牌返回给前端。
 *   - 前端将其存入 sessionStorage，后续 GET（页面刷新）与下载请求携带该令牌
 *     （GET 走 `X-Share-Session` header；下载走 `?session=` query，因为下载是
 *     `window.open` 导航无法带自定义 header）。
 *   - 服务端校验签名 + 过期 + 令牌内 `t` 字段与当前请求的 share token 一致，
 *     通过则跳过密码校验。
 *
 * 安全属性：
 *   - HMAC-SHA256 签名（与 auth.ts 复用 TOKEN_SECRET），不可伪造。
 *   - 令牌绑定到具体 share token（`t` 字段），不能跨分享复用。
 *   - 令牌自带过期（`exp`），不超过分享本身过期时间，且不超过 SHARE_SESSION_TTL_MS（24h）。
 *   - 不跳过分享存在性 / 过期校验（由路由先行检查）。
 *   - 不跳过密码暴破限流（限流仅在 POST 密码验证时触发，session 令牌是验证后凭据）。
 *
 * 设计权衡：令牌不落库（无服务端撤销），依赖短期过期 + sessionStorage 生命周期。
 * 与 rate-limit 的内存方案一致，当前 README 定位为单实例个人/小团队部署，足够。
 */
import crypto from "crypto";

/** 单个 session 令牌最长存活时间：24 小时（即使分享本身过期更晚） */
const SHARE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getTokenSecret(): string {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[SHARE-SESSION] FATAL: TOKEN_SECRET is not set in production."
      );
    }
    return "fallback-dev-secret-do-not-use-in-production";
  }
  return secret;
}

function sign(payloadB64: string): Buffer {
  return crypto.createHmac("sha256", getTokenSecret()).update(payloadB64).digest();
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * 签发一个绑定到 `shareToken` 的 session 令牌。
 *
 * @param shareToken 分享 token（令牌内 `t` 字段，校验时必须与请求的 share token 一致）
 * @param shareExpiresAt 分享本身的过期时间（令牌过期不会超过该时间）；为 null/undefined
 *   表示分享不过期，令牌过期取 SHARE_SESSION_TTL_MS
 */
export function issueShareSessionToken(
  shareToken: string,
  shareExpiresAt?: Date | null
): string {
  const now = Date.now();
  const ttlCap = now + SHARE_SESSION_TTL_MS;
  const exp = shareExpiresAt && shareExpiresAt.getTime() < ttlCap
    ? shareExpiresAt.getTime()
    : ttlCap;

  const payload = { t: shareToken, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sigB64 = sign(payloadB64).toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

/**
 * 校验 session 令牌。
 *
 * 通过条件：签名正确、未过期、令牌内 `t` 与 `expectedShareToken` 一致。
 * 任何失败均返回 null（调用方按「无令牌」处理，即回退到要求密码）。
 *
 * @param sessionToken 前端提交的令牌（`X-Share-Session` header 或 `?session=` query）
 * @param expectedShareToken 当前请求对应的 share token（路由 params.id / download 的 ?token=）
 */
export function verifyShareSessionToken(
  sessionToken: string | null | undefined,
  expectedShareToken: string
): boolean {
  if (!sessionToken || typeof sessionToken !== "string") return false;
  if (!expectedShareToken) return false;

  try {
    const parts = sessionToken.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, sigB64] = parts;

    const expectedSig = sign(payloadB64);
    const actualSig = Buffer.from(sigB64, "base64url");
    if (!timingSafeEqualBuf(expectedSig, actualSig)) return false;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.t !== "string" || payload.t !== expectedShareToken) return false;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}
