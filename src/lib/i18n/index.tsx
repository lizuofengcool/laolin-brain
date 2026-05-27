/**
 * 轻量级国际化（i18n）模块
 * 支持中/英文切换，基于 React Context + localStorage 持久化
 * 零外部依赖
 */

'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Locale = 'zh-CN' | 'en';
export const LOCALE_KEY = 'kb_locale';
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
];

const zhCN: Record<string, string> = {
  'app.title': '智能文档知识库',
  'app.subtitle': '文档管理 & 个人相册',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.close': '关闭',
  'common.search': '搜索',
  'common.upload': '上传',
  'common.download': '下载',
  'common.loading': '加载中...',
  'common.noData': '暂无数据',
  'common.success': '操作成功',
  'common.error': '操作失败',
  'common.retry': '重试',
  'common.back': '返回',
  'nav.dashboard': '仪表板',
  'nav.files': '文件管理',
  'nav.albums': '相册',
  'nav.timeline': '时间线',
  'nav.favorites': '收藏夹',
  'nav.tags': '标签管理',
  'nav.recycleBin': '回收站',
  'nav.search': '搜索',
  'nav.analytics': '存储分析',
  'nav.knowledgeGraph': '知识图谱',
  'nav.settings': '设置',
  'nav.logout': '退出登录',
  'file.upload': '拖拽文件到此处，或点击上传',
  'file.uploading': '上传中...',
  'file.uploadSuccess': '上传完成',
  'file.uploadFailed': '上传失败',
  'file.delete': '删除文件',
  'file.restore': '恢复文件',
  'file.permanentDelete': '永久删除',
  'file.rename': '重命名',
  'file.favorite': '收藏',
  'file.unfavorite': '取消收藏',
  'file.share': '分享',
  'file.versions': '版本历史',
  'file.preview': '预览',
  'file.noPreview': '无法预览此文件',
  'file.tooLarge': '文件过大，已跳过',
  'file.duplicate': '重复文件，已跳过',
  'search.placeholder': '搜索文件... (Ctrl+K)',
  'search.noResults': '没有找到匹配的文件',
  'search.aiChat': 'AI 问答',
  'settings.account': '账户信息',
  'settings.storage': '存储模式',
  'settings.storageLocal': '本地存储',
  'settings.storageCloud': '云端存储',
  'settings.backup': '数据备份与恢复',
  'settings.automation': '自动化规则',
  'settings.about': '关于',
  'settings.language': '语言',
  'settings.theme': '主题',
  'recycleBin.empty': '回收站为空',
  'recycleBin.emptyAll': '清空回收站',
  'dashboard.totalFiles': '总文件数',
  'dashboard.totalSize': '总存储量',
  'dashboard.recentFiles': '最近文件',
  'login.title': '登录',
  'login.register': '注册',
  'login.email': '邮箱',
  'login.password': '密码',
  'login.name': '用户名',
  'login.submit': '登录',
  'login.registerSubmit': '注册',
  'voiceNote.title': '语音笔记',
  'voiceNote.start': '开始录音',
  'voiceNote.stop': '停止录音',
  'voiceNote.recording': '录音中...',
  'voiceNote.noSupport': '您的浏览器不支持语音识别',
  'voiceNote.placeholder': '语音内容将显示在这里...',
  'error.pageNotFound': '页面未找到',
  'error.global': '哎呀，出了点问题',
  'batch.tag': '批量标签',
  'batch.moveToFolder': '移动到文件夹',
  'batch.selected': '已选择',
  'batch.items': '项',
  'chunkUpload.resume': '断点续传',
  'chunkUpload.progress': '上传进度',
};

const enUS: Record<string, string> = {
  'app.title': 'Smart Document Knowledge Base',
  'app.subtitle': 'Document Management & Photo Album',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.upload': 'Upload',
  'common.download': 'Download',
  'common.loading': 'Loading...',
  'common.noData': 'No data',
  'common.success': 'Success',
  'common.error': 'Error',
  'common.retry': 'Retry',
  'common.back': 'Back',
  'nav.dashboard': 'Dashboard',
  'nav.files': 'Files',
  'nav.albums': 'Albums',
  'nav.timeline': 'Timeline',
  'nav.favorites': 'Favorites',
  'nav.tags': 'Tags',
  'nav.recycleBin': 'Recycle Bin',
  'nav.search': 'Search',
  'nav.analytics': 'Analytics',
  'nav.knowledgeGraph': 'Knowledge Graph',
  'nav.settings': 'Settings',
  'nav.logout': 'Logout',
  'file.upload': 'Drop files here or click to upload',
  'file.uploading': 'Uploading...',
  'file.uploadSuccess': 'Upload complete',
  'file.uploadFailed': 'Upload failed',
  'file.delete': 'Delete file',
  'file.restore': 'Restore file',
  'file.permanentDelete': 'Delete permanently',
  'file.rename': 'Rename',
  'file.favorite': 'Favorite',
  'file.unfavorite': 'Unfavorite',
  'file.share': 'Share',
  'file.versions': 'Version history',
  'file.preview': 'Preview',
  'file.noPreview': 'Cannot preview this file',
  'file.tooLarge': 'File too large, skipped',
  'file.duplicate': 'Duplicate file, skipped',
  'search.placeholder': 'Search files... (Ctrl+K)',
  'search.noResults': 'No matching files found',
  'search.aiChat': 'AI Chat',
  'settings.account': 'Account',
  'settings.storage': 'Storage Mode',
  'settings.storageLocal': 'Local Storage',
  'settings.storageCloud': 'Cloud Storage',
  'settings.backup': 'Backup & Restore',
  'settings.automation': 'Automation Rules',
  'settings.about': 'About',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'recycleBin.empty': 'Recycle bin is empty',
  'recycleBin.emptyAll': 'Empty recycle bin',
  'dashboard.totalFiles': 'Total Files',
  'dashboard.totalSize': 'Total Size',
  'dashboard.recentFiles': 'Recent Files',
  'login.title': 'Login',
  'login.register': 'Register',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.name': 'Username',
  'login.submit': 'Login',
  'login.registerSubmit': 'Register',
  'voiceNote.title': 'Voice Note',
  'voiceNote.start': 'Start Recording',
  'voiceNote.stop': 'Stop Recording',
  'voiceNote.recording': 'Recording...',
  'voiceNote.noSupport': 'Speech recognition not supported',
  'voiceNote.placeholder': 'Voice content will appear here...',
  'error.pageNotFound': 'Page Not Found',
  'error.global': 'Oops, something went wrong',
  'batch.tag': 'Batch Tag',
  'batch.moveToFolder': 'Move to Folder',
  'batch.selected': 'Selected',
  'batch.items': 'items',
  'chunkUpload.resume': 'Resume Upload',
  'chunkUpload.progress': 'Upload Progress',
};

const LOCALE_MAP: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en': enUS,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'zh-CN',
  setLocale: () => {},
  t: (key, fallback) => fallback || key,
});

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const saved = localStorage.getItem(LOCALE_KEY) as Locale;
    if (saved && LOCALE_MAP[saved]) return saved;
  } catch {}
  const lang = navigator.language;
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh-CN');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(detectLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem(LOCALE_KEY, newLocale); } catch {}
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => LOCALE_MAP[locale]?.[key] || fallback || key,
    [locale]
  );

  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: 'zh-CN', setLocale, t }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
