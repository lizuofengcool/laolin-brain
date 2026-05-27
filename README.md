# 个人私有第二大脑

一款基于 Next.js 16 构建的全功能智能文件管理与知识库系统，支持本地存储和云端部署双模式。它不仅仅是一个网盘，而是一个能"理解"你文件内容的 AI 驱动知识管理平台。

## 核心特性

- **多格式文件管理**：支持图片、文档（Word/PDF/PPT）、Markdown、文本等全类型文件，拖拽排序、文件夹树管理
- **AI 智能助理**：自动摘要、OCR 识别、图像理解、语义搜索、智能关联推荐、知识图谱生成
- **隐私安全**：本地 IndexedDB 存储 + 云端加密双模式，密码保护和分享链接，HMAC-SHA256 签名令牌
- **全平台适配**：PWA 离线支持、手势操作（滑动/长按/缩放）、响应式设计
- **数据洞察**：存储分析仪表板（Recharts）、知识图谱可视化（SVG 力导向图）、时间线浏览
- **高级功能**：文件版本管理、自动化规则引擎、批量操作、数据备份恢复、键盘快捷键

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Next.js 16 + React 19 + TypeScript |
| 样式方案 | Tailwind CSS 4 + shadcn/ui |
| 状态管理 | Zustand |
| 数据层 | Prisma ORM + SQLite / IndexedDB（双模式） |
| 拖拽 | @dnd-kit |
| 动画 | Framer Motion |
| 图表 | Recharts |
| AI 集成 | z-ai-web-dev-sdk |
| 认证 | 自研 HMAC-SHA256 令牌 + bcryptjs |
| 测试 | Vitest + React Testing Library |
| 国际化 | 自研 i18n 轻量框架 |

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # 24 个 API 路由
│   │   ├── auth/          # 注册/登录
│   │   ├── files/         # 文件 CRUD、上传、版本、分享
│   │   ├── folders/       # 文件夹管理
│   │   ├── ai/            # AI 摘要/OCR/问答/关联/图谱
│   │   ├── search/        # 搜索
│   │   └── analytics/     # 存储分析
│   ├── share/[token]/     # 公开分享页
│   ├── error.tsx          # 全局错误边界
│   └── not-found.tsx      # 404 页面
├── components/            # 75+ 组件
│   ├── files/             # 文件管理核心组件
│   ├── dashboard/         # 仪表板
│   ├── search/            # 搜索
│   ├── layout/            # 布局（侧栏/头部/移动导航）
│   ├── album/             # 相册（网格/瀑布流）
│   ├── timeline/          # 时间线
│   ├── tags/              # 标签管理
│   ├── graph/             # 知识图谱
│   ├── ai/                # AI 聊天面板
│   ├── settings/          # 设置（备份/自动化/存储切换）
│   └── ui/                # 41 个 shadcn/ui 组件
├── hooks/                 # 自定义 Hooks
├── lib/                   # 工具库
│   ├── storage/           # 存储适配器（工厂模式）
│   ├── automation/        # 自动化规则引擎
│   ├── parser/            # 文件解析器（Word/PDF/PPT/图片）
│   ├── i18n/              # 国际化
│   └── ...
├── stores/                # Zustand 状态管理
└── __tests__/             # 200+ 单元测试
```

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- 包管理器：pnpm / bun / npm

### 安装

```bash
git clone <你的仓库地址>
cd second-brain
pnpm install
```

### 本地运行

```bash
pnpm dev
# 访问 http://localhost:3000
```

### 生产构建

```bash
pnpm build
pnpm start
```

## 测试

```bash
# 运行单元测试
pnpm test

# 监听模式
pnpm test:watch
```

## 功能概览

### 12 个视图

1. **仪表板** - 文件统计、存储图表、最近文件
2. **文件管理** - 上传/浏览/搜索/批量操作
3. **相册** - 网格/瀑布流布局、图片灯箱
4. **时间线** - 按时间线浏览文件
5. **收藏夹** - 收藏文件分组展示
6. **标签** - 标签管理和筛选
7. **搜索** - 全文搜索 + AI 问答
8. **回收站** - 文件恢复/永久删除
9. **存储分析** - Recharts 图表可视化
10. **知识图谱** - SVG 力导向关联图
11. **设置** - 账户/存储/备份/自动化

### API 路由（24 个）

- 认证：注册、登录、设置
- 文件：列表、上传、详情、下载、预览、版本管理、分享
- 文件夹：列表、创建、详情
- AI：摘要、OCR、图像理解、问答、关联推荐、知识图谱
- 其他：搜索、存储分析

## 许可证

MIT
