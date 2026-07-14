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

/**
 * HTML 实体转义：将 &, <, >, ", ' 转义为 HTML 实体。
 * 用于将不可信文本插入 HTML 文本节点或属性值时的 XSS 防护。
 * 注意：不适用于 <script> 标签内的 JS 字符串上下文（请用 escapeJsString）。
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JS 字符串字面量转义：将不可信文本安全插入 <script> 内的单引号 JS 字符串。
 * 转义反斜杠、单引号、< （防止 </script> 截断）、换行与 Unicode 行分隔符。
 */
export function escapeJsString(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/</g, '\\u003c')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
