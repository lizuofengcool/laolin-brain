"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Copy,
  Check,
  Link2,
  Lock,
  Clock,
  Share2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ShareDialogProps {
  file: {
    id: string;
    fileName: string;
  } | null;
  open: boolean;
  onClose: () => void;
}

interface ShareLink {
  id: string;
  token: string;
  shareUrl: string;
  expiresAt: string | null;
  password: boolean;
  createdAt: string;
}

export function ShareDialog({ file, open, onClose }: ShareDialogProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>("168");
  const [password, setPassword] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateShareLink = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${file.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresIn: parseInt(expiresIn),
          password: passwordEnabled ? password : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "创建分享链接失败");
      }

      const data = await res.json();
      const newLink: ShareLink = {
        id: data.id,
        token: data.token,
        shareUrl: data.shareUrl,
        expiresAt: data.expiresAt,
        password: passwordEnabled && !!password,
        createdAt: new Date().toISOString(),
      };
      setShareLinks((prev) => [newLink, ...prev]);
      setPassword("");
      setPasswordEnabled(false);
      toast({ title: "分享链接已创建", description: "点击复制按钮复制链接" });
    } catch (err) {
      toast({
        title: "创建失败",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [file, expiresIn, password, passwordEnabled]);

  const copyLink = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.shareUrl);
      setCopiedId(link.id);
      toast({ title: "已复制", description: "分享链接已复制到剪贴板" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = link.shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedId(link.id);
      toast({ title: "已复制", description: "分享链接已复制到剪贴板" });
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return "永久有效";
    const date = new Date(expiresAt);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) return "已过期";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours} 小时后过期`;
    const days = Math.floor(hours / 24);
    return `${days} 天后过期`;
  };

  const getExpiryLabel = (val: string) => {
    switch (val) {
      case "1": return "1 小时";
      case "24": return "1 天";
      case "168": return "7 天";
      case "720": return "30 天";
      case "0": return "永不过期";
      default: return `${val} 小时`;
    }
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            分享文件
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium truncate">{file.fileName}</p>
          </div>

          {/* Share settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                有效期
              </Label>
              <Select value={expiresIn} onValueChange={setExpiresIn}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 小时</SelectItem>
                  <SelectItem value="24">1 天</SelectItem>
                  <SelectItem value="168">7 天</SelectItem>
                  <SelectItem value="720">30 天</SelectItem>
                  <SelectItem value="0">永不过期</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm">
                <Lock className="h-4 w-4" />
                密码保护
              </Label>
              <Switch
                checked={passwordEnabled}
                onCheckedChange={setPasswordEnabled}
              />
            </div>

            {passwordEnabled && (
              <div className="space-y-2 pl-6">
                <Input
                  type="text"
                  placeholder="输入分享密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  访问者需要输入密码才能查看文件
                </p>
              </div>
            )}
          </div>

          {/* Generate button */}
          <Button
            className="w-full"
            onClick={generateShareLink}
            disabled={loading || (passwordEnabled && !password.trim())}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            生成分享链接
            <span className="text-xs opacity-70 ml-1">
              ({getExpiryLabel(expiresIn)})
            </span>
          </Button>

          {/* Active share links */}
          {shareLinks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  已分享 ({shareLinks.length})
                </Badge>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {shareLinks.map((link) => (
                  <div
                    key={link.id}
                    className="p-3 rounded-lg border bg-card flex items-center gap-2"
                  >
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono truncate text-muted-foreground">
                        {link.shareUrl}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatExpiry(link.expiresAt)}
                        </span>
                        {link.password && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            <Lock className="h-2.5 w-2.5 mr-0.5" />
                            已加密
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copyLink(link)}
                    >
                      {copiedId === link.id ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
