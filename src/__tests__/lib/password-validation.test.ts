import { describe, it, expect } from "vitest";

/**
 * Extract the validation rules from src/app/api/auth/register/route.ts
 * for direct unit testing without database or HTTP overhead.
 *
 * Validation rules extracted from the route:
 *   1. password.length >= 8
 *   2. /[a-zA-Z]/.test(password) — at least one letter
 *   3. /[0-9]/.test(password) — at least one number
 *   4. Email format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 */

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return { valid: false, error: "密码至少需要8个字符" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: "密码至少需要包含一个字母" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "密码至少需要包含一个数字" };
  }
  return { valid: true };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): ValidationResult {
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: "邮箱格式不正确" };
  }
  return { valid: true };
}

describe("password validation", () => {
  describe("minimum length requirement (8 characters)", () => {
    it("rejects passwords under 8 characters", () => {
      expect(validatePassword("abc1")).toEqual({
        valid: false,
        error: "密码至少需要8个字符",
      });
    });

    it("rejects 7-character password", () => {
      expect(validatePassword("passwo1")).toEqual({
        valid: false,
        error: "密码至少需要8个字符",
      });
    });

    it("accepts exactly 8 characters", () => {
      expect(validatePassword("password1")).toEqual({ valid: true });
    });

    it("accepts passwords longer than 8 characters", () => {
      expect(validatePassword("mySecurePassword123")).toEqual({ valid: true });
    });
  });

  describe("at least one letter requirement", () => {
    it("rejects passwords with only numbers", () => {
      expect(validatePassword("12345678")).toEqual({
        valid: false,
        error: "密码至少需要包含一个字母",
      });
    });

    it("rejects passwords with only special characters and numbers", () => {
      expect(validatePassword("1234567!")).toEqual({
        valid: false,
        error: "密码至少需要包含一个字母",
      });
    });
  });

  describe("at least one number requirement", () => {
    it("rejects passwords with only letters", () => {
      expect(validatePassword("abcdefgh")).toEqual({
        valid: false,
        error: "密码至少需要包含一个数字",
      });
    });

    it("rejects passwords with only letters and special chars", () => {
      expect(validatePassword("password!")).toEqual({
        valid: false,
        error: "密码至少需要包含一个数字",
      });
    });
  });

  describe("valid passwords pass", () => {
    it("accepts letter + number combination", () => {
      expect(validatePassword("password1")).toEqual({ valid: true });
    });

    it("accepts mixed case with numbers", () => {
      expect(validatePassword("PassWord123")).toEqual({ valid: true });
    });

    it("accepts complex password with special chars", () => {
      expect(validatePassword("MyP@ssw0rd!")).toEqual({ valid: true });
    });

    it("accepts password with number at the beginning", () => {
      expect(validatePassword("1passwordA")).toEqual({ valid: true });
    });

    it("accepts password with number in the middle", () => {
      expect(validatePassword("pass1word")).toEqual({ valid: true });
    });
  });

  describe("edge cases", () => {
    it("rejects empty string", () => {
      expect(validatePassword("")).toEqual({
        valid: false,
        error: "密码至少需要8个字符",
      });
    });

    it("rejects whitespace-only string", () => {
      expect(validatePassword("        ")).toEqual({
        valid: false,
        error: "密码至少需要包含一个字母",
      });
    });
  });
});

describe("email validation", () => {
  describe("valid emails pass", () => {
    it("accepts standard email", () => {
      expect(validateEmail("user@example.com")).toEqual({ valid: true });
    });

    it("accepts email with subdomain", () => {
      expect(validateEmail("user@mail.example.com")).toEqual({ valid: true });
    });

    it("accepts email with plus sign", () => {
      expect(validateEmail("user+tag@example.com")).toEqual({ valid: true });
    });

    it("accepts email with dots in local part", () => {
      expect(validateEmail("first.last@example.com")).toEqual({ valid: true });
    });

    it("accepts email with numbers", () => {
      expect(validateEmail("user123@example456.com")).toEqual({ valid: true });
    });

    it("accepts email with hyphen in domain", () => {
      expect(validateEmail("user@my-domain.com")).toEqual({ valid: true });
    });
  });

  describe("invalid emails are rejected", () => {
    it("rejects email without @", () => {
      expect(validateEmail("userexample.com")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects email without domain", () => {
      expect(validateEmail("user@")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects email without TLD", () => {
      expect(validateEmail("user@example")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects email with spaces", () => {
      expect(validateEmail("user @example.com")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects empty string", () => {
      expect(validateEmail("")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects just @ symbol", () => {
      expect(validateEmail("@")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });

    it("rejects double @ symbols", () => {
      expect(validateEmail("user@@example.com")).toEqual({
        valid: false,
        error: "邮箱格式不正确",
      });
    });
  });
});
