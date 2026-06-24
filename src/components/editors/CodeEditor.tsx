"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string | number;
  placeholder?: string;
  showLineNumbers?: boolean;
  showMinimap?: boolean;
  theme?: "light" | "dark";
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  className?: string;
}

// ==================== 支持的语言 ====================

export const SUPPORTED_LANGUAGES = [
  { id: "javascript", name: "JavaScript", ext: [".js", ".jsx", ".mjs"] },
  { id: "typescript", name: "TypeScript", ext: [".ts", ".tsx"] },
  { id: "python", name: "Python", ext: [".py"] },
  { id: "java", name: "Java", ext: [".java"] },
  { id: "cpp", name: "C++", ext: [".cpp", ".cc", ".cxx", ".h", ".hpp"] },
  { id: "c", name: "C", ext: [".c", ".h"] },
  { id: "csharp", name: "C#", ext: [".cs"] },
  { id: "go", name: "Go", ext: [".go"] },
  { id: "rust", name: "Rust", ext: [".rs"] },
  { id: "php", name: "PHP", ext: [".php"] },
  { id: "ruby", name: "Ruby", ext: [".rb"] },
  { id: "swift", name: "Swift", ext: [".swift"] },
  { id: "kotlin", name: "Kotlin", ext: [".kt"] },
  { id: "html", name: "HTML", ext: [".html", ".htm"] },
  { id: "css", name: "CSS", ext: [".css"] },
  { id: "scss", name: "SCSS", ext: [".scss", ".sass"] },
  { id: "json", name: "JSON", ext: [".json"] },
  { id: "yaml", name: "YAML", ext: [".yaml", ".yml"] },
  { id: "xml", name: "XML", ext: [".xml"] },
  { id: "sql", name: "SQL", ext: [".sql"] },
  { id: "bash", name: "Bash", ext: [".sh", ".bash"] },
  { id: "markdown", name: "Markdown", ext: [".md", ".markdown"] },
  { id: "plaintext", name: "纯文本", ext: [".txt"] },
];

// ==================== 简单的语法高亮 ====================

function highlightCode(code: string, language: string, theme: "light" | "dark"): string {
  if (!code) return "";

  // 转义HTML
  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const colors = theme === "dark"
    ? {
        keyword: "#c678dd",
        string: "#98c379",
        number: "#d19a66",
        comment: "#5c6370",
        function: "#61afef",
        variable: "#e06c75",
        operator: "#56b6c2",
        punctuation: "#abb2bf",
        tag: "#e06c75",
        attr: "#d19a66",
      }
    : {
        keyword: "#a626a4",
        string: "#50a14f",
        number: "#986801",
        comment: "#a0a1a7",
        function: "#4078f2",
        variable: "#e45649",
        operator: "#0184bc",
        punctuation: "#383a42",
        tag: "#e45649",
        attr: "#986801",
      };

  // 注释
  if (["javascript", "typescript", "java", "cpp", "c", "csharp", "go", "rust", "php", "swift", "kotlin"].includes(language)) {
    html = html.replace(/(\/\/.*$)/gm, `<span style="color: ${colors.comment}">$1</span>`);
    html = html.replace(/(\/\*[\s\S]*?\*\/)/g, `<span style="color: ${colors.comment}">$1</span>`);
  }
  if (["python", "ruby", "bash", "yaml"].includes(language)) {
    html = html.replace(/(#.*$)/gm, `<span style="color: ${colors.comment}">$1</span>`);
  }
  if (language === "html" || language === "xml") {
    html = html.replace(/(<!--[\s\S]*?-->)/g, `<span style="color: ${colors.comment}">$1</span>`);
  }
  if (language === "css" || language === "scss") {
    html = html.replace(/(\/\*[\s\S]*?\*\/)/g, `<span style="color: ${colors.comment}">$1</span>`);
  }

  // 字符串
  html = html.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, `<span style="color: ${colors.string}">$&</span>`);

  // 数字
  html = html.replace(/\b(\d+\.?\d*)\b/g, `<span style="color: ${colors.number}">$1</span>`);

  // 关键字
  const keywords: Record<string, string[]> = {
    javascript: ["var", "let", "const", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "class", "extends", "new", "this", "super", "import", "export", "default", "from", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "true", "false", "null", "undefined", "void", "delete"],
    typescript: ["var", "let", "const", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "class", "extends", "new", "this", "super", "import", "export", "default", "from", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "true", "false", "null", "undefined", "void", "delete", "interface", "type", "enum", "implements", "private", "public", "protected", "readonly", "abstract", "static", "namespace", "declare"],
    python: ["def", "class", "return", "if", "elif", "else", "for", "while", "break", "continue", "pass", "import", "from", "as", "try", "except", "finally", "raise", "with", "lambda", "yield", "global", "nonlocal", "True", "False", "None", "and", "or", "not", "in", "is"],
    java: ["public", "private", "protected", "class", "interface", "extends", "implements", "new", "this", "super", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "throws", "import", "package", "static", "final", "abstract", "void", "int", "long", "float", "double", "boolean", "char", "byte", "short", "true", "false", "null"],
    cpp: ["int", "long", "float", "double", "char", "bool", "void", "short", "unsigned", "signed", "const", "static", "extern", "auto", "register", "volatile", "mutable", "class", "struct", "union", "enum", "public", "private", "protected", "virtual", "inline", "explicit", "friend", "typedef", "using", "namespace", "template", "typename", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "goto", "try", "catch", "throw", "new", "delete", "this", "true", "false", "nullptr"],
    go: ["package", "import", "func", "var", "const", "type", "struct", "interface", "map", "chan", "return", "if", "else", "for", "range", "switch", "case", "default", "break", "continue", "goto", "defer", "go", "select", "true", "false", "nil", "int", "string", "bool", "float64", "float32"],
    rust: ["fn", "let", "mut", "const", "static", "struct", "enum", "trait", "impl", "pub", "mod", "use", "crate", "self", "super", "return", "if", "else", "for", "while", "loop", "match", "break", "continue", "move", "ref", "deref", "true", "false", "Some", "None", "Ok", "Err", "i32", "i64", "f32", "f64", "bool", "str", "String", "Vec", "Option", "Result"],
  };

  const langKeywords = keywords[language] || keywords.javascript;
  for (const keyword of langKeywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, "g");
    html = html.replace(regex, `<span style="color: ${colors.keyword}; font-weight: 500">$1</span>`);
  }

  // 函数名
  html = html.replace(/(\w+)\s*\(/g, `<span style="color: ${colors.function}">$1</span>(`);

  return html;
}

// ==================== 主组件 ====================

export function CodeEditor({
  value,
  onChange,
  onSave,
  language = "javascript",
  readOnly = false,
  height = "500px",
  placeholder = "",
  showLineNumbers = true,
  showMinimap = false,
  theme = "dark",
  fontSize = 14,
  tabSize = 2,
  wordWrap = false,
  className = "",
}: CodeEditorProps) {
  const [content, setContent] = useState(value);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [currentLang, setCurrentLang] = useState(language);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // 同步外部value
  useEffect(() => {
    setContent(value);
  }, [value]);

  // 同步语言
  useEffect(() => {
    setCurrentLang(language);
  }, [language]);

  // 计算行数
  const lineCount = useMemo(() => {
    return content.split("\n").length;
  }, [content]);

  // 生成行号
  const lineNumbers = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1);
  }, [lineCount]);

  // 处理内容变化
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setContent(newValue);
      onChange?.(newValue);
      updateCursorPosition(e.target);
    },
    [onChange]
  );

  // 更新光标位置
  const updateCursorPosition = useCallback((textarea: HTMLTextAreaElement) => {
    const text = textarea.value.substring(0, textarea.selectionStart);
    const lines = text.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    setCursorPosition({ line, column });
  }, []);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;

      // Tab键缩进
      if (e.key === "Tab") {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const indent = " ".repeat(tabSize);

        if (e.shiftKey) {
          // 减少缩进
          const lines = content.split("\n");
          const startLine = content.substring(0, start).split("\n").length - 1;
          const endLine = content.substring(0, end).split("\n").length - 1;

          let newContent = "";
          for (let i = 0; i < lines.length; i++) {
            if (i >= startLine && i <= endLine) {
              if (lines[i].startsWith(indent)) {
                newContent += lines[i].substring(tabSize);
              } else {
                newContent += lines[i];
              }
            } else {
              newContent += lines[i];
            }
            if (i < lines.length - 1) newContent += "\n";
          }

          setContent(newContent);
          onChange?.(newContent);
        } else {
          // 增加缩进
          const newContent =
            content.substring(0, start) + indent + content.substring(end);
          setContent(newContent);
          onChange?.(newContent);

          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + tabSize;
          }, 0);
        }
      }

      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.(content);
      }

      // Ctrl+F 搜索
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowSearch(true);
      }

      // 自动缩进
      if (e.key === "Enter") {
        const start = textarea.selectionStart;
        const lineStart = content.lastIndexOf("\n", start - 1) + 1;
        const currentLine = content.substring(lineStart, start);
        const indentMatch = currentLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";

        // 检查是否需要额外缩进
        let extraIndent = "";
        if (["{", "(", "["].includes(currentLine.trim().slice(-1))) {
          extraIndent = " ".repeat(tabSize);
        }

        e.preventDefault();
        const newContent =
          content.substring(0, start) +
          "\n" +
          indent +
          extraIndent +
          content.substring(start);

        setContent(newContent);
        onChange?.(newContent);

        setTimeout(() => {
          const newPos = start + 1 + indent.length + extraIndent.length;
          textarea.selectionStart = textarea.selectionEnd = newPos;
        }, 0);
      }

      // 括号自动闭合
      const brackets: Record<string, string> = {
        "(": ")",
        "[": "]",
        "{": "}",
        '"': '"',
        "'": "'",
        "`": "`",
      };

      if (brackets[e.key]) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = content.substring(start, end);

        if (selectedText) {
          // 包裹选中文本
          e.preventDefault();
          const newContent =
            content.substring(0, start) +
            e.key +
            selectedText +
            brackets[e.key] +
            content.substring(end);
          setContent(newContent);
          onChange?.(newContent);

          setTimeout(() => {
            textarea.selectionStart = start + 1;
            textarea.selectionEnd = end + 1;
          }, 0);
        }
      }
    },
    [content, onChange, onSave, tabSize]
  );

  // 同步滚动
  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const lineNumbers = lineNumbersRef.current;
    const highlight = highlightRef.current;

    if (textarea && lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop;
    }
    if (textarea && highlight) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
  }, []);

  // 格式化代码（简单实现）
  const formatCode = useCallback(() => {
    if (currentLang === "json") {
      try {
        const parsed = JSON.parse(content);
        const formatted = JSON.stringify(parsed, null, tabSize);
        setContent(formatted);
        onChange?.(formatted);
      } catch (e) {
        console.error("JSON format error:", e);
      }
    }
  }, [content, currentLang, onChange, tabSize]);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // 下载文件
  const handleDownload = useCallback(() => {
    const langInfo = SUPPORTED_LANGUAGES.find((l) => l.id === currentLang);
    const ext = langInfo?.ext[0] || ".txt";
    const filename = `code${ext}`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, currentLang]);

  // 搜索功能
  const handleSearch = useCallback(() => {
    if (!searchText || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const index = content.indexOf(searchText, textarea.selectionStart + 1);

    if (index !== -1) {
      textarea.focus();
      textarea.setSelectionRange(index, index + searchText.length);
    } else {
      // 从头开始搜索
      const firstIndex = content.indexOf(searchText);
      if (firstIndex !== -1) {
        textarea.focus();
        textarea.setSelectionRange(firstIndex, firstIndex + searchText.length);
      }
    }
  }, [content, searchText]);

  // 替换功能
  const handleReplace = useCallback(() => {
    if (!searchText || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (content.substring(start, end) === searchText) {
      const newContent =
        content.substring(0, start) + replaceText + content.substring(end);
      setContent(newContent);
      onChange?.(newContent);
    }
  }, [content, searchText, replaceText, onChange]);

  // 全部替换
  const handleReplaceAll = useCallback(() => {
    if (!searchText) return;

    const newContent = content.split(searchText).join(replaceText);
    setContent(newContent);
    onChange?.(newContent);
  }, [content, searchText, replaceText, onChange]);

  const bgColor = theme === "dark" ? "bg-gray-900" : "bg-white";
  const textColor = theme === "dark" ? "text-gray-100" : "text-gray-800";
  const lineNumColor = theme === "dark" ? "text-gray-500" : "text-gray-400";
  const borderColor = theme === "dark" ? "border-gray-700" : "border-gray-200";
  const toolbarBg = theme === "dark" ? "bg-gray-800" : "bg-gray-50";

  const containerClasses = `
    flex flex-col border ${borderColor} rounded-lg overflow-hidden ${bgColor}
    ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}
    ${className}
  `;

  return (
    <div className={containerClasses} style={{ height: isFullscreen ? "100vh" : height }}>
      {/* 工具栏 */}
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b ${borderColor} ${toolbarBg}`}>
        {/* 语言选择 */}
        <select
          value={currentLang}
          onChange={(e) => setCurrentLang(e.target.value)}
          className={`text-xs px-2 py-1 border ${borderColor} rounded ${bgColor} ${textColor}`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.name}
            </option>
          ))}
        </select>

        <div className={`w-px h-5 ${theme === "dark" ? "bg-gray-600" : "bg-gray-300"}`} />

        {/* 操作按钮 */}
        <button
          onClick={formatCode}
          title="格式化代码"
          className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors`}
        >
          格式化
        </button>

        <button
          onClick={() => setShowSearch(!showSearch)}
          title="搜索 (Ctrl+F)"
          className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors`}
        >
          🔍 搜索
        </button>

        <button
          onClick={handleDownload}
          title="下载文件"
          className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors`}
        >
          ⬇ 下载
        </button>

        <button
          onClick={() => onSave?.(content)}
          title="保存 (Ctrl+S)"
          className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors`}
        >
          💾 保存
        </button>

        <div className="flex-1" />

        {/* 字体大小 */}
        <span className={`text-xs ${lineNumColor}`}>{fontSize}px</span>

        {/* 全屏 */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏编辑"}
          className={`px-2 py-1 text-sm ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded transition-colors`}
        >
          ⛶
        </button>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <div className={`flex items-center gap-2 px-3 py-2 border-b ${borderColor} ${toolbarBg}`}>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索..."
            className={`flex-1 max-w-xs px-2 py-1 text-sm border ${borderColor} rounded ${bgColor} ${textColor} focus:outline-none focus:ring-1 focus:ring-blue-500`}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
              if (e.key === "Escape") setShowSearch(false);
            }}
          />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="替换为..."
            className={`flex-1 max-w-xs px-2 py-1 text-sm border ${borderColor} rounded ${bgColor} ${textColor} focus:outline-none focus:ring-1 focus:ring-blue-500`}
          />
          <button
            onClick={handleSearch}
            className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded`}
          >
            查找
          </button>
          <button
            onClick={handleReplace}
            className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded`}
          >
            替换
          </button>
          <button
            onClick={handleReplaceAll}
            className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded`}
          >
            全部替换
          </button>
          <button
            onClick={() => setShowSearch(false)}
            className={`px-2 py-1 text-xs ${textColor} hover:bg-gray-700 dark:hover:bg-gray-600 rounded`}
          >
            ✕
          </button>
        </div>
      )}

      {/* 编辑器主体 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 行号 */}
        {showLineNumbers && (
          <div
            ref={lineNumbersRef}
            className={`flex-shrink-0 py-4 px-2 text-right font-mono text-sm ${lineNumColor} ${bgColor} overflow-hidden select-none border-r ${borderColor}`}
            style={{ fontSize: `${fontSize}px`, lineHeight: "1.5", minWidth: "3em" }}
          >
            {lineNumbers.map((num) => (
              <div key={num} style={{ height: "1.5em" }}>
                {num}
              </div>
            ))}
          </div>
        )}

        {/* 编辑区 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 语法高亮层（背景） */}
          <pre
            ref={highlightRef}
            className={`absolute inset-0 p-4 font-mono ${textColor} pointer-events-none overflow-auto`}
            style={{ fontSize: `${fontSize}px`, lineHeight: "1.5", whiteSpace: wordWrap ? "pre-wrap" : "pre" }}
            aria-hidden="true"
          >
            <code
              dangerouslySetInnerHTML={{
                __html: highlightCode(content + "\n", currentLang, theme),
              }}
            />
          </pre>

          {/* 文本输入层 */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onSelect={(e) => updateCursorPosition(e.currentTarget)}
            onClick={(e) => updateCursorPosition(e.currentTarget)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`absolute inset-0 w-full h-full p-4 font-mono ${textColor} bg-transparent resize-none focus:outline-none caret-current`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: "1.5",
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
              color: "transparent",
              caretColor: theme === "dark" ? "#fff" : "#000",
            }}
            spellCheck={false}
          />
        </div>

        {/* 缩略图（Minimap） */}
        {showMinimap && (
          <div
            className={`w-24 flex-shrink-0 ${bgColor} border-l ${borderColor} overflow-hidden`}
          >
            <div
              className={`p-1 font-mono text-gray-500 overflow-hidden scale-[0.25] origin-top-left`}
              style={{ fontSize: `${fontSize}px`, lineHeight: "1.5", width: "400%" }}
            >
              {content}
            </div>
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className={`flex items-center justify-between px-3 py-1.5 text-xs ${lineNumColor} border-t ${borderColor} ${toolbarBg}`}>
        <div className="flex items-center gap-4">
          <span>行 {cursorPosition.line}, 列 {cursorPosition.column}</span>
          <span>{lineCount} 行</span>
          <span>{content.length} 字符</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>空格: {tabSize}</span>
          <span className="capitalize">{currentLang}</span>
        </div>
      </div>
    </div>
  );
}

export default CodeEditor;
