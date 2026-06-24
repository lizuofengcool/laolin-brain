'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  RefreshCw,
  AlertTriangle,
  ListTodo,
  Play,
  X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BackupInfo {
  backupTime: string;
  fileCount: number;
  folderCount: number;
  totalSize: number;
  version: string;
}

interface SyncStatusInfo {
  lastSyncTime: string | null;
  totalFiles: number;
  syncedFiles: number;
  pendingFiles: number;
  conflictFiles: number;
  isSyncing: boolean;
  lastError: string | null;
  overallStatus: 'idle' | 'syncing' | 'error' | 'offline';
  queueSize: number;
}

interface ConflictFile {
  id: string;
  fileName: string;
  fileSize: number;
  updatedAt: string;
  fileHash: string | null;
}

interface QueueItem {
  id: string;
  operation: 'upload' | 'update' | 'delete';
  fileId: string | null;
  fileName: string | null;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  priority: number;
  createdAt: string;
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

  // 同步状态
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictFile[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isResolvingConflict, setIsResolvingConflict] = useState<string | null>(null);

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

  // 加载同步状态
  const loadSyncStatus = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const res = await fetch('/api/cloud-sync/status');
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncStatus(data.data.status);
      }
    } catch (error) {
      console.error('加载同步状态失败:', error);
    }
  }, [isConfigured]);

  // 加载冲突列表
  const loadConflicts = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const res = await fetch('/api/cloud-sync/conflicts');
      const data = await res.json();
      if (res.ok && data.success) {
        setConflicts(data.data);
      }
    } catch (error) {
      console.error('加载冲突列表失败:', error);
    }
  }, [isConfigured]);

  // 加载备份列表
  const loadBackups = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const res = await fetch('/api/cloud-sync/backups');
      const data = await res.json();
      if (res.ok) {
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('加载备份列表失败:', error);
    }
  }, [isConfigured]);

  // 加载队列
  const loadQueue = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const res = await fetch('/api/cloud-sync/queue');
      const data = await res.json();
      if (res.ok && data.success) {
        setQueue(data.data);
      }
    } catch (error) {
      console.error('加载队列失败:', error);
    }
  }, [isConfigured]);

  // 配置完成后加载数据
  useEffect(() => {
    if (isConfigured) {
      loadBackups();
      loadSyncStatus();
      loadConflicts();
      loadQueue();

      // 定时刷新同步状态
      const interval = setInterval(() => {
        loadSyncStatus();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isConfigured, loadBackups, loadSyncStatus, loadConflicts, loadQueue]);

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
        loadSyncStatus();
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

  // 手动同步
  const handleSync = async () => {
    if (!encryptionPassword) {
      toast({
        title: '请输入加密密码',
        description: '需要加密密码才能进行同步',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch('/api/cloud-sync/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: encryptionPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '同步完成',
          description: `上传 ${data.data.uploaded} 个，下载 ${data.data.downloaded} 个，冲突 ${data.data.conflicts} 个`,
        });
        loadSyncStatus();
        loadConflicts();
        loadQueue();
      } else {
        toast({
          title: '同步失败',
          description: data.error || '同步失败',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '同步失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // 解决冲突
  const handleResolveConflict = async (fileId: string, resolution: 'local_wins' | 'cloud_wins' | 'keep_both') => {
    if (!encryptionPassword) {
      toast({
        title: '请输入加密密码',
        description: '需要加密密码才能解决冲突',
        variant: 'destructive',
      });
      return;
    }

    setIsResolvingConflict(fileId);
    try {
      const res = await fetch('/api/cloud-sync/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          resolution,
          password: encryptionPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '冲突已解决',
          description: '文件已同步',
        });
        loadConflicts();
        loadSyncStatus();
      } else {
        toast({
          title: '解决冲突失败',
          description: data.error || '解决冲突失败',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '解决冲突失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    } finally {
      setIsResolvingConflict(null);
    }
  };

  // 批量自动解决冲突
  const handleAutoResolveConflicts = async () => {
    if (!encryptionPassword) {
      toast({
        title: '请输入加密密码',
        description: '需要加密密码才能解决冲突',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('确定要自动解决所有冲突吗？将使用"最后写入胜出"策略。')) {
      return;
    }

    try {
      const res = await fetch('/api/cloud-sync/conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto: true,
          password: encryptionPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '批量解决完成',
          description: `已解决 ${data.data.resolved} 个冲突`,
        });
        loadConflicts();
        loadSyncStatus();
      } else {
        toast({
          title: '批量解决失败',
          description: data.error || '批量解决失败',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '批量解决失败',
        description: '网络错误，请重试',
        variant: 'destructive',
      });
    }
  };

  // 清理队列
  const handleCleanupQueue = async () => {
    if (!confirm('确定要清理已完成的队列项吗？')) {
      return;
    }

    try {
      const res = await fetch('/api/cloud-sync/queue', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '清理完成',
          description: `已清理 ${data.data.cleaned} 个队列项`,
        });
        loadQueue();
      } else {
        toast({
          title: '清理失败',
          description: data.error || '清理失败',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '清理失败',
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'synced':
        return <Badge className="bg-green-500">已同步</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">等待中</Badge>;
      case 'conflict':
        return <Badge className="bg-red-500">冲突</Badge>;
      case 'local':
        return <Badge variant="outline">本地</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOverallStatusText = (status: string) => {
    switch (status) {
      case 'idle':
        return '空闲';
      case 'syncing':
        return '同步中';
      case 'error':
        return '错误';
      case 'offline':
        return '离线';
      default:
        return status;
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case 'idle':
        return 'text-green-500';
      case 'syncing':
        return 'text-blue-500';
      case 'error':
        return 'text-red-500';
      case 'offline':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
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
      <Tabs defaultValue="sync" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sync">
            <RefreshCw className="mr-2 h-4 w-4" />
            同步状态
          </TabsTrigger>
          <TabsTrigger value="backups">
            <Cloud className="mr-2 h-4 w-4" />
            备份管理
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertTriangle className="mr-2 h-4 w-4" />
            冲突解决
            {conflicts.length > 0 && (
              <Badge className="ml-2 bg-red-500 text-xs">{conflicts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="queue">
            <ListTodo className="mr-2 h-4 w-4" />
            同步队列
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            配置设置
          </TabsTrigger>
        </TabsList>

        {/* 同步状态 */}
        <TabsContent value="sync" className="space-y-4">
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
              {/* 同步状态卡片 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-5 w-5" />
                      同步状态
                    </div>
                    <Badge className={getOverallStatusColor(syncStatus?.overallStatus || 'idle')}>
                      {getOverallStatusText(syncStatus?.overallStatus || 'idle')}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    离线优先：本地数据为主，云端为备份
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 同步进度 */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>同步进度</span>
                      <span>
                        {syncStatus?.syncedFiles || 0} / {syncStatus?.totalFiles || 0} 个文件
                      </span>
                    </div>
                    <Progress
                      value={syncStatus?.totalFiles ? (syncStatus.syncedFiles / syncStatus.totalFiles) * 100 : 0}
                    />
                  </div>

                  {/* 统计信息 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">总文件数</p>
                      <p className="text-2xl font-bold">{syncStatus?.totalFiles || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">已同步</p>
                      <p className="text-2xl font-bold text-green-500">{syncStatus?.syncedFiles || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">等待中</p>
                      <p className="text-2xl font-bold text-yellow-500">{syncStatus?.pendingFiles || 0}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">冲突</p>
                      <p className="text-2xl font-bold text-red-500">{syncStatus?.conflictFiles || 0}</p>
                    </div>
                  </div>

                  {/* 上次同步时间 */}
                  {syncStatus?.lastSyncTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>上次同步：{formatDate(syncStatus.lastSyncTime)}</span>
                    </div>
                  )}

                  {/* 错误信息 */}
                  {syncStatus?.lastError && (
                    <div className="flex items-center gap-2 text-sm text-red-500">
                      <AlertCircle className="h-4 w-4" />
                      <span>{syncStatus.lastError}</span>
                    </div>
                  )}

                  {/* 加密密码和同步按钮 */}
                  <div className="space-y-4 pt-4 border-t">
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

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSync}
                        disabled={isSyncing || !encryptionPassword}
                        className="flex-1"
                      >
                        {isSyncing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            同步中...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            立即同步
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={loadSyncStatus}
                        disabled={isSyncing}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 队列状态 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    离线队列
                    <Badge variant="outline" className="ml-auto">
                      {syncStatus?.queueSize || 0} 个待处理
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    离线时操作会加入队列，联网后自动同步
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => (document.querySelector('[data-value="queue"]') as HTMLElement)?.click()}
                  >
                    查看队列详情
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

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

        {/* 冲突解决 */}
        <TabsContent value="conflicts" className="space-y-4">
          {!isConfigured ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  云同步未配置
                </CardTitle>
                <CardDescription>
                  请先配置云同步以启用冲突解决功能
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
              {/* 冲突说明 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    文件冲突
                    <Badge variant="destructive" className="ml-auto">
                      {conflicts.length} 个冲突
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    当本地和云端同时修改同一文件时会产生冲突，请选择解决方式
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {conflicts.length > 0 && (
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
                    </div>
                  )}

                  {conflicts.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={handleAutoResolveConflicts}
                      disabled={!encryptionPassword}
                    >
                      自动解决所有冲突（最后写入胜出）
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* 冲突列表 */}
              <Card>
                <CardHeader>
                  <CardTitle>冲突文件列表</CardTitle>
                </CardHeader>
                <CardContent>
                  {conflicts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500/50 mb-4" />
                      <p className="text-muted-foreground">没有冲突文件</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        所有文件都已正确同步
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {conflicts.map((conflict) => (
                        <div
                          key={conflict.id}
                          className="p-4 border rounded-lg space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                <span className="font-medium">{conflict.fileName}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{formatSize(conflict.fileSize)}</span>
                                <span>修改于 {formatDate(conflict.updatedAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveConflict(conflict.id, 'local_wins')}
                              disabled={isResolvingConflict === conflict.id || !encryptionPassword}
                            >
                              {isResolvingConflict === conflict.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              <span className="ml-1">保留本地版本</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveConflict(conflict.id, 'cloud_wins')}
                              disabled={isResolvingConflict === conflict.id || !encryptionPassword}
                            >
                              {isResolvingConflict === conflict.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              <span className="ml-1">保留云端版本</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveConflict(conflict.id, 'keep_both')}
                              disabled={isResolvingConflict === conflict.id || !encryptionPassword}
                            >
                              {isResolvingConflict === conflict.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              <span className="ml-1">保留两者</span>
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

        {/* 同步队列 */}
        <TabsContent value="queue" className="space-y-4">
          {!isConfigured ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  云同步未配置
                </CardTitle>
                <CardDescription>
                  请先配置云同步以查看同步队列
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
              {/* 队列操作 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    离线同步队列
                    <Badge variant="outline" className="ml-auto">
                      {queue.length} 个任务
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    离线时的操作会加入队列，联网后自动同步
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadQueue}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      刷新
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCleanupQueue}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      清理已完成
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 队列列表 */}
              <Card>
                <CardHeader>
                  <CardTitle>队列任务列表</CardTitle>
                </CardHeader>
                <CardContent>
                  {queue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500/50 mb-4" />
                      <p className="text-muted-foreground">队列为空</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        所有同步任务都已完成
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {queue.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {item.operation === 'upload' || item.operation === 'update' ? (
                                <CloudUpload className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-500" />
                              )}
                              <span className="font-medium">
                                {item.fileName || item.fileId}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>
                                {item.operation === 'upload' ? '上传' : item.operation === 'update' ? '更新' : '删除'}
                              </span>
                              <span>重试 {item.retryCount}/{item.maxRetries}</span>
                              <span>{formatDate(item.createdAt)}</span>
                            </div>
                            {item.errorMessage && (
                              <p className="text-xs text-red-500">{item.errorMessage}</p>
                            )}
                          </div>
                          <div>
                            {getStatusBadge(item.status)}
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
                <label className="text-sm font-medium">Bucket Name</label>
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
                  '保存配置'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 安全设置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                安全设置
              </CardTitle>
              <CardDescription>
                数据加密和安全相关设置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">端到端 AES-256-GCM 加密</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">零知识加密 - 服务器无法读取您的数据</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">数据完整性校验</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                注意：请务必牢记您的加密密码。丢失密码将无法恢复备份数据，我们也无法帮您找回。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
