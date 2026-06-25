/**
 * 安全加固模块
 * 提供认证安全、数据安全、API安全、应用安全等功能
 */

import crypto from "crypto";

// ==================== 认证安全 ====================

/**
 * 密码策略配置
 */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  forbidCommonPasswords: boolean;
  passwordHistoryCount: number;
  passwordExpiryDays: number;
}

/**
 * 默认密码策略
 */
export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  forbidCommonPasswords: true,
  passwordHistoryCount: 5,
  passwordExpiryDays: 90,
};

// 常见弱密码列表
const COMMON_PASSWORDS = new Set([
  "password",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "password1",
  "1234567",
  "123456789",
  "letmein",
  "12345",
  "password123",
  "admin",
  "welcome",
  "monkey",
  "login",
  "abc12345",
  "111111",
  "iloveyou",
  "sunshine",
  "princess",
]);

/**
 * 验证密码强度
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = defaultPasswordPolicy
): {
  valid: boolean;
  score: number;
  level: "very_weak" | "weak" | "medium" | "strong" | "very_strong";
  errors: string[];
  suggestions: string[];
} {
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 长度检查
  if (password.length < policy.minLength) {
    errors.push(`密码长度不能少于 ${policy.minLength} 个字符`);
  } else if (password.length >= 12) {
    score += 2;
  } else if (password.length >= 8) {
    score += 1;
  }

  if (password.length > policy.maxLength) {
    errors.push(`密码长度不能超过 ${policy.maxLength} 个字符`);
  }

  // 大写字母检查
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("密码必须包含大写字母");
  } else if (/[A-Z]/.test(password)) {
    score += 1;
    if (!policy.requireUppercase) suggestions.push("可以添加大写字母增强安全性");
  }

  // 小写字母检查
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("密码必须包含小写字母");
  } else if (/[a-z]/.test(password)) {
    score += 1;
  }

  // 数字检查
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("密码必须包含数字");
  } else if (/[0-9]/.test(password)) {
    score += 1;
  }

  // 特殊字符检查
  if (policy.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("密码必须包含特殊字符");
  } else if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  }

  // 常见密码检查
  if (policy.forbidCommonPasswords && COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("密码过于常见，请使用更复杂的密码");
  }

  // 计算强度等级
  let level: "very_weak" | "weak" | "medium" | "strong" | "very_strong";
  if (score <= 1) level = "very_weak";
  else if (score <= 2) level = "weak";
  else if (score <= 3) level = "medium";
  else if (score <= 4) level = "strong";
  else level = "very_strong";

  return {
    valid: errors.length === 0,
    score,
    level,
    errors,
    suggestions,
  };
}

/**
 * 登录失败追踪器
 */
export class LoginFailureTracker {
  private failures: Map<string, { count: number; firstFailure: number; lockedUntil: number }> = new Map();
  private maxAttempts: number;
  private lockoutDuration: number; // 毫秒
  private windowMs: number; // 时间窗口

  constructor(options?: {
    maxAttempts?: number;
    lockoutDuration?: number;
    windowMs?: number;
  }) {
    this.maxAttempts = options?.maxAttempts || 5;
    this.lockoutDuration = options?.lockoutDuration || 30 * 60 * 1000; // 30分钟
    this.windowMs = options?.windowMs || 15 * 60 * 1000; // 15分钟
  }

  /**
   * 记录登录失败
   */
  recordFailure(identifier: string): {
    attempts: number;
    remaining: number;
    locked: boolean;
    lockoutUntil?: number;
  } {
    const now = Date.now();
    let record = this.failures.get(identifier);

    // 如果记录已过期，重置
    if (record && now - record.firstFailure > this.windowMs && now > record.lockedUntil) {
      this.failures.delete(identifier);
      record = undefined;
    }

    if (!record) {
      record = {
        count: 1,
        firstFailure: now,
        lockedUntil: 0,
      };
    } else {
      record.count++;
    }

    // 检查是否需要锁定
    if (record.count >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutDuration;
    }

    this.failures.set(identifier, record);

    return {
      attempts: record.count,
      remaining: Math.max(0, this.maxAttempts - record.count),
      locked: record.lockedUntil > now,
      lockoutUntil: record.lockedUntil > now ? record.lockedUntil : undefined,
    };
  }

  /**
   * 检查是否被锁定
   */
  isLocked(identifier: string): {
    locked: boolean;
    lockoutUntil?: number;
    remainingAttempts?: number;
  } {
    const now = Date.now();
    const record = this.failures.get(identifier);

    if (!record) {
      return { locked: false, remainingAttempts: this.maxAttempts };
    }

    // 如果锁定已过期
    if (record.lockedUntil && now > record.lockedUntil) {
      this.failures.delete(identifier);
      return { locked: false, remainingAttempts: this.maxAttempts };
    }

    // 如果在时间窗口外
    if (now - record.firstFailure > this.windowMs) {
      this.failures.delete(identifier);
      return { locked: false, remainingAttempts: this.maxAttempts };
    }

    return {
      locked: record.lockedUntil > now,
      lockoutUntil: record.lockedUntil > now ? record.lockedUntil : undefined,
      remainingAttempts: Math.max(0, this.maxAttempts - record.count),
    };
  }

  /**
   * 清除失败记录（登录成功时调用）
   */
  clearFailures(identifier: string): void {
    this.failures.delete(identifier);
  }

  /**
   * 清理过期记录
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.failures.entries()) {
      if (now > record.lockedUntil && now - record.firstFailure > this.windowMs) {
        this.failures.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// 导出单例
export const loginFailureTracker = new LoginFailureTracker();

// ==================== 数据安全 ====================

/**
 * 数据加密工具
 */
export class DataEncryptor {
  private algorithm: string;
  private key: Buffer;
  private ivLength: number;

  constructor(secretKey: string, algorithm: string = "aes-256-gcm") {
    this.algorithm = algorithm;
    this.key = crypto.scryptSync(secretKey, "salt", 32);
    this.ivLength = 16;
  }

  /**
   * 加密数据
   */
  encrypt(data: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    // @ts-expect-error - getAuthTag exists on GCM cipher but TypeScript types may not recognize it
    const authTag = cipher.getAuthTag().toString("hex");

    // 返回格式: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  /**
   * 解密数据
   */
  decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    // @ts-expect-error - setAuthTag exists on GCM decipher but TypeScript types may not recognize it
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * 加密对象
   */
  encryptObject<T>(obj: T): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /**
   * 解密对象
   */
  decryptObject<T>(encryptedData: string): T {
    return JSON.parse(this.decrypt(encryptedData));
  }
}

/**
 * 数据脱敏工具
 */
export class DataMasker {
  /**
   * 脱敏邮箱
   */
  static maskEmail(email: string, maskChar: string = "*"): string {
    if (!email || !email.includes("@")) {
      return email;
    }

    const [username, domain] = email.split("@");
    const maskLength = Math.max(1, Math.floor(username.length / 2));
    const visibleStart = Math.max(1, Math.floor(username.length / 4));

    const maskedUsername =
      username.slice(0, visibleStart) +
      maskChar.repeat(maskLength) +
      username.slice(visibleStart + maskLength);

    return `${maskedUsername}@${domain}`;
  }

  /**
   * 脱敏手机号
   */
  static maskPhone(phone: string, maskChar: string = "*"): string {
    if (!phone || phone.length < 7) {
      return phone;
    }

    const start = 3;
    const end = phone.length - 4;
    const maskLength = end - start;

    return (
      phone.slice(0, start) +
      maskChar.repeat(maskLength) +
      phone.slice(end)
    );
  }

  /**
   * 脱敏身份证号
   */
  static maskIdCard(idCard: string, maskChar: string = "*"): string {
    if (!idCard || idCard.length < 10) {
      return idCard;
    }

    const start = 6;
    const end = idCard.length - 4;
    const maskLength = end - start;

    return (
      idCard.slice(0, start) +
      maskChar.repeat(maskLength) +
      idCard.slice(end)
    );
  }

  /**
   * 脱敏姓名
   */
  static maskName(name: string, maskChar: string = "*"): string {
    if (!name || name.length <= 1) {
      return name;
    }

    if (name.length === 2) {
      return name[0] + maskChar;
    }

    return name[0] + maskChar.repeat(name.length - 2) + name[name.length - 1];
  }

  /**
   * 脱敏银行卡号
   */
  static maskBankCard(cardNumber: string, maskChar: string = "*"): string {
    if (!cardNumber || cardNumber.length < 8) {
      return cardNumber;
    }

    const start = 4;
    const end = cardNumber.length - 4;
    const maskLength = end - start;

    return (
      cardNumber.slice(0, start) +
      maskChar.repeat(maskLength) +
      cardNumber.slice(end)
    );
  }

  /**
   * 通用脱敏
   */
  static mask(
    value: string,
    options?: {
      start?: number;
      end?: number;
      maskChar?: string;
    }
  ): string {
    if (!value) return value;

    const { start = 1, end = 1, maskChar = "*" } = options || {};

    if (value.length <= start + end) {
      return maskChar.repeat(value.length);
    }

    return (
      value.slice(0, start) +
      maskChar.repeat(value.length - start - end) +
      value.slice(value.length - end)
    );
  }
}

// ==================== API安全 ====================

/**
 * 速率限制器
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(options?: {
    windowMs?: number;
    maxRequests?: number;
  }) {
    this.windowMs = options?.windowMs || 60 * 1000; // 1分钟
    this.maxRequests = options?.maxRequests || 100; // 最多100次
  }

  /**
   * 检查是否超过限制
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
  } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 获取该key的请求记录
    let timestamps = this.requests.get(key) || [];

    // 移除时间窗口外的记录
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // 检查是否超过限制
    const allowed = timestamps.length < this.maxRequests;

    if (allowed) {
      timestamps.push(now);
    }

    this.requests.set(key, timestamps);

    // 计算重置时间
    const resetTime = timestamps.length > 0 ? timestamps[0] + this.windowMs : now;

    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
      resetTime,
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
   * 清理过期记录
   */
  cleanup(): number {
    const windowStart = Date.now() - this.windowMs;
    let cleaned = 0;

    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter((ts) => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
        cleaned++;
      } else if (filtered.length < timestamps.length) {
        this.requests.set(key, filtered);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// 导出单例
export const rateLimiter = new RateLimiter();

/**
 * 请求签名验证
 */
export class RequestSigner {
  private secret: string;
  private maxTimestampDiff: number; // 最大时间差（秒）

  constructor(secret: string, maxTimestampDiff: number = 300) {
    this.secret = secret;
    this.maxTimestampDiff = maxTimestampDiff;
  }

  /**
   * 生成签名
   */
  sign(params: Record<string, any>, timestamp?: number): {
    signature: string;
    timestamp: number;
    nonce: string;
  } {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString("hex");

    // 按key排序参数
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = params[key];
        return acc;
      }, {});

    // 构造签名字符串
    const signString =
      JSON.stringify(sortedParams) + ts + nonce + this.secret;

    // 计算签名
    const signature = crypto
      .createHash("sha256")
      .update(signString)
      .digest("hex");

    return {
      signature,
      timestamp: ts,
      nonce,
    };
  }

  /**
   * 验证签名
   */
  verify(
    params: Record<string, any>,
    signature: string,
    timestamp: number,
    nonce: string
  ): {
    valid: boolean;
    reason?: string;
  } {
    // 检查时间戳
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > this.maxTimestampDiff) {
      return {
        valid: false,
        reason: "Timestamp expired",
      };
    }

    // 重新计算签名
    const expected = this.sign(params, timestamp);

    // 比较签名（使用timingSafeEqual防止时序攻击）
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected.signature)
    );

    if (!valid) {
      return {
        valid: false,
        reason: "Invalid signature",
      };
    }

    return { valid: true };
  }
}

// ==================== 应用安全 ====================

/**
 * XSS防护工具
 */
export class XSSProtection {
  /**
   * 转义HTML
   */
  static escapeHtml(html: string): string {
    const htmlEntities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;",
    };

    return String(html).replace(/[&<>"'`=\/]/g, (char) => htmlEntities[char]);
  }

  /**
   * 净化HTML（移除危险标签和属性）
   */
  static sanitizeHtml(html: string): string {
    // 移除script标签
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

    // 移除javascript:协议
    sanitized = sanitized.replace(/javascript:/gi, "");

    // 移除on*事件属性
    sanitized = sanitized.replace(/\son\w+="[^"]*"/gi, "");
    sanitized = sanitized.replace(/\son\w+='[^']*'/gi, "");

    // 移除expression
    sanitized = sanitized.replace(/expression\([^)]*\)/gi, "");

    return sanitized;
  }

  /**
   * 验证URL是否安全
   */
  static isSafeUrl(url: string): boolean {
    if (!url) return false;

    // 只允许http和https协议
    const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];

    try {
      const parsed = new URL(url);
      return allowedProtocols.includes(parsed.protocol);
    } catch {
      // 相对路径
      return !url.startsWith("javascript:") && !url.startsWith("data:");
    }
  }
}

/**
 * SQL注入防护工具
 */
export class SQLInjectionProtection {
  private static dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
    /(--|#|\/\*|\*\/|;)/g,
    /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/gi,
    /(\bOR\b|\bAND\b)\s+['"][^'"]*['"]\s*=\s*['"][^'"]*['"]/gi,
    /\bxp_\w+/gi,
    /\bsp_\w+/gi,
    /UNION\s+SELECT/gi,
    /INTO\s+(OUT|DUMP)FILE/gi,
    /LOAD_FILE\s*\(/gi,
    /BENCHMARK\s*\(/gi,
    /SLEEP\s*\(/gi,
  ];

  /**
   * 检测SQL注入
   */
  static detect(input: string): boolean {
    if (!input) return false;

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 转义SQL特殊字符
   */
  static escape(input: string): string {
    return input
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\x00/g, "\\0")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\x1a/g, "\\Z");
  }
}

/**
 * 路径遍历防护
 */
export class PathTraversalProtection {
  /**
   * 检测路径遍历攻击
   */
  static detect(path: string): boolean {
    if (!path) return false;

    // 检测../
    if (/\.\.\//.test(path) || /\.\.\\/.test(path)) {
      return true;
    }

    // 检测编码的../
    if (/%2e%2e%2f/i.test(path) || /%2e%2e\\/i.test(path)) {
      return true;
    }

    // 检测绝对路径
    if (path.startsWith("/") || /^[a-zA-Z]:\\/.test(path)) {
      return true;
    }

    return false;
  }

  /**
   * 净化路径
   */
  static sanitize(path: string): string {
    // 移除../和..\
    let sanitized = path.replace(/\.\.\//g, "").replace(/\.\.\\/g, "");

    // 移除开头的/和\
    sanitized = sanitized.replace(/^[\/\\]+/, "");

    // 移除编码的../
    sanitized = sanitized.replace(/%2e%2e%2f/gi, "").replace(/%2e%2e\\/gi, "");

    return sanitized;
  }

  /**
   * 确保路径在指定目录内
   */
  static ensureWithin(path: string, baseDir: string): string | null {
    const resolvedPath = require("path").resolve(baseDir, path);
    const resolvedBase = require("path").resolve(baseDir);

    if (!resolvedPath.startsWith(resolvedBase)) {
      return null;
    }

    return resolvedPath;
  }
}

/**
 * 文件上传安全检查
 */
export class FileUploadSecurity {
  // 允许的MIME类型
  private static allowedMimeTypes = new Set([
    // 图片
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    // 文档
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/csv",
    // 压缩包
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    // 音频
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    // 视频
    "video/mp4",
    "video/webm",
    "video/ogg",
  ]);

  // 危险的文件扩展名
  private static dangerousExtensions = new Set([
    ".php",
    ".php3",
    ".php4",
    ".php5",
    ".phtml",
    ".asp",
    ".aspx",
    ".jsp",
    ".js",
    ".exe",
    ".sh",
    ".bat",
    ".cmd",
    ".com",
    ".pif",
    ".application",
    ".gadget",
    ".msi",
    ".msp",
    ".msc",
    ".scr",
    ".hta",
    ".cpl",
    ".jar",
    ".wsf",
    ".wsh",
    ".ps1",
    ".ps1xml",
    ".ps2",
    ".ps2xml",
    ".psc1",
    ".psc2",
    ".msh",
    ".msh1",
    ".msh2",
    ".mshxml",
    ".msh1xml",
    ".msh2xml",
    ".scf",
    ".lnk",
    ".inf",
    ".reg",
    ".vbs",
    ".vbe",
    ".jse",
    ".ws",
    ".wsc",
    ".wsh",
  ]);

  /**
   * 验证文件是否安全
   */
  static validateFile(options: {
    filename: string;
    mimeType: string;
    size: number;
    maxSize?: number;
    allowedMimeTypes?: Set<string>;
  }): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const { filename, mimeType, size, maxSize, allowedMimeTypes } = options;

    // 检查文件大小
    if (maxSize && size > maxSize) {
      errors.push(`文件大小超过限制（最大 ${maxSize} 字节）`);
    }

    // 检查MIME类型
    const allowed = allowedMimeTypes || this.allowedMimeTypes;
    if (!allowed.has(mimeType)) {
      errors.push(`不支持的文件类型: ${mimeType}`);
    }

    // 检查文件扩展名
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    if (this.dangerousExtensions.has(ext)) {
      errors.push(`不允许的文件扩展名: ${ext}`);
    }

    // 检查文件名中的路径遍历
    if (PathTraversalProtection.detect(filename)) {
      errors.push("文件名包含非法字符");
    }

    // 检查文件名长度
    if (filename.length > 255) {
      errors.push("文件名过长");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 生成安全的文件名
   */
  static generateSafeFilename(originalName: string): string {
    // 获取扩展名
    const ext = originalName.slice(originalName.lastIndexOf("."));

    // 生成随机文件名
    const randomName = crypto.randomBytes(16).toString("hex");

    return `${randomName}${ext}`;
  }
}
