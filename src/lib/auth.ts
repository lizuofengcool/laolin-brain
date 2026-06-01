import bcrypt from "bcryptjs";
import crypto from "crypto";

function getTokenSecret(): string {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[AUTH] WARN: TOKEN_SECRET is not set. Authentication will use a fallback secret. ' +
        'Set TOKEN_SECRET environment variable for production security.'
      );
    }
    return 'fallback-dev-secret-do-not-use-in-production';
  }
  return secret;
}
const TOKEN_SECRET: string = getTokenSecret();
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
  return crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest();
}

/**
 * Timing-safe comparison to prevent timing attacks.
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
