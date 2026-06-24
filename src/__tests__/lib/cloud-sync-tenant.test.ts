/**
 * 云同步系统测试
 * 
 * 测试目标：
 * 1. 验证同步日志的多租户隔离
 * 2. 验证同步队列的多租户隔离
 * 3. 验证增量同步和冲突检测
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTenantDb } from '@/lib/db/tenant-db';

// Mock Prisma client
vi.mock('@/lib/db', () => ({
  db: {
    syncLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    syncQueue: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    file: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('云同步系统 - 多租户隔离', () => {
  const tenantId1 = 'tenant-001';
  const tenantId2 = 'tenant-002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SyncLog 同步日志模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockLogs = [
        { id: 'log-1', tenantId: tenantId1, status: 'success', type: 'upload' },
      ];
      
      const { db } = await import('@/lib/db');
      (db.syncLog.findMany as any).mockResolvedValue(mockLogs);

      const result = await tenantDb.syncLog.findMany({
        where: { status: 'success' },
        orderBy: { createdAt: 'desc' },
      });

      expect(db.syncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'success',
          }),
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual(mockLogs);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockLog = {
        id: 'log-1',
        tenantId: tenantId1,
        status: 'success',
        type: 'upload',
      };
      
      const { db } = await import('@/lib/db');
      (db.syncLog.create as any).mockResolvedValue(mockLog);

      const result = await tenantDb.syncLog.create({
        data: {
          status: 'success',
          type: 'upload',
        },
      });

      expect(db.syncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            status: 'success',
            type: 'upload',
          }),
        })
      );
      expect(result).toEqual(mockLog);
    });

    it('不同租户的同步日志应该互相隔离', async () => {
      const tenantDb1 = createTenantDb(tenantId1);
      const tenantDb2 = createTenantDb(tenantId2);
      
      const { db } = await import('@/lib/db');
      (db.syncLog.findMany as any).mockResolvedValue([]);

      await tenantDb1.syncLog.findMany();
      await tenantDb2.syncLog.findMany();

      expect(db.syncLog.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId1 }),
        })
      );

      expect(db.syncLog.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId2 }),
        })
      );
    });
  });

  describe('SyncQueue 同步队列模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockQueue = [
        { id: 'queue-1', tenantId: tenantId1, fileId: 'file-1', status: 'pending' },
      ];
      
      const { db } = await import('@/lib/db');
      (db.syncQueue.findMany as any).mockResolvedValue(mockQueue);

      const result = await tenantDb.syncQueue.findMany({
        where: { status: 'pending' },
      });

      expect(db.syncQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'pending',
          }),
        })
      );
      expect(result).toEqual(mockQueue);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockQueueItem = {
        id: 'queue-1',
        tenantId: tenantId1,
        fileId: 'file-1',
        status: 'pending',
      };
      
      const { db } = await import('@/lib/db');
      (db.syncQueue.create as any).mockResolvedValue(mockQueueItem);

      const result = await tenantDb.syncQueue.create({
        data: {
          fileId: 'file-1',
          status: 'pending',
        },
      });

      expect(db.syncQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            fileId: 'file-1',
            status: 'pending',
          }),
        })
      );
      expect(result).toEqual(mockQueueItem);
    });

    it('createMany 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockResult = { count: 3 };
      
      const { db } = await import('@/lib/db');
      (db.syncQueue.createMany as any).mockResolvedValue(mockResult);

      const result = await tenantDb.syncQueue.createMany({
        data: [
          { fileId: 'file-1', status: 'pending' },
          { fileId: 'file-2', status: 'pending' },
          { fileId: 'file-3', status: 'pending' },
        ],
      });

      expect(db.syncQueue.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId: tenantId1 }),
          ]),
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('deleteMany 应该只删除当前租户的队列项', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.syncQueue.deleteMany as any).mockResolvedValue({ count: 5 });

      await tenantDb.syncQueue.deleteMany({
        where: { status: 'completed' },
      });

      expect(db.syncQueue.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'completed',
          }),
        })
      );
    });
  });

  describe('增量同步验证', () => {
    it('文件查询应该按租户隔离', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFiles = [
        { id: 'file-1', tenantId: tenantId1, updatedAt: new Date() },
      ];
      
      const { db } = await import('@/lib/db');
      (db.file.findMany as any).mockResolvedValue(mockFiles);

      const since = new Date('2024-01-01');
      const result = await tenantDb.file.findMany({
        where: {
          updatedAt: { gte: since },
          isDeleted: false,
        },
      });

      expect(db.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            updatedAt: { gte: since },
            isDeleted: false,
          }),
        })
      );
      expect(result).toEqual(mockFiles);
    });

    it('count 应该只统计当前租户的待同步文件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.syncQueue.count as any).mockResolvedValue(12);

      const result = await tenantDb.syncQueue.count({
        where: { status: 'pending' },
      });

      expect(db.syncQueue.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            status: 'pending',
          }),
        })
      );
      expect(result).toBe(12);
    });
  });
});
