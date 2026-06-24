'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, HardDrive, DollarSign, TrendingUp, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { useRouter } from 'next/navigation';

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

// 模拟图表数据
const revenueData = [
  { name: '1月', revenue: 12000 },
  { name: '2月', revenue: 15000 },
  { name: '3月', revenue: 18000 },
  { name: '4月', revenue: 22000 },
  { name: '5月', revenue: 28000 },
  { name: '6月', revenue: 35000 },
];

const tenantGrowthData = [
  { name: '1月', tenants: 45 },
  { name: '2月', tenants: 62 },
  { name: '3月', tenants: 78 },
  { name: '4月', tenants: 95 },
  { name: '5月', tenants: 120 },
  { name: '6月', tenants: 156 },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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

  const navigateTo = (path: string) => {
    router.push(path);
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
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/tenants')}>
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
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/orders')}>
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
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/settings')}>
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
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/tenants')}>
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

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>收入趋势</CardTitle>
            <CardDescription>近6个月收入统计</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`¥${value.toFixed(2)}`, '收入']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>租户增长</CardTitle>
            <CardDescription>近6个月租户增长趋势</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tenantGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [value, '租户数量']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                  />
                  <Bar dataKey="tenants" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/tenants')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                租户管理
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">查看和管理所有租户，支持状态管理和套餐变更</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/orders')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                订单管理
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">查看和处理所有订单，支持多维度筛选</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigateTo('/admin/settings')}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                系统设置
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">查看系统配置和套餐信息</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
