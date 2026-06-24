'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, FileText, HardDrive, DollarSign, TrendingUp, Activity } from 'lucide-react';

interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  paidTenants: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalStorage: string;
  totalFiles: number;
  newTenantsThisMonth: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  const formatBytes = (bytes: bigint) => {
    const gb = Number(bytes) / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  if (loading) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">管理后台</h1>
        <p className="text-muted-foreground">系统概览与数据统计</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总租户数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTenants || 0}</div>
            <p className="text-xs text-muted-foreground">
              活跃 {stats?.activeTenants || 0} · 付费 {stats?.paidTenants || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月收入</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.monthlyRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">
              总收入 {formatCurrency(stats?.totalRevenue || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总存储量</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalStorage || '0 GB'}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalFiles || 0} 个文件
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">本月新增</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.newTenantsThisMonth || 0}</div>
            <p className="text-xs text-muted-foreground">
              新增租户
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">租户管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">查看和管理所有租户</p>
            <Button variant="outline" className="w-full">
              进入租户管理
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">订单管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">查看和处理所有订单</p>
            <Button variant="outline" className="w-full">
              进入订单管理
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">系统设置</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">配置系统参数</p>
            <Button variant="outline" className="w-full">
              进入系统设置
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
