import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clearRateLimits } from '@/lib/rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    clearRateLimits();
  });

  it('should allow requests within the default limit', () => {
    // 使用不匹配任何特定规则的路径，走默认100次/分钟
    const result = rateLimit('192.168.1.1', '/api/search');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(99); // 100 - 1
  });

  it('should block requests exceeding the auth limit', () => {
    // 认证接口限制为每分钟10次
    for (let i = 0; i < 10; i++) {
      const result = rateLimit('192.168.1.1', '/api/auth/login');
      expect(result.success).toBe(true);
    }
    // 第11次应该被限制
    const blocked = rateLimit('192.168.1.1', '/api/auth/login');
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('should apply different limits for different route types', () => {
    // /api/files 走通用文件规则：20次/分钟
    for (let i = 0; i < 5; i++) {
      rateLimit('192.168.1.1', '/api/files');
    }
    const filesResult = rateLimit('192.168.1.1', '/api/files');
    expect(filesResult.success).toBe(true);
    expect(filesResult.remaining).toBe(14); // 20 - 6
  });

  it('should track different clients independently', () => {
    const result1 = rateLimit('client-a', '/api/auth/login');
    const result2 = rateLimit('client-b', '/api/auth/login');
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.remaining).toBe(9);
    expect(result2.remaining).toBe(9);
  });

  it('should provide a reset time in the future', () => {
    const result = rateLimit('192.168.1.1', '/api/search');
    expect(result.resetTime).toBeGreaterThan(Date.now());
  });

  it('should apply auth limits (10/min) for auth routes', () => {
    const authResult = rateLimit('192.168.1.1', '/api/auth/register');
    expect(authResult.success).toBe(true);
    expect(authResult.remaining).toBe(9); // 10 - 1
  });

  it('should apply upload limits (30/min) for upload path', () => {
    const uploadResult = rateLimit('192.168.1.1', '/api/files/upload');
    expect(uploadResult.success).toBe(true);
    expect(uploadResult.remaining).toBe(29); // 30 - 1
  });

  it('should apply file limits (20/min) for general file operations', () => {
    const filesResult = rateLimit('192.168.1.1', '/api/files');
    expect(filesResult.success).toBe(true);
    expect(filesResult.remaining).toBe(19); // 20 - 1
  });

  it('should use upload limit (not general files limit) for upload paths', () => {
    // /api/files/upload 应该匹配 upload 规则（30次），不是 files 规则（20次）
    for (let i = 0; i < 20; i++) {
      rateLimit('192.168.1.1', '/api/files/upload');
    }
    // 第21次应该仍然允许（upload 限制是30）
    const result = rateLimit('192.168.1.1', '/api/files/upload');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9); // 30 - 21
  });
});
