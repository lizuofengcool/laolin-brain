/**
 * HTML 安全净化模块
 * 使用 sanitize-html 对用户生成的内容进行 XSS 防护
 * 适用于服务端和客户端（Node.js + 浏览器均兼容）
 */
import sanitizeHtml from 'sanitize-html';

/** 基础净化配置：适用于一般文本内容 */
const BASE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'del',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'img', 'video', 'audio', 'source',
    'details', 'summary',
    'div', 'span',
  ],
  allowedAttributes: {
    '*': ['class', 'title'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'width', 'height', 'poster'],
    audio: ['src', 'controls'],
    source: ['src', 'type'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'align'],
    pre: ['class'],
    code: ['class'],
    details: ['open'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/** Markdown 渲染后的净化配置：保留更多 Markdown 特有元素 */
const MARKDOWN_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'strong', 'em', 'b', 'i', 'u', 's', 'mark', 'del',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'img', 'video', 'audio', 'source',
    'details', 'summary',
    'div', 'span',
    'input',
  ],
  allowedAttributes: {
    '*': ['class', 'title'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'width', 'height', 'poster'],
    audio: ['src', 'controls'],
    source: ['src', 'type'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'align'],
    pre: ['class', 'data-language'],
    code: ['class'],
    details: ['open'],
    input: ['type', 'checked', 'disabled'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/**
 * 净化用户输入的 HTML 内容
 * 用于文件预览、笔记内容等场景
 */
export function sanitizeUserHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return sanitizeHtml(dirty, BASE_OPTIONS);
}

/**
 * 净化 Markdown 渲染后的 HTML
 * 保留代码块、任务列表、表格等 Markdown 特有元素
 */
export function sanitizeMarkdownHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return sanitizeHtml(dirty, MARKDOWN_OPTIONS);
}

/**
 * 纯文本净化：移除所有 HTML 标签，仅保留文本内容
 * 用于搜索结果摘要、通知消息等场景
 */
export function stripHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return sanitizeHtml(dirty, {
    allowedTags: [],
    allowedAttributes: {},
  });
}
