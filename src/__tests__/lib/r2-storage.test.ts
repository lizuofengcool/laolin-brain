/**
 * r2-storage 配置态单测
 *
 * 回归防护：历史上 isR2Configured() 依赖进程级单例 s3Client，
 * 租户 A 配置后对所有租户返回 true（跨租户误报）。
 * 现改为按 tenantId 查询 DB，本测试锁定该行为：
 *   - 不同租户的"已配置"状态互不影响
 *   - 查询走 storageConfig.findUnique 的 tenantId_provider 复合唯一键
 *   - testR2Connection 不写入任何全局状态（仅构造临时实例）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted 确保 mock 函数在 vi.mock 工厂执行时已初始化（避免 TDZ / 提升顺序问题）
const { mockStorageConfigFindUnique, mockTestConnection } = vi.hoisted(() => ({
  mockStorageConfigFindUnique: vi.fn(),
  mockTestConnection: vi.fn(),
}));

// Mock @/lib/db —— 仅需 storageConfig.findUnique
vi.mock('@/lib/db', () => ({
  db: {
    storageConfig: {
      findUnique: (...args: unknown[]) => mockStorageConfigFindUnique(...args),
    },
  },
}));

// Mock R2Storage 类，使 testR2Connection 不触达网络
// 注意：实现须为普通 function（非箭头函数），否则无法作为构造器被 new 调用
vi.mock('@/lib/cloud-sync/r2-storage-class', () => ({
  R2Storage: vi.fn().mockImplementation(function () {
    return { testConnection: () => mockTestConnection() };
  }),
}));

import { isR2Configured, testR2Connection } from '@/lib/cloud-sync/r2-storage';

const sampleConfig = {
  accountId: 'acc-1',
  accessKeyId: 'key-1',
  secretAccessKey: 'secret-1',
  bucketName: 'bucket-1',
};

describe('r2-storage 配置态（按租户落库）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isR2Configured(tenantId)', () => {
    it('租户已配置 R2 时返回 true', async () => {
      mockStorageConfigFindUnique.mockResolvedValue({ id: 'cfg-1' });

      expect(await isR2Configured('tenant-A')).toBe(true);
      expect(mockStorageConfigFindUnique).toHaveBeenCalledWith({
        where: { tenantId_provider: { tenantId: 'tenant-A', provider: 'r2' } },
        select: { id: true },
      });
    });

    it('租户未配置 R2 时返回 false', async () => {
      mockStorageConfigFindUnique.mockResolvedValue(null);

      expect(await isR2Configured('tenant-B')).toBe(false);
    });

    it('不同租户互不影响：无进程级全局单例泄露', async () => {
      // 租户 A 已配置、租户 B 未配置，二者查询互不干扰
      mockStorageConfigFindUnique
        .mockResolvedValueOnce({ id: 'cfg-A' })
        .mockResolvedValueOnce(null);

      expect(await isR2Configured('tenant-A')).toBe(true);
      expect(await isR2Configured('tenant-B')).toBe(false);

      expect(mockStorageConfigFindUnique).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { tenantId_provider: { tenantId: 'tenant-A', provider: 'r2' } },
        })
      );
      expect(mockStorageConfigFindUnique).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { tenantId_provider: { tenantId: 'tenant-B', provider: 'r2' } },
        })
      );
    });
  });

  describe('testR2Connection(config)', () => {
    it('连接成功返回 true', async () => {
      mockTestConnection.mockResolvedValue(true);

      expect(await testR2Connection(sampleConfig)).toBe(true);
      expect(mockTestConnection).toHaveBeenCalledTimes(1);
    });

    it('连接失败返回 false（不向上抛出）', async () => {
      mockTestConnection.mockResolvedValue(false);

      expect(await testR2Connection(sampleConfig)).toBe(false);
    });

    it('抛出异常时捕获并返回 false', async () => {
      mockTestConnection.mockRejectedValue(new Error('network down'));

      expect(await testR2Connection(sampleConfig)).toBe(false);
    });

    it('不写入任何进程级全局状态：连续调用互不影响', async () => {
      mockTestConnection
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      expect(await testR2Connection(sampleConfig)).toBe(true);
      expect(await testR2Connection(sampleConfig)).toBe(false);
      // 每次调用都新建独立实例，无全局缓存
      expect(mockTestConnection).toHaveBeenCalledTimes(2);
    });
  });
});
