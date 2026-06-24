/**
 * 多租户数据隔离测试
 * 
 * 测试目标：
 * 1. 验证tenant-db层的多租户隔离
 * 2. 验证不同租户的数据不会互相泄露
 * 3. 验证创建数据时自动带上tenantId
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTenantDb } from '@/lib/db/tenant-db';

// Mock Prisma client
vi.mock('@/lib/db', () => ({
  db: {
    file: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    folder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('多租户数据隔离 - TenantDb', () => {
  const tenantId1 = 'tenant-001';
  const tenantId2 = 'tenant-002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File 模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFiles = [{ id: 'file-1', tenantId: tenantId1, fileName: 'test.txt' }];
      
      const { db } = await import('@/lib/db');
      (db.file.findMany as any).mockResolvedValue(mockFiles);

      const result = await tenantDb.file.findMany({
        where: { isDeleted: false },
      });

      expect(db.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            isDeleted: false,
          }),
        })
      );
      expect(result).toEqual(mockFiles);
    });

    it('findFirst 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFile = { id: 'file-1', tenantId: tenantId1, fileName: 'test.txt' };
      
      const { db } = await import('@/lib/db');
      (db.file.findFirst as any).mockResolvedValue(mockFile);

      const result = await tenantDb.file.findFirst({
        where: { id: 'file-1' },
      });

      expect(db.file.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            id: 'file-1',
          }),
        })
      );
      expect(result).toEqual(mockFile);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFile = { id: 'file-1', tenantId: tenantId1, fileName: 'test.txt' };
      
      const { db } = await import('@/lib/db');
      (db.file.create as any).mockResolvedValue(mockFile);

      const result = await tenantDb.file.create({
        data: {
          fileName: 'test.txt',
          userId: 'user-1',
        },
      });

      expect(db.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            fileName: 'test.txt',
            userId: 'user-1',
          }),
        })
      );
      expect(result).toEqual(mockFile);
    });

    it('不同租户的 tenantDb 实例应该互相隔离', async () => {
      const tenantDb1 = createTenantDb(tenantId1);
      const tenantDb2 = createTenantDb(tenantId2);
      
      const { db } = await import('@/lib/db');
      (db.file.findMany as any).mockResolvedValue([]);

      await tenantDb1.file.findMany();
      await tenantDb2.file.findMany();

      // 验证第一个调用使用 tenantId1
      expect(db.file.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId1 }),
        })
      );

      // 验证第二个调用使用 tenantId2
      expect(db.file.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenantId2 }),
        })
      );
    });
  });

  describe('Folder 模型', () => {
    it('findMany 应该自动添加 tenantId 过滤条件', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFolders = [{ id: 'folder-1', tenantId: tenantId1, name: '测试文件夹' }];
      
      const { db } = await import('@/lib/db');
      (db.folder.findMany as any).mockResolvedValue(mockFolders);

      const result = await tenantDb.folder.findMany();

      expect(db.folder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
          }),
        })
      );
      expect(result).toEqual(mockFolders);
    });

    it('create 应该自动带上 tenantId', async () => {
      const tenantDb = createTenantDb(tenantId1);
      const mockFolder = { id: 'folder-1', tenantId: tenantId1, name: '测试文件夹' };
      
      const { db } = await import('@/lib/db');
      (db.folder.create as any).mockResolvedValue(mockFolder);

      const result = await tenantDb.folder.create({
        data: {
          name: '测试文件夹',
          userId: 'user-1',
        },
      });

      expect(db.folder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: tenantId1,
            name: '测试文件夹',
            userId: 'user-1',
          }),
        })
      );
      expect(result).toEqual(mockFolder);
    });
  });

  describe('数据隔离验证', () => {
    it('updateMany 应该只更新当前租户的数据', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.file.updateMany as any).mockResolvedValue({ count: 5 });

      await tenantDb.file.updateMany({
        where: { folderId: 'folder-1' },
        data: { folderId: 'folder-2' },
      });

      expect(db.file.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            folderId: 'folder-1',
          }),
        })
      );
    });

    it('deleteMany 应该只删除当前租户的数据', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.file.deleteMany as any).mockResolvedValue({ count: 3 });

      await tenantDb.file.deleteMany({
        where: { isDeleted: true },
      });

      expect(db.file.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            isDeleted: true,
          }),
        })
      );
    });

    it('count 应该只统计当前租户的数据', async () => {
      const tenantDb = createTenantDb(tenantId1);
      
      const { db } = await import('@/lib/db');
      (db.file.count as any).mockResolvedValue(42);

      const result = await tenantDb.file.count({
        where: { isDeleted: false },
      });

      expect(db.file.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenantId1,
            isDeleted: false,
          }),
        })
      );
      expect(result).toBe(42);
    });
  });
});
