'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Search, Eye, RefreshCw } from 'lucide-react';

interface Order {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  payMethod: string;
  plan: string;
  createdAt: string;
  tenant?: {
    name: string;
  };
}

interface OrderDetail extends Order {
  tenant?: any;
  subscription?: any;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payMethodFilter, setPayMethodFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter, payMethodFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (payMethodFilter !== 'all') params.append('payMethod', payMethodFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/admin/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      const data = await res.json();
      setSelectedOrder(data);
      setDetailDialogOpen(true);
    } catch (error) {
      console.error('Failed to fetch order detail:', error);
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
    };
    return variants[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      failed: '支付失败',
      refunded: '已退款',
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

  const totalPages = Math.ceil(total / pageSize);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  if (loading && orders.length === 0) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">订单管理</h1>
        <p className="text-muted-foreground">查看和处理所有订单</p>
      </div>

      {/* 筛选和搜索 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <Input
                placeholder="搜索订单号或租户名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-md"
              />
              <Button type="submit" variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </form>
            <div className="flex gap-2">
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
              <Select value={payMethodFilter} onValueChange={(v) => { setPayMethodFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="支付方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部方式</SelectItem>
                  <SelectItem value="alipay">支付宝</SelectItem>
                  <SelectItem value="wechat">微信支付</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="manual">手动充值</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchOrders}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 订单列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>租户</TableHead>
                <TableHead>套餐</TableHead>
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
                  <TableCell>{order.tenant?.name || '-'}</TableCell>
                  <TableCell>{getPlanText(order.plan)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(order.amount)}</TableCell>
                  <TableCell>{getPayMethodText(order.payMethod)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadge(order.status)} variant="secondary">
                      {getStatusText(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fetchOrderDetail(order.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-4">
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
          <div className="text-center text-sm text-muted-foreground mt-2">
            共 {total} 条，第 {page} / {totalPages} 页
          </div>
        </div>
      )}

      {/* 订单详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>订单详情</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* 基本信息 */}
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
                    <span className="text-muted-foreground">创建时间：</span>
                    <span>{new Date(selectedOrder.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 租户信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-3">租户信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">租户名称：</span>
                    <span>{selectedOrder.tenant?.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">租户ID：</span>
                    <span className="font-mono text-xs">{selectedOrder.tenant?.id || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 订阅信息 */}
              {selectedOrder.subscription && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">订阅信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">订阅ID：</span>
                      <span className="font-mono text-xs">{selectedOrder.subscription.id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">状态：</span>
                      <span>{selectedOrder.subscription.status}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">开始时间：</span>
                      <span>{new Date(selectedOrder.subscription.startDate).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">结束时间：</span>
                      <span>{new Date(selectedOrder.subscription.endDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
