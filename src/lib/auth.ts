import bcrypt from "bcryptjs";
import crypto from "crypto";

const TOKEN_SECRET = process.env.TOKEN_SECRET;
if (!TOKEN_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: TOKEN_SECRET environment variable is required in production');
}
const _TOKEN_SECRET = TOKEN_SECRET || 'kb-dev-only-secret-do-not-use-in-prod-2024';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hash a password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Simple HMAC-based token generation.
 * Format: base64url(JSON({id, email, exp})) + "." + base64url(HMAC-SHA256 signature)
 */
export function generateToken(user: { id: string; email: string }): string {
  const payload = {
    id: user.id,
    email: user.email,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmacSignature(payloadB64);
  const signatureB64 = Buffer.from(signature).toString("base64url");

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode a token.
 * Returns {id, email} if valid, null if expired or invalid.
 */
export function verifyToken(token: string): { id: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSignature = createHmacSignature(payloadB64);
    const actualSignature = Buffer.from(signatureB64, "base64url");
    if (!timingSafeEqual(Buffer.from(expectedSignature), actualSignature)) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    // Check expiry
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return { id: payload.id, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired (for client-side use).
 * Parses the base64 payload and checks the exp field without verifying the signature.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return true;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return payload.exp ? Date.now() > payload.exp : true;
  } catch {
    return true;
  }
}

/**
 * Create HMAC-SHA256 signature for a payload string.
 */
function createHmacSignature(payload: string): Buffer {
  return crypto.createHmac("sha256", _TOKEN_SECRET).update(payload).digest();
}

/**
 * Timing-safe comparison to prevent timing attacks.
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
