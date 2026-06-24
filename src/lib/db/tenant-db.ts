/**
 * 租户数据访问层
 * 
 * 封装常用的数据库操作，自动注入tenantId过滤条件
 * 确保数据隔离在底层强制实现，不靠程序员自觉
 * 
 * 使用方式：
 *   const tenantDb = createTenantDb(tenantId);
 *   const files = await tenantDb.file.findMany({ where: { folderId } });
 *   // 自动添加 tenantId: tenantId 过滤条件
 */
import { PrismaClient } from '@prisma/client';
import { db } from './index';

/**
 * 租户数据库访问类
 * 封装所有业务表的CRUD操作，自动添加tenantId过滤
 */
export class TenantDb {
  private tenantId: string;
  private prisma: PrismaClient;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.prisma = db;
  }

  /**
   * 获取当前租户ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * 执行事务
   */
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * 原始Prisma客户端（谨慎使用）
   */
  get raw(): PrismaClient {
    return this.prisma;
  }

  // ==================== File 相关操作 ====================

  get file() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.file.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.file.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findUnique: (args: any) => {
        return prisma.file.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.file.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      createMany: (args: any) => {
        const data = Array.isArray(args.data) 
          ? args.data.map((item: any) => ({ ...item, tenantId }))
          : { ...args.data, tenantId };
        return prisma.file.createMany({
          ...args,
          data,
        });
      },

      update: (args: any) => {
        return prisma.file.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      updateMany: (args: any) => {
        return prisma.file.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      delete: (args: any) => {
        return prisma.file.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.file.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.file.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      aggregate: (args: any) => {
        return prisma.file.aggregate({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== Folder 相关操作 ====================

  get folder() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.folder.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.folder.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findUnique: (args: any) => {
        return prisma.folder.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.folder.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      createMany: (args: any) => {
        const data = Array.isArray(args.data) 
          ? args.data.map((item: any) => ({ ...item, tenantId }))
          : { ...args.data, tenantId };
        return prisma.folder.createMany({
          ...args,
          data,
        });
      },

      update: (args: any) => {
        return prisma.folder.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      updateMany: (args: any) => {
        return prisma.folder.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      delete: (args: any) => {
        return prisma.folder.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.folder.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.folder.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== FileVersion 相关操作 ====================
  // 注意：FileVersion表没有tenantId字段，通过关联File表过滤

  get fileVersion() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.fileVersion.findMany({
          ...args,
          where: {
            ...args.where,
            file: {
              tenantId,
            },
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.fileVersion.findFirst({
          ...args,
          where: {
            ...args.where,
            file: {
              tenantId,
            },
          },
        });
      },

      create: (args: any) => {
        return prisma.fileVersion.create(args);
      },

      createMany: (args: any) => {
        return prisma.fileVersion.createMany(args);
      },

      deleteMany: (args: any = {}) => {
        return prisma.fileVersion.deleteMany({
          ...args,
          where: {
            ...args.where,
            file: {
              tenantId,
            },
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.fileVersion.count({
          ...args,
          where: {
            ...args.where,
            file: {
              tenantId,
            },
          },
        });
      },
    };
  }

  // ==================== FileEmbedding 相关操作 ====================

  get fileEmbedding() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.fileEmbedding.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.fileEmbedding.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      upsert: (args: any) => {
        return prisma.fileEmbedding.upsert({
          ...args,
          create: {
            ...args.create,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.fileEmbedding.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      createMany: (args: any) => {
        const data = Array.isArray(args.data) 
          ? args.data.map((item: any) => ({ ...item, tenantId }))
          : { ...args.data, tenantId };
        return prisma.fileEmbedding.createMany({
          ...args,
          data,
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.fileEmbedding.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.fileEmbedding.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== FaceGroup 相关操作 ====================

  get faceGroup() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.faceGroup.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.faceGroup.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.faceGroup.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      createMany: (args: any) => {
        const data = Array.isArray(args.data) 
          ? args.data.map((item: any) => ({ ...item, tenantId }))
          : { ...args.data, tenantId };
        return prisma.faceGroup.createMany({
          ...args,
          data,
        });
      },

      update: (args: any) => {
        return prisma.faceGroup.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.faceGroup.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.faceGroup.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== FaceInstance 相关操作 ====================

  get faceInstance() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.faceInstance.findMany({
          ...args,
          where: {
            ...args.where,
            faceGroup: {
              tenantId,
            },
          },
        });
      },

      create: (args: any) => {
        return prisma.faceInstance.create(args);
      },

      deleteMany: (args: any = {}) => {
        return prisma.faceInstance.deleteMany({
          ...args,
          where: {
            ...args.where,
            faceGroup: {
              tenantId,
            },
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.faceInstance.count({
          ...args,
          where: {
            ...args.where,
            faceGroup: {
              tenantId,
            },
          },
        });
      },
    };
  }

  // ==================== FileShare 相关操作 ====================

  get fileShare() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.fileShare.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.fileShare.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.fileShare.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.fileShare.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.fileShare.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.fileShare.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== SyncLog 相关操作 ====================

  get syncLog() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.syncLog.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          orderBy: args.orderBy || { createdAt: 'desc' },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.syncLog.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.syncLog.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.syncLog.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.syncLog.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.syncLog.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== SyncQueue 相关操作 ====================

  get syncQueue() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.syncQueue.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          orderBy: args.orderBy || { createdAt: 'asc' },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.syncQueue.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.syncQueue.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      createMany: (args: any) => {
        const data = Array.isArray(args.data) 
          ? args.data.map((item: any) => ({ ...item, tenantId }))
          : { ...args.data, tenantId };
        return prisma.syncQueue.createMany({
          ...args,
          data,
        });
      },

      update: (args: any) => {
        return prisma.syncQueue.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      deleteMany: (args: any = {}) => {
        return prisma.syncQueue.deleteMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      count: (args: any = {}) => {
        return prisma.syncQueue.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== Order 相关操作 ====================

  get order() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.order.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          orderBy: args.orderBy || { createdAt: 'desc' },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.order.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findUnique: (args: any) => {
        return prisma.order.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      create: (args: any) => {
        return prisma.order.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.order.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      count: (args: any = {}) => {
        return prisma.order.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== Subscription 相关操作 ====================

  get subscription() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findMany: (args: any = {}) => {
        return prisma.subscription.findMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      findFirst: (args: any = {}) => {
        return prisma.subscription.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          orderBy: args.orderBy || { createdAt: 'desc' },
        });
      },

      create: (args: any) => {
        return prisma.subscription.create({
          ...args,
          data: {
            ...args.data,
            tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.subscription.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },

      count: (args: any = {}) => {
        return prisma.subscription.count({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },
    };
  }

  // ==================== Tenant 相关操作（只读） ====================

  get tenant() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findUnique: (args: any = {}) => {
        return prisma.tenant.findUnique({
          ...args,
          where: {
            ...args.where,
            id: tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.tenant.update({
          ...args,
          where: {
            ...args.where,
            id: tenantId,
          },
        });
      },
    };
  }

  // ==================== StorageConfig 相关操作 ====================

  get storageConfig() {
    const tenantId = this.tenantId;
    const prisma = this.prisma;
    return {
      findFirst: (args: any = {}) => {
        return prisma.storageConfig.findFirst({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
        });
      },

      upsert: (args: any) => {
        return prisma.storageConfig.upsert({
          ...args,
          create: {
            ...args.create,
            tenantId,
          },
        });
      },

      update: (args: any) => {
        return prisma.storageConfig.updateMany({
          ...args,
          where: {
            ...args.where,
            tenantId,
          },
          data: args.data,
        });
      },
    };
  }
}

/**
 * 创建租户数据库访问实例
 * @param tenantId 租户ID
 * @returns TenantDb实例
 */
export function createTenantDb(tenantId: string): TenantDb {
  return new TenantDb(tenantId);
}

/**
 * 原始Prisma客户端（用于管理后台等需要跨租户操作的场景）
 * 谨慎使用！
 */
export { db as rawDb };
