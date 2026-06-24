"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Shield, Lock, Eye, EyeOff, Monitor, MapPin, Clock, Trash2 } from "lucide-react";

// 密码强度等级
type PasswordStrength = "weak" | "fair" | "good" | "strong" | "very-strong";

// 登录会话
interface LoginSession {
  id: string;
  device: string;
  browser: string;
  os: string;
  ip: string;
  location?: string;
  lastActive: string;
  isCurrent: boolean;
}

export function SecuritySettings() {
  const { user } = useAppStore();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // 密码表单
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // 计算密码强度
  const getPasswordStrength = (password: string): PasswordStrength => {
    let score = 0;

    // 长度
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // 复杂度
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 2) return "weak";
    if (score <= 3) return "fair";
    if (score <= 4) return "good";
    if (score <= 5) return "strong";
    return "very-strong";
  };

  // 获取密码强度颜色
  const getPasswordStrengthColor = (strength: PasswordStrength): string => {
    const colors: Record<PasswordStrength, string> = {
      weak: "bg-red-500",
      fair: "bg-orange-500",
      good: "bg-yellow-500",
      strong: "bg-green-500",
      "very-strong": "bg-emerald-500",
    };
    return colors[strength];
  };

  // 获取密码强度文字
  const getPasswordStrengthText = (strength: PasswordStrength): string => {
    const texts: Record<PasswordStrength, string> = {
      weak: "弱",
      fair: "一般",
      good: "良好",
      strong: "强",
      "very-strong": "非常强",
    };
    return texts[strength];
  };

  // 处理密码输入变化
  const handlePasswordChange = (field: string, value: string) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  // 修改密码
  const handleChangePassword = async () => {
    // 验证
    if (!passwordForm.currentPassword) {
      toast({
        title: "请输入当前密码",
        variant: "destructive",
      });
      return;
    }

    if (!passwordForm.newPassword) {
      toast({
        title: "请输入新密码",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        title: "密码长度不足",
        description: "密码至少需要8个字符",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "两次密码不一致",
        description: "请确认新密码输入正确",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.ok) {
        toast({
          title: "密码修改成功",
          description: "请使用新密码重新登录",
        });
        // 清空表单
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        const data = await response.json();
        throw new Error(data.error || "修改失败");
      }
    } catch (error: any) {
      toast({
        title: "修改失败",
        description: error.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // 加载登录会话
  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const response = await fetch("/api/user/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data || []);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoadingSessions(false);
    }
  };

  // 退出其他会话
  const handleLogoutOtherSessions = async () => {
    try {
      const response = await fetch("/api/user/sessions/other", {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "已退出其他设备",
          description: "其他设备的登录已失效",
        });
        loadSessions();
      }
    } catch (error) {
      toast({
        title: "操作失败",
        variant: "destructive",
      });
    }
  };

  // 退出单个会话
  const handleLogoutSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/user/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "已退出该设备",
        });
        loadSessions();
      }
    } catch (error) {
      toast({
        title: "操作失败",
        variant: "destructive",
      });
    }
  };

  // 加载会话列表
  useEffect(() => {
    loadSessions();
  }, []);

  const newPasswordStrength = getPasswordStrength(passwordForm.newPassword);

  return (
    <div className="space-y-6">
      {/* 修改密码 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            修改密码
          </CardTitle>
          <CardDescription>
            定期修改密码可以提高账户安全性
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 当前密码 */}
          <div className="space-y-2">
            <Label htmlFor="current-password">当前密码</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showPassword ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                placeholder="请输入当前密码"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div className="space-y-2">
            <Label htmlFor="new-password">新密码</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                placeholder="请输入新密码"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* 密码强度指示器 */}
            {passwordForm.newPassword && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full ${
                        level <=
                        { weak: 1, fair: 2, good: 3, strong: 4, "very-strong": 5 }[
                          newPasswordStrength
                        ]
                          ? getPasswordStrengthColor(newPasswordStrength)
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  密码强度：{getPasswordStrengthText(newPasswordStrength)}
                </p>
              </div>
            )}

            {/* 密码要求 */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>密码要求：</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li className={passwordForm.newPassword.length >= 8 ? "text-green-500" : ""}>
                  至少 8 个字符
                </li>
                <li className={/[A-Z]/.test(passwordForm.newPassword) ? "text-green-500" : ""}>
                  包含大写字母
                </li>
                <li className={/[0-9]/.test(passwordForm.newPassword) ? "text-green-500" : ""}>
                  包含数字
                </li>
                <li className={/[^a-zA-Z0-9]/.test(passwordForm.newPassword) ? "text-green-500" : ""}>
                  包含特殊字符
                </li>
              </ul>
            </div>
          </div>

          {/* 确认新密码 */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">确认新密码</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                placeholder="请再次输入新密码"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {passwordForm.confirmPassword &&
              passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-xs text-red-500">两次密码输入不一致</p>
              )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changingPassword}
            className="w-full sm:w-auto"
          >
            {changingPassword ? "修改中..." : "修改密码"}
          </Button>
        </CardContent>
      </Card>

      {/* 登录会话 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              登录设备
            </CardTitle>
            <CardDescription>
              管理你的登录会话和设备
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogoutOtherSessions}
            disabled={sessions.filter((s) => !s.isCurrent).length === 0}
          >
            退出其他设备
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-48 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无登录会话记录
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-4 p-3 rounded-lg border"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Monitor className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{session.device}</span>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-xs">
                          当前设备
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {session.ip}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.lastActive}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {session.browser} · {session.os}
                    </div>
                  </div>
                  {!session.isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleLogoutSession(session.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 安全提示 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            安全建议
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              使用强密码，包含大小写字母、数字和特殊字符
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              定期更换密码，建议每 3-6 个月更换一次
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              不要在多个网站使用相同的密码
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              定期检查登录设备，及时退出不使用的设备
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
