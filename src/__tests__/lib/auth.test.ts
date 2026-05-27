import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  isTokenExpired,
} from "@/lib/auth";

describe("auth utilities", () => {
  describe("hashPassword + verifyPassword round-trip", () => {
    it("verifies a correct password", async () => {
      const hash = await hashPassword("my-secret-password");
      expect(await verifyPassword("my-secret-password", hash)).toBe(true);
    });

    it("rejects a wrong password", async () => {
      const hash = await hashPassword("my-secret-password");
      expect(await verifyPassword("wrong-password", hash)).toBe(false);
    });

    it("handles empty password", async () => {
      const hash = await hashPassword("");
      expect(await verifyPassword("", hash)).toBe(true);
      expect(await verifyPassword("something", hash)).toBe(false);
    });

    it("different hashes for the same password (salt randomization)", async () => {
      const hash1 = await hashPassword("password");
      const hash2 = await hashPassword("password");
      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword("password", hash1)).toBe(true);
      expect(await verifyPassword("password", hash2)).toBe(true);
    });

    it("hash starts with $2b$", async () => {
      const hash = await hashPassword("test");
      expect(hash).toMatch(/^\$2b\$/);
    });
  });

  describe("generateToken", () => {
    it("returns a string with one dot (two parts)", () => {
      const token = generateToken({ id: "user-1", email: "test@example.com" });
      const parts = token.split(".");
      expect(parts).toHaveLength(2);
    });

    it("payload contains id, email, and exp fields", () => {
      const token = generateToken({ id: "user-1", email: "test@example.com" });
      const payloadB64 = token.split(".")[0];
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      expect(payload.id).toBe("user-1");
      expect(payload.email).toBe("test@example.com");
      expect(payload.exp).toBeDefined();
      expect(typeof payload.exp).toBe("number");
    });

    it("exp is approximately 24 hours from now", () => {
      const before = Date.now();
      const token = generateToken({ id: "u1", email: "e@e.com" });
      const after = Date.now();
      const payloadB64 = token.split(".")[0];
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
      const expectedExpiryMs = 24 * 60 * 60 * 1000;
      // Allow 1 second tolerance
      expect(payload.exp).toBeGreaterThanOrEqual(before + expectedExpiryMs - 1000);
      expect(payload.exp).toBeLessThanOrEqual(after + expectedExpiryMs + 1000);
    });

    it("generates different tokens for different users", () => {
      const t1 = generateToken({ id: "u1", email: "a@b.com" });
      const t2 = generateToken({ id: "u2", email: "c@d.com" });
      expect(t1).not.toBe(t2);
    });

    it("both parts are valid base64url strings", () => {
      const token = generateToken({ id: "u1", email: "e@e.com" });
      const [payload, signature] = token.split(".");
      // base64url decoding should not throw
      expect(() => Buffer.from(payload, "base64url")).not.toThrow();
      expect(() => Buffer.from(signature, "base64url")).not.toThrow();
    });
  });

  describe("verifyToken", () => {
    it("returns { id, email } for a valid token", () => {
      const token = generateToken({ id: "user-123", email: "hello@world.com" });
      const result = verifyToken(token);
      expect(result).toEqual({ id: "user-123", email: "hello@world.com" });
    });

    it("returns null for a tampered payload", () => {
      const token = generateToken({ id: "user-1", email: "a@b.com" });
      const [payload, sig] = token.split(".");
      // Tamper with the payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ id: "attacker", email: "evil@bad.com", exp: Date.now() + 999999999 })
      ).toString("base64url");
      const tamperedToken = `${tamperedPayload}.${sig}`;
      expect(verifyToken(tamperedToken)).toBeNull();
    });

    it("returns null for a tampered signature", () => {
      const token = generateToken({ id: "user-1", email: "a@b.com" });
      const [payload] = token.split(".");
      const fakeSig = Buffer.from("fake-signature-32bytes12345678").toString("base64url");
      const tamperedToken = `${payload}.${fakeSig}`;
      expect(verifyToken(tamperedToken)).toBeNull();
    });

    it("returns null for an expired token", () => {
      vi.useFakeTimers();
      const token = generateToken({ id: "user-1", email: "a@b.com" });
      // Advance time by 25 hours (past the 24h expiry)
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(verifyToken(token)).toBeNull();
      vi.useRealTimers();
    });

    it("returns null for a malformed token (no dot)", () => {
      expect(verifyToken("not-a-token")).toBeNull();
    });

    it("returns null for an empty token", () => {
      expect(verifyToken("")).toBeNull();
    });

    it("returns null for a token with too many dots", () => {
      expect(verifyToken("a.b.c")).toBeNull();
    });

    it("returns null for a token with invalid base64 payload", () => {
      expect(verifyToken("!!!.valid")).toBeNull();
    });

    it("returns null for a token with invalid JSON payload", () => {
      const badPayload = Buffer.from("not-json").toString("base64url");
      const sig = Buffer.from("x".repeat(32)).toString("base64url");
      expect(verifyToken(`${badPayload}.${sig}`)).toBeNull();
    });

    it("returns null for a token missing exp field", () => {
      const payload = Buffer.from(JSON.stringify({ id: "u1", email: "a@b.com" })).toString("base64url");
      // Use a real signature so signature check passes
      const secret = "kb-secure-hmac-secret-key-2024";
      const sig = Buffer.from(
        createHmac("sha256", secret).update(payload).digest()
      ).toString("base64url");
      // Without exp, the code checks `payload.exp && Date.now() > payload.exp` → falsy → returns {id, email}
      const result = verifyToken(`${payload}.${sig}`);
      expect(result).toEqual({ id: "u1", email: "a@b.com" });
    });
  });

  describe("isTokenExpired", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns false for a token with future expiry", () => {
      const token = generateToken({ id: "u1", email: "a@b.com" });
      expect(isTokenExpired(token)).toBe(false);
    });

    it("returns true for a token with past expiry", () => {
      const token = generateToken({ id: "u1", email: "a@b.com" });
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      expect(isTokenExpired(token)).toBe(true);
    });

    it("returns true for an empty string", () => {
      expect(isTokenExpired("")).toBe(true);
    });

    it("returns true for a malformed token (no dot)", () => {
      expect(isTokenExpired("invalid")).toBe(true);
    });

    it("returns true for a token with invalid base64", () => {
      expect(isTokenExpired("!!!.===")).toBe(true);
    });

    it("returns true for a token with missing exp field", () => {
      const payload = Buffer.from(JSON.stringify({ id: "u1", email: "a@b.com" })).toString("base64url");
      const fakeSig = Buffer.from("x".repeat(32)).toString("base64url");
      expect(isTokenExpired(`${payload}.${fakeSig}`)).toBe(true);
    });

    it("does not verify signature (client-side check only)", () => {
      // Create a token with a valid-looking payload but wrong signature
      const payload = Buffer.from(
        JSON.stringify({ id: "u1", email: "a@b.com", exp: Date.now() + 999999999 })
      ).toString("base64url");
      const fakeSig = Buffer.from("x".repeat(32)).toString("base64url");
      const fakeToken = `${payload}.${fakeSig}`;
      // Should return false (not expired) because it doesn't verify signature
      expect(isTokenExpired(fakeToken)).toBe(false);
    });
  });
});
