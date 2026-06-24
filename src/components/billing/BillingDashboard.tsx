'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Crown, HardDrive, Sparkles, CreditCard, FileText, ArrowRight, Clock } from 'lucide-react';

interface SubscriptionInfo {
  plan: string;
  planName: string;
  planDescription: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd?: boolean;
}

interface UsageInfo {
  storage: {
    used: string;
    quota: string;
    percentage: number;
  };
  ai: {
    used: number;
    quota: number;
    percentage: number;
  };
}

interface TrialInfo {
  isTrial: boolean;
  trialEndsAt: string | null;
  daysLeft: number;
}

interface BillingDashboardProps {
  onUpgradeClick?: () => void;
  onOrdersClick?: () => void;
}

export function BillingDashboard({ onUpgradeClick, onOrdersClick }: BillingDashboardProps) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/billing/subscription');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setUsage(data.usage);
        setTrial(data.trial);
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytesStr: string) => {
    const bytes = BigInt(bytesStr);
    const mb = Number(bytes) / (1024 * 1024);
    if (mb >= 1024) {
      const gb = mb / 1024;
      if (gb >= 1024) {
        return `${(gb / 1024).toFixed(2)} TB`;
      }
      return `${gb.toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  const formatCurrency = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      past_due: 'bg-yellow-100 text-yellow-800',
    };
    return variants[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      active: '活跃',
      cancelled: '已取消',
      past_due: '逾期',
    };
    return texts[status] || status;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-20 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 当前订阅状态 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Crown className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {subscription?.planName || '免费版'}
                </CardTitle>
                <CardDescription>
                  {subscription?.planDescription || '基础功能完全免费'}
                </CardDescription>
              </div>
            </div>
            <Badge className={getStatusBadge(subscription?.status || 'active')}>
              {getStatusText(subscription?.status || 'active')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* 存储配额 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  存储空间
                </span>
                <span className="font-medium">
                  {formatBytes(usage?.storage.used || '0')} / {formatBytes(usage?.storage.quota || '0')}
                </span>
              </div>
              <Progress value={usage?.storage.percentage || 0} className="h-2" />
              <p className="text-xs text-muted-foreground">
                已使用 {usage?.storage.percentage || 0}%
              </p>
            </div>

            {/* AI配额 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  AI 使用次数
                </span>
                <span className="font-medium">
                  {usage?.ai.used || 0} / {usage?.ai.quota || 0} 次/天
                </span>
              </div>
              <Progress value={usage?.ai.percentage || 0} className="h-2" />
              <p className="text-xs text-muted-foreground">
                已使用 {usage?.ai.percentage || 0}%
              </p>
            </div>

            {/* 到期时间 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>计费周期</span>
              </div>
              <div className="font-medium">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : '永久免费'}
              </div>
              {subscription?.cancelAtPeriodEnd && (
                <p className="text-xs text-yellow-600">
                  已取消，到期后失效
                </p>
              )}
            </div>
          </div>

          {/* 试用提示 */}
          {trial?.isTrial && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-600" />
                <span className="font-medium text-yellow-800">
                  专业版试用中
                </span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                还剩 {trial.daysLeft} 天试用期，试用期结束后将自动降级为免费版
              </p>
            </div>
          )}

          {/* 快捷操作 */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={onUpgradeClick} className="gap-2">
              <CreditCard className="h-4 w-4" />
              升级套餐
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={onOrdersClick} className="gap-2">
              <FileText className="h-4 w-4" />
              查看订单
            </Button>
            {subscription?.status === 'active' && subscription.plan !== 'free' && (
              <Button variant="outline" className="gap-2">
                管理订阅
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 功能特性 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">当前套餐功能</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                {formatBytes(usage?.storage.quota || '0')} 存储
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                {usage?.ai.quota || 0} 次AI/天
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full ${subscription?.plan !== 'free' ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">高级搜索</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded-full ${subscription?.plan === 'enterprise' ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">优先支持</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
