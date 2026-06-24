# API 文档

## 目录

- [认证方式](#认证方式)
- [请求/响应格式](#请求响应格式)
- [错误码说明](#错误码说明)
- [核心API列表](#核心api列表)
- [API示例](#api示例)

---

## 认证方式

### 1. Token 认证（推荐）

所有需要认证的API请求都需要在请求头中携带 `Authorization` 字段：

```
Authorization: Bearer <your-token>
```

**获取Token**：通过登录接口获取

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "用户名"
    }
  }
}
```

### 2. API 密钥认证（开放API）

第三方应用可以使用API密钥进行认证：

```
X-API-Key: <your-api-key>
X-API-Secret: <your-api-secret>
```

> **注意**：API密钥功能需在设置页面生成，每个密钥可配置不同的权限范围。

---

## 请求/响应格式

### 请求格式

- 所有请求使用 `UTF-8` 编码
- POST/PUT/PATCH 请求体使用 `application/json` 格式
- 文件上传使用 `multipart/form-data` 格式

### 响应格式

所有API响应遵循统一格式：

```json
{
  "success": true,
  "data": {
    // 具体数据
  },
  "message": "操作成功",
  "code": 200
}
```

**分页响应格式**：

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5,
    "hasMore": true
  }
}
```

**错误响应格式**：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  }
}
```

---

## 错误码说明

| HTTP状态码 | 错误码 | 说明 |
|-----------|--------|------|
| 200 | - | 请求成功 |
| 201 | - | 创建成功 |
| 400 | BAD_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证或认证失败 |
| 403 | FORBIDDEN | 无权限访问 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突 |
| 422 | VALIDATION_ERROR | 数据验证失败 |
| 429 | RATE_LIMITED | 请求过于频繁 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |
| 503 | SERVICE_UNAVAILABLE | 服务不可用 |

---

## 核心API列表

### 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/change-password` | 修改密码 |
| POST | `/api/auth/forgot-password` | 忘记密码 |
| POST | `/api/auth/reset-password` | 重置密码 |

### 文件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files` | 获取文件列表 |
| POST | `/api/files` | 上传文件 |
| GET | `/api/files/[id]` | 获取文件详情 |
| PUT | `/api/files/[id]` | 更新文件信息 |
| DELETE | `/api/files/[id]` | 删除文件（软删除） |
| GET | `/api/files/[id]/download` | 下载文件 |
| GET | `/api/files/[id]/preview` | 预览文件 |
| POST | `/api/files/batch` | 批量操作（删除/移动/标签） |

### 文件版本

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files/[id]/versions` | 获取版本列表 |
| POST | `/api/files/[id]/versions` | 创建新版本 |
| DELETE | `/api/files/[id]/versions` | 批量删除版本 |
| POST | `/api/files/[id]/versions/restore` | 恢复到指定版本 |

### 文件分享

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/files/[id]/share` | 创建分享链接 |
| GET | `/api/files/[id]/share` | 获取分享信息 |
| DELETE | `/api/files/[id]/share` | 取消分享 |
| GET | `/api/shares` | 获取我的分享列表 |
| DELETE | `/api/shares` | 批量删除分享 |

### 文件夹管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/folders` | 获取文件夹列表 |
| POST | `/api/folders` | 创建文件夹 |
| GET | `/api/folders/[id]` | 获取文件夹详情 |
| PUT | `/api/folders/[id]` | 更新文件夹 |
| DELETE | `/api/folders/[id]` | 删除文件夹 |
| GET | `/api/folders/[id]/children` | 获取子文件夹 |

### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search` | 搜索文件 |
| GET | `/api/search/semantic` | 语义搜索 |
| POST | `/api/search/ai` | AI问答搜索 |

### AI 功能

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/summarize` | 生成文档摘要 |
| POST | `/api/ai/ocr` | OCR文字识别 |
| POST | `/api/ai/describe` | 图像描述生成 |
| POST | `/api/ai/generate-tags` | 智能标签生成 |
| POST | `/api/ai/qa` | 文档问答 |
| GET | `/api/ai/graph` | 知识图谱生成 |
| GET | `/api/ai/usage` | AI使用量统计 |

### 人脸相册

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/faces/detect` | 人脸检测 |
| POST | `/api/faces/process-all` | 批量人脸检测 |
| GET | `/api/faces/groups` | 人脸分组列表 |
| GET | `/api/faces/groups/[id]` | 分组详情 |
| PATCH | `/api/faces/groups/[id]` | 重命名分组 |
| DELETE | `/api/faces/groups/[id]` | 删除分组 |
| GET | `/api/faces/groups/[id]/photos` | 分组照片列表 |
| POST | `/api/faces/groups/merge` | 合并分组 |

### 标签管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tags` | 获取标签列表 |
| POST | `/api/tags` | 批量添加标签 |
| DELETE | `/api/tags` | 删除标签 |

### 存储分析

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/storage` | 存储概览 |
| GET | `/api/storage/by-type` | 按类型统计 |
| GET | `/api/storage/large-files` | 大文件列表 |
| GET | `/api/storage/trend` | 存储趋势 |

### 回收站

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trash` | 获取回收站列表 |
| POST | `/api/trash/restore` | 批量恢复文件 |
| DELETE | `/api/trash` | 永久删除文件 |
| POST | `/api/trash/empty` | 清空回收站 |

### 云同步

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/cloud-sync/sync` | 触发同步 |
| GET | `/api/cloud-sync/status` | 同步状态 |
| GET | `/api/cloud-sync/conflicts` | 冲突列表 |
| POST | `/api/cloud-sync/conflicts/resolve` | 解决冲突 |
| GET | `/api/cloud-sync/queue` | 同步队列 |
| GET | `/api/cloud-sync/backups` | 备份列表 |
| POST | `/api/cloud-sync/backups` | 创建备份 |
| POST | `/api/cloud-sync/backups/[id]/restore` | 恢复备份 |

### 通知系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 获取通知列表 |
| PATCH | `/api/notifications` | 标记已读 |
| DELETE | `/api/notifications` | 删除通知 |
| GET | `/api/notifications/unread-count` | 未读数量 |

### 活动日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/activity-logs` | 获取活动日志 |

### 支付和账单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/billing/subscription` | 订阅信息 |
| POST | `/api/billing/subscribe` | 订阅套餐 |
| POST | `/api/billing/cancel` | 取消订阅 |
| GET | `/api/billing/orders` | 订单列表 |
| GET | `/api/billing/plans` | 套餐列表 |
| POST | `/api/payment/create` | 创建支付 |
| GET | `/api/payment/status/[orderId]` | 支付状态 |
| POST | `/api/payment/callback/alipay` | 支付宝回调 |
| POST | `/api/payment/callback/wechat` | 微信支付回调 |

### 管理后台

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/dashboard` | 仪表盘统计 |
| GET | `/api/admin/tenants` | 租户列表 |
| GET | `/api/admin/tenants/[id]` | 租户详情 |
| PATCH | `/api/admin/tenants/[id]` | 更新租户 |
| GET | `/api/admin/orders` | 订单列表 |
| GET | `/api/admin/orders/[id]` | 订单详情 |
| GET | `/api/admin/settings` | 系统设置 |
| PATCH | `/api/admin/settings` | 更新系统设置 |
| GET | `/api/admin/migrations` | 迁移状态 |
| POST | `/api/admin/migrations` | 执行迁移 |

### 导入导出

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export-import` | 导出数据 |
| POST | `/api/export-import` | 导入数据 |

---

## API示例

### 示例1：获取文件列表

**请求**：
```bash
GET /api/files?page=1&pageSize=20&folderId=root
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "file_123",
        "fileName": "文档.pdf",
        "fileType": "pdf",
        "fileSize": 1024000,
        "folderId": "root",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5,
    "hasMore": true
  }
}
```

### 示例2：上传文件

**请求**：
```bash
POST /api/files
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <文件内容>
folderId: root
tags: ["重要", "工作"]
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "file_123",
    "fileName": "文档.pdf",
    "fileType": "pdf",
    "fileSize": 1024000,
    "folderId": "root",
    "tags": ["重要", "工作"],
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "message": "上传成功"
}
```

### 示例3：搜索文件

**请求**：
```bash
GET /api/search?q=关键词&type=keyword&page=1&pageSize=20
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3,
    "hasMore": true
  }
}
```

### 示例4：生成文档摘要

**请求**：
```bash
POST /api/ai/summarize
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileId": "file_123",
  "length": "medium"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "summary": "这是文档的摘要内容...",
    "keyPoints": [
      "要点1",
      "要点2",
      "要点3"
    ],
    "suggestedTags": ["标签1", "标签2"]
  }
}
```

---

## 速率限制

为保证服务稳定性，API有以下速率限制：

- **普通用户**：每分钟 100 次请求
- **专业版用户**：每分钟 300 次请求
- **企业版用户**：每分钟 1000 次请求

超过限制将返回 `429 RATE_LIMITED` 错误。

---

## 多租户说明

所有业务API自动基于当前用户的租户进行数据隔离，无需在请求中手动指定 `tenantId`。

系统会根据认证信息自动确定租户，并确保：
- 查询结果只包含当前租户的数据
- 创建的数据自动关联到当前租户
- 跨租户访问会被拒绝

---

## 版本信息

- API 版本：v1
- 文档版本：1.0.0
- 最后更新：2026-06-24
