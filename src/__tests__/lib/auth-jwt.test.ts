import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateToken,
  verifyToken,
  isTokenExpired,
} from "@/lib/auth";

const TOKEN_SECRET = "kb-secure-hmac-secret-key-2024";

describe("auth-jwt", () => {
  describe("isTokenExpired", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns false for a valid (not expired) token", () => {
      const token = generateToken({ id: "user-1", email: "test@example.com" });
      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns true for an expired token", () => {
      const token = generateToken({ id: "user-1", email: "test@example.com" });
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours
      expect(isTokenExpired(token)).toBe(true);
    });

    it("returns true for a malformed token (no dot)", () => {
      expect(isTokenExpired("invalid-token")).toBe(true);
    });

    it("returns true for an empty string", () => {
      expect(isTokenExpired("")).toBe(true);
    });

    it("returns true for a 3-part JWT format (code expects 2 parts)", () => {
      // The implementation uses parts.length !== 2, so 3-part tokens are considered expired
      expect(isTokenExpired("a.b.c")).toBe(true);
    });

    it("returns true for a token with invalid base64 payload", () => {
      expect(isTokenExpired("!!!.===")).toBe(true);
    });

    it("returns false for a token with future expiry even if signature is fake", () => {
      // isTokenExpired does NOT verify signature (client-side check only)
      const payload = Buffer.from(
        JSON.stringify({ id: "u1", email: "a@b.com", exp: Date.now() + 999999999 })
      ).toString("base64url");
      const fakeSig = Buffer.from("x".repeat(32)).toString("base64url");
      expect(isTokenExpired(`${payload}.${fakeSig}`)).toBe(false);
    });
  });

  describe("generateToken", () => {
    it("creates a valid 2-part token (payload.signature)", () => {
      const token = generateToken({ id: "u1", email: "e@e.com" });
      expect(token.split(".")).toHaveLength(2);
    });

    it("produces a token that can be verified", () => {
      const token = generateToken({ id: "user-42", email: "user@test.com" });
      const result = verifyToken(token);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("user-42");
      expect(result!.email).toBe("user@test.com");
    });

    it("sets exp approximately 24 hours in the future", () => {
      const before = Date.now();
      const token = generateToken({ id: "u1", email: "e@e.com" });
      const payloadB64 = token.split(".")[0];
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      const expectedExpiry = 24 * 60 * 60 * 1000;
      expect(payload.exp).toBeGreaterThanOrEqual(before + expectedExpiry - 1000);
      expect(payload.exp).toBeLessThanOrEqual(Date.now() + expectedExpiry + 1000);
    });

    it("generates different tokens for different users", () => {
      const t1 = generateToken({ id: "u1", email: "a@b.com" });
      const t2 = generateToken({ id: "u2", email: "c@d.com" });
      expect(t1).not.toBe(t2);
    });
  });

  describe("verifyToken", () => {
    it("validates a correctly signed token", () => {
      const token = generateToken({ id: "u1", email: "a@b.com" });
      const result = verifyToken(token);
      expect(result).toEqual({ id: "u1", email: "a@b.com" });
    });

    it("rejects a token with invalid signature", () => {
      const token = generateToken({ id: "u1", email: "a@b.com" });
      const [payload] = token.split(".");
      const fakeSig = Buffer.from("totally-fake-signature-32b!").toString("base64url");
      expect(verifyToken(`${payload}.${fakeSig}`)).toBeNull();
    });

    it("rejects a token with tampered payload", () => {
      const token = generateToken({ id: "u1", email: "a@b.com" });
      const [, sig] = token.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ id: "attacker", email: "evil@bad.com", exp: Date.now() + 999999999 })
      ).toString("base64url");
      expect(verifyToken(`${tamperedPayload}.${sig}`)).toBeNull();
    });

    it("rejects an expired token", () => {
      vi.useFakeTimers();
      const token = generateToken({ id: "u1", email: "a@b.com" });
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(verifyToken(token)).toBeNull();
      vi.useRealTimers();
    });

    it("returns null for malformed token (no dot)", () => {
      expect(verifyToken("not-a-token")).toBeNull();
    });

    it("returns null for a 3-part format (code expects exactly 2 parts)", () => {
      expect(verifyToken("a.b.c")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(verifyToken("")).toBeNull();
    });

    it("returns {id, email} for a valid token missing exp field (signature still verified)", () => {
      const payload = Buffer.from(JSON.stringify({ id: "u1", email: "a@b.com" })).toString("base64url");
      const sig = Buffer.from(
        createHmac("sha256", TOKEN_SECRET).update(payload).digest()
      ).toString("base64url");
      expect(verifyToken(`${payload}.${sig}`)).toEqual({ id: "u1", email: "a@b.com" });
    });
  });
});
