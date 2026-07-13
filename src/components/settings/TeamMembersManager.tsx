"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, RefreshCw, Search, UserCog, Trash2, Clock, X } from "lucide-react";

/**
 * 团队成员管理（团队 Tab）
 *
 * 消费后端租户用户 API（均由后端做权限兜底）：
 *   - GET    /api/tenant/users          列表（分页 + search 按 name/email 模糊匹配 +
 *                                        role 按角色筛选；owner/admin 可调）
 *   - PATCH  /api/tenant/users/[id]     修改用户角色（owner 独有；不能改自己）
 *   - DELETE /api/tenant/users/[id]     移除用户（owner/admin；不能移除自己 / 所有者）
 *
 * 权限：前端不持有当前用户角色，故不做客户端门控；GET 返回 403 时显示
 * 「没有权限查看成员列表」提示，由后端作为权限唯一真源。客户端仅按 user.id
 * 禁用「自己」行的操作按钮（UX 友好，后端另有 targetUserId === userId 兜底）。
 *
 * 角色变更采用「修改角色 → 行内 Select 选择 → 保存」两步式，避免误触直接降级。
 * 变更下拉不含 owner：转让所有权为高危操作，不在普通下拉暴露（后端 PATCH
 * 白名单含 owner，但 UI 不提供入口，与 InvitationsManager 创建表单约定一致）。
 */

interface Member {
  // 后端返回的 id 即 user.id（PATCH/DELETE URL 的 [id] 参数）
  id: string;
  name: string;
  email: string;
  role: string; // 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: string;
  createdAt: string;
}

interface ListResponse {
  data: Member[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
  viewer: "访客",
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  owner: { label: "所有者", className: "bg-purple-100 text-purple-800" },
  admin: { label: "管理员", className: "bg-blue-100 text-blue-800" },
  member: { label: "成员", className: "bg-green-100 text-green-800" },
  viewer: { label: "访客", className: "bg-gray-100 text-gray-700" },
};

// 可变更的目标角色：不含 owner（转让所有权为高危操作，不在普通下拉暴露）
const CHANGEABLE_ROLES: { value: "admin" | "member" | "viewer"; label: string }[] = [
  { value: "admin", label: "管理员" },
  { value: "member", label: "成员" },
  { value: "viewer", label: "访客" },
];

// 角色筛选选项：消费后端 GET 的 role 查询参数（route.ts 行 24/51-53）。
// 标签带「仅」前缀以区别于列表中角色徽章文案（避免 getByText 误匹配），并表达
// 「只看该角色」的过滤语义。空值 = 全部。
const ROLE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部角色" },
  { value: "owner", label: "仅所有者" },
  { value: "admin", label: "仅管理员" },
  { value: "member", label: "仅成员" },
  { value: "viewer", label: "仅访客" },
];

const PAGE_SIZE = 10;

export function TeamMembersManager() {
  const token = useAppStore((s) => s.token);
  const currentUserId = useAppStore((s) => s.user?.id ?? null);

  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // forbidden: 当前用户非 owner/admin，后端 GET 返回 403
  const [forbidden, setForbidden] = useState(false);

  // 搜索：searchInput 为输入框值，searchApplied 为已提交并生效的搜索词
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  // 角色筛选：空值 = 全部（不传 role 参数）
  const [roleFilter, setRoleFilter] = useState("");

  // 行级操作状态
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // 行内角色编辑：记录正在编辑角色的成员 id；同时缓存待保存的角色
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<"admin" | "member" | "viewer">("member");

  const fetchList = useCallback(async (p: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setActionMsg(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (searchApplied.trim()) params.set("search", searchApplied.trim());
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch(`/api/tenant/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setForbidden(true);
        setMembers([]);
        setTotal(0);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "获取成员列表失败");
      }
      const data: ListResponse = await res.json();
      setForbidden(false);
      setMembers(data.data || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取成员列表失败");
    } finally {
      setLoading(false);
    }
  }, [token, searchApplied, roleFilter]);

  useEffect(() => {
    fetchList(page);
  }, [page, fetchList]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed === searchApplied.trim()) {
      // 搜索词未变，仍强制刷新当前页
      if (page === 1) fetchList(1);
      else setPage(1);
      return;
    }
    setSearchApplied(trimmed);
    if (page !== 1) setPage(1);
    else fetchList(1);
  };

  // 角色筛选即时生效：切换后重置到第一页。setRoleFilter 改变 fetchList 标识，
  // 触发 useEffect 重新拉取；若当前已在第一页，setPage(1) 不变但 fetchList 变化
  // 仍会触发 refetch。若在第三页切换筛选，setPage(1) 使其回到第一页。
  const handleRoleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(e.target.value);
    if (page !== 1) setPage(1);
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    // 初值取当前角色（owner 不进入编辑，这里类型已收敛到 admin/member/viewer）
    setDraftRole(member.role === "owner" ? "member" : (member.role as "admin" | "member" | "viewer"));
    setActionMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftRole("member");
  };

  const handleChangeRole = async (member: Member) => {
    if (!token) return;
    const newRole = draftRole;
    setEditingId(null);
    if (newRole === member.role) {
      // 未变更，不发起请求
      return;
    }
    setPendingAction(member.id);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tenant/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "修改角色失败");
      }
      // 先刷新列表再设置成功消息：fetchList 内部会 setActionMsg(null) 清空旧消息，
      // 若在刷新前设置会被立即清掉。await 后再设置即可保留。
      await fetchList(page);
      setActionMsg(`已将 ${member.email} 的角色改为 ${ROLE_LABELS[newRole]}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "修改角色失败");
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!token) return;
    if (!window.confirm(`确定从团队移除 ${member.email} 吗？移除后该用户将无法访问本租户。`)) {
      return;
    }
    setPendingAction(member.id);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/tenant/users/${member.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "移除成员失败");
      }
      // 同 handleChangeRole：先 await 刷新列表，再设置成功消息，避免被 fetchList 清空。
      await fetchList(page);
      setActionMsg(`已移除 ${member.email}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "移除成员失败");
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
          请先登录后管理团队成员。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          团队成员
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 搜索 + 角色筛选 */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <Input
            type="text"
            placeholder="按姓名或邮箱搜索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1"
            disabled={forbidden}
          />
          <select
            aria-label="按角色筛选"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            value={roleFilter}
            onChange={handleRoleFilterChange}
            disabled={forbidden}
          >
            {ROLE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={forbidden || loading}>
            <Search className="h-4 w-4" />
            搜索
          </Button>
        </form>

        {/* 权限提示 */}
        {forbidden && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            没有权限查看成员列表，仅租户所有者 / 管理员可操作。
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
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                共 {total} 名成员
              </p>
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
                    <TableHead>姓名</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>加入时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const isOwner = m.role === "owner";
                    const isSelf = m.id === currentUserId;
                    const badge = ROLE_BADGE[m.role] || {
                      label: m.role,
                      className: "bg-gray-100 text-gray-800",
                    };
                    const isEditing = editingId === m.id;
                    const isPending = pendingAction === m.id;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium break-all">{m.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.name || "—"}
                        </TableCell>
                        <TableCell>
                          {isOwner ? (
                            <Badge className={badge.className} variant="secondary">
                              {badge.label}
                            </Badge>
                          ) : isEditing ? (
                            <div className="flex items-center gap-1">
                              <Select
                                value={draftRole}
                                onValueChange={(v) => setDraftRole(v as "admin" | "member" | "viewer")}
                              >
                                <SelectTrigger className="h-8 w-[110px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHANGEABLE_ROLES.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <Badge className={badge.className} variant="secondary">
                              {badge.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {isOwner ? (
                            <span className="text-sm text-muted-foreground">—</span>
                          ) : isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleChangeRole(m)}
                                disabled={isPending}
                              >
                                保存
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEdit}
                                disabled={isPending}
                              >
                                取消
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(m)}
                                disabled={isSelf || isPending}
                              >
                                <UserCog className="h-3.5 w-3.5" />
                                修改角色
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemove(m)}
                                disabled={isSelf || isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                移除
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {members.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        暂无成员
                      </TableCell>
                    </TableRow>
                  )}
                  {loading && members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
