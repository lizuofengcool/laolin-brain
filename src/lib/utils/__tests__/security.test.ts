import { describe, it, expect } from "vitest";
import {
  validateInput,
  validateInputs,
  isValidEmail,
  isValidUrl,
  escapeHtml,
  stripHtml,
  detectSqlInjection,
  generateSecureToken,
  maskEmail,
  maskPhone,
  checkPasswordStrength,
} from "../security";

describe("安全工具函数", () => {
  describe("validateInput", () => {
    it("应该验证输入长度", () => {
      const result = validateInput("test", { minLength: 2, maxLength: 10 });
      expect(result.valid).toBe(true);
    });

    it("应该拒绝太短的输入", () => {
      const result = validateInput("a", { minLength: 2 });
      expect(result.valid).toBe(false);
    });

    it("应该拒绝太长的输入", () => {
      const result = validateInput("a".repeat(100), { maxLength: 10 });
      expect(result.valid).toBe(false);
    });

    it("应该验证必填字段", () => {
      const result = validateInput("", { required: true });
      expect(result.valid).toBe(false);
    });

    it("应该验证正则表达式模式", () => {
      const result = validateInput("abc123", { pattern: /^[a-z0-9]+$/ });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateInputs", () => {
    it("应该验证多个输入", () => {
      const results = validateInputs(
        { name: "test", email: "test@example.com" },
        {
          name: { required: true, minLength: 2 },
          email: { required: true },
        }
      );
      expect(results.valid).toBe(true);
    });

    it("应该返回所有错误", () => {
      const results = validateInputs(
        { name: "", email: "invalid" },
        {
          name: { required: true },
          email: { required: true },
        }
      );
      expect(results.valid).toBe(false);
      expect(Object.keys(results.errors).length).toBeGreaterThan(0);
    });
  });

  describe("isValidEmail", () => {
    it("应该验证有效的邮箱", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
      expect(isValidEmail("user.name+tag@domain.co.uk")).toBe(true);
    });

    it("应该拒绝无效的邮箱", () => {
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("test@")).toBe(false);
    });
  });

  describe("isValidUrl", () => {
    it("应该验证有效的URL", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://example.com/path?query=1")).toBe(true);
    });

    it("应该拒绝无效的URL", () => {
      expect(isValidUrl("invalid")).toBe(false);
      expect(isValidUrl("ftp://example.com")).toBe(false);
    });
  });

  describe("escapeHtml", () => {
    it("应该转义HTML特殊字符", () => {
      const result = escapeHtml('<script>alert("xss")</script>');
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
    });

    it("应该处理空字符串", () => {
      expect(escapeHtml("")).toBe("");
    });
  });

  describe("stripHtml", () => {
    it("应该移除HTML标签", () => {
      const result = stripHtml("<p>Hello <b>World</b></p>");
      expect(result).toBe("Hello World");
    });

    it("应该处理纯文本", () => {
      expect(stripHtml("Hello World")).toBe("Hello World");
    });
  });

  describe("detectSqlInjection", () => {
    it("应该检测常见的SQL注入模式", () => {
      expect(detectSqlInjection("' OR 1=1 --")).toBe(true);
      expect(detectSqlInjection("'; DROP TABLE users; --")).toBe(true);
    });

    it("应该不检测正常输入", () => {
      expect(detectSqlInjection("hello world")).toBe(false);
      expect(detectSqlInjection("test@example.com")).toBe(false);
    });
  });

  describe("generateSecureToken", () => {
    it("应该生成指定长度的令牌", () => {
      const token = generateSecureToken(32);
      expect(token.length).toBe(32);
    });

    it("应该生成唯一的令牌", () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);
      expect(token1).not.toBe(token2);
    });
  });

  describe("maskEmail", () => {
    it("应该脱敏邮箱地址", () => {
      const result = maskEmail("test@example.com");
      expect(result).toContain("***");
      expect(result).toContain("@example.com");
    });

    it("应该处理短邮箱名", () => {
      const result = maskEmail("a@b.com");
      expect(result).toBeDefined();
    });
  });

  describe("maskPhone", () => {
    it("应该脱敏手机号", () => {
      const result = maskPhone("13800138000");
      expect(result).toContain("****");
    });
  });

  describe("checkPasswordStrength", () => {
    it("应该评估弱密码", () => {
      const result = checkPasswordStrength("123456");
      expect(result.score).toBeLessThan(3);
      expect(result.level).toBe("weak");
    });

    it("应该评估强密码", () => {
      const result = checkPasswordStrength("MyP@ssw0rd!2024");
      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.level).toBeIn(["strong", "very_strong"]);
    });

    it("应该返回建议", () => {
      const result = checkPasswordStrength("weak");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
});
