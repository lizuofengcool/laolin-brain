"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ==================== 类型定义 ====================

export interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
  placeholder?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  showToolbar?: boolean;
  showPreview?: boolean;
  defaultView?: "edit" | "preview" | "split";
  className?: string;
}

// ==================== Markdown解析器（轻量级实现） ====================

function parseMarkdown(text: string): string {
  if (!text) return "";

  let html = text;

  // 转义HTML
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 标题
  html = html.replace(/^###### (.*)$/gm, '<h6 class="text-sm font-semibold mt-4 mb-2">$1</h6>');
  html = html.replace(/^##### (.*)$/gm, '<h5 class="text-base font-semibold mt-4 mb-2">$1</h5>');
  html = html.replace(/^#### (.*)$/gm, '<h4 class="text-lg font-semibold mt-4 mb-2">$1</h4>');
  html = html.replace(/^### (.*)$/gm, '<h3 class="text-xl font-semibold mt-5 mb-3">$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2 class="text-2xl font-bold mt-6 mb-4">$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1 class="text-3xl font-bold mt-6 mb-4">$1</h1>');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-bold">$1</strong>');

  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_(.+?)_/g, '<em class="italic">$1</em>');

  // 删除线
  html = html.replace(/~~(.+?)~~/g, '<del class="line-through">$1</del>');

  // 行内代码
  html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono text-red-600 dark:text-red-400">$1</code>');

  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre class="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm font-mono">${code.trim()}</code></pre>`;
  });

  // 引用
  html = html.replace(/^> (.*)$/gm, '<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-1 my-4 text-gray-600 dark:text-gray-400 italic">$1</blockquote>');

  // 无序列表
  html = html.replace(/^[-*+] (.*)$/gm, '<li class="ml-4 list-disc">$1</li>');

  // 有序列表
  html = html.replace(/^\d+\. (.*)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // 链接
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // 图片
  html = html.replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg my-4" />');

  // 分割线
  html = html.replace(/^---$/gm, '<hr class="my-6 border-gray-200 dark:border-gray-700" />');
  html = html.replace(/^\*\*\*$/gm, '<hr class="my-6 border-gray-200 dark:border-gray-700" />');

  // 表格（简单实现）
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split("|").map((cell: string) => cell.trim());
    return `<tr>${cells.map((cell: string) => `<td class="border border-gray-300 dark:border-gray-600 px-3 py-2">${cell}</td>`).join("")}</tr>`;
  });

  // 段落
  html = html.replace(/^(?!<[hlupt]|<pre|<block|<hr|<img|<table|<tr|<li|<a|<str|<em|<del|<code|<br).+$/gm, (match) => {
    if (match.trim() === "") return "";
    return `<p class="my-3 leading-relaxed">${match}</p>`;
  });

  // 换行
  html = html.replace(/\n\n/g, "</p><p class=\"my-3 leading-relaxed\">");
  html = html.replace(/\n/g, "<br />");

  return html;
}

// ==================== 工具栏按钮配置 ====================

interface ToolbarButton {
  icon: string;
  title: string;
  shortcut?: string;
  action: "bold" | "italic" | "strikethrough" | "heading1" | "heading2" | "heading3" | "link" | "image" | "code" | "codeblock" | "quote" | "ul" | "ol" | "table" | "hr" | "undo" | "redo" | "save";
}

const toolbarButtons: ToolbarButton[][] = [
  [
    { icon: "B", title: "粗体", shortcut: "Ctrl+B", action: "bold" },
    { icon: "I", title: "斜体", shortcut: "Ctrl+I", action: "italic" },
    { icon: "S", title: "删除线", shortcut: "Ctrl+Shift+S", action: "strikethrough" },
  ],
  [
    { icon: "H1", title: "一级标题", shortcut: "Ctrl+1", action: "heading1" },
    { icon: "H2", title: "二级标题", shortcut: "Ctrl+2", action: "heading2" },
    { icon: "H3", title: "三级标题", shortcut: "Ctrl+3", action: "heading3" },
  ],
  [
    { icon: "•", title: "无序列表", shortcut: "Ctrl+U", action: "ul" },
    { icon: "1.", title: "有序列表", shortcut: "Ctrl+O", action: "ol" },
    { icon: "❝", title: "引用", action: "quote" },
  ],
  [
    { icon: "</>", title: "行内代码", shortcut: "Ctrl+E", action: "code" },
    { icon: "{}", title: "代码块", shortcut: "Ctrl+Shift+E", action: "codeblock" },
  ],
  [
    { icon: "🔗", title: "链接", shortcut: "Ctrl+K", action: "link" },
    { icon: "🖼", title: "图片", shortcut: "Ctrl+Shift+I", action: "image" },
  ],
  [
    { icon: "⊞", title: "表格", action: "table" },
    { icon: "—", title: "分割线", action: "hr" },
  ],
  [
    { icon: "↶", title: "撤销", shortcut: "Ctrl+Z", action: "undo" },
    { icon: "↷", title: "重做", shortcut: "Ctrl+Y", action: "redo" },
  ],
  [
    { icon: "💾", title: "保存", shortcut: "Ctrl+S", action: "save" },
  ],
];

// ==================== 主组件 ====================

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  readOnly = false,
  height = "500px",
  placeholder = "开始输入Markdown内容...",
  autoSave = false,
  autoSaveInterval = 30000,
  showToolbar = true,
  showPreview = true,
  defaultView = "split",
  className = "",
}: MarkdownEditorProps) {
  const [content, setContent] = useState(value);
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">(defaultView);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 同步外部value
  useEffect(() => {
    setContent(value);
  }, [value]);

  // 自动保存
  useEffect(() => {
    if (autoSave && onSave) {
      autoSaveTimerRef.current = setInterval(() => {
        onSave(content);
        setLastSaved(new Date());
      }, autoSaveInterval);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [autoSave, autoSaveInterval, onSave, content]);

  // 处理内容变化
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setContent(newValue);
      onChange?.(newValue);
    },
    [onChange]
  );

  // 插入文本
  const insertText = useCallback(
    (before: string, after: string = "", placeholder: string = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end) || placeholder;

      const newContent =
        content.substring(0, start) +
        before +
        selectedText +
        after +
        content.substring(end);

      setContent(newContent);
      onChange?.(newContent);

      // 设置光标位置
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + before.length + selectedText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [content, onChange]
  );

  // 处理工具栏操作
  const handleToolbarAction = useCallback(
    (action: ToolbarButton["action"]) => {
      switch (action) {
        case "bold":
          insertText("**", "**", "粗体文本");
          break;
        case "italic":
          insertText("*", "*", "斜体文本");
          break;
        case "strikethrough":
          insertText("~~", "~~", "删除线文本");
          break;
        case "heading1":
          insertText("# ", "", "一级标题");
          break;
        case "heading2":
          insertText("## ", "", "二级标题");
          break;
        case "heading3":
          insertText("### ", "", "三级标题");
          break;
        case "link":
          insertText("[", "](https://)", "链接文字");
          break;
        case "image":
          insertText("![", "](https://)", "图片描述");
          break;
        case "code":
          insertText("`", "`", "代码");
          break;
        case "codeblock":
          insertText("\n```\n", "\n```\n", "代码块");
          break;
        case "quote":
          insertText("> ", "", "引用文本");
          break;
        case "ul":
          insertText("- ", "", "列表项");
          break;
        case "ol":
          insertText("1. ", "", "列表项");
          break;
        case "table":
          insertText(
            "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容1 | 内容2 | 内容3 |\n",
            "",
            ""
          );
          break;
        case "hr":
          insertText("\n---\n", "", "");
          break;
        case "save":
          onSave?.(content);
          setLastSaved(new Date());
          break;
        default:
          break;
      }
    },
    [insertText, onSave, content]
  );

  // 处理快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case "b":
            e.preventDefault();
            handleToolbarAction("bold");
            break;
          case "i":
            e.preventDefault();
            handleToolbarAction("italic");
            break;
          case "k":
            e.preventDefault();
            handleToolbarAction("link");
            break;
          case "e":
            e.preventDefault();
            if (e.shiftKey) {
              handleToolbarAction("codeblock");
            } else {
              handleToolbarAction("code");
            }
            break;
          case "s":
            e.preventDefault();
            handleToolbarAction("save");
            break;
          case "1":
            e.preventDefault();
            handleToolbarAction("heading1");
            break;
          case "2":
            e.preventDefault();
            handleToolbarAction("heading2");
            break;
          case "3":
            e.preventDefault();
            handleToolbarAction("heading3");
            break;
          default:
            break;
        }
      }
    },
    [handleToolbarAction]
  );

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // 导出功能
  const handleExport = useCallback(
    (format: "markdown" | "html") => {
      let exportContent = content;
      let filename = "document";
      let mimeType = "text/plain";

      if (format === "html") {
        exportContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
    img { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  </style>
</head>
<body>
${parseMarkdown(content)}
</body>
</html>`;
        filename = "document.html";
        mimeType = "text/html";
      } else {
        filename = "document.md";
        mimeType = "text/markdown";
      }

      const blob = new Blob([exportContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [content]
  );

  const containerClasses = `
    flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900
    ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}
    ${className}
  `;

  return (
    <div className={containerClasses} style={{ height: isFullscreen ? "100vh" : height }}>
      {/* 工具栏 */}
      {showToolbar && !readOnly && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {toolbarButtons.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              {groupIndex > 0 && (
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
              )}
              {group.map((button) => (
                <button
                  key={button.action}
                  onClick={() => handleToolbarAction(button.action)}
                  title={`${button.title}${button.shortcut ? ` (${button.shortcut})` : ""}`}
                  className="px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors min-w-[32px] h-7 flex items-center justify-center"
                >
                  {button.icon}
                </button>
              ))}
            </React.Fragment>
          ))}

          <div className="flex-1" />

          {/* 视图切换 */}
          {showPreview && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode("edit")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === "edit"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                编辑
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === "split"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                分屏
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === "preview"
                    ? "bg-blue-500 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                预览
              </button>
            </div>
          )}

          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* 导出 */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleExport(e.target.value as "markdown" | "html");
                e.target.value = "";
              }
            }}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            defaultValue=""
          >
            <option value="" disabled>
              导出
            </option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>

          {/* 全屏 */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "退出全屏" : "全屏编辑"}
            className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            {isFullscreen ? "⛶" : "⛶"}
          </button>
        </div>
      )}

      {/* 编辑器主体 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 编辑区 */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            className={`flex flex-col ${
              viewMode === "split" ? "w-1/2 border-r border-gray-200 dark:border-gray-700" : "w-full"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              readOnly={readOnly}
              className="flex-1 w-full p-4 resize-none font-mono text-sm leading-relaxed bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
              spellCheck={false}
            />
          </div>
        )}

        {/* 预览区 */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={`${
              viewMode === "split" ? "w-1/2" : "w-full"
            } overflow-auto bg-white dark:bg-gray-900`}
          >
            <div
              className="p-4 prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
            />
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <span>字数: {content.length}</span>
          <span>行数: {content.split("\n").length}</span>
        </div>
        <div className="flex items-center gap-4">
          {lastSaved && (
            <span>上次保存: {lastSaved.toLocaleTimeString()}</span>
          )}
          <span>Markdown</span>
        </div>
      </div>
    </div>
  );
}

export default MarkdownEditor;
