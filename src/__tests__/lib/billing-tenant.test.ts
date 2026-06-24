/**
 * 付费系统测试
 * 
 * 测试目标：
 * 1. 验证订阅系统的多租户隔离
 * 2. 验证订单系统的多租户隔离
 * 3. 验证配额检查功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTenantDb } from '@/lib/db/tenant-db';

// Mock Prisma client
vi.mock('@/lib/db', () => ({
  db: {
    subscription: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('付费系统 - 多租户隔离', () => {
  const tenantId1 = 'tenant-001';
  const tenantId2 = 'tenant-002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Subscription 订阅模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockSubscriptions = [
        { id: 'sub-1', tenantId: tenantId1, plan: 'pro', status: 'active' },
      ];
      
      const { db } = await import('@/lib/db');
      (db.subscription.findMany as any).mockResolvedValue(mockSubscriptions);

      const result = await tenantDb.subscription.findMany();

      expect(db.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
          }),
        })
      );
      expect(result).toEqual(mockSubscriptions);
    });

    it('findFirst 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockSubscription = {
        id: 'sub-1',
        tenantId: tenantId1,
        plan: 'pro',
        status: 'active',
      };
      
      const { db } = await import('@/lib/db');
      (db.subscription.findFirst as any).mockResolvedValue(mockSubscription);

      const result = await tenantDb.subscription.findFirst({
        where: { status: 'active' },
      });

      expect(db.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'active',
          }),
        })
      );
      expect(result).toEqual(mockSubscription);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockSubscription = {
        id: 'sub-1',
        tenantId: tenantId1,
        plan: 'pro',
        status: 'active',
      };
      
      const { db } = await import('@/lib/db');
      (db.subscription.create as any).mockResolvedValue(mockSubscription);

      const result = await tenantDb.subscription.create({
        data: {
          plan: 'pro',
          status: 'active',
        },
      });

      expect(db.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            plan: 'pro',
            status: 'active',
          }),
        })
      );
      expect(result).toEqual(mockSubscription);
    });

    it('不同租户的订阅数据应该互相隔离', async () => {
      const tenantDb1 = createTenantDb(tenantId1);
      const tenantDb2 = createTenantDb(tenantId2);
      
      const { db } = await import('@/lib/db');
      (db.subscription.findFirst as any).mockResolvedValue(null);

      await tenantDb1.subscription.findFirst();
      await tenantDb2.subscription.findFirst();

      expect(db.subscription.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId1 }),
        })
      );

      expect(db.subscription.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId2 }),
        })
      );
    });
  });

  describe('Order 订单模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockOrders = [
        { id: 'order-1', tenantId: tenantId1, amount: 9900, status: 'paid' },
      ];
      
      const { db } = await import('@/lib/db');
      (db.order.findMany as any).mockResolvedValue(mockOrders);

      const result = await tenantDb.order.findMany({
        where: { status: 'paid' },
      });

      expect(db.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'paid',
          }),
        })
      );
      expect(result).toEqual(mockOrders);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockOrder = {
        id: 'order-1',
        tenantId: tenantId1,
        amount: 9900,
        status: 'pending',
      };
      
      const { db } = await import('@/lib/db');
      (db.order.create as any).mockResolvedValue(mockOrder);

      const result = await tenantDb.order.create({
        data: {
          amount: 9900,
          status: 'pending',
        },
      });

      expect(db.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            amount: 9900,
            status: 'pending',
          }),
        })
      );
      expect(result).toEqual(mockOrder);
    });

    it('count 应该只统计当前租户的订单', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.order.count as any).mockResolvedValue(15);

      const result = await tenantDb.order.count({
        where: { status: 'paid' },
      });

      expect(db.order.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'paid',
          }),
        })
      );
      expect(result).toBe(15);
    });
  });

  describe('Tenant 租户模型', () => {
    it('findUnique 应该只查询当前租户', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockTenant = {
        id: tenantId1,
        name: '测试租户',
        storageUsed: BigInt(1024),
        storageQuota: BigInt(1073741824),
      };
      
      const { db } = await import('@/lib/db');
      (db.tenant.findUnique as any).mockResolvedValue(mockTenant);

      const result = await tenantDb.tenant.findUnique();

      expect(db.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: tenantId1,
          }),
        })
      );
      expect(result).toEqual(mockTenant);
    });

    it('update 应该只更新当前租户', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockTenant = {
        id: tenantId1,
        storageUsed: BigInt(2048),
      };
      
      const { db } = await import('@/lib/db');
      (db.tenant.update as any).mockResolvedValue(mockTenant);

      const result = await tenantDb.tenant.update({
        data: { storageUsed: BigInt(2048) },
      });

      expect(db.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: tenantId1,
          }),
          data: expect.objectContaining({
            storageUsed: BigInt(2048),
          }),
        })
      );
      expect(result).toEqual(mockTenant);
    });
  });
});
