"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Lock,
  Clock,
  FileText,
  Image as ImageIcon,
  HardDrive,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { formatSize } from "@/lib/file-utils";

interface SharedFileData {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  textContent?: string;
  thumbnailUrl?: string;
  createdAt: string;
  downloadUrl: string;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [fileData, setFileData] = useState<SharedFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const fetchSharedFile = async (pwd: string = "") => {
    setLoading(true);
    setError("");
    try {
      const url = pwd
        ? `/api/files/${token}/share?password=${encodeURIComponent(pwd)}`
        : `/api/files/${token}/share`;
      const res = await fetch(url);
      const data = await res.json();

      if (res.status === 410) {
        setExpired(true);
        return;
      }

      if (res.status === 403 && data.passwordRequired) {
        setPasswordRequired(true);
        return;
      }

      if (!res.ok) {
        setError(data.error || "获取文件失败");
        return;
      }

      setFileData(data);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSharedFile();
    }
  }, [token]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError(true);
      return;
    }
    fetchSharedFile(passwordInput);
    setPasswordError(false);
  };

  const handleDownload = () => {
    if (!fileData) return;
    // Get the token from localStorage or use direct download URL
    const downloadUrl = `/api/files/${fileData.id}/download`;
    window.open(downloadUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold">链接已过期</h1>
            <p className="text-sm text-muted-foreground">
              该分享链接已过期，无法查看文件内容。请联系分享者获取新的链接。
            </p>
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              链接已失效
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (passwordRequired && !fileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-xl font-bold">需要密码</h1>
              <p className="text-sm text-muted-foreground">
                该分享链接已设置密码保护，请输入密码访问
              </p>
            </div>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <Input
                type="password"
                placeholder="输入分享密码"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className={passwordError ? "border-destructive" : ""}
              />
              {passwordError && (
                <p className="text-xs text-destructive">请输入密码</p>
              )}
              <Button type="submit" className="w-full">
                <ShieldCheck className="h-4 w-4 mr-2" />
                验证密码
              </Button>
            </form>
            <div className="text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                文件通过加密链接安全分享
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !fileData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold">无法访问</h1>
            <p className="text-sm text-muted-foreground">
              {error || "文件不存在或链接无效"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isImage = fileData.fileType === "image";
  const isDocument = ["word", "pdf", "pptx", "markdown", "txt"].includes(fileData.fileType);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            KB
          </div>
          <span className="font-semibold text-sm">知识库</span>
          <Badge variant="secondary" className="text-xs ml-auto">
            分享文件
          </Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* File info card */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                  isImage
                    ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-500/15"
                    : isDocument
                    ? "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/15"
                    : "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-500/15"
                }`}>
                  {isImage ? (
                    <ImageIcon className="h-6 w-6" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="font-semibold text-lg truncate" title={fileData.fileName}>
                    {fileData.fileName}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5" />
                      {formatSize(fileData.fileSize)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(fileData.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
              </div>
              <Button onClick={handleDownload} className="shrink-0">
                <Download className="h-4 w-4 mr-2" />
                下载文件
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preview area */}
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {isImage && fileData.thumbnailUrl ? (
              <div className="flex items-center justify-center bg-muted/30 min-h-[300px] p-4">
                <img
                  src={fileData.thumbnailUrl}
                  alt={fileData.fileName}
                  className="max-w-full max-h-[600px] object-contain rounded-lg"
                />
              </div>
            ) : fileData.textContent ? (
              <div className="p-6 max-h-[500px] overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                  {fileData.textContent.slice(0, 10000)}
                  {fileData.textContent.length > 10000 && (
                    <span className="text-muted-foreground">
                      {"\n\n"}... (内容过长，请下载查看完整文件)
                    </span>
                  )}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <FileText className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-sm">无法在线预览此文件</p>
                <p className="text-xs mt-1">请下载后查看</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            该文件通过智能文档知识库分享 · Powered by KB
          </p>
        </div>
      </main>
    </div>
  );
}
