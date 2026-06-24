/**
 * 管理后台服务
 * 用于运营后台的数据查询和管理
 */

import { db } from "@/lib/db";
import { PLANS } from "../billing/subscription";

// ==================== 仪表盘统计 ====================

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  paidTenants: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalStorage: bigint;
  totalFiles: number;
  newTenantsThisMonth: number;
}

/**
 * 获取仪表盘统计数据
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // 租户统计
  const totalTenants = await db.tenant.count();
  const activeTenants = await db.tenant.count({
    where: { status: 'active' },
  });
  const paidTenants = await db.tenant.count({
    where: {
      status: 'active',
      plan: { not: 'free' },
    },
  });
  const newTenantsThisMonth = await db.tenant.count({
    where: {
      createdAt: { gte: thisMonth },
    },
  });

  // 收入统计
  const paidOrders = await db.order.findMany({
    where: { status: 'paid' },
    select: { amount: true, createdAt: true },
  });
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);
  const monthlyRevenue = paidOrders
    .filter(o => o.createdAt >= thisMonth)
    .reduce((sum, o) => sum + o.amount, 0);

  // 存储统计
  const tenants = await db.tenant.findMany({
    select: { storageUsed: true },
  });
  const totalStorage = tenants.reduce((sum, t) => sum + t.storageUsed, BigInt(0));

  // 文件统计
  const totalFiles = await db.file.count({
    where: { isDeleted: false },
  });

  return {
    totalTenants,
    activeTenants,
    paidTenants,
    totalRevenue,
    monthlyRevenue,
    totalStorage,
    totalFiles,
    newTenantsThisMonth,
  };
}

// ==================== 租户管理 ====================

export interface TenantListItem {
  id: string;
  name: string;
  plan: string;
  status: string;
  storageUsed: bigint;
  storageQuota: bigint;
  aiUsed: number;
  aiQuota: number;
  createdAt: Date;
  userCount: number;
}

/**
 * 获取租户列表
 */
export async function getTenantList(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    status?: string;
    plan?: string;
    search?: string;
  }
): Promise<{
  tenants: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.plan) {
    where.plan = filters.plan;
  }
  if (filters?.search) {
    where.name = {
      contains: filters.search,
    };
  }

  const skip = (page - 1) * pageSize;

  const [tenants, total] = await Promise.all([
    db.tenant.findMany({
      where,
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.tenant.count({ where }),
  ]);

  return {
    tenants: tenants.map(t => ({
      id: t.id,
      name: t.name,
      plan: t.plan,
      status: t.status,
      storageUsed: t.storageUsed,
      storageQuota: t.storageQuota,
      aiUsed: t.aiUsed,
      aiQuota: t.aiQuota,
      createdAt: t.createdAt,
      userCount: t._count.users,
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * 获取租户详情
 */
export async function getTenantDetail(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        include: {
          user: true,
        },
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: {
        select: {
          files: true,
          folders: true,
        },
      },
    },
  });

  if (!tenant) {
    return null;
  }

  return {
    ...tenant,
    planInfo: PLANS[tenant.plan] || PLANS.free,
  };
}

/**
 * 更新租户状态
 */
export async function updateTenantStatus(
  tenantId: string,
  status: 'active' | 'suspended' | 'cancelled'
) {
  return db.tenant.update({
    where: { id: tenantId },
    data: { status },
  });
}

/**
 * 更新租户套餐
 */
export async function updateTenantPlan(tenantId: string, planId: string) {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  return db.tenant.update({
    where: { id: tenantId },
    data: {
      plan: planId,
      storageQuota: plan.features.storageQuota,
      aiQuota: plan.features.aiQuota,
    },
  });
}

// ==================== 订单管理 ====================

/**
 * 获取订单列表
 */
export async function getOrderList(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    status?: string;
    payMethod?: string;
    search?: string;
  }
): Promise<{
  orders: any[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.payMethod) {
    where.payMethod = filters.payMethod;
  }
  if (filters?.search) {
    where.OR = [
      { orderNo: { contains: filters.search } },
      { tenant: { name: { contains: filters.search } } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        tenant: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  return {
    orders,
    total,
    page,
    pageSize,
  };
}

/**
 * 获取订单详情
 */
export async function getOrderDetail(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      tenant: true,
      subscription: true,
    },
  });
}

// ==================== 系统监控 ====================

/**
 * 获取系统概览
 */
export async function getSystemOverview() {
  const [totalUsers, totalFiles, totalFolders, totalSyncLogs] = await Promise.all([
    db.user.count(),
    db.file.count(),
    db.folder.count(),
    db.syncLog.count(),
  ]);

  return {
    totalUsers,
    totalFiles,
    totalFolders,
    totalSyncLogs,
  };
}

/**
 * 获取最近的同步日志
 */
export async function getRecentSyncLogs(limit: number = 20) {
  return db.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      tenant: {
        select: { name: true },
      },
    },
  });
}
