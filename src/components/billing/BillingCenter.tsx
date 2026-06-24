'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingDashboard } from './BillingDashboard';
import { PlanComparison } from './PlanComparison';
import { OrderHistory } from './OrderHistory';
import { Crown, CreditCard, FileText } from 'lucide-react';

interface BillingCenterProps {
  defaultTab?: string;
}

export function BillingCenter({ defaultTab = 'overview' }: BillingCenterProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [currentPlanId, setCurrentPlanId] = useState<string>('free');

  const handleUpgradeClick = () => {
    setActiveTab('plans');
  };

  const handleOrdersClick = () => {
    setActiveTab('orders');
  };

  const handleSelectPlan = (planId: string, interval: 'month' | 'year') => {
    // TODO: 实现订阅/升级逻辑
    console.log('Select plan:', planId, interval);
    // 这里可以跳转到支付页面或者打开支付对话框
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
