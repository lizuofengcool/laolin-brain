'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Zap, Crown, Building2 } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
    yearlyDiscount: number;
  };
  features: {
    storageQuota: bigint;
    aiQuota: number;
    maxUsers: number;
    versionHistory: boolean;
    advancedSearch: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
    apiAccess: boolean;
  };
}

interface PlanComparisonProps {
  currentPlanId?: string;
  onSelectPlan?: (planId: string, interval: 'month' | 'year') => void;
}

export function PlanComparison({ currentPlanId, onSelectPlan }: PlanComparisonProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/billing/plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
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
      return `${(gb / 1024).toFixed(0)}TB`;
    }
    return `${gb.toFixed(0)}GB`;
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free':
        return <Zap className="h-6 w-6" />;
      case 'pro':
        return <Crown className="h-6 w-6" />;
      case 'enterprise':
        return <Building2 className="h-6 w-6" />;
      default:
        return <Zap className="h-6 w-6" />;
    }
  };

  const getPlanColor = (planId: string) => {
    switch (planId) {
      case 'free':
        return 'text-gray-600 bg-gray-100';
      case 'pro':
        return 'text-blue-600 bg-blue-100';
      case 'enterprise':
        return 'text-purple-600 bg-purple-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const featureList = [
    { key: 'storageQuota', label: '存储空间', format: (v: any) => formatBytes(v) },
    { key: 'aiQuota', label: 'AI 使用次数', format: (v: any) => `${v} 次/天` },
    { key: 'maxUsers', label: '用户数量', format: (v: any) => v === 0 ? '无限制' : `${v} 人` },
    { key: 'versionHistory', label: '版本历史', format: (v: any) => v ? '✓' : '✗' },
    { key: 'advancedSearch', label: '高级搜索', format: (v: any) => v ? '✓' : '✗' },
    { key: 'prioritySupport', label: '优先支持', format: (v: any) => v ? '✓' : '✗' },
    { key: 'customBranding', label: '自定义品牌', format: (v: any) => v ? '✓' : '✗' },
    { key: 'apiAccess', label: 'API 访问', format: (v: any) => v ? '✓' : '✗' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-1/2 mb-2" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-10 bg-muted rounded" />
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="h-4 bg-muted rounded" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 计费周期切换 */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-lg bg-muted p-1">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              billingInterval === 'month'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setBillingInterval('month')}
          >
            按月付费
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              billingInterval === 'year'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setBillingInterval('year')}
          >
            按年付费
            <Badge className="ml-2 bg-green-100 text-green-800 text-xs">
              省 17%
            </Badge>
          </button>
        </div>
      </div>

      {/* 套餐卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = plan.id === currentPlanId;
          const price = billingInterval === 'month' ? plan.price.monthly : plan.price.yearly;
          const pricePerMonth = billingInterval === 'year' ? plan.price.yearly / 12 : plan.price.monthly;

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                isCurrentPlan ? 'border-primary ring-2 ring-primary/20' : ''
              } ${plan.id === 'pro' ? 'md:scale-105 md:shadow-lg' : ''}`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    当前套餐
                  </Badge>
                </div>
              )}
              {plan.id === 'pro' && (
                <div className="absolute -top-3 right-4">
                  <Badge className="bg-orange-500 text-white">
                    最受欢迎
                  </Badge>
                </div>
              )}

              <CardHeader>
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4 ${getPlanColor(plan.id)}`}>
                  {getPlanIcon(plan.id)}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      {formatCurrency(billingInterval === 'month' ? price : pricePerMonth)}
                    </span>
                    <span className="text-muted-foreground">/月</span>
                  </div>
                  {billingInterval === 'year' && (
                    <p className="text-sm text-muted-foreground mt-1">
                      按年付费 {formatCurrency(plan.price.yearly)}/年
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {featureList.map((feature) => {
                    const value = (plan.features as any)[feature.key];
                    const isEnabled = typeof value === 'boolean' ? value : true;

                    return (
                      <div key={feature.key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{feature.label}</span>
                        <span className={isEnabled ? 'text-foreground' : 'text-muted-foreground'}>
                          {typeof value === 'boolean' ? (
                            value ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-gray-300" />
                            )
                          ) : (
                            feature.format(value)
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrentPlan ? 'outline' : 'default'}
                  disabled={isCurrentPlan}
                  onClick={() => onSelectPlan?.(plan.id, billingInterval)}
                >
                  {isCurrentPlan ? '当前套餐' : plan.id === 'free' ? '免费使用' : '立即升级'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* 常见问题 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">常见问题</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-1">可以随时升级或降级吗？</h4>
            <p className="text-sm text-muted-foreground">
              是的，您可以随时升级或降级套餐。升级时立即生效，降级将在当前计费周期结束后生效。
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">支持哪些支付方式？</h4>
            <p className="text-sm text-muted-foreground">
              目前支持支付宝、微信支付和 Stripe 支付。企业版还支持对公转账。
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">可以退款吗？</h4>
            <p className="text-sm text-muted-foreground">
              7天内未使用核心功能可申请全额退款。超过7天或已使用核心功能的，按剩余天数比例退款。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
