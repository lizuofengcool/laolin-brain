/**
 * 安全工具
 * 
 * 功能：
 * 1. 输入验证
 * 2. 速率限制
 * 3. XSS防护
 * 4. SQL注入防护
 * 5. 敏感数据处理
 */

/**
 * 输入验证规则
 */
export interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  type?: 'string' | 'number' | 'email' | 'url' | 'boolean';
  custom?: (value: any) => boolean | string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证输入
 */
export function validateInput(
  value: any,
  rules: ValidationRules,
  fieldName: string = '字段'
): ValidationResult {
  const errors: string[] = [];

  // 必填检查
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldName}不能为空`);
    return { valid: false, errors };
  }

  // 如果值为空且不是必填，直接通过
  if (value === undefined || value === null || value === '') {
    return { valid: true, errors: [] };
  }

  // 类型检查
  if (rules.type) {
    switch (rules.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${fieldName}必须是字符串`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${fieldName}必须是数字`);
        }
        break;
      case 'email':
        if (!isValidEmail(value)) {
          errors.push(`${fieldName}格式不正确`);
        }
        break;
      case 'url':
        if (!isValidUrl(value)) {
          errors.push(`${fieldName}格式不正确`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${fieldName}必须是布尔值`);
        }
        break;
    }
  }

  // 长度检查
  if (typeof value === 'string') {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      errors.push(`${fieldName}长度不能少于${rules.minLength}个字符`);
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push(`${fieldName}长度不能超过${rules.maxLength}个字符`);
    }
  }

  // 正则检查
  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push(`${fieldName}格式不正确`);
  }

  // 自定义验证
  if (rules.custom) {
    const result = rules.custom(value);
    if (result !== true) {
      errors.push(typeof result === 'string' ? result : `${fieldName}验证失败`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证多个字段
 */
export function validateInputs(
  data: Record<string, any>,
  rules: Record<string, ValidationRules>
): ValidationResult {
  const allErrors: string[] = [];

  for (const [field, fieldRules] of Object.entries(rules)) {
    const result = validateInput(data[field], fieldRules, field);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证URL格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 转义HTML，防止XSS
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return text.replace(/[&<>"'`=\/]/g, (char) => htmlEntities[char] || char);
}

/**
 * 清理HTML标签
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 简单的SQL注入检测
 * 注意：主要依赖Prisma的参数化查询，这里只是额外防护
 */
export function detectSqlInjection(input: string): boolean {
  const sqlKeywords = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/i,
    // OR/AND 注入：兼容 `1=1`、`'1'='1'`、`'1'='1`（无尾引号，依赖外层 SQL 补全引号）等形态
    /(\b(OR|AND)\b\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?)/i,
  ];

  return sqlKeywords.some((pattern) => pattern.test(input));
}

/**
 * 速率限制器
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * 检查是否超过速率限制
   */
  isRateLimited(key: string): {
    limited: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 获取该key的请求记录
    let requestTimes = this.requests.get(key) || [];

    // 移除窗口外的请求记录
    requestTimes = requestTimes.filter((time) => time > windowStart);

    // 检查是否超过限制
    const limited = requestTimes.length >= this.maxRequests;

    if (!limited) {
      requestTimes.push(now);
    }

    this.requests.set(key, requestTimes);

    // 计算重置时间
    const resetTime = requestTimes.length > 0 ? requestTimes[0] + this.windowMs : now;
    const remaining = Math.max(0, this.maxRequests - requestTimes.length);

    return {
      limited,
      remaining,
      resetTime,
    };
  }

  /**
   * 重置某个key的限制
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * 清理过期的记录
   */
  cleanup(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let cleaned = 0;

    for (const [key, times] of this.requests.entries()) {
      const filtered = times.filter((time) => time > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
        cleaned++;
      } else {
        this.requests.set(key, filtered);
      }
    }

    return cleaned;
  }
}

/**
 * 全局速率限制器实例
 */
export const globalRateLimiter = new RateLimiter(100, 60000); // 每分钟100次

/**
 * 生成安全的随机令牌
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * 脱敏处理
 */
export function maskEmail(email: string): string {
  const [username, domain] = email.split('@');
  if (username.length <= 2) {
    return username + '***@' + domain;
  }
  return username[0] + '***' + username[username.length - 1] + '@' + domain;
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 验证密码强度
 */
export function checkPasswordStrength(password: string): {
  score: number; // 0-4
  level: 'weak' | 'fair' | 'good' | 'strong';
  suggestions: string[];
} {
  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8) score++;
  else suggestions.push('密码长度至少8位');

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else suggestions.push('包含大小写字母');

  if (/\d/.test(password)) score++;
  else suggestions.push('包含数字');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push('包含特殊字符');

  const levels: Array<'weak' | 'fair' | 'good' | 'strong'> = ['weak', 'fair', 'good', 'strong'];
  const level = levels[Math.min(score, 3)];

  return { score, level, suggestions };
}

export default {
  validateInput,
  validateInputs,
  isValidEmail,
  isValidUrl,
  escapeHtml,
  stripHtml,
  detectSqlInjection,
  RateLimiter,
  globalRateLimiter,
  generateSecureToken,
  maskEmail,
  maskPhone,
  checkPasswordStrength,
};
