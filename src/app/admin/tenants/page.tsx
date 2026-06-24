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
import { Search, Eye, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  plan: string;
  status: string;
  storageUsed: bigint;
  storageQuota: bigint;
  aiUsed: number;
  aiQuota: number;
  createdAt: string;
  userCount: number;
}

interface TenantDetail extends Tenant {
  users: any[];
  subscriptions: any[];
  orders: any[];
  planInfo: any;
  _count: {
    files: number;
    folders: number;
  };
}

export default function AdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newPlan, setNewPlan] = useState<string>('');

  useEffect(() => {
    fetchTenants();
  }, [page, statusFilter, planFilter]);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('plan', planFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/admin/tenants?${params}`);
      const data = await res.json();
      setTenants(data.tenants || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      const data = await res.json();
      setSelectedTenant(data);
      setDetailDialogOpen(true);
    } catch (error) {
      console.error('Failed to fetch tenant detail:', error);
    }
  };

  const updateTenantStatus = async () => {
    if (!selectedTenant || !newStatus) return;
    try {
      await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatusDialogOpen(false);
      fetchTenants();
      fetchTenantDetail(selectedTenant.id);
    } catch (error) {
      console.error('Failed to update tenant status:', error);
    }
  };

  const updateTenantPlan = async () => {
    if (!selectedTenant || !newPlan) return;
    try {
      await fetch(`/api/admin/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan }),
      });
      setPlanDialogOpen(false);
      fetchTenants();
      fetchTenantDetail(selectedTenant.id);
    } catch (error) {
      console.error('Failed to update tenant plan:', error);
    }
  };

  const formatBytes = (bytes: bigint) => {
    const gb = Number(bytes) / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return variants[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      active: '活跃',
      suspended: '已暂停',
      cancelled: '已取消',
    };
    return texts[status] || status;
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
    fetchTenants();
  };

  if (loading && tenants.length === 0) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">租户管理</h1>
        <p className="text-muted-foreground">查看和管理所有租户</p>
      </div>

      {/* 筛选和搜索 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <Input
                placeholder="搜索租户名称..."
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
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="suspended">已暂停</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="套餐筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部套餐</SelectItem>
                  <SelectItem value="free">免费版</SelectItem>
                  <SelectItem value="basic">基础版</SelectItem>
                  <SelectItem value="pro">专业版</SelectItem>
                  <SelectItem value="enterprise">企业版</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchTenants}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 租户列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>租户名称</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>存储使用</TableHead>
                <TableHead>AI使用</TableHead>
                <TableHead>用户数</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>{getPlanText(tenant.plan)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadge(tenant.status)} variant="secondary">
                      {getStatusText(tenant.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatBytes(tenant.storageUsed)} / {formatBytes(tenant.storageQuota)}
                  </TableCell>
                  <TableCell>
                    {tenant.aiUsed} / {tenant.aiQuota}
                  </TableCell>
                  <TableCell>{tenant.userCount}</TableCell>
                  <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => fetchTenantDetail(tenant.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {tenants.length === 0 && (
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

      {/* 租户详情对话框 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>租户详情</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">租户名称：</span>
                    <span>{selectedTenant.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">当前套餐：</span>
                    <span>{getPlanText(selectedTenant.plan)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">状态：</span>
                    <Badge className={getStatusBadge(selectedTenant.status)} variant="secondary">
                      {getStatusText(selectedTenant.status)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">创建时间：</span>
                    <span>{new Date(selectedTenant.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 配额信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-3">配额信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">存储使用：</span>
                    <span>{formatBytes(selectedTenant.storageUsed)} / {formatBytes(selectedTenant.storageQuota)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">AI使用：</span>
                    <span>{selectedTenant.aiUsed} / {selectedTenant.aiQuota} 次</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">文件数量：</span>
                    <span>{selectedTenant._count?.files || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">文件夹数量：</span>
                    <span>{selectedTenant._count?.folders || 0}</span>
                  </div>
                </div>
              </div>

              {/* 用户列表 */}
              <div>
                <h3 className="text-lg font-semibold mb-3">用户列表 ({selectedTenant.users?.length || 0})</h3>
                <div className="space-y-2">
                  {selectedTenant.users?.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span>{u.user?.name || u.user?.email || '未知用户'}</span>
                      <span className="text-sm text-muted-foreground">{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">修改状态</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>修改租户状态</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">活跃</SelectItem>
                          <SelectItem value="suspended">已暂停</SelectItem>
                          <SelectItem value="cancelled">已取消</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={updateTenantStatus} className="w-full">
                        确认修改
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">变更套餐</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>变更租户套餐</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Select value={newPlan} onValueChange={setNewPlan}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择套餐" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免费版</SelectItem>
                          <SelectItem value="basic">基础版</SelectItem>
                          <SelectItem value="pro">专业版</SelectItem>
                          <SelectItem value="enterprise">企业版</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={updateTenantPlan} className="w-full">
                        确认变更
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
