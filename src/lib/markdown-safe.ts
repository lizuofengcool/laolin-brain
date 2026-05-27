/**
 * 安全的 Markdown 渲染入口
 * 包含 XSS 防护层，在渲染后自动净化 HTML
 */
import { renderMarkdown } from './markdown';
import { sanitizeMarkdownHtml } from './sanitize';

/**
 * 渲染 Markdown 为安全的 HTML
 * 自动应用 XSS 过滤，防止恶意代码注入
 */
export function renderMarkdownSafe(md: string): string {
  if (!md) return '';
  const rawHtml = renderMarkdown(md);
  return sanitizeMarkdownHtml(rawHtml);
}

// 保留原始渲染器以供测试使用
export { renderMarkdown } from './markdown';
