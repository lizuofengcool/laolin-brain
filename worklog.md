# 智能文档知识库 + 个人相册系统 - 工作日志

> 本文件记录每次开发的详细过程，用于上下文恢复

---

## 2026-05-26 09:21 - 会话 1

### 完成事项
- 与用户确认项目需求：文档知识库 + 智能相册二合一
- 确认技术栈：Next.js 15 + shadcn/ui + SQLite + Prisma
- 确认双存储模式：本地 IndexedDB / 服务端存储
- 确认三轮开发计划
- 确认为 Tauri 桌面版迁移预留架构
- 编写完整开发文档（dev-doc.md）

### 下一步
- 开始第一轮开发步骤 1.1（项目初始化）

---

## 2026-05-26 09:37 - 会话 2 - 第一轮 MVP 开发

### 完成事项

#### 1. 基础设施
- ✅ 安装依赖: mammoth, pdf-parse, idb, react-dropzone, browser-image-compression
- ✅ 更新 Prisma schema: User, File, Folder 三表设计
- ✅ 推送数据库 schema (db:push)

#### 2. 存储适配器架构
- ✅ `src/lib/storage/base.ts` - StorageAdapter 接口定义
- ✅ `src/lib/storage/indexeddb.ts` - IndexedDB 本地存储适配器
- ✅ `src/lib/storage/server.ts` - 服务端 API 存储适配器
- ✅ `src/lib/storage/factory.ts` - 存储工厂（按模式切换适配器）

#### 3. API 路由 (10 个)
- ✅ POST/GET `/api/auth/register`, `/api/auth/login`
- ✅ POST/GET/PUT/DELETE `/api/files`, `/api/files/[id]`
- ✅ POST/GET/DELETE `/api/folders`, `/api/folders/[id]`
- ✅ GET `/api/search`, PUT `/api/settings`

#### 4. 文档解析器
- ✅ Word (mammoth), PDF (pdf-parse), Image (thumbnail generation)

#### 5. Zustand 全局状态管理
- ✅ 认证、导航、文件 CRUD、文件夹、UI 状态、存储模式

#### 6. 前端组件 (16 个)
- ✅ 布局: Sidebar, Header, MobileNav
- ✅ 认证: LoginForm
- ✅ 仪表盘: StatsCard, RecentFiles
- ✅ 文件: FileCard, FileGrid, FolderTree, UploadZone, FilePreview
- ✅ 搜索: SearchBar, SearchResults
- ✅ 设置: StorageSwitch

#### 7. SPA 页面视图 (5 个)
- ✅ LoginView, DashboardView, FilesView, SearchView, SettingsView

#### 8. 代码质量
- ✅ ESLint 0 errors, 0 warnings
- ✅ TypeScript 严格类型, 响应式设计, 水合安全

### 注意事项
- 密码使用简单哈希（MVP 阶段）
- 认证 token 存 localStorage
- 本地存储文件以 base64 存 IndexedDB（大文件慎用）
- 云端存储文件保存在 upload/ 目录

---

## 2026-05-26 - 会话 3 - Bug 修复 + 第二轮 AI 能力开发

### 完成事项

#### Part 1: Bug 修复

##### 1. 修复 pdf-parse ESM 导入失败
- ✅ `src/lib/parser/pdf.ts` - 将 `import pdfParse from "pdf-parse"` 改为动态 `import()` 方式
- ✅ 使用 `pdfParseModule.default || pdfParseModule` 兼容 CJS 模块

##### 2. Lint 检查
- ✅ 所有文件通过 ESLint，0 errors, 0 warnings

##### 3. Dev Server 验证
- ✅ 服务器正常运行，页面返回 200

#### Part 2: 第二轮 AI 能力开发

##### 1. AI 服务封装
- ✅ `src/lib/ai/vision.ts` - 基于 z-ai-web-dev-sdk 的 AI 服务
  - `describeImage()` - 图片场景描述（关键词）
  - `extractTextFromImage()` - OCR 文字识别
  - `askAboutDocument()` - 文档智能问答
  - `askAboutImage()` - 图片智能问答

##### 2. AI API 路由 (4 个)
- ✅ POST `/api/ai/describe` - 图片场景描述
- ✅ POST `/api/ai/ocr` - 图片文字识别
- ✅ POST `/api/ai/ask` - AI 问答（文档/图片）
- ✅ POST `/api/ai/process-image` - 图片上传时自动处理（OCR + 描述）

##### 3. 文件上传流程更新
- ✅ 云端模式：图片上传后自动调用 AI 处理，OCR 文字存入 textContent，描述生成 tags
- ✅ 本地模式：图片上传后前端调用 `/api/ai/process-image`，结果持久化到 IndexedDB
- ✅ UploadZone 显示 AI 处理状态（"AI 正在分析图片..."）

##### 4. AI 前端组件
- ✅ `src/components/ai/AIChatPanel.tsx` - AI 问答面板
  - 侧滑面板（Sheet），显示当前文件名和类型
  - 支持文档（发送文本内容）和图片（发送 base64）的 AI 问答
  - 聊天记录本地保存，自动滚动
  - 从 FileCard / FilePreview / SearchResults 均可触发

##### 5. FileCard 更新
- ✅ 图片卡片左上角显示 "AI" 标签（有 AI 标签时）
- ✅ 图片卡片显示 OCR 文字预览（一行截断）
- ✅ 下拉菜单新增 "AI 解读" 选项
- ✅ 列表视图显示 Sparkles 图标（有 AI 标签时）
- ✅ 列表视图新增 AI 解读按钮

##### 6. FilePreview 更新
- ✅ 预览弹窗底部新增 "AI 解读" 按钮

##### 7. 搜索功能增强
- ✅ 搜索已支持匹配 textContent（包含 OCR 文字和 AI 描述）和 tags
- ✅ 图片文件如果有 AI 描述/OCR 文字，搜索结果会包含相关图片

##### 8. Zustand Store 更新
- ✅ 新增 `aiProcessing: boolean` - AI 处理中状态
- ✅ 新增 `aiChatFile: FileData | null` - 当前 AI 聊天的文件
- ✅ 新增 `setAiProcessing()` / `setAiChatFile()` 方法

#### Part 3: 代码质量
- ✅ ESLint 0 errors, 0 warnings
- ✅ Dev Server 编译成功
- ✅ 页面正常返回

### 技术要点
- z-ai-web-dev-sdk 仅在后端 API 路由中使用（符合安全约束）
- AI 处理对上传是同步等待的（云端模式）或异步触发后更新（本地模式）
- AI 标签最多 8 个，从描述关键词中提取
- AI 聊天面板通过 Zustand store 的 aiChatFile 驱动显示

---
