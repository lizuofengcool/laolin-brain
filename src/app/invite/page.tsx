"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoginForm } from "@/components/auth/LoginForm";
import { useAppStore } from "@/stores/app-store";
import {
  Mail,
  Users,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  LogIn,
  ArrowRight,
} from "lucide-react";

/**
 * 邀请接受页
 *
 * 邀请邮件中 inviteUrl 形如 `${baseUrl}/invite?token=${token}`，本页消费该 token：
 *   1. 未登录：内嵌 LoginForm，登录后自动加载邀请预览（无需跳转）。
 *   2. 已登录：GET /api/invitations/accept?token=xxx 预览邀请信息（团队名/角色/状态）。
 *   3. 预览通过（pending + 邮箱匹配）：展示"接受邀请"按钮 → POST 接受 → 成功页。
 *
 * 回跳记忆：当用户无法在本页立即接受（未登录 / 邮箱不匹配需切换账号）时，把当前
 * 邀请 URL 暂存到 sessionStorage（invite_redirect）；用户离开本页到根路径登录后，
 * LoginForm 读取并消费该值，router.push 回 /invite 继续接受流程。
 *
 * 安全：token 为 randomUUID，邮箱不匹配时禁用接受按钮并提示切换账号。
 */

type Preview =
  | {
      kind: "ok";
      tenantName: string;
      role: string;
      invitedEmail: string;
      status: string;
      expiresAt: string;
      emailMatches: boolean;
    }
  | { kind: "error"; message: string };

type Phase = "loading" | "unauth" | "ready" | "accepting" | "accepted";

// 邀请 token 为 randomUUID（UUIDv4）
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  member: "成员",
  viewer: "访客",
};

function authHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("kb_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function InvitePage() {
  const router = useRouter();
  const { isAuthenticated, hydrateAuth } = useAppStore();

  const [token, setToken] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acceptError, setAcceptError] = useState("");

  // 1) 挂载时：hydrate 认证 + 从 URL 读取 token
  useEffect(() => {
    hydrateAuth();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("token");
      if (!t || !TOKEN_RE.test(t)) {
        setTokenInvalid(true);
        setPhase("ready");
        return;
      }
      setToken(t);
    }
  }, [hydrateAuth]);

  // 2) 认证就绪且有合法 token → 拉取预览
  const fetchPreview = useCallback(async () => {
    if (!token) return;
    setPhase("loading");
    setPreview(null);
    try {
      const res = await fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`, {
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview({ kind: "error", message: data.error || "获取邀请信息失败" });
      } else {
        setPreview({
          kind: "ok",
          tenantName: data.tenantName,
          role: data.role,
          invitedEmail: data.invitedEmail,
          status: data.status,
          expiresAt: data.expiresAt,
          emailMatches: data.emailMatches,
        });
      }
    } catch {
      setPreview({ kind: "error", message: "网络错误，请稍后重试" });
    } finally {
      setPhase("ready");
    }
  }, [token]);

  useEffect(() => {
    // 仅在已认证且 token 合法时拉取（未认证交给内嵌 LoginForm）
    if (isAuthenticated && token) {
      fetchPreview();
    } else if (!isAuthenticated && token) {
      setPhase("unauth");
    }
  }, [isAuthenticated, token, fetchPreview]);

  // 邀请回跳记忆：用户无法在本页立即接受邀请时，把当前邀请 URL 暂存到
  // sessionStorage（key=invite_redirect），供 LoginForm 登录成功后回跳。
  //   - 无有效 token / 已接受：清理，避免后续登录误跳到无效或已接受的邀请
  //   - 未登录（可能离开本页去登录）或邮箱不匹配（需切换账号）：记忆回跳地址
  //   - 已登录且邮箱匹配（可立即接受）：清理，无需回跳
  // 说明：未登录时本页内嵌 LoginForm 可原地登录，回跳目标即当前页会被 LoginForm
  // 跳过；此记忆主要覆盖「离开 /invite 到根路径登录」与「切换账号」两类场景。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token || phase === "accepted") {
      sessionStorage.removeItem("invite_redirect");
      return;
    }
    const blocked = !isAuthenticated || (preview?.kind === "ok" && !preview.emailMatches);
    if (blocked) {
      sessionStorage.setItem("invite_redirect", `/invite?token=${token}`);
    } else {
      sessionStorage.removeItem("invite_redirect");
    }
  }, [token, phase, preview, isAuthenticated]);

  // 3) 接受邀请
  const handleAccept = async () => {
    if (!token) return;
    setAcceptError("");
    setPhase("accepting");
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAcceptError(data.error || "接受邀请失败");
        setPhase("ready");
        return;
      }
      setPhase("accepted");
    } catch {
      setAcceptError("网络错误，请稍后重试");
      setPhase("ready");
    }
  };

  // ── 渲染：无效 token ──
  if (tokenInvalid) {
    return (
      <CenteredCard>
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">无效的邀请链接</h1>
        <p className="text-sm text-muted-foreground">
          邀请链接缺少有效的令牌参数，请确认从邮件中点击完整链接进入。
        </p>
      </CenteredCard>
    );
  }

  // ── 渲染：未登录（内嵌 LoginForm）──
  if (phase === "unauth" || (!isAuthenticated && token)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
        <div className="max-w-md mx-auto px-4 pt-10">
          <Card className="mb-4 shadow-sm border-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">您收到一份团队邀请</p>
                <p className="text-xs text-muted-foreground">
                  登录或注册被邀请的邮箱账号后，即可在此页接受邀请。
                </p>
              </div>
            </CardContent>
          </Card>
          <LoginForm />
        </div>
      </div>
    );
  }

  // ── 渲染：加载中 ──
  if (phase === "loading" && !preview) {
    return (
      <CenteredCard>
        <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">正在加载邀请信息...</p>
      </CenteredCard>
    );
  }

  // ── 渲染：预览错误 ──
  if (preview?.kind === "error") {
    return (
      <CenteredCard>
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">无法查看邀请</h1>
        <p className="text-sm text-muted-foreground">{preview.message}</p>
      </CenteredCard>
    );
  }

  // ── 渲染：接受成功 ──
  if (phase === "accepted" && preview?.kind === "ok") {
    return (
      <CenteredCard>
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-xl font-bold">已成功加入团队</h1>
        <p className="text-sm text-muted-foreground">
          您已以「{ROLE_LABELS[preview.role] || preview.role}」身份加入
          <span className="font-medium text-foreground"> {preview.tenantName} </span>
        </p>
        <Button className="w-full" onClick={() => router.push("/")}>
          进入工作台
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CenteredCard>
    );
  }

  // ── 渲染：邀请预览 + 接受按钮 ──
  if (preview?.kind === "ok") {
    const expired = preview.status !== "pending";
    const canAccept = !expired && preview.emailMatches;

    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-xl font-bold">团队邀请</h1>
              <p className="text-sm text-muted-foreground">
                您被邀请加入团队
              </p>
              <p className="text-lg font-semibold">{preview.tenantName}</p>
            </div>

            <div className="space-y-3">
              <Row icon={<ShieldCheck className="h-4 w-4" />} label="角色">
                <Badge variant="secondary">
                  {ROLE_LABELS[preview.role] || preview.role}
                </Badge>
              </Row>
              <Row icon={<Mail className="h-4 w-4" />} label="被邀请邮箱">
                <span className="text-sm">{preview.invitedEmail}</span>
              </Row>
              <Row icon={<Clock className="h-4 w-4" />} label="有效期至">
                <span className="text-sm">
                  {new Date(preview.expiresAt).toLocaleString("zh-CN")}
                </span>
              </Row>
            </div>

            {expired && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  该邀请{preview.status === "accepted" ? "已被接受" : preview.status === "revoked" ? "已被撤销" : "已过期"}，无法再次接受。
                </span>
              </div>
            )}

            {!expired && !preview.emailMatches && (
              <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-500/10 p-3 rounded-md">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  此邀请属于 <span className="font-medium">{preview.invitedEmail}</span>，
                  当前登录账号不匹配。请退出后使用被邀请的邮箱登录。
                </span>
              </div>
            )}

            {acceptError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {acceptError}
              </div>
            )}

            {canAccept ? (
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={phase === "accepting"}
              >
                {phase === "accepting" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4 mr-2" />
                )}
                {phase === "accepting" ? "正在接受..." : "接受邀请"}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
                返回工作台
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              邀请通过加密令牌安全验证
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 兜底（理论上不会触达）
  return (
    <CenteredCard>
      <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
      <p className="text-sm text-muted-foreground">加载中...</p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardContent className="p-8 text-center space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </span>
      <div className="text-right min-w-0">{children}</div>
    </div>
  );
}
