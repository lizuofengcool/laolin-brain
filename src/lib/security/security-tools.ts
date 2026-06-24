/**
 * 安全工具模块
 * 包含输入验证、XSS防护、SQL注入检测、路径遍历防护等安全功能
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// 密码策略配置
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  commonPasswords: string[];
}

// 默认密码策略
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: false,
  commonPasswords: [
    "password",
    "123456",
    "12345678",
    "qwerty",
    "abc123",
    "password1",
    "1234567",
    "123456789",
    "12345",
    "iloveyou",
    "111111",
    "123123",
    "admin",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "login",
    "princess",
  ],
};

// 密码强度等级
export type PasswordStrength = "weak" | "fair" | "good" | "strong" | "very_strong";

// 密码检查结果
export interface PasswordCheckResult {
  valid: boolean;
  strength: PasswordStrength;
  score: number; // 0-100
  errors: string[];
  suggestions: string[];
}

/**
 * XSS防护 - 转义HTML
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== "string") return "";

  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
    .replace(/`/g, "&#x60;")
    .replace(/=/g, "&#x3D;");
}

/**
 * XSS防护 - 去除HTML标签
 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "");
}

/**
 * SQL注入检测
 */
export function detectSqlInjection(input: string): boolean {
  if (!input || typeof input !== "string") return false;

  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\bOR\b|\bAND\b).*=.*\1/i,
    /(\bWHERE\b.*\bOR\b.*=)/i,
    /('.*'|".*").*(\bOR\b|\bAND\b)/i,
    /(\bxp_|\bsp_)/i,
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /(\bINSERT\b.*\bINTO\b)/i,
    /(\bCREATE\b.*\bTABLE\b)/i,
    /(\bALTER\b.*\bTABLE\b)/i,
    /(;.*\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE)\b)/i,
    /(\bEXEC\b|\bEXECUTE\b)/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * 路径遍历攻击检测
 */
export function detectPathTraversal(input: string): boolean {
  if (!input || typeof input !== "string") return false;

  const traversalPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e%2f/i,
    /%2e%2e%5c/i,
    /%252e%252e%252f/i,
    /%c0%ae%c0%ae%c0%af/i,
    /\.\.[\\/]/,
    /^[\\/]/,
    /^[a-zA-Z]:[\\/]/,
  ];

  return traversalPatterns.some((pattern) => pattern.test(input));
}

/**
 * 安全路径验证
 */
export function validatePath(path: string, baseDir: string): boolean {
  if (!path || typeof path !== "string") return false;

  // 检测路径遍历
  if (detectPathTraversal(path)) {
    return false;
  }

  // 规范化路径
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+/g, "/");

  // 检查是否在baseDir内
  const fullPath = baseDir.endsWith("/")
    ? baseDir + normalizedPath
    : baseDir + "/" + normalizedPath;

  // 简单检查：不允许..
  if (fullPath.includes("..")) {
    return false;
  }

  return true;
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * 验证URL格式
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 验证手机号（中国）
 */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 输入验证
 */
export function validateInput(
  input: string,
  options: {
    maxLength?: number;
    minLength?: number;
    allowedChars?: RegExp;
    forbiddenPatterns?: RegExp[];
    allowEmpty?: boolean;
    trim?: boolean;
  } = {}
): {
  valid: boolean;
  sanitized: string;
  errors: string[];
} {
  const errors: string[] = [];
  let sanitized = input || "";

  // 检查是否为空
  if (!options.allowEmpty && (!sanitized || !sanitized.trim())) {
    errors.push("输入不能为空");
    return { valid: false, sanitized: "", errors };
  }

  // 去除首尾空白
  if (options.trim !== false) {
    sanitized = sanitized.trim();
  }

  // 检查最小长度
  if (options.minLength && sanitized.length < options.minLength) {
    errors.push(`输入长度不能少于 ${options.minLength} 个字符`);
  }

  // 检查最大长度
  if (options.maxLength && sanitized.length > options.maxLength) {
    errors.push(`输入长度不能超过 ${options.maxLength} 个字符`);
    sanitized = sanitized.slice(0, options.maxLength);
  }

  // 检查允许的字符
  if (options.allowedChars && !options.allowedChars.test(sanitized)) {
    errors.push("输入包含不允许的字符");
  }

  // 检查禁止的模式
  if (options.forbiddenPatterns) {
    for (const pattern of options.forbiddenPatterns) {
      if (pattern.test(sanitized)) {
        errors.push("输入包含不允许的内容");
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    sanitized,
    errors,
  };
}

/**
 * 批量验证输入
 */
export function validateInputs(
  inputs: Record<string, string>,
  rules: Record<
    string,
    {
      maxLength?: number;
      minLength?: number;
      allowedChars?: RegExp;
      required?: boolean;
      type?: "email" | "url" | "phone" | "text";
    }
  >
): {
  valid: boolean;
  sanitized: Record<string, string>;
  errors: Record<string, string[]>;
} {
  const sanitized: Record<string, string> = {};
  const errors: Record<string, string[]> = {};
  let allValid = true;

  for (const [field, rule] of Object.entries(rules)) {
    const input = inputs[field] || "";
    const fieldErrors: string[] = [];

    // 检查必填
    if (rule.required && !input.trim()) {
      fieldErrors.push("此字段为必填项");
    }

    // 类型验证
    if (input.trim()) {
      if (rule.type === "email" && !isValidEmail(input)) {
        fieldErrors.push("邮箱格式不正确");
      }
      if (rule.type === "url" && !isValidUrl(input)) {
        fieldErrors.push("URL格式不正确");
      }
      if (rule.type === "phone" && !isValidPhone(input)) {
        fieldErrors.push("手机号格式不正确");
      }
    }

    // 长度验证
    const result = validateInput(input, {
      maxLength: rule.maxLength,
      minLength: rule.minLength,
      allowEmpty: !rule.required,
    });

    if (!result.valid) {
      fieldErrors.push(...result.errors);
    }

    sanitized[field] = result.sanitized;
    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
      allValid = false;
    }
  }

  return {
    valid: allValid,
    sanitized,
    errors,
  };
}

/**
 * 检查密码强度
 */
export function checkPasswordStrength(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): PasswordCheckResult {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 检查空密码
  if (!password) {
    return {
      valid: false,
      strength: "weak",
      score: 0,
      errors: ["密码不能为空"],
      suggestions: ["请输入密码"],
    };
  }

  // 检查最小长度
  if (password.length < policy.minLength) {
    errors.push(`密码长度不能少于 ${policy.minLength} 个字符`);
    suggestions.push(`增加密码长度到至少 ${policy.minLength} 个字符`);
  } else {
    score += 20;
  }

  // 检查最大长度
  if (password.length > policy.maxLength) {
    errors.push(`密码长度不能超过 ${policy.maxLength} 个字符`);
  }

  // 检查大写字母
  const hasUppercase = /[A-Z]/.test(password);
  if (policy.requireUppercase && !hasUppercase) {
    errors.push("密码必须包含大写字母");
    suggestions.push("添加大写字母");
  } else if (hasUppercase) {
    score += 15;
  }

  // 检查小写字母
  const hasLowercase = /[a-z]/.test(password);
  if (policy.requireLowercase && !hasLowercase) {
    errors.push("密码必须包含小写字母");
    suggestions.push("添加小写字母");
  } else if (hasLowercase) {
    score += 15;
  }

  // 检查数字
  const hasNumbers = /\d/.test(password);
  if (policy.requireNumbers && !hasNumbers) {
    errors.push("密码必须包含数字");
    suggestions.push("添加数字");
  } else if (hasNumbers) {
    score += 15;
  }

  // 检查特殊字符
  const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  if (policy.requireSymbols && !hasSymbols) {
    errors.push("密码必须包含特殊字符");
    suggestions.push("添加特殊字符（如 !@#$%^&*）");
  } else if (hasSymbols) {
    score += 20;
  }

  // 长度奖励
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 5;

  // 检查常见密码
  if (policy.commonPasswords.includes(password.toLowerCase())) {
    errors.push("密码太常见，容易被猜到");
    suggestions.push("使用更独特的密码");
    score = Math.max(0, score - 30);
  }

  // 检查重复字符
  if (/(.)\1{2,}/.test(password)) {
    suggestions.push("避免连续重复的字符");
    score -= 5;
  }

  // 检查顺序字符
  if (/(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
    suggestions.push("避免连续的字母或数字");
    score -= 5;
  }

  // 确保分数在0-100之间
  score = Math.max(0, Math.min(100, score));

  // 确定强度等级
  let strength: PasswordStrength;
  if (score < 30) {
    strength = "weak";
  } else if (score < 50) {
    strength = "fair";
  } else if (score < 70) {
    strength = "good";
  } else if (score < 90) {
    strength = "strong";
  } else {
    strength = "very_strong";
  }

  return {
    valid: errors.length === 0,
    strength,
    score,
    errors,
    suggestions,
  };
}

/**
 * 生成安全的随机令牌
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * 哈希密码（使用scrypt）
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * 验证密码（使用恒定时间比较，防止时序攻击）
 */
export function verifyPassword(password: string, hash: string): boolean {
  try {
    const [salt, key] = hash.split(":");
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
  } catch {
    return false;
  }
}

/**
 * 数据脱敏 - 邮箱
 */
export function maskEmail(email: string): string {
  if (!email || !isValidEmail(email)) return email;

  const [username, domain] = email.split("@");
  const maskedUsername =
    username.length <= 2
      ? username[0] + "*"
      : username[0] + "*".repeat(username.length - 2) + username[username.length - 1];

  return `${maskedUsername}@${domain}`;
}

/**
 * 数据脱敏 - 手机号
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

/**
 * 数据脱敏 - 身份证号
 */
export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 8) return idCard;
  return idCard.slice(0, 4) + "********" + idCard.slice(-4);
}

/**
 * 数据脱敏 - 银行卡号
 */
export function maskBankCard(cardNumber: string): string {
  if (!cardNumber || cardNumber.length < 8) return cardNumber;
  return cardNumber.slice(0, 4) + " **** **** " + cardNumber.slice(-4);
}

/**
 * 数据脱敏 - 通用
 */
export function maskString(
  str: string,
  options: {
    startChars?: number;
    endChars?: number;
    maskChar?: string;
  } = {}
): string {
  const { startChars = 2, endChars = 2, maskChar = "*" } = options;

  if (!str || str.length <= startChars + endChars) {
    return maskChar.repeat(str?.length || 0);
  }

  return (
    str.slice(0, startChars) +
    maskChar.repeat(str.length - startChars - endChars) +
    str.slice(-endChars)
  );
}

/**
 * 速率限制器
 */
export class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number = 100, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * 检查是否超过速率限制
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  } {
    const now = Date.now();
    let requestInfo = this.requests.get(key);

    // 如果没有记录或窗口已过期，创建新记录
    if (!requestInfo || requestInfo.resetTime < now) {
      requestInfo = {
        count: 0,
        resetTime: now + this.windowMs,
      };
      this.requests.set(key, requestInfo);
    }

    // 检查是否超过限制
    if (requestInfo.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: requestInfo.resetTime,
        limit: this.maxRequests,
      };
    }

    // 增加计数
    requestInfo.count++;

    return {
      allowed: true,
      remaining: this.maxRequests - requestInfo.count,
      resetTime: requestInfo.resetTime,
      limit: this.maxRequests,
    };
  }

  /**
   * 重置某个key的计数
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * 清理过期的记录
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, info] of this.requests.entries()) {
      if (info.resetTime < now) {
        this.requests.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// 全局速率限制器（每分钟100次请求）
export const globalRateLimiter = new RateLimiter(100, 60 * 1000);

/**
 * 生成安全的文件名
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "unnamed";

  // 移除路径遍历字符
  let sanitized = filename.replace(/[\\/]/g, "_");

  // 移除危险字符
  sanitized = sanitized.replace(/[<>:"|?*]/g, "_");

  // 移除控制字符
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

  // 移除首尾空格和点
  sanitized = sanitized.trim().replace(/^\.+/, "").replace(/\.+$/, "");

  // 限制长度
  if (sanitized.length > 255) {
    const ext = sanitized.lastIndexOf(".");
    if (ext > 0 && sanitized.length - ext <= 10) {
      const name = sanitized.slice(0, ext);
      const extension = sanitized.slice(ext);
      sanitized = name.slice(0, 255 - extension.length) + extension;
    } else {
      sanitized = sanitized.slice(0, 255);
    }
  }

  return sanitized || "unnamed";
}

/**
 * 检查文件类型是否安全
 */
export function isSafeFileType(
  filename: string,
  allowedTypes: string[] = []
): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  if (!ext) return false;

  // 危险的文件类型
  const dangerousTypes = [
    "exe",
    "bat",
    "cmd",
    "sh",
    "ps1",
    "vbs",
    "js",
    "jse",
    "wsf",
    "wsh",
    "msc",
    "msi",
    "msp",
    "mst",
    "scr",
    "htaccess",
    "htpasswd",
    "php",
    "phtml",
    "php3",
    "php4",
    "php5",
    "phps",
    "asp",
    "aspx",
    "jsp",
    "jspx",
    "cfm",
    "cfml",
    "pl",
    "py",
    "cgi",
    "dll",
    "so",
    "dylib",
  ];

  if (dangerousTypes.includes(ext)) {
    return false;
  }

  // 如果指定了允许的类型，检查是否在列表中
  if (allowedTypes.length > 0) {
    return allowedTypes.map((t) => t.toLowerCase()).includes(ext);
  }

  return true;
}

/**
 * 计算文件哈希（用于完整性校验）
 */
export function calculateFileHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}
