# 开发文档

## 目录

- [项目架构](#项目架构)
- [目录结构](#目录结构)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [测试指南](#测试指南)
- [核心模块说明](#核心模块说明)
- [贡献指南](#贡献指南)

---

## 项目架构

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                        前端层                           │
│  Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui    │
│  Zustand 状态管理 + Framer Motion 动画                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                        API层                            │
│  Next.js API Routes + 认证中间件 + 多租户上下文         │
│  60+ 个 API 端点                                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                      业务逻辑层                         │
│  工具函数 + 服务层 + 业务规则                           │
│  AI处理 + 文件解析 + 云同步 + 支付                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                      数据访问层                         │
│  TenantDb 封装 ── 强制 tenantId 过滤 ── Prisma ORM     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                        存储层                           │
│  SQLite (云端) / IndexedDB (浏览器) / SQLite (Tauri)   │
│  阿里云OSS / Cloudflare R2 (文件存储)                   │
└─────────────────────────────────────────────────────────┘
```

### 多租户架构

系统采用完整的SaaS多租户架构：

1. **数据隔离**：所有业务表携带 `tenantId` 字段
2. **底层强制过滤**：TenantDb 层自动添加 tenantId 过滤条件
3. **租户上下文**：请求自动解析租户信息
4. **配额管理**：租户级别的存储、AI调用配额
5. **订阅系统**：租户级别的套餐和订阅管理

---

## 目录结构

```
laolin-brain/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API 路由
│   │   │   ├── admin/                # 运营后台API
│   │   │   ├── auth/                 # 认证相关
│   │   │   ├── ai/                   # AI功能
│   │   │   ├── files/                # 文件管理
│   │   │   ├── folders/              # 文件夹管理
│   │   │   ├── faces/                # 人脸相册
│   │   │   ├── search/               # 搜索
│   │   │   ├── billing/              # 账单订阅
│   │   │   ├── payment/              # 支付
│   │   │   ├── cloud-sync/           # 云同步
│   │   │   ├── storage/              # 存储分析
│   │   │   ├── tags/                 # 标签
│   │   │   ├── trash/                # 回收站
│   │   │   ├── notifications/        # 通知
│   │   │   ├── activity-logs/        # 活动日志
│   │   │   └── export-import/        # 导入导出
│   │   ├── (dashboard)/              # 主应用页面
│   │   ├── admin/                    # 运营后台页面
│   │   ├── share/                    # 分享页面
│   │   └── layout.tsx                # 根布局
│   │
│   ├── components/                   # React 组件
│   │   ├── files/                    # 文件管理组件
│   │   ├── album/                    # 相册组件
│   │   ├── search/                   # 搜索组件
│   │   ├── graph/                    # 知识图谱
│   │   ├── ai/                       # AI相关
│   │   ├── billing/                  # 账单会员
│   │   ├── settings/                 # 设置页面
│   │   ├── layout/                   # 布局组件
│   │   └── ui/                       # shadcn/ui 组件
│   │
│   ├── lib/                          # 工具库
│   │   ├── db/                       # 数据库访问层
│   │   │   ├── tenant-db.ts          # 多租户数据访问
│   │   │   ├── tenant-context.ts     # 租户上下文
│   │   │   └── index.ts              # 数据库入口
│   │   ├── ai/                       # AI相关工具
│   │   ├── cloud-sync/               # 云同步引擎
│   │   ├── payment/                  # 支付服务
│   │   ├── billing/                  # 账单服务
│   │   ├── storage/                  # 存储适配器
│   │   ├── migrations/               # 数据库迁移
│   │   ├── backup/                   # 备份恢复
│   │   ├── monitoring/               # 监控告警
│   │   ├── logging/                  # 日志系统
│   │   ├── security/                 # 安全工具
│   │   ├── i18n/                     # 国际化
│   │   └── utils/                    # 通用工具
│   │
│   ├── hooks/                        # 自定义 Hooks
│   ├── stores/                       # Zustand 状态管理
│   └── __tests__/                    # 单元测试
│
├── src-tauri/                        # Tauri 桌面端
│   ├── src/
│   │   ├── db.rs                     # 数据库模块
│   │   ├── lib.rs                    # 命令模块
│   │   └── ...
│   └── Cargo.toml
│
├── prisma/                           # Prisma ORM
│   ├── schema.prisma                 # 数据模型
│   └── migrations/                   # 迁移文件
│
├── public/                           # 静态资源
│   ├── icons/                        # PWA 图标
│   ├── sw.js                         # Service Worker
│   └── manifest.json                 # PWA 清单
│
├── docs/                             # 文档
│   ├── API.md                        # API 文档
│   ├── DEPLOY.md                     # 部署文档
│   ├── DEVELOPMENT.md                # 开发文档（本文件）
│   └── TAURI_SETUP.md                # Tauri 开发环境
│
├── scripts/                          # 脚本
│   ├── migrate.js                    # 数据库迁移脚本
│   └── ...
│
├── prisma/                           # Prisma schema
├── package.json
├── next.config.ts                    # Next.js 配置
├── tailwind.config.ts                # Tailwind 配置
├── tsconfig.json                     # TypeScript 配置
├── vitest.config.ts                  # Vitest 配置
└── README.md
```

---

## 开发环境搭建

### 前置要求

- **Node.js** >= 20.0.0
- **npm** / **pnpm** / **bun**（推荐 pnpm）
- **Git**
- **Rust** >= 1.70（仅桌面端开发需要）

### 安装步骤

1. **克隆仓库**

```bash
git clone https://gitee.com/fay1314/laolin-brain.git
cd laolin-brain
```

2. **安装依赖**

```bash
# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install

# 或使用 bun
bun install
```

3. **初始化数据库**

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma db push
```

4. **配置环境变量**

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的配置
```

5. **启动开发服务器**

```bash
pnpm dev

# 访问 http://localhost:3000
```

### Tauri 桌面端开发

1. **安装 Rust 环境**

参考 [TAURI_SETUP.md](./TAURI_SETUP.md)

2. **启动开发模式**

```bash
pnpm tauri dev
```

3. **构建生产版本**

```bash
pnpm tauri build
```

---

## 代码规范

### TypeScript 规范

- 严格模式（strict: true）
- 禁止使用 `any` 类型（特殊情况需加注释说明）
- 使用接口定义对象类型
- 函数必须有返回类型
- 使用类型守卫处理联合类型

### React 规范

- 使用函数组件 + Hooks
- 组件名使用 PascalCase
- 自定义 Hook 以 `use` 开头
- 使用 TypeScript 定义 Props 类型
- 避免过度渲染，合理使用 memo/useMemo/useCallback

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `FileList.tsx` |
| Hook | camelCase（use开头） | `useFileUpload.ts` |
| 工具函数 | camelCase | `formatFileSize.ts` |
| 常量 | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |
| 类型/接口 | PascalCase | `FileItem` |
| API路由 | kebab-case | `file-list` |

### 提交规范

使用 Conventional Commits 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）**：
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**：
```
feat(files): 添加文件版本控制功能

- 实现版本列表API
- 实现版本恢复功能
- 添加版本管理UI

Closes #123
```

---

## 测试指南

### 测试框架

- **单元测试**：Vitest
- **组件测试**：React Testing Library
- **E2E测试**：Playwright（可选）

### 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch

# 查看测试覆盖率
pnpm test:coverage

# 运行类型检查
pnpm type-check

# 运行构建检查
pnpm build
```

### 编写测试

**单元测试示例**：

```typescript
// src/lib/utils/__tests__/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatFileSize } from '../format';

describe('formatFileSize', () => {
  it('should format bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
  });
});
```

**组件测试示例**：

```typescript
// src/components/__tests__/FileList.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileList } from '../FileList';

describe('FileList', () => {
  it('should render file list', () => {
    const files = [
      { id: '1', name: 'test.txt', size: 100 },
    ];
    
    render(<FileList files={files} />);
    
    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });
});
```

### 测试覆盖率目标

- 核心工具函数：> 90%
- 业务逻辑：> 80%
- 组件：> 60%
- API路由：> 70%

---

## 核心模块说明

### 1. 多租户数据访问层（TenantDb）

**位置**：`src/lib/db/tenant-db.ts`

**功能**：
- 自动添加 tenantId 过滤条件
- 创建时自动设置 tenantId
- 确保数据隔离
- 提供统一的CRUD接口

**使用示例**：

```typescript
import { getTenantDb } from '@/lib/db/tenant-db';

// 在API路由中
export async function GET(request: Request) {
  const tenantDb = await getTenantDbFromRequest(request);
  
  // 查询自动过滤租户
  const files = await tenantDb.file.findMany({
    where: { folderId: 'root' },
  });
  
  return Response.json({ success: true, data: files });
}
```

### 2. 云同步引擎

**位置**：`src/lib/cloud-sync/`

**核心功能**：
- 增量同步（只同步变更）
- 冲突检测与处理
- 离线队列
- 多租户隔离

### 3. AI 处理模块

**位置**：`src/lib/ai/`

**支持的功能**：
- 文档摘要
- OCR文字识别
- 图像描述
- 智能标签
- 文档问答
- 知识图谱

### 4. 支付系统

**位置**：`src/lib/payment/`

**支持的支付方式**：
- 支付宝
- 微信支付

**特性**：
- 签名验证
- 幂等性设计
- 订单状态管理

### 5. 监控系统

**位置**：`src/lib/monitoring/`

**监控指标**：
- 系统指标（CPU、内存、磁盘）
- 应用指标（请求数、响应时间、错误率）
- 业务指标（用户、文件、存储、AI、付费）

**告警系统**：
- 可配置的告警规则
- 多级别告警（info/warn/error/critical）
- 多种通知方式

### 6. 日志系统

**位置**：`src/lib/logging/`

**日志类型**：
- 访问日志（access）
- 错误日志（error）
- 操作日志（operation）
- 系统日志（system）
- 审计日志（audit）
- 安全日志（security）

### 7. 安全工具

**位置**：`src/lib/security/`

**安全功能**：
- XSS防护
- SQL注入检测
- 路径遍历防护
- 输入验证
- 密码强度检查
- 数据脱敏
- 速率限制

---

## 贡献指南

### 贡献流程

1. **Fork 仓库**

2. **创建功能分支**

```bash
git checkout -b feature/your-feature-name
```

3. **开发并提交**

```bash
git add .
git commit -m "feat: 添加新功能"
```

4. **推送分支**

```bash
git push origin feature/your-feature-name
```

5. **创建 Pull Request**

### PR 要求

- 代码通过 TypeScript 类型检查
- 代码通过所有测试
- 新功能需要添加测试用例
- 代码风格符合规范
- 有清晰的提交信息
- 更新相关文档

### 代码审查

- 所有PR需要至少一个审查者
- 审查重点：功能正确性、代码质量、性能影响、安全性
- 审查通过后才能合并

---

## 常见问题

### Q: 如何添加新的API路由？

A: 在 `src/app/api/` 目录下创建对应的文件夹和 `route.ts` 文件，使用 Next.js App Router 规范。

### Q: 如何添加新的数据库表？

A: 在 `prisma/schema.prisma` 中定义模型，然后运行 `npx prisma db push`。记得添加 `tenantId` 字段以支持多租户。

### Q: 如何添加新的AI功能？

A: 在 `src/lib/ai/` 中添加对应的工具函数，然后在 `src/app/api/ai/` 中创建API路由。

### Q: 如何调试云同步功能？

A: 可以在浏览器开发者工具中查看 Console 和 Network，云同步模块会输出详细的调试日志。

---

## 版本信息

- 文档版本：1.0.0
- 最后更新：2026-06-24
