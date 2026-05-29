"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  ExternalLink,
  Shield,
  CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getFileColor, formatSize, FileIconDisplay } from "@/lib/file-utils";
import { useAppStore } from "@/stores/app-store";

interface ShareDialogProps {
  file: {
    id: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
  } | null;
  open: boolean;
  onClose: () => void;
}

interface ShareResult {
  id: string;
  token: string;
  shareUrl: string;
  expiresAt: string | null;
  password: boolean;
}

const expiryOptions = [
  { value: "0", label: "永不过期", hours: 0 },
  { value: "1", label: "1 小时", hours: 1 },
  { value: "24", label: "1 天", hours: 24 },
  { value: "168", label: "7 天", hours: 168 },
  { value: "720", label: "30 天", hours: 720 },
] as const;

const formatExpiry = (expiresAt: string | null): string => {
  if (!expiresAt) return "永不过期";
  const date = new Date(expiresAt);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "已过期";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours} 小时后过期`;
  const days = Math.floor(hours / 24);
  return `${days} 天后过期`;
};

const formatExpiryDate = (expiresAt: string | null): string => {
  if (!expiresAt) return "无限制";
  return new Date(expiresAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Animation variants for step transitions
const stepVariants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function ShareDialog({ file, open, onClose }: ShareDialogProps) {
  const [step, setStep] = useState<"settings" | "result">("settings");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState("168");
  const [password, setPassword] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);

  // Reset state when dialog opens or file changes
  useEffect(() => {
    if (open) {
      setStep("settings");
      setLoading(false);
      setError(null);
      setPassword("");
      setPasswordEnabled(false);
      setCopied(false);
      setShareResult(null);
    }
  }, [open, file]);

  const generateShareLink = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/${file.id}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${useAppStore.getState().token}`,
        },
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
      setShareResult({
        id: data.id,
        token: data.token,
        shareUrl: data.shareUrl,
        expiresAt: data.expiresAt,
        password: passwordEnabled && !!password,
      });
      setStep("result");
      toast({ title: "分享链接已创建", description: "链接已生成，点击复制分享给他人" });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast({
        title: "创建失败",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [file, expiresIn, password, passwordEnabled]);

  const copyLink = useCallback(async () => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.shareUrl);
      setCopied(true);
      toast({ title: "已复制", description: "分享链接已复制到剪贴板" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = shareResult.shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      toast({ title: "已复制", description: "分享链接已复制到剪贴板" });
      setTimeout(() => setCopied(false), 2500);
    }
  }, [shareResult]);

  const handleOpenLink = useCallback(() => {
    if (shareResult) {
      window.open(shareResult.shareUrl, "_blank", "noopener,noreferrer");
    }
  }, [shareResult]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleBackToSettings = useCallback(() => {
    setStep("settings");
    setShareResult(null);
    setCopied(false);
    setError(null);
  }, []);

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        {/* Header with file icon */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${getFileColor(file.fileType || "file")}`}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center">
                <FileIconDisplay fileType={file.fileType || "file"} className="h-4 w-4" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{file.fileName}</p>
              <p className="text-xs font-normal text-muted-foreground mt-0.5">
                分享文件
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            为 {file.fileName} 创建分享链接
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Step Content */}
        <div className="relative min-h-[200px]">
          <AnimatePresence mode="wait">
            {/* Step 1: Share Settings */}
            {step === "settings" && (
              <motion.div
                key="settings"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-5"
              >
                {/* File metadata */}
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-3">
                    {file.fileType && file.fileSize ? (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          {file.fileType.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatSize(file.fileSize)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">文件</span>
                    )}
                  </div>
                </div>

                {/* Expiration */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    有效期
                  </Label>
                  <Select value={expiresIn} onValueChange={setExpiresIn}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择有效期" />
                    </SelectTrigger>
                    <SelectContent>
                      {expiryOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Password Protection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      密码保护
                    </Label>
                    <Switch
                      checked={passwordEnabled}
                      onCheckedChange={setPasswordEnabled}
                    />
                  </div>
                  <AnimatePresence>
                    {passwordEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <Input
                          type="password"
                          placeholder="输入分享密码"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-2"
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          访问者需要输入密码才能查看文件
                        </p>
                        {password.length > 0 && password.length < 4 && (
                          <p className="text-xs text-destructive mt-1">密码至少需要 4 个字符</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Generate button */}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={generateShareLink}
                  disabled={loading || (passwordEnabled && (!password.trim() || password.trim().length < 4))}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      正在生成...
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4 mr-2" />
                      生成分享链接
                    </>
                  )}
                </Button>
              </motion.div>
            )}

            {/* Step 2: Share Result */}
            {step === "result" && shareResult && (
              <motion.div
                key="result"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-4"
              >
                {/* Success indicator */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  className="flex justify-center"
                >
                  <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-7 w-7 text-green-500" />
                  </div>
                </motion.div>

                <p className="text-center text-sm text-muted-foreground">
                  分享链接已生成
                </p>

                {/* Share link display */}
                <div className="rounded-lg border bg-muted/40 overflow-hidden">
                  <div className="flex items-stretch">
                    <div className="flex-1 px-3 py-2.5 flex items-center min-w-0">
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mr-2" />
                      <span className="text-xs font-mono truncate select-all text-foreground/80">
                        {shareResult.shareUrl}
                      </span>
                    </div>
                    <div className="border-l">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-full rounded-none px-3"
                        onClick={copyLink}
                      >
                        <AnimatePresence mode="wait">
                          {copied ? (
                            <motion.span
                              key="copied"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              className="flex items-center gap-1.5 text-green-500"
                            >
                              <Check className="h-4 w-4" />
                              <span className="text-xs">已复制</span>
                            </motion.span>
                          ) : (
                            <motion.span
                              key="copy"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="flex items-center gap-1.5"
                            >
                              <Copy className="h-4 w-4" />
                              <span className="text-xs">复制</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Share info summary */}
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      有效期
                    </span>
                    <span className="font-medium">
                      {formatExpiry(shareResult.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      过期时间
                    </span>
                    <span className="font-medium">
                      {formatExpiryDate(shareResult.expiresAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" />
                      密码保护
                    </span>
                    {shareResult.password ? (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        <Lock className="h-2.5 w-2.5 mr-0.5" />
                        已启用
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">未启用</span>
                    )}
                  </div>
                </div>

                {/* Open link button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleOpenLink}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  在新标签页打开链接
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Separator />

        <DialogFooter className="flex gap-2 sm:gap-0">
          {step === "result" && (
            <Button variant="ghost" onClick={handleBackToSettings}>
              继续分享
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} className="flex-1 sm:flex-none">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
