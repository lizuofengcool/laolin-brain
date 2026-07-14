'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Eye, RefreshCw, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { PaymentDialog } from './PaymentDialog';

interface Order {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  payMethod: string;
  plan: string;
  interval: string;
  createdAt: string;
  payTime?: string;
  transactionId?: string;
}

interface OrderHistoryProps {
  onBack?: () => void;
}

export function OrderHistory({ onBack }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  // 取消订单确认弹窗 + 提交中状态。仅 pending 订单显示「取消订单」按钮，
  // 点击后弹 AlertDialog 二次确认 → POST /api/billing/orders/:id/cancel。
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // 立即支付：复用 PaymentDialog 并透传 reuseOrderId 复用既有 pending 订单。
  // 点击后关闭详情弹窗，以选中订单的 plan/interval/amount 打开 PaymentDialog。
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/billing/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `¥${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return variants[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      failed: '支付失败',
      refunded: '已退款',
      cancelled: '已取消',
    };
    return texts[status] || status;
  };

  const getPayMethodText = (method: string) => {
    const texts: Record<string, string> = {
      alipay: '支付宝',
      wechat: '微信支付',
      stripe: 'Stripe',
      manual: '手动充值',
    };
    return texts[method] || method;
  };

  const getPlanText = (plan: string) => {
    const texts: Record<string, string> = {
      free: '免费版',
      basic: '基础版',
      pro: '专业版',
      enterprise: '企业版',
    };
    return texts[plan] || plan;
  };

  const getIntervalText = (interval: string) => {
    const texts: Record<string, string> = {
      month: '月付',
      year: '年付',
    };
    return texts[interval] || interval;
  };

  const totalPages = Math.ceil(total / pageSize);

  const viewOrderDetail = (order: Order) => {
    setSelectedOrder(order);
    setDetailDialogOpen(true);
  };

  // 立即支付：关闭详情弹窗，以选中订单的 plan/interval/amount 打开 PaymentDialog。
  // 透传 reuseOrderId=order.id，PaymentDialog → /api/payment/create 走 reusePendingOrder
  // 复用既有 pending 订单，而非 createOrder 新建（避免原订单悬挂）。
  const handlePayNow = (order: Order) => {
    setPayOrder(order);
    setDetailDialogOpen(false);
    setPayDialogOpen(true);
  };

  // 取消订单：仅 pending 订单可取消。服务端 cancelOrder 按 id+tenantId 定位，
  // 跨租户 orderId 不会命中 → 返回 400「订单不存在」。
  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/billing/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast({
          title: '取消订单失败',
          description: data.error || '请稍后重试',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: '订单已取消',
        description: `订单 ${selectedOrder.orderNo} 已取消。`,
      });
      setCancelDialogOpen(false);
      setDetailDialogOpen(false);
      await fetchOrders();
    } catch (error) {
      console.error('取消订单失败:', error);
      toast({
        title: '取消订单失败',
        description: '网络错误，请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-1/4" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和筛选 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold">订单历史</h2>
            <p className="text-sm text-muted-foreground">查看您的所有订单记录</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待支付</SelectItem>
              <SelectItem value="paid">已支付</SelectItem>
              <SelectItem value="failed">支付失败</SelectItem>
              <SelectItem value="refunded">已退款</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchOrders}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 订单列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>周期</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>支付方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.orderNo}</TableCell>
                  <TableCell>{getPlanText(order.plan)}</TableCell>
                  <TableCell>{getIntervalText(order.interval)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(order.amount)}</TableCell>
                  <TableCell>{getPayMethodText(order.payMethod)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadge(order.status)} variant="secondary">
                      {getStatusText(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => viewOrderDetail(order)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">暂无订单记录</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {total} 条记录
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = i + 1;
                if (totalPages > 5 && page > 3) {
                  pageNum = page - 2 + i;
                  if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                }
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setPage(pageNum)}
                      isActive={page === pageNum}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* 订单详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>订单详情</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* 订单信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-3">订单信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">订单号：</span>
                    <span className="font-mono">{selectedOrder.orderNo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">金额：</span>
                    <span className="font-medium">{formatCurrency(selectedOrder.amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">状态：</span>
                    <Badge className={getStatusBadge(selectedOrder.status)} variant="secondary">
                      {getStatusText(selectedOrder.status)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">支付方式：</span>
                    <span>{getPayMethodText(selectedOrder.payMethod)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">套餐：</span>
                    <span>{getPlanText(selectedOrder.plan)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">周期：</span>
                    <span>{getIntervalText(selectedOrder.interval)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">创建时间：</span>
                    <span>{new Date(selectedOrder.createdAt).toLocaleString()}</span>
                  </div>
                  {selectedOrder.payTime && (
                    <div>
                      <span className="text-muted-foreground">支付时间：</span>
                      <span>{new Date(selectedOrder.payTime).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedOrder.transactionId && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">交易号：</span>
                      <span className="font-mono text-xs">{selectedOrder.transactionId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              {selectedOrder.status === 'pending' && (
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={() => handlePayNow(selectedOrder)}>立即支付</Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={cancelling}
                  >
                    取消订单
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 取消订单确认弹窗 */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
        if (!cancelling) setCancelDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消订单？</AlertDialogTitle>
            <AlertDialogDescription>
              订单 {selectedOrder?.orderNo} 取消后无法恢复，如需购买请重新下单。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>再想想</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelOrder}
              disabled={cancelling}
            >
              {cancelling ? '处理中…' : '确认取消'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 立即支付：复用 PaymentDialog，透传 reuseOrderId 复用既有 pending 订单 */}
      {payOrder && (
        <PaymentDialog
          open={payDialogOpen}
          onOpenChange={(open) => setPayDialogOpen(open)}
          planId={payOrder.plan}
          planName={getPlanText(payOrder.plan)}
          interval={payOrder.interval as 'month' | 'year'}
          amount={payOrder.amount}
          reuseOrderId={payOrder.id}
          onSuccess={() => {
            // 支付成功后刷新订单列表（复用订单经回调变 paid 后会出现在列表中）
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
