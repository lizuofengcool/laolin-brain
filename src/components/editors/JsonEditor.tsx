"use client";

import React, { useState, useMemo, useCallback } from "react";

// ==================== 类型定义 ====================

export interface JsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
  defaultView?: "code" | "tree";
  indentSize?: number;
  className?: string;
}

// ==================== JSON树节点类型 ====================

interface TreeNode {
  key: string;
  value: any;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  children?: TreeNode[];
  path: string;
}

// ==================== 解析JSON为树结构 ====================

function parseJsonToTree(data: any, key: string = "root", path: string = ""): TreeNode {
  const currentPath = path ? `${path}.${key}` : key;

  if (data === null) {
    return { key, value: null, type: "null", path: currentPath };
  }

  if (Array.isArray(data)) {
    return {
      key,
      value: data,
      type: "array",
      path: currentPath,
      children: data.map((item, index) =>
        parseJsonToTree(item, `[${index}]`, currentPath)
      ),
    };
  }

  if (typeof data === "object") {
    return {
      key,
      value: data,
      type: "object",
      path: currentPath,
      children: Object.entries(data).map(([k, v]) =>
        parseJsonToTree(v, k, currentPath)
      ),
    };
  }

  if (typeof data === "string") {
    return { key, value: data, type: "string", path: currentPath };
  }

  if (typeof data === "number") {
    return { key, value: data, type: "number", path: currentPath };
  }

  if (typeof data === "boolean") {
    return { key, value: data, type: "boolean", path: currentPath };
  }

  return { key, value: data, type: "string", path: currentPath };
}

// ==================== JSON树节点组件 ====================

interface JsonTreeNodeProps {
  node: TreeNode;
  level: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  searchText: string;
}

function JsonTreeNode({
  node,
  level,
  expandedPaths,
  onToggle,
  searchText,
}: JsonTreeNodeProps) {
  const isExpandable = node.type === "object" || node.type === "array";
  const isExpanded = expandedPaths.has(node.path);

  const typeColors: Record<string, string> = {
    object: "text-purple-500",
    array: "text-blue-500",
    string: "text-green-600 dark:text-green-400",
    number: "text-orange-500",
    boolean: "text-yellow-600 dark:text-yellow-400",
    null: "text-gray-500",
  };

  const highlightText = (text: string) => {
    if (!searchText) return text;
    const regex = new RegExp(`(${searchText})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const renderValue = () => {
    if (node.type === "string") {
      return (
        <span className={typeColors.string}>
          "{highlightText(String(node.value))}"
        </span>
      );
    }
    if (node.type === "number") {
      return <span className={typeColors.number}>{node.value}</span>;
    }
    if (node.type === "boolean") {
      return (
        <span className={typeColors.boolean}>{String(node.value)}</span>
      );
    }
    if (node.type === "null") {
      return <span className={typeColors.null}>null</span>;
    }
    if (node.type === "object") {
      return (
        <span className={typeColors.object}>
          {"{"}
          {!isExpanded && ` ${node.children?.length || 0} keys `}
          {!isExpanded && "}"}
        </span>
      );
    }
    if (node.type === "array") {
      return (
        <span className={typeColors.array}>
          [
          {!isExpanded && ` ${node.children?.length || 0} items `}
          {!isExpanded && "]"}
        </span>
      );
    }
    return null;
  };

  return (
    <div>
      <div
        className="flex items-start py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer rounded px-1"
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={() => isExpandable && onToggle(node.path)}
      >
        {/* 展开/折叠图标 */}
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 mr-1">
          {isExpandable ? (
            isExpanded ? (
              <span className="text-xs">▼</span>
            ) : (
              <span className="text-xs">▶</span>
            )
          ) : (
            <span className="text-xs">•</span>
          )}
        </span>

        {/* Key */}
        {node.key !== "root" && (
          <>
            <span className="text-rose-600 dark:text-rose-400 font-medium">
              {highlightText(node.key)}
            </span>
            <span className="text-gray-500 mx-1">:</span>
          </>
        )}

        {/* Value */}
        <span className="font-mono text-sm">{renderValue()}</span>

        {/* 类型标签 */}
        <span className="ml-2 text-xs text-gray-400 uppercase">
          {node.type}
        </span>
      </div>

      {/* 子节点 */}
      {isExpandable && isExpanded && node.children && (
        <div>
          {node.children.map((child, index) => (
            <JsonTreeNode
              key={`${child.path}-${index}`}
              node={child}
              level={level + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              searchText={searchText}
            />
          ))}
          {/* 闭合括号 */}
          <div
            className="py-0.5 text-gray-400 font-mono text-sm"
            style={{ paddingLeft: `${level * 20 + 20}px` }}
          >
            {node.type === "object" ? "}" : "]"}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 主组件 ====================

export function JsonEditor({
  value,
  onChange,
  onSave,
  readOnly = false,
  height = "500px",
  defaultView = "code",
  indentSize = 2,
  className = "",
}: JsonEditorProps) {
  const [viewMode, setViewMode] = useState<"code" | "tree">(defaultView);
  const [searchText, setSearchText] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["root"]));
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 解析JSON
  const parsedData = useMemo(() => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }, [value]);

  // 验证状态
  const validation = useMemo(() => {
    try {
      JSON.parse(value);
      return { valid: true, error: null };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }, [value]);

  // 树结构
  const treeData = useMemo(() => {
    if (!parsedData) return null;
    return parseJsonToTree(parsedData);
  }, [parsedData]);

  // 统计信息
  const stats = useMemo(() => {
    if (!parsedData) return null;

    let objectCount = 0;
    let arrayCount = 0;
    let stringCount = 0;
    let numberCount = 0;
    let booleanCount = 0;
    let nullCount = 0;

    function count(data: any) {
      if (data === null) {
        nullCount++;
        return;
      }
      if (Array.isArray(data)) {
        arrayCount++;
        data.forEach(count);
        return;
      }
      if (typeof data === "object") {
        objectCount++;
        Object.values(data).forEach(count);
        return;
      }
      if (typeof data === "string") stringCount++;
      if (typeof data === "number") numberCount++;
      if (typeof data === "boolean") booleanCount++;
    }

    count(parsedData);

    return {
      objectCount,
      arrayCount,
      stringCount,
      numberCount,
      booleanCount,
      nullCount,
      totalKeys: objectCount + arrayCount + stringCount + numberCount + booleanCount + nullCount,
    };
  }, [parsedData]);

  // 格式化JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, indentSize);
      onChange?.(formatted);
    } catch (e) {
      console.error("JSON format error:", e);
    }
  }, [value, onChange, indentSize]);

  // 压缩JSON
  const minifyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(value);
      const minified = JSON.stringify(parsed);
      onChange?.(minified);
    } catch (e) {
      console.error("JSON minify error:", e);
    }
  }, [value, onChange]);

  // 切换节点展开
  const toggleNode = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // 展开全部
  const expandAll = useCallback(() => {
    if (!treeData?.children) return;

    const allPaths = new Set<string>();

    function collectPaths(node: TreeNode) {
      allPaths.add(node.path);
      if (node.children) {
        node.children.forEach(collectPaths);
      }
    }

    collectPaths(treeData);
    setExpandedPaths(allPaths);
  }, [treeData]);

  // 折叠全部
  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(["root"]));
  }, []);

  // 复制为代码
  const copyAsCode = useCallback(() => {
    navigator.clipboard.writeText(value);
  }, [value]);

  // 数据转换
  const convertTo = useCallback(
    (format: "csv" | "xml" | "yaml") => {
      if (!parsedData) return;

      let result = "";

      if (format === "csv") {
        // 简单的JSON转CSV（只处理数组）
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          const headers = Object.keys(parsedData[0]);
          result = headers.join(",") + "\n";
          result += parsedData
            .map((row: any) =>
              headers
                .map((h) => {
                  const val = row[h];
                  if (typeof val === "string" && val.includes(",")) {
                    return `"${val}"`;
                  }
                  return String(val ?? "");
                })
                .join(",")
            )
            .join("\n");
        } else {
          result = "Error: 只有数组类型的JSON才能转换为CSV";
        }
      } else if (format === "xml") {
        // 简单的JSON转XML
        function jsonToXml(data: any, tagName: string = "root"): string {
          if (data === null) return `<${tagName} null="true"/>`;
          if (typeof data === "string") return `<${tagName}>${data}</${tagName}>`;
          if (typeof data === "number" || typeof data === "boolean")
            return `<${tagName}>${data}</${tagName}>`;
          if (Array.isArray(data)) {
            return data
              .map((item) => jsonToXml(item, "item"))
              .join("\n");
          }
          if (typeof data === "object") {
            const children = Object.entries(data)
              .map(([key, val]) => jsonToXml(val, key))
              .join("\n  ");
            return `<${tagName}>\n  ${children}\n</${tagName}>`;
          }
          return "";
        }
        result = jsonToXml(parsedData);
      } else if (format === "yaml") {
        // 简单的JSON转YAML
        function jsonToYaml(data: any, indent: number = 0): string {
          const spaces = "  ".repeat(indent);
          if (data === null) return "null";
          if (typeof data === "string") return data;
          if (typeof data === "number" || typeof data === "boolean")
            return String(data);
          if (Array.isArray(data)) {
            return data
              .map((item) => `${spaces}- ${jsonToYaml(item, indent + 1).trim()}`)
              .join("\n");
          }
          if (typeof data === "object") {
            return Object.entries(data)
              .map(([key, val]) => {
                if (typeof val === "object" && val !== null) {
                  return `${spaces}${key}:\n${jsonToYaml(val, indent + 1)}`;
                }
                return `${spaces}${key}: ${jsonToYaml(val, indent + 1)}`;
              })
              .join("\n");
          }
          return "";
        }
        result = jsonToYaml(parsedData);
      }

      // 复制到剪贴板
      navigator.clipboard.writeText(result);
      alert(`已转换为${format.toUpperCase()}格式并复制到剪贴板`);
    },
    [parsedData]
  );

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const containerClasses = `
    flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900
    ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}
    ${className}
  `;

  return (
    <div className={containerClasses} style={{ height: isFullscreen ? "100vh" : height }}>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* 视图切换 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("code")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "code"
                ? "bg-blue-500 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            代码
          </button>
          <button
            onClick={() => setViewMode("tree")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "tree"
                ? "bg-blue-500 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            树状
          </button>
        </div>

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 格式化操作 */}
        <button
          onClick={formatJson}
          disabled={!validation.valid}
          title="格式化JSON"
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          格式化
        </button>
        <button
          onClick={minifyJson}
          disabled={!validation.valid}
          title="压缩JSON"
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          压缩
        </button>

        {viewMode === "tree" && (
          <>
            <button
              onClick={expandAll}
              disabled={!validation.valid}
              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              展开全部
            </button>
            <button
              onClick={collapseAll}
              disabled={!validation.valid}
              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              折叠全部
            </button>
          </>
        )}

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 搜索 */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索..."
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
        />

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 数据转换 */}
        <select
          onChange={(e) => {
            if (e.target.value) {
              convertTo(e.target.value as "csv" | "xml" | "yaml");
              e.target.value = "";
            }
          }}
          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
          defaultValue=""
          disabled={!validation.valid}
        >
          <option value="" disabled>
            转换
          </option>
          <option value="csv">转CSV</option>
          <option value="xml">转XML</option>
          <option value="yaml">转YAML</option>
        </select>

        <button
          onClick={copyAsCode}
          title="复制JSON"
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          复制
        </button>

        <div className="flex-1" />

        {/* 验证状态 */}
        {validation.valid ? (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            有效JSON
          </span>
        ) : (
          <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            格式错误
          </span>
        )}

        {/* 全屏 */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏编辑"}
          className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          ⛶
        </button>
      </div>

      {/* 编辑器主体 */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "code" ? (
          /* 代码视图 */
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            readOnly={readOnly}
            className="w-full h-full p-4 font-mono text-sm resize-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none"
            spellCheck={false}
          />
        ) : (
          /* 树状视图 */
          <div className="h-full overflow-auto p-4 font-mono text-sm">
            {validation.valid && treeData ? (
              <JsonTreeNode
                node={treeData}
                level={0}
                expandedPaths={expandedPaths}
                onToggle={toggleNode}
                searchText={searchText}
              />
            ) : (
              <div className="text-red-500 dark:text-red-400">
                <p className="font-semibold">JSON解析错误</p>
                <p className="text-sm mt-2">{validation.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          {stats && (
            <>
              <span>对象: {stats.objectCount}</span>
              <span>数组: {stats.arrayCount}</span>
              <span>字符串: {stats.stringCount}</span>
              <span>数字: {stats.numberCount}</span>
              <span>布尔: {stats.booleanCount}</span>
              <span>null: {stats.nullCount}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{value.length} 字符</span>
          <span>JSON</span>
        </div>
      </div>
    </div>
  );
}

export default JsonEditor;
