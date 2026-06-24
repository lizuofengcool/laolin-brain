'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Trash2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings,
  Clock,
  HardDrive,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BackupInfo {
  backupTime: string;
  fileCount: number;
  folderCount: number;
  totalSize: number;
  version: string;
}

interface CloudSyncProps {
  className?: string;
}

export function CloudSync({ className }: CloudSyncProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  // 配置表单状态
  const [configForm, setConfigForm] = useState({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // 加密密码
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 检查配置状态
  useEffect(() => {
    checkConfigStatus();
  }, []);

  const checkConfigStatus = async () => {
    try {
      const res = await fetch('/api/cloud-sync/config');
      const data = await res.json();
      setIsConfigured(data.configured);
      if (data.configured) {
        loadBackups();
      }
    } catch (error) {
      console.error('检查云同步配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await fetch('/api/cloud-sync/backups');
      const data = await res.json();
      if (res.ok) {
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('加载备份列表失败:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!configForm.accountId || !configForm.accessKeyId || !configForm.secretAccessKey || !configForm.bucketName) {
      toast({
        title: '配置不完整',
        description: '请填写所有配置项',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingConnection(true);
    try {
      const res = await fetch('/api/cloud-sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: '配置成功',
          description: data.message,
        });
        setIsConfigured(true);
        loadBackups();
      } else {
        toast({
          title: '配置失败',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '配置失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!encryptionPassword) {
      toast({
        title: '请输入加密密码',
        description: '加密密码用于保护您的备份数据',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingBackup(true);
    try {
      const res = await fetch('/api/cloud-sync/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: encryptionPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: '备份成功',
          description: `已备份 ${data.backup.fileCount} 个文件和 ${data.backup.folderCount} 个文件夹`,
        });
        loadBackups();
      } else {
        toast({
          title: '备份失败',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '备份失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!encryptionPassword) {
      toast({
        title: '请输入加密密码',
        description: '需要加密密码才能解密备份数据',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('确定要恢复此备份吗？这将合并到现有数据中，不会覆盖现有文件。')) {
      return;
    }

    setIsRestoring(backupId);
    try {
      const res = await fetch(`/api/cloud-sync/backups/${backupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: encryptionPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: '恢复成功',
          description: `已恢复 ${data.restored} 个项目，跳过 ${data.skipped} 个已存在的项目`,
        });
        // 刷新页面以显示新数据
        window.location.reload();
      } else {
        toast({
          title: '恢复失败',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '恢复失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(null);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('确定要删除此备份吗？此操作不可撤销。')) {
      return;
    }

    try {
      const res = await fetch(`/api/cloud-sync/backups/${backupId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({
          title: '删除成功',
          description: '备份已删除',
        });
        loadBackups();
      } else {
        const data = await res.json();
        toast({
          title: '删除失败',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '删除失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={className}>
      <Tabs defaultValue="backups" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="backups">
            <Cloud className="mr-2 h-4 w-4" />
            备份管理
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            配置设置
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            安全设置
          </TabsTrigger>
        </TabsList>

        {/* 备份管理 */}
        <TabsContent value="backups" className="space-y-4">
          {!isConfigured ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  云同步未配置
                </CardTitle>
                <CardDescription>
                  请先配置 Cloudflare R2 存储以启用云端备份同步功能
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => (document.querySelector('[data-value="settings"]') as HTMLElement)?.click()}>
                  去配置
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 创建备份 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CloudUpload className="h-5 w-5" />
                    创建云端备份
                  </CardTitle>
                  <CardDescription>
                    将所有数据加密后上传到云端，支持端到端加密
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">加密密码</label>
                    <div className="flex gap-2">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="请输入加密密码"
                        value={encryptionPassword}
                        onChange={(e) => setEncryptionPassword(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={() => setShowPassword(!showPassword)}
                        type="button"
                      >
                        {showPassword ? '隐藏' : '显示'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      密码用于加密您的数据，请务必牢记。丢失密码将无法恢复备份数据。
                    </p>
                  </div>
                  <Button
                    onClick={handleCreateBackup}
                    disabled={isCreatingBackup || !encryptionPassword}
                    className="w-full"
                  >
                    {isCreatingBackup ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在备份...
                      </>
                    ) : (
                      <>
                        <CloudUpload className="mr-2 h-4 w-4" />
                        立即备份
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* 备份列表 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    云端备份列表
                    <Badge variant="outline" className="ml-auto">
                      {backups.length} 个备份
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    所有备份均使用 AES-256-GCM 端到端加密
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Cloud className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">暂无云端备份</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        点击上方按钮创建您的第一个云端备份
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {backups.map((backup, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              <span className="font-medium">
                                {formatDate(backup.backupTime)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{backup.fileCount} 个文件</span>
                              <span>{backup.folderCount} 个文件夹</span>
                              <span>{formatSize(backup.totalSize)}</span>
                              <span>v{backup.version}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestoreBackup(backup.backupTime)}
                              disabled={isRestoring === backup.backupTime}
                            >
                              {isRestoring === backup.backupTime ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CloudDownload className="h-4 w-4" />
                              )}
                              <span className="ml-1">恢复</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteBackup(backup.backupTime)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* 配置设置 */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Cloudflare R2 配置
              </CardTitle>
              <CardDescription>
                配置 Cloudflare R2 对象存储以启用云端备份同步
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Account ID</label>
                <Input
                  placeholder="您的 Cloudflare Account ID"
                  value={configForm.accountId}
                  onChange={(e) => setConfigForm({ ...configForm, accountId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Access Key ID</label>
                <Input
                  placeholder="R2 Access Key ID"
                  value={configForm.accessKeyId}
                  onChange={(e) => setConfigForm({ ...configForm, accessKeyId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Secret Access Key</label>
                <Input
                  type="password"
                  placeholder="R2 Secret Access Key"
                  value={configForm.secretAccessKey}
                  onChange={(e) => setConfigForm({ ...configForm, secretAccessKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bucket 名称</label>
                <Input
                  placeholder="存储桶名称"
                  value={configForm.bucketName}
                  onChange={(e) => setConfigForm({ ...configForm, bucketName: e.target.value })}
                />
              </div>
              <Button
                onClick={handleSaveConfig}
                disabled={isTestingConnection}
                className="w-full"
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    测试连接中...
                  </>
                ) : (
                  '保存配置并测试连接'
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                配置信息仅存储在服务端内存中，重启后需要重新配置。生产环境建议存储到加密数据库中。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 安全设置 */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                加密说明
              </CardTitle>
              <CardDescription>
                了解云端同步的安全机制
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium">端到端加密</h4>
                <p className="text-sm text-muted-foreground">
                  所有备份数据在上传到云端之前都会在本地使用 AES-256-GCM 算法加密。
                  加密密钥由您的密码派生，即使云端存储被攻破，数据也无法被解密。
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">密码管理</h4>
                <p className="text-sm text-muted-foreground">
                  请务必牢记您的加密密码。密码丢失将无法恢复备份数据。
                  我们不会存储您的密码，也无法帮您找回。
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">数据完整性</h4>
                <p className="text-sm text-muted-foreground">
                  每个备份都包含 SHA-256 校验和，恢复时会自动验证数据完整性，
                  确保备份数据没有被篡改或损坏。
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">存储位置</h4>
                <p className="text-sm text-muted-foreground">
                  数据存储在您自己的 Cloudflare R2 存储桶中，您完全拥有和控制自己的数据。
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
