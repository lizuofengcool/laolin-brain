"use client";

import React, { useState } from "react";
import { MarkdownEditor, CodeEditor, JsonEditor, CsvViewer } from "@/components/editors";

// ==================== 示例数据 ====================

const sampleMarkdown = `# 在线Markdown编辑器

欢迎使用 **laolin-brain** 在线Markdown编辑器！

## 功能特性

- ✨ 实时预览
- 🎨 语法高亮
- 📝 工具栏快捷操作
- ⌨️ 快捷键支持
- 📤 导出功能

## 代码示例

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
  return "Welcome to laolin-brain";
}
\`\`\`

## 表格示例

| 功能 | 状态 | 说明 |
|------|------|------|
| Markdown编辑 | ✅ | 完整支持 |
| 实时预览 | ✅ | 分屏显示 |
| 语法高亮 | ✅ | 多种语言 |
| 导出功能 | ✅ | HTML/PDF |

## 引用

> 这是一段引用文字
> 可以用来强调重要内容

## 列表

### 无序列表
- 项目一
- 项目二
  - 子项目A
  - 子项目B
- 项目三

### 有序列表
1. 第一步
2. 第二步
3. 第三步

---

*斜体文本* 和 **粗体文本** 和 ~~删除线~~

[访问GitHub](https://github.com)
`;

const sampleCode = `// laolin-brain - 个人私有第二大脑
// 示例代码：文件管理系统

import { useState, useCallback, useMemo } from "react";
import { File, Folder, Tag } from "@/types";

interface FileManagerProps {
  files: File[];
  folders: Folder[];
  onFileSelect?: (file: File) => void;
  onFolderCreate?: (name: string) => void;
}

export function FileManager({
  files,
  folders,
  onFileSelect,
  onFolderCreate,
}: FileManagerProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");

  // 筛选文件
  const filteredFiles = useMemo(() => {
    let result = files.filter((f) => f.folderId === currentFolder);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.fileName.toLowerCase().includes(query) ||
          f.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }

    return result;
  }, [files, currentFolder, searchQuery]);

  // 切换文件选择
  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  // 批量操作
  const handleBatchDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    const confirmed = window.confirm(
      \`确定要删除 \${selectedFiles.size} 个文件吗？\`
    );

    if (confirmed) {
      // 执行删除操作
      console.log("Deleting files:", Array.from(selectedFiles));
      setSelectedFiles(new Set());
    }
  }, [selectedFiles]);

  return (
    <div className="file-manager">
      <header className="toolbar">
        <input
          type="text"
          placeholder="搜索文件..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button onClick={handleBatchDelete}>
          删除选中 ({selectedFiles.size})
        </button>
      </header>

      <div className="file-list">
        {filteredFiles.map((file) => (
          <div
            key={file.id}
            className={\`file-item \${selectedFiles.has(file.id) ? "selected" : ""}\`}
            onClick={() => {
              toggleFileSelection(file.id);
              onFileSelect?.(file);
            }}
          >
            <span className="file-name">{file.fileName}</span>
            <span className="file-size">{formatFileSize(file.fileSize)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 工具函数
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return \`\${bytes} B\`;
  if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(1)} KB\`;
  if (bytes < 1024 * 1024 * 1024) return \`\${(bytes / (1024 * 1024)).toFixed(1)} MB\`;
  return \`\${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB\`;
}

export default FileManager;
`;

const sampleJson = `{
  "name": "laolin-brain",
  "version": "1.0.0",
  "description": "个人私有第二大脑",
  "features": [
    "文件管理",
    "知识图谱",
    "AI智能",
    "云端同步",
    "多租户支持"
  ],
  "techStack": {
    "frontend": {
      "framework": "Next.js 16",
      "ui": "shadcn/ui",
      "style": "Tailwind CSS 4",
      "language": "TypeScript"
    },
    "backend": {
      "api": "Next.js API Routes",
      "orm": "Prisma",
      "database": "SQLite"
    },
    "desktop": {
      "framework": "Tauri 2.0",
      "language": "Rust"
    }
  },
  "modules": {
    "fileManager": {
      "enabled": true,
      "version": "2.0",
      "features": ["上传", "下载", "分享", "版本控制"]
    },
    "aiAssistant": {
      "enabled": true,
      "version": "1.5",
      "features": ["摘要", "OCR", "智能标签", "问答"]
    },
    "knowledgeGraph": {
      "enabled": true,
      "version": "1.2",
      "features": ["实体识别", "关系提取", "可视化"]
    }
  },
  "stats": {
    "totalUsers": 1000,
    "totalFiles": 50000,
    "totalStorage": "10TB",
    "dailyActive": 500
  },
  "settings": {
    "theme": "dark",
    "language": "zh-CN",
    "timezone": "Asia/Shanghai",
    "autoSave": true,
    "autoSync": true
  }
}`;

const sampleCsv = `姓名,年龄,城市,职业,薪资,入职日期
张三,28,北京,软件工程师,15000,2022-03-15
李四,32,上海,产品经理,18000,2021-06-20
王五,25,广州,设计师,12000,2023-01-10
赵六,35,深圳,架构师,25000,2020-09-05
钱七,29,杭州,数据分析师,16000,2022-07-12
孙八,27,成都,前端工程师,14000,2023-02-28
周九,31,武汉,后端工程师,17000,2021-11-18
吴十,26,南京,测试工程师,11000,2023-04-01
郑十一,33,西安,运维工程师,15500,2020-12-15
王十二,24,重庆,实习生,8000,2024-01-01`;

// ==================== 主组件 ====================

export default function EditorsDemoPage() {
  const [activeTab, setActiveTab] = useState<"markdown" | "code" | "json" | "csv">("markdown");
  const [markdownValue, setMarkdownValue] = useState(sampleMarkdown);
  const [codeValue, setCodeValue] = useState(sampleCode);
  const [jsonValue, setJsonValue] = useState(sampleJson);
  const [csvValue, setCsvValue] = useState(sampleCsv);

  const tabs = [
    { id: "markdown", label: "Markdown编辑器", icon: "📝" },
    { id: "code", label: "代码编辑器", icon: "💻" },
    { id: "json", label: "JSON编辑器", icon: "📋" },
    { id: "csv", label: "CSV查看器", icon: "📊" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            在线编辑器演示
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            laolin-brain 提供多种在线编辑器，支持 Markdown、代码、JSON、CSV 等格式
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                ${activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }
              `}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 编辑器内容 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          {activeTab === "markdown" && (
            <div>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Markdown 编辑器
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  支持实时预览、语法高亮、工具栏快捷操作、快捷键支持
                </p>
              </div>
              <div className="p-4">
                <MarkdownEditor
                  value={markdownValue}
                  onChange={setMarkdownValue}
                  height="600px"
                  onSave={(value) => {
                    console.log("Saved:", value.length, "characters");
                    alert("保存成功！");
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "code" && (
            <div>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  代码编辑器
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  支持 20+ 种编程语言语法高亮、代码折叠、搜索替换、自动缩进
                </p>
              </div>
              <div className="p-4">
                <CodeEditor
                  value={codeValue}
                  onChange={setCodeValue}
                  language="typescript"
                  height="600px"
                  theme="dark"
                  onSave={(value) => {
                    console.log("Saved:", value.length, "characters");
                    alert("保存成功！");
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "json" && (
            <div>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  JSON 编辑器
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  支持代码/树状双视图、格式化/压缩、数据转换（CSV/XML/YAML）
                </p>
              </div>
              <div className="p-4">
                <JsonEditor
                  value={jsonValue}
                  onChange={setJsonValue}
                  height="600px"
                  defaultView="tree"
                  onSave={(value) => {
                    console.log("Saved:", value.length, "characters");
                    alert("保存成功！");
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "csv" && (
            <div>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  CSV 查看器
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  支持表格展示、列排序、筛选、搜索、单元格编辑、导出JSON
                </p>
              </div>
              <div className="p-4">
                <CsvViewer
                  value={csvValue}
                  onChange={setCsvValue}
                  height="600px"
                  readOnly={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* 功能说明 */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">📝</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Markdown编辑
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              实时预览、语法高亮、工具栏、快捷键、导出HTML
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">💻</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              代码编辑
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              20+语言支持、搜索替换、自动缩进、括号匹配
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">📋</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              JSON编辑
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              双视图切换、树状浏览、格式化压缩、数据转换
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              CSV查看
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              表格展示、排序筛选、单元格编辑、导出JSON
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
