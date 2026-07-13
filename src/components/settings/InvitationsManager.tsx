"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserPlus, RefreshCw, Mail, Clock, X } from "lucide-react";

/**
 * 邀请管理（团队 Tab）
 *
 * 消费后端邀请 API（均需 owner/admin 权限，由后端 403 兜底）：
 *   - GET    /api/invitations          列表（分页，支持 status 按状态筛选；
 *                                        owner/admin 可调）
 *   - POST   /api/invitations          创建邀请（email + role，默认 72h 有效）
 *   - DELETE /api/invitations/[id]     撤销（仅 pending，软撤销 status='revoked'）
 *   - POST   /api/invitations/[id]/resend  重发（刷新有效期，复用原 token）
 *
 * 权限：前端不持有当前用户角色，故不做客户端门控；GET 返回 403 时显示
 * 「没有权限管理邀请」提示，由后端作为权限唯一真源。
 */

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: Invitation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  member: "成员",
  viewer: "访客",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "待接受", className: "bg-yellow-100 text-yellow-800" },
  accepted: { label: "已接受", className: "bg-green-100 text-green-800" },
  revoked: { label: "已撤销", className: "bg-gray-100 text-gray-600" },
  expired: { label: "已过期", className: "bg-red-100 text-red-800" },
};

// 状态筛选选项：消费后端 GET /api/invitations 的 status 查询参数（route.ts 行 24/51-53）。
// 标签带「仅」前缀以区别于列表中状态徽章文案（避免 getByText 误匹配），并表达
// 「只看该状态」的过滤语义。空值 = 全部。
// 注：后端按存储的 status 字段过滤；行内「已过期」徽章在 pending 且过期时客户端计算，
// 与 status=expired（后端已标记过期）同标签，但两者均可被 status=expired 命中。
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "仅待接受" },
  { value: "accepted", label: "仅已接受" },
  { value: "revoked", label: "仅已撤销" },
  { value: "expired", label: "仅已过期" },
];

const PAGE_SIZE = 10;

export function InvitationsManager() {
  const token = useAppStore((s) => s.token);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // forbidden: 当前用户非 owner/admin，后端 GET 返回 403
  const [forbidden, setForbidden] = useState(false);

  // 创建表单
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // 行级操作状态：记录正在处理的邀请 id，禁用按钮防止重复点击
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // 状态筛选：空值 = 全部（不传 status 参数）
  const [statusFilter, setStatusFilter] = useState("");

  const fetchList = useCallback(async (p: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setActionMsg(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/invitations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setForbidden(true);
        setInvitations([]);
        setTotal(0);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "获取邀请列表失败");
      }
      const data: ListResponse = await res.json();
      setForbidden(false);
      setInvitations(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取邀请列表失败");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    fetchList(page);
  }, [page, fetchList]);

  // 状态筛选即时生效：切换后重置到第一页。setStatusFilter 改变 fetchList 标识，
  // 触发 useEffect 重新拉取；若当前已在第一页，fetchList 变化仍会触发 refetch。
  // 若在第二页切换筛选，setPage(1) 使其回到第一页（与 setRoleFilter 同批合并，
  // 单次 re-render 单次 refetch，无 page=2&newStatus 中间态请求）。
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    if (page !== 1) setPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setCreateMsg("邮箱不能为空");
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "创建邀请失败");
      }
      setCreateMsg(`已向 ${trimmed} 发送邀请`);
      setEmail("");
      // 新建后回到第一页并刷新，确保新邀请可见
      if (page !== 1) {
        setPage(1);
      } else {
        fetchList(1);
      }
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : "创建邀请失败");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, emailAddr: string) => {
    if (!token) return;
    if (!window.confirm(`确定撤销发送给 ${emailAddr} 的邀请吗？撤销后该邀请链接将失效。`)) {
      return;
    }
    setPendingAction(id);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/invitations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "撤销邀请失败");
      }
      // 先刷新列表再设置成功消息：fetchList 内部会 setActionMsg(null) 清空旧消息，
      // 若在刷新前设置会被立即清掉，用户永远看不到成功反馈。await 后再设置即可保留。
      await fetchList(page);
      setActionMsg(`已撤销 ${emailAddr} 的邀请`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "撤销邀请失败");
    } finally {
      setPendingAction(null);
    }
  };

  const handleResend = async (id: string, emailAddr: string) => {
    if (!token) return;
    setPendingAction(id);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/invitations/${id}/resend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "重发邀请失败");
      }
      // 同 handleRevoke：先 await 刷新列表，再设置成功消息，避免被 fetchList 清空。
      await fetchList(page);
      setActionMsg(`已重新发送 ${emailAddr} 的邀请，有效期已刷新`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "重发邀请失败");
    } finally {
      setPendingAction(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 未登录：设置页本身在鉴权后渲染，此为兜底
  if (!token) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-6 text-sm text-muted-foreground">
          请先登录后管理团队邀请。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          团队邀请
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 创建邀请 */}
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              placeholder="被邀请人邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              disabled={forbidden || creating}
            />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "admin" | "member" | "viewer")}
              disabled={forbidden || creating}
            >
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="member">成员</SelectItem>
                <SelectItem value="viewer">访客</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={forbidden || creating || !email.trim()}>
              <Mail className="h-4 w-4" />
              {creating ? "发送中..." : "发送邀请"}
            </Button>
          </div>
          {createMsg && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              {createMsg}
            </div>
          )}
        </form>

        {/* 权限提示 */}
        {forbidden && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            没有权限管理邀请，仅租户所有者 / 管理员可操作。
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <X className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* 行级操作反馈 */}
        {actionMsg && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <X className="h-3.5 w-3.5" />
            {actionMsg}
          </div>
        )}

        {/* 列表 */}
        {!forbidden && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <select
                  aria-label="按状态筛选"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                >
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">
                  共 {total} 条邀请
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchList(page)}
                disabled={loading}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>有效期</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => {
                    const isPending = inv.status === "pending";
                    const status = STATUS_BADGE[inv.status] || {
                      label: inv.status,
                      className: "bg-gray-100 text-gray-800",
                    };
                    const expired = isPending && new Date(inv.expiresAt).getTime() < Date.now();
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium break-all">{inv.email}</TableCell>
                        <TableCell>{ROLE_LABELS[inv.role] || inv.role}</TableCell>
                        <TableCell>
                          <Badge className={status.className} variant="secondary">
                            {expired ? "已过期" : status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.expiresAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResend(inv.id, inv.email)}
                                disabled={pendingAction === inv.id}
                              >
                                重发
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRevoke(inv.id, inv.email)}
                                disabled={pendingAction === inv.id}
                              >
                                撤销
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {invitations.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        暂无邀请记录
                      </TableCell>
                    </TableRow>
                  )}
                  {loading && invitations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  第 {page} / {totalPages} 页
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
