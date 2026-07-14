'use client';

import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingDashboard } from './BillingDashboard';
import { PlanComparison } from './PlanComparison';
import { OrderHistory } from './OrderHistory';
import { Crown, CreditCard, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BillingCenterProps {
  defaultTab?: string;
}

export function BillingCenter({ defaultTab = 'overview' }: BillingCenterProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  // currentPlanId 初始为 'free'，BillingDashboard 挂载后通过 onPlanLoaded 回调
  // 把真实订阅套餐回传上来（避免本组件再发一次 /api/billing/subscription 请求）。
  const [currentPlanId, setCurrentPlanId] = useState<string>('free');

  const handleUpgradeClick = () => {
    setActiveTab('plans');
  };

  const handleOrdersClick = () => {
    setActiveTab('orders');
  };

  // BillingDashboard 拉到订阅信息后回传真实 plan，驱动 PlanComparison 的「当前套餐」高亮
  const handlePlanLoaded = useCallback((plan: string) => {
    setCurrentPlanId(plan);
  }, []);

  // handleSelectPlan 由 PlanComparison 触发，分两种场景：
  //   1. free 套餐按钮：未走支付，需 POST /api/billing/subscription 直接降级
  //   2. 付费套餐：PaymentDialog.onSuccess 已确认支付成功，订阅经支付回调
  //      handlePaymentCallback → createSubscription 在服务端更新完毕，
  //      客户端只需刷新本地状态 + 提示用户。
  const handleSelectPlan = async (planId: string, interval: 'month' | 'year') => {
    if (planId === 'free') {
      try {
        const res = await fetch('/api/billing/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, interval }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          toast({
            title: '切换套餐失败',
            description: data.error || '请稍后重试',
            variant: 'destructive',
          });
          return;
        }
        setCurrentPlanId('free');
        toast({
          title: '已切换到免费版',
          description: '订阅已更新，将在当前计费周期结束后生效。',
        });
        setActiveTab('overview');
      } catch (error) {
        console.error('切换套餐失败:', error);
        toast({
          title: '切换套餐失败',
          description: '网络错误，请稍后重试',
          variant: 'destructive',
        });
      }
      return;
    }

    // 付费套餐：支付回调已更新服务端订阅
    setCurrentPlanId(planId);
    toast({
      title: '套餐升级成功',
      description: '您的订阅已更新，感谢您的支持！',
    });
    setActiveTab('overview');
  };

  const handleBackToOverview = () => {
    setActiveTab('overview');
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {/* Tab Navigation */}
      <TabsList className="w-full grid grid-cols-3 mb-6">
        <TabsTrigger value="overview" className="gap-1.5">
          <Crown className="h-4 w-4" />
          <span className="hidden sm:inline">订阅概览</span>
          <span className="sm:hidden">概览</span>
        </TabsTrigger>
        <TabsTrigger value="plans" className="gap-1.5">
          <CreditCard className="h-4 w-4" />
          <span className="hidden sm:inline">套餐升级</span>
          <span className="sm:hidden">套餐</span>
        </TabsTrigger>
        <TabsTrigger value="orders" className="gap-1.5">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">订单历史</span>
          <span className="sm:hidden">订单</span>
        </TabsTrigger>
      </TabsList>

      {/* Tab 1: 订阅概览 */}
      <TabsContent value="overview">
        <BillingDashboard
          onUpgradeClick={handleUpgradeClick}
          onOrdersClick={handleOrdersClick}
          onPlanLoaded={handlePlanLoaded}
        />
      </TabsContent>

      {/* Tab 2: 套餐升级 */}
      <TabsContent value="plans">
        <PlanComparison
          currentPlanId={currentPlanId}
          onSelectPlan={handleSelectPlan}
        />
      </TabsContent>

      {/* Tab 3: 订单历史 */}
      <TabsContent value="orders">
        <OrderHistory onBack={handleBackToOverview} />
      </TabsContent>
    </Tabs>
  );
}
