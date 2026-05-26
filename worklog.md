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
