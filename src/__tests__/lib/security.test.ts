import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectSqlInjection } from "@/lib/utils/security";

// 模拟安全工具函数
describe("安全工具", () => {
  describe("输入验证", () => {
    // 模拟输入验证函数
    const validateInput = (
      input: string,
      options: {
        maxLength?: number;
        minLength?: number;
        pattern?: RegExp;
        allowedChars?: string;
      } = {}
    ): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      if (options.minLength && input.length < options.minLength) {
        errors.push(`输入长度不能少于 ${options.minLength} 个字符`);
      }

      if (options.maxLength && input.length > options.maxLength) {
        errors.push(`输入长度不能超过 ${options.maxLength} 个字符`);
      }

      if (options.pattern && !options.pattern.test(input)) {
        errors.push("输入格式不正确");
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    };

    it("应该验证输入长度", () => {
      const result = validateInput("test", { minLength: 2, maxLength: 10 });
      expect(result.valid).toBe(true);
    });

    it("应该拒绝过短的输入", () => {
      const result = validateInput("a", { minLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("应该拒绝过长的输入", () => {
      const result = validateInput("a".repeat(100), { maxLength: 10 });
      expect(result.valid).toBe(false);
    });

    it("应该验证输入格式", () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const result = validateInput("test@example.com", { pattern: emailPattern });
      expect(result.valid).toBe(true);
    });

    it("应该拒绝格式不正确的输入", () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const result = validateInput("invalid-email", { pattern: emailPattern });
      expect(result.valid).toBe(false);
    });
  });

  describe("XSS防护", () => {
    // 模拟HTML转义函数
    const escapeHtml = (text: string): string => {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    };

    // 模拟HTML标签移除函数
    const stripHtml = (html: string): string => {
      return html.replace(/<[^>]*>/g, "");
    };

    it("应该转义HTML特殊字符", () => {
      const result = escapeHtml("<script>alert('xss')</script>");
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
    });

    it("应该移除HTML标签", () => {
      const result = stripHtml("<p>Hello <b>World</b></p>");
      expect(result).toBe("Hello World");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("应该处理空字符串", () => {
      expect(escapeHtml("")).toBe("");
      expect(stripHtml("")).toBe("");
    });

    it("应该处理纯文本", () => {
      const text = "Hello World";
      expect(escapeHtml(text)).toBe(text);
      expect(stripHtml(text)).toBe(text);
    });
  });

  describe("SQL注入检测", () => {
    it("应该检测到SQL关键字", () => {
      expect(detectSqlInjection("SELECT * FROM users")).toBe(true);
    });

    it("应该检测到SQL注释", () => {
      expect(detectSqlInjection("1=1 --")).toBe(true);
    });

    it("应该检测到OR注入", () => {
      expect(detectSqlInjection("' OR '1'='1")).toBe(true);
    });

    it("应该检测到UNION注入", () => {
      expect(detectSqlInjection("UNION SELECT * FROM passwords")).toBe(true);
    });

    it("应该允许正常输入", () => {
      expect(detectSqlInjection("Hello World")).toBe(false);
      expect(detectSqlInjection("user@example.com")).toBe(false);
    });
  });

  describe("速率限制", () => {
    // 模拟速率限制器
    class RateLimiter {
      private requests = new Map<string, { count: number; windowStart: number }>();
      private windowMs: number;
      private maxRequests: number;

      constructor(maxRequests = 100, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
      }

      check(key: string): { allowed: boolean; remaining: number; resetTime: number } {
        const now = Date.now();
        const requestInfo = this.requests.get(key);

        if (!requestInfo || now - requestInfo.windowStart > this.windowMs) {
          // 新窗口
          this.requests.set(key, { count: 1, windowStart: now });
          return {
            allowed: true,
            remaining: this.maxRequests - 1,
            resetTime: now + this.windowMs,
          };
        }

        if (requestInfo.count >= this.maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetTime: requestInfo.windowStart + this.windowMs,
          };
        }

        requestInfo.count++;
        return {
          allowed: true,
          remaining: this.maxRequests - requestInfo.count,
          resetTime: requestInfo.windowStart + this.windowMs,
        };
      }

      reset(key: string): void {
        this.requests.delete(key);
      }
    }

    it("应该允许请求在限制内", () => {
      const limiter = new RateLimiter(5, 60000);
      const result = limiter.check("user1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("应该拒绝超过限制的请求", () => {
      const limiter = new RateLimiter(3, 60000);

      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");
      const result = limiter.check("user1");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("应该为不同用户独立计数", () => {
      const limiter = new RateLimiter(3, 60000);

      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");

      const result = limiter.check("user2");
      expect(result.allowed).toBe(true);
    });

    it("应该在窗口重置后允许请求", () => {
      const limiter = new RateLimiter(3, 10); // 10ms窗口

      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");

      return new Promise((resolve) => {
        setTimeout(() => {
          const result = limiter.check("user1");
          expect(result.allowed).toBe(true);
          resolve(true);
        }, 15);
      });
    });
  });

  describe("数据脱敏", () => {
    // 模拟邮箱脱敏
    const maskEmail = (email: string): string => {
      const [username, domain] = email.split("@");
      if (username.length <= 2) {
        return username[0] + "***@" + domain;
      }
      const maskedUsername = username[0] + "***" + username[username.length - 1];
      return maskedUsername + "@" + domain;
    };

    // 模拟手机号脱敏
    const maskPhone = (phone: string): string => {
      if (phone.length < 7) return phone;
      return phone.slice(0, 3) + "****" + phone.slice(-4);
    };

    it("应该正确脱敏邮箱", () => {
      const result = maskEmail("test@example.com");
      expect(result).toContain("***");
      expect(result).toContain("@example.com");
      expect(result).not.toBe("test@example.com");
    });

    it("应该正确脱敏短邮箱用户名", () => {
      const result = maskEmail("ab@example.com");
      expect(result).toContain("***");
    });

    it("应该正确脱敏手机号", () => {
      const result = maskPhone("13812345678");
      expect(result).toBe("138****5678");
      expect(result).toContain("****");
    });

    it("应该处理短手机号", () => {
      const result = maskPhone("12345");
      expect(result).toBe("12345");
    });
  });

  describe("密码强度检查", () => {
    // 模拟密码强度检查
    const checkPasswordStrength = (
      password: string
    ): {
      score: number;
      level: "weak" | "fair" | "good" | "strong" | "very-strong";
      feedback: string[];
    } => {
      let score = 0;
      const feedback: string[] = [];

      // 长度
      if (password.length >= 8) score++;
      else feedback.push("密码长度至少需要8个字符");

      if (password.length >= 12) score++;

      // 复杂度
      if (/[a-z]/.test(password)) score++;
      else feedback.push("建议包含小写字母");

      if (/[A-Z]/.test(password)) score++;
      else feedback.push("建议包含大写字母");

      if (/[0-9]/.test(password)) score++;
      else feedback.push("建议包含数字");

      if (/[^a-zA-Z0-9]/.test(password)) score++;
      else feedback.push("建议包含特殊字符");

      let level: "weak" | "fair" | "good" | "strong" | "very-strong";
      if (score <= 2) level = "weak";
      else if (score <= 3) level = "fair";
      else if (score <= 4) level = "good";
      else if (score <= 5) level = "strong";
      else level = "very-strong";

      return { score, level, feedback };
    };

    it("应该检测弱密码", () => {
      const result = checkPasswordStrength("123");
      expect(result.level).toBe("weak");
      expect(result.score).toBeLessThan(3);
    });

    it("应该检测强密码", () => {
      const result = checkPasswordStrength("MyP@ssw0rd123!");
      expect(result.level).toBeOneOf(["strong", "very-strong"]);
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it("应该提供改进建议", () => {
      const result = checkPasswordStrength("password");
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it("应该正确评分中等强度密码", () => {
      const result = checkPasswordStrength("Password123");
      expect(result.level).toBeOneOf(["fair", "good"]);
    });
  });
});
