'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Building2, FileText, FolderOpen, HardDrive } from 'lucide-react';

interface SystemSettings {
  system: {
    totalUsers: number;
    totalTenants: number;
    totalFiles: number;
    totalFolders: number;
    totalStorage: string;
  };
  plans: Array<{
    id: string;
    name: string;
    price: number;
    interval: string;
    features: any;
  }>;
  storage: {
    defaultQuota: string;
    defaultAiQuota: number;
  };
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  const formatBytes = (bytesStr: string) => {
    const bytes = BigInt(bytesStr);
    const gb = Number(bytes) / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  const getPlanIntervalText = (interval: string) => {
    const texts: Record<string, string> = {
      month: '月',
      year: '年',
      lifetime: '终身',
    };
    return texts[interval] || interval;
  };

  if (loading) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground">系统配置与套餐管理</p>
      </div>

      {/* 系统概览 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">系统概览</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总用户数</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{settings?.system.totalUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总租户数</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{settings?.system.totalTenants || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总文件数</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{settings?.system.totalFiles || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总文件夹数</CardTitle>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{settings?.system.totalFolders || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">总存储量</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {settings?.system.totalStorage ? formatBytes(settings.system.totalStorage) : '0 GB'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 套餐配置 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">套餐配置</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {settings?.plans.map((plan) => (
            <Card key={plan.id} className="relative">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  <Badge variant="secondary" className="text-base">
                    {formatCurrency(plan.price)}/{getPlanIntervalText(plan.interval)}
                  </Badge>
                </CardTitle>
                <CardDescription>套餐ID: {plan.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">存储配额</span>
                    <span className="font-medium">{formatBytes(plan.features.storageQuota.toString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AI配额</span>
                    <span className="font-medium">{plan.features.aiQuota} 次/月</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">文件数量</span>
                    <span className="font-medium">{plan.features.maxFiles || '无限制'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">用户数量</span>
                    <span className="font-medium">{plan.features.maxUsers || '无限制'}</span>
                  </div>
                  {plan.features.advancedSearch && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">高级搜索</span>
                      <Badge className="bg-green-100 text-green-800">支持</Badge>
                    </div>
                  )}
                  {plan.features.faceRecognition && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">人脸识别</span>
                      <Badge className="bg-green-100 text-green-800">支持</Badge>
                    </div>
                  )}
                  {plan.features.prioritySupport && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">优先支持</span>
                      <Badge className="bg-green-100 text-green-800">支持</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 存储配置 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">存储配置</h2>
        <Card>
          <CardHeader>
            <CardTitle>默认存储配置</CardTitle>
            <CardDescription>新注册用户的默认配额</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="text-sm font-medium">默认存储配额</div>
                <div className="text-2xl font-bold">
                  {settings?.storage.defaultQuota ? formatBytes(settings.storage.defaultQuota) : '0 GB'}
                </div>
                <p className="text-sm text-muted-foreground">
                  免费版用户的初始存储空间
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">默认AI配额</div>
                <div className="text-2xl font-bold">
                  {settings?.storage.defaultAiQuota || 0} 次/月
                </div>
                <p className="text-sm text-muted-foreground">
                  免费版用户的每月AI使用次数
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
