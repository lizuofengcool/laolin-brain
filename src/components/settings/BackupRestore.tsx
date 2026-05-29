'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, Archive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import JSZip from 'jszip';

/**
 * ZIP 备份与恢复组件
 * 基于 store 的 exportData/importData 能力，扩展为 ZIP 格式
 * 支持完整的元数据备份和恢复
 */
export function BackupRestore() {
  const { exportData, importData } = useAppStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setTimeout(() => {
        useAppStore.getState().refreshFiles();
        useAppStore.getState().refreshFolders();
      }, 500);
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
        {/* 状态消息 */}
        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
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

        <p className="text-xs text-muted-foreground">
          支持 .zip 和 .json 两种备份格式。恢复操作会将备份数据与现有数据合并。
        </p>
      </CardContent>
    </Card>
  );
}
