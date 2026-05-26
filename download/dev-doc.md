# 智能文档知识库 + 个人相册系统 - 开发文档

> **项目代号**: KnowledgeBase-Album  
> **创建时间**: 2026-05-26  
> **最后更新**: 2026-05-26  
> **当前状态**: ✅ 第三轮开发完成  
> **技术栈**: Next.js 16 + shadcn/ui + SQLite + Prisma  
> **存储模式**: 双模式（本地 IndexedDB / 服务端存储）  
> **迁移预留**: Tauri 桌面版 / App 移动端

---

## 一、项目概述

### 1.1 产品定位
个人私有"第二大脑"= 文档知识库 + 智能相册 二合一产品。

### 1.2 核心价值
- 文档和图片统一管理，一个搜索框搞定所有内容检索
- 支持"本地保存"和"云端上传"双模式切换
- 后续可迁移至 Tauri 桌面版 / App 移动端

### 1.3 目标用户
职场人士、学生、需要管理大量文档和照片的个人用户。

### 1.4 竞品差异化
- Notion 只做文档，一刻相册只做图片 → 本产品二合一
- 支持本地保存模式，隐私安全
- AI 能力增强检索体验

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 技术选择 | 说明 |
|------|---------|------|
| 前端框架 | Next.js 15 (App Router) | 前后端一体 |
| UI 组件库 | shadcn/ui + Tailwind CSS | 美观现代的界面 |
| 数据库 | SQLite + Prisma ORM | 服务端数据存储 |
| 本地存储 | IndexedDB (浏览器) | 本地模式文件存储 |
| 文档解析 | mammoth (Word) + pdf-parse (PDF) | 文本提取 |
| 图片处理 | browser-image-compression | 图片压缩预览 |
| 认证 | NextAuth.js | 用户登录注册 |
| 状态管理 | React Context + Zustand | 全局状态 |

### 2.2 架构设计图（存储层分离，为 Tauri 迁移预留）

```
┌─────────────────────────────────────┐
│             前端 UI 层               │
│   (React 组件，可复用到 Tauri/App)    │
├─────────────────────────────────────┤
│           业务逻辑层（独立模块）        │
│  搜索引擎 / 文件解析 / 标签管理 / AI  │
├────────────┬────────────────────────┤
│ 存储适配器A │      存储适配器B        │
│ IndexedDB  │    服务端 API           │
│ (本地模式)  │    (云端模式)           │
├────────────┴────────────────────────┤
│       【未来预留】Tauri 存储适配器     │
│       (本地文件系统直接读写)           │
├─────────────────────────────────────┤
│       【未来预留】App 存储适配器       │
│       (React Native 本地存储)        │
└─────────────────────────────────────┘
```

### 2.3 关键设计原则
1. **业务逻辑与存储层完全分离**：存储方式可随时切换，不影响业务
2. **前端组件与框架无关**：UI 组件可复用到 Tauri / App
3. **API 接口统一封装**：更换存储后端只需实现新适配器
4. **数据库操作抽象**：所有数据操作通过 Service 层，不直接操作数据库

### 2.4 数据库设计

#### 用户表 (User)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| name | String | 用户名 |
| email | String | 邮箱，唯一 |
| password | String | 加密密码 |
| storageMode | String | 'local' / 'cloud' |
| storageUsed | Int | 已用空间（字节） |
| createdAt | DateTime | 创建时间 |

#### 文件表 (File)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| userId | String | 所属用户 |
| fileName | String | 文件名 |
| fileType | String | 'word' / 'pdf' / 'image' |
| fileSize | Int | 文件大小（字节） |
| filePath | String? | 服务端存储路径（云端模式） |
| fileData | String? | Base64 数据（本地模式存 IndexedDB） |
| textContent | String? | 提取的文本内容 |
| thumbnailUrl | String? | 缩略图地址 |
| storageMode | String | 'local' / 'cloud' |
| folderId | String? | 所属文件夹 |
| tags | String[] | 标签列表 |
| isFavorite | Boolean | 是否收藏 |
| createdAt | DateTime | 上传时间 |
| updatedAt | DateTime | 更新时间 |

#### 文件夹表 (Folder)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| userId | String | 所属用户 |
| name | String | 文件夹名 |
| parentId | String? | 父文件夹 |
| createdAt | DateTime | 创建时间 |

#### AI 识别结果表（第二轮加）(AIResult)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| fileId | String | 关联文件 |
| ocrText | String? | OCR 识别文字 |
| imageDescription | String? | 图像描述 |
| faceNames | String[]? | 识别到的人名 |
| tags | String[]? | 自动生成标签 |
| createdAt | DateTime | 创建时间 |

### 2.5 项目目录结构

```
/home/z/my-project/
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── page.tsx            # 首页/仪表盘
│   │   ├── login/page.tsx      # 登录页
│   │   ├── register/page.tsx   # 注册页
│   │   ├── files/page.tsx      # 文件管理页
│   │   ├── search/page.tsx     # 搜索页
│   │   ├── upload/page.tsx     # 上传页
│   │   ├── settings/page.tsx   # 设置页（含存储模式切换）
│   │   └── api/                # API 路由
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── files/route.ts          # 文件 CRUD
│   │       ├── upload/route.ts         # 文件上传
│   │       ├── search/route.ts         # 搜索接口
│   │       ├── folders/route.ts        # 文件夹管理
│   │       └── ai/route.ts             # AI 接口（第二轮）
│   ├── components/             # UI 组件
│   │   ├── ui/                 # shadcn/ui 基础组件
│   │   ├── FileCard.tsx        # 文件卡片
│   │   ├── FileList.tsx        # 文件列表
│   │   ├── SearchBar.tsx       # 搜索栏
│   │   ├── Sidebar.tsx         # 侧边栏导航
│   │   ├── UploadZone.tsx      # 拖拽上传区
│   │   ├── FilePreview.tsx     # 文件预览
│   │   └── StorageSwitch.tsx   # 存储模式切换
│   ├── lib/                    # 工具库
│   │   ├── storage/            # ⭐ 存储适配器（关键！Tauri迁移核心）
│   │   │   ├── base.ts         # 存储接口定义
│   │   │   ├── indexeddb.ts    # IndexedDB 适配器（本地模式）
│   │   │   ├── server.ts       # 服务端存储适配器（云端模式）
│   │   │   └── factory.ts      # 存储工厂（根据模式选择适配器）
│   │   ├── parser/             # 文件解析器
│   │   │   ├── word.ts         # Word 文档解析
│   │   │   ├── pdf.ts          # PDF 文档解析
│   │   │   └── image.ts        # 图片处理
│   │   ├── db.ts               # Prisma 数据库客户端
│   │   ├── auth.ts             # 认证配置
│   │   └── utils.ts            # 通用工具
│   ├── hooks/                  # React Hooks
│   │   ├── useStorage.ts       # 存储操作 Hook
│   │   ├── useSearch.ts        # 搜索 Hook
│   │   └── useUpload.ts        # 上传 Hook
│   ├── store/                  # 全局状态
│   │   └── settings-store.ts   # 设置状态（存储模式等）
│   └── types/                  # TypeScript 类型定义
│       └── index.ts
├── prisma/
│   └── schema.prisma           # 数据库 Schema
├── public/                     # 静态资源
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── .env                        # 环境变量
```

---

## 三、开发计划（三轮）

### 第一轮：基础骨架 MVP
> 目标：纯文档知识库可用，支持本地/云端双模式

| 步骤 | 内容 | 预计耗时 | 状态 |
|------|------|---------|------|
| 1.1 | 项目初始化 + 依赖安装 | - | ✅ 已完成 |
| 1.2 | 数据库 Schema 设计 + Prisma 配置 | - | ✅ 已完成 |
| 1.3 | 存储适配器架构搭建（base/indexeddb/server/factory） | - | ✅ 已完成 |
| 1.4 | 用户认证系统（注册/登录/登出） | - | ✅ 已完成 |
| 1.5 | 文件上传功能（拖拽+选择，支持 Word/PDF/图片） | - | ✅ 已完成 |
| 1.6 | 文档解析模块（Word→mammoth，PDF→pdf-parse） | - | ✅ 已完成 |
| 1.7 | 文件管理界面（列表/网格视图、标签、收藏、文件夹） | - | ✅ 已完成 |
| 1.8 | 全局搜索功能（文本匹配，文档+图片） | - | ✅ 已完成 |
| 1.9 | 存储模式切换设置页面 | - | ✅ 已完成 |
| 1.10 | 用户仪表盘首页（空间统计、最近文件、快捷操作） | - | ✅ 已完成 |
| 1.11 | UI 美化 + 响应式适配 | - | ✅ 已完成 |
| 1.12 | 自检测试 + 修复 | - | ✅ 已完成 |

### 第二轮：AI 能力对接
> 目标：文档+图片混合搜索成型

| 步骤 | 内容 | 预计耗时 | 状态 |
|------|------|---------|------|
| 2.1 | AI API 接口对接框架搭建（z-ai-web-dev-sdk） | - | ✅ 已完成 |
| 2.2 | 图片上传 + OCR 文字识别入库 | - | ✅ 已完成 |
| 2.3 | 图片场景/物品语义识别 | - | ✅ 已完成 |
| 2.4 | AI 问答：选中文档/图片，AI 解读内容 | - | ✅ 已完成 |
| 2.5 | 搜索结果优化（按相关性排序） | - | ✅ 已完成 |
| 2.6 | 自检测试 + 修复 | - | ✅ 已完成 |

### 第三轮：高级功能
> 目标：一刻相册同款体验 + UI 精细化

| 步骤 | 内容 | 预计耗时 | 状态 |
|------|------|---------|------|
| 3.1 | PPT 文件上传 + 逐页解析 | - | ✅ 已完成 |
| 3.2 | 人脸聚类识别 + 人名标注 | - | ⏳ 待开发 |
| 3.3 | 人名关键词搜索照片 | - | ⏳ 待开发 |
| 3.4 | 时间线浏览模式 | - | ✅ 已完成 |
| 3.5 | 语义搜索（向量检索） | - | ⏳ 待开发 |
| 3.6 | UI 全面优化 + 动画效果 | - | ✅ 已完成 |
| 3.7 | 性能优化（大文件处理、分页加载） | - | ✅ 已完成 |
| 3.8 | 自检测试 + 修复 | - | ✅ 已完成 |

---

## 四、第一轮详细开发步骤

### 步骤 1.1 - 项目初始化
- 使用 fullstack-dev 技能初始化 Next.js 15 项目
- 安装依赖：shadcn/ui, prisma, next-auth, mammoth, pdf-parse, zustand, idb, browser-image-compression, react-dropzone, lucide-react
- 配置 Tailwind CSS
- 配置 .env 环境变量

### 步骤 1.2 - 数据库设计
- 创建 Prisma schema（用户、文件、文件夹三张表）
- 执行 prisma generate + prisma db push
- 创建数据库种子数据

### 步骤 1.3 - 存储适配器架构
- **base.ts**: 定义 IStorageAdapter 接口
  - upload(file): 上传文件
  - download(fileId): 下载文件
  - delete(fileId): 删除文件
  - getFileContent(fileId): 获取文件内容
  - searchFiles(query): 搜索文件
  - updateFile(fileId, data): 更新文件信息
- **indexeddb.ts**: 实现 IndexedDB 适配器（本地模式）
- **server.ts**: 实现服务端存储适配器（云端模式）
- **factory.ts**: 根据 storageMode 返回对应适配器

### 步骤 1.4 - 用户认证
- 配置 NextAuth.js（Credentials Provider）
- 登录页面 /register + /login
- 注册时同步创建用户记录
- 登录状态保护（中间件）
- 登录后跳转到仪表盘

### 步骤 1.5 - 文件上传
- 拖拽上传组件（react-dropzone）
- 支持格式：.docx, .pdf, .jpg, .jpeg, .png, .webp
- 文件大小限制：单文件 50MB
- 上传进度显示
- 根据当前存储模式自动选择适配器

### 步骤 1.6 - 文档解析
- Word 解析：使用 mammoth 提取纯文本
- PDF 解析：使用 pdf-parse 提取纯文本
- 图片：生成缩略图，提取基本信息
- 解析结果存入文件记录的 textContent 字段

### 步骤 1.7 - 文件管理界面
- 侧边栏：文件夹树 + 标签筛选
- 主区域：文件列表（网格/列表视图切换）
- 文件操作：重命名、移动、删除、添加标签、收藏
- 文件夹操作：创建、重命名、删除
- 文件预览：点击文件弹出预览窗口

### 步骤 1.8 - 全局搜索
- 顶部搜索栏（始终可见）
- 搜索逻辑：匹配文件名 + 文本内容 + 标签
- 结果混排展示：文档和图片一起展示
- 搜索结果高亮关键词

### 步骤 1.9 - 设置页面
- 存储模式切换：本地 / 云端
- 切换时提示数据迁移
- 已用存储空间显示
- 账号信息管理

### 步骤 1.10 - 仪表盘首页
- 欢迎信息 + 快捷操作按钮
- 已用存储空间统计（进度条）
- 最近上传文件列表
- 快捷搜索入口

### 步骤 1.11 - UI 美化
- 整体配色方案（深色/浅色模式）
- 响应式布局（PC + 平板适配）
- 图标统一使用 lucide-react
- 加载动画 + 空状态提示

### 步骤 1.12 - 自检测试
- 测试注册/登录流程
- 测试文件上传（Word/PDF/图片）
- 测试文档解析和文本提取
- 测试搜索功能
- 测试存储模式切换
- 修复发现的问题

---

## 五、API 对接清单（第二轮参考）

| 功能 | 推荐服务商 | 免费额度 | 费用 |
|------|-----------|---------|------|
| OCR 文字识别 | 百度 OCR / 腾讯云 OCR | 500-1000次/月 | ~0.02元/次 |
| 图像语义识别 | 腾讯云图像分析 | 10000次/月 | ~0.01元/次 |
| 人脸聚类 | 腾讯云人脸识别 | 10000次/月 | ~0.01元/次 |
| AI 问答 | z-ai-web-dev-sdk（内置） | 有 | - |

> 注意：API Key 需要用户自行申请，开发时用环境变量配置。

---

## 六、Tauri 迁移指南（预留）

### 6.1 迁移准备
- 前端 React 组件可直接复用
- 业务逻辑层（lib/）可直接复用
- 只需新增 Tauri 存储适配器

### 6.2 需要替换的部分
1. IndexedDB 适配器 → Tauri 本地文件系统读写
2. 浏览器文件选择器 → Tauri 原生文件对话框
3. 浏览器缓存 → Tauri 系统缓存目录

### 6.3 Tauri 新增能力
- 本地目录实时监听（自动扫描新文件）
- 拖拽文件到指定目录自动入库
- 系统托盘 + 开机自启
- 更大的本地存储空间

---

## 七、开发进度记录

### 2026-05-26
- [x] 完成项目需求分析
- [x] 完成技术架构设计
- [x] 完成数据库 Schema 设计
- [x] 完成开发文档编写
- [x] 第一轮开发全部完成（12个步骤）
  - 存储适配器架构（IndexedDB本地 + 服务端云端）
  - 10个API路由（认证、文件CRUD、文件夹、搜索、设置）
  - 文档解析（Word/PDF/图片缩略图）
  - 16个组件 + 5个视图
  - SPA单页应用，状态切换视图
  - ESLint 0错误，TypeScript 严格类型
- [x] 第二轮开发完成
- [x] 第三轮开发完成
  - Bug修复7项：ServerStorageAdapter URLs、SearchResults无限循环、sharp缩略图、FileCard交互、文件下载、共享工具函数、本地文件夹支持
  - Feature 3.1：PPT文件上传+解析
  - Feature 3.4：时间线浏览模式
  - Feature 3.6：UI优化+framer-motion动画+skeleton+空状态
  - Feature 3.7：分页加载+搜索防抖
  - ESLint 0错误，Next.js build 成功

---

## 八、重要备忘

1. 本项目文件保存在 `/home/z/my-project/` 目录
2. 下载目录：`/home/z/my-project/download/`
3. 开发完成后预览链接会发送给用户
4. 用户从微信端连接，需要用 send_message 发送结果
5. 每完成一步都要更新本文档的进度状态
6. 如果对话上下文丢失，用户会说"查看开发文档"，此时读取本文档恢复上下文
