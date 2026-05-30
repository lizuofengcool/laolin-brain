'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, Archive, CheckCircle2, AlertCircle, Loader2, Clock, Shield } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import JSZip from 'jszip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const AUTO_BACKUP_KEY = 'kb_auto_backup';
const LAST_BACKUP_KEY = 'kb_last_backup';

/** SHA-256 hash function for backup integrity checking (matches server-side checksum.ts) */
const simpleHash = async (str: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * ZIP 备份与恢复组件
 * 基于 store 的 exportData/importData 能力，扩展为 ZIP 格式
 * 支持完整的元数据备份和恢复
 */
export function BackupRestore() {
  const { exportData, importData } = useAppStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [autoBackupInterval, setAutoBackupInterval] = useState<'never' | 'daily' | 'weekly'>('never');
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

  // Load auto-backup settings on mount
  useEffect(() => {
    const saved = localStorage.getItem(AUTO_BACKUP_KEY);
    if (saved) setAutoBackupInterval(saved as 'never' | 'daily' | 'weekly');
    const lastTime = localStorage.getItem(LAST_BACKUP_KEY);
    if (lastTime) setLastBackupTime(lastTime);
  }, []);

  // Trigger auto-backup function
  const triggerAutoBackup = useCallback(async () => {
    try {
      const data = await useAppStore.getState().exportData();
      // Save to localStorage with timestamp and checksum for integrity
      const checksum = await simpleHash(data);
      const backup = JSON.stringify({
        version: '2.0',
        data,
        timestamp: new Date().toISOString(),
        checksum,
      });
      localStorage.setItem('kb_auto_backup_data', backup);
      localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
      setLastBackupTime(new Date().toISOString());
      console.log('Auto-backup completed');
    } catch (err) {
      console.error('Auto-backup failed:', err);
    }
  }, []);

  // Auto-backup scheduler
  useEffect(() => {
    if (autoBackupInterval === 'never') return;

    const checkAndBackup = () => {
      if (!lastBackupTime) {
        // Never backed up, trigger immediately
        triggerAutoBackup();
        return;
      }
      const last = new Date(lastBackupTime).getTime();
      const now = Date.now();
      const interval = autoBackupInterval === 'daily'
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
      if (now - last >= interval) {
        triggerAutoBackup();
      }
    };

    checkAndBackup();
    const timer = setInterval(checkAndBackup, 60 * 60 * 1000); // check every hour

    return () => clearInterval(timer);
  }, [autoBackupInterval, lastBackupTime, triggerAutoBackup]);

  // Persist auto-backup interval changes
  const handleAutoBackupChange = (value: string) => {
    const interval = value as 'never' | 'daily' | 'weekly';
    setAutoBackupInterval(interval);
    localStorage.setItem(AUTO_BACKUP_KEY, interval);
  };

  /**
   * 导出所有数据为 ZIP 文件
   * ZIP 包含：backup.json（元数据）
   */
  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);
    try {
      // 获取导出数据
      const jsonStr = await exportData();

      // 创建 ZIP 包
      const zip = new JSZip();
      const backupObj = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        appName: '个人私有第二大脑',
        data: JSON.parse(jsonStr),
      };
      zip.file('backup.json', JSON.stringify(backupObj, null, 2));
      zip.file('README.txt', [
        '个人私有第二大脑 - 数据备份',
        `导出时间: ${new Date().toLocaleString('zh-CN')}`,
        '版本: 2.0',
        '',
        '说明:',
        '- backup.json 包含所有文件元数据和文件夹结构',
        '- 文件内容（图片、文档等二进制文件）不包含在备份中',
        '- 请妥善保管此备份文件',
      ].join('\n'));

      // 生成 ZIP 并下载
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `second-brain-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setMessage({ type: 'success', text: '备份文件已生成并下载' });
    } catch (err) {
      console.error('备份导出失败:', err);
      setMessage({ type: 'error', text: '备份导出失败，请重试' });
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * 从 ZIP 文件恢复数据
   * 支持 JSON 和 ZIP 两种格式（向后兼容）
   */
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);

    try {
      let jsonStr: string;

      if (file.name.endsWith('.zip')) {
        // ZIP 格式备份
        const zip = await JSZip.loadAsync(file);
        const backupFile = zip.file('backup.json');

        if (!backupFile) {
          throw new Error('无效的备份文件：缺少 backup.json');
        }

        jsonStr = await backupFile.async('string');
      } else {
        // 直接的 JSON 格式（向后兼容旧版导出）
        jsonStr = await file.text();
      }

      // 解析并验证格式
      const parsed = JSON.parse(jsonStr);

      // Integrity check: if the backup has a checksum field, verify it
      if (parsed.checksum && parsed.timestamp) {
        const expectedHash = parsed.checksum;
        const actualHash = await simpleHash(typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data));
        if (expectedHash !== actualHash) {
          console.warn('Backup integrity check failed');
          setMessage({
            type: 'warning',
            text: '备份数据完整性校验失败，数据可能已损坏。是否继续导入？',
          });
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      if (parsed.data) {
        // 新版 ZIP 格式：data 字段包含实际数据
        jsonStr = JSON.stringify(parsed.data);
      }

      // 执行导入
      const count = await importData(jsonStr);

      setMessage({
        type: 'success',
        text: `成功恢复 ${count} 个文件的元数据`,
      });

      // 刷新页面以显示最新数据
      useAppStore.getState().refreshFiles();
      useAppStore.getState().refreshFolders();
    } catch (err) {
      console.error('备份恢复失败:', err);
      setMessage({
        type: 'error',
        text: (err as Error).message || '备份恢复失败，请确认文件格式正确',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Archive className="h-4 w-4" />
          ZIP 备份与恢复
        </CardTitle>
        <CardDescription>
          将所有文件元数据打包为 ZIP 文件备份，支持从 ZIP 或 JSON 文件恢复
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 自动备份设置 */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            自动备份
          </div>
          <div className="flex items-center justify-between gap-3">
            <Select value={autoBackupInterval} onValueChange={handleAutoBackupChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="选择备份频率" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">从不</SelectItem>
                <SelectItem value="daily">每天</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
              </SelectContent>
            </Select>
            {lastBackupTime && autoBackupInterval !== 'never' && (
              <span className="text-xs text-muted-foreground">
                上次备份: {new Date(lastBackupTime).toLocaleString('zh-CN')}
              </span>
            )}
          </div>
        </div>

        {/* 状态消息 */}
        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                : message.type === 'warning'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || isImporting}
            className="flex-1"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isExporting ? '正在生成备份...' : '导出 ZIP 备份'}
          </Button>

          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExporting || isImporting}
              className="w-full"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isImporting ? '正在恢复...' : '从备份恢复'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Shield className="h-3 w-3" />
          支持 .zip 和 .json 两种备份格式。恢复操作会将备份数据与现有数据合并。自动备份包含数据完整性校验。
        </p>
      </CardContent>
    </Card>
  );
}
