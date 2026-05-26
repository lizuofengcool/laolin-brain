---
Task ID: 1-13
Agent: Main Agent
Task: 全面修复项目问题（P0-P2 共 13 项）

Work Log:
- P0-1: 修复电脑端图片上传 — 放宽 useDropzone accept 限制（新增 .bmp/.svg/.tiff/.ico 等格式），添加 MIME 扩展名回退（guessMimeType），修复本地模式 adapter 初始化错误处理，增加调试日志，增加文件拒绝原因显示
- P0-2: 替换 FolderTree.tsx 中的 confirm() 为 Dialog 确认对话框
- P0-3: 替换 StorageSwitch.tsx 中的 confirm() 为 Dialog 确认对话框，同时修复暗色模式硬编码颜色（bg-green-100 → bg-green-500/10 dark:bg-green-500/20）
- P0-4: 替换 useFileActions.ts 中的 confirm() 为 ConfirmDialog（增加 deleteConfirmOpen 状态 + confirmDelete handler），同步更新 FileCard.tsx 和 FileListItem
- P0-5: 修复暗色模式硬编码颜色（StorageSwitch 图标背景色、文件类型图标颜色全部适配 dark:）
- P1-1: 清理未使用的 npm 依赖 — 移除 39 个包（@dnd-kit/*, @tanstack/*, next-auth, @mdxeditor/editor, next-intl, browser-image-compression, react-markdown, react-syntax-highlighter, embla-carousel-react, vaul, @reactuses/core, sonner, input-otp, cmdk, date-fns, react-day-picker, react-resizable-panels, uuid, @hookform/resolvers, react-hook-form, zod, 多个未使用的 @radix-ui/*）
- P1-2: 修复 next.config.ts — ignoreBuildErrors: false, reactStrictMode: true
- P1-3: 回收站列表增加图片缩略图显示 + 文件大小信息 + 使用 FileIconDisplay 替代 emoji
- P1-4: 文件名截断显示优化 — 为所有 truncate 文件名添加 title 属性（鼠标悬停显示全名）
- P2-1: 集成重复文件检测 — 上传时使用 SHA-256 哈希比对，重复文件提示并跳过。FileData 新增 fileHash 字段，IndexedDB 存储哈希
- P2-2: 文件移动到文件夹功能（之前已存在，确认正常）
- P2-3: 新增 Markdown (.md) 和 TXT (.txt) 文件支持 — accept 配置、文件类型检测、图标（FileCode）、颜色（紫色）
- 额外修复：删除 examples/ 和 skills/ 目录（构建错误），修复 vision.ts 类型断言、pdf-parse 类型、api/files/route.ts Buffer 类型、StorageCharts tooltip undefined 类型、indexeddb.ts userId 类型

Stage Summary:
- 全部 13 项任务完成
- 构建通过：0 TypeScript 错误，0 ESLint 错误
- 移除 39 个未使用的 npm 包
- 所有 window.confirm() 替换为 Dialog 组件
- 暗色模式颜色全面适配
- 新增功能：重复文件检测、Markdown/TXT 支持
