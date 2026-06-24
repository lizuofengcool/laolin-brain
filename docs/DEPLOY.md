# 部署指南 — 个人私有第二大脑

本文档介绍如何将「个人私有第二大脑」项目部署到 Linux 服务器（Ubuntu/Debian），使用 PM2 进程管理和 Nginx 反向代理。

---

## 目录

1. [部署架构概览](#1-部署架构概览)
2. [环境要求](#2-环境要求)
3. [环境变量说明](#3-环境变量说明)
4. [安装依赖与构建](#4-安装依赖与构建)
5. [数据库初始化](#5-数据库初始化)
6. [一键部署](#6-一键部署)
7. [PM2 进程管理](#7-pm2-进程管理)
8. [日常运维操作](#8-日常运维操作)
9. [Nginx 反向代理](#9-nginx-反向代理)
10. [SSL 证书配置（HTTPS）](#10-ssl-证书配置https)
11. [自动备份策略](#11-自动备份策略)
12. [常见问题排查](#12-常见问题排查)

---

## 1. 部署架构概览

### 短期方案（当前）

```
用户浏览器 → Caddy (反向代理 + 自动 HTTPS) → Next.js (PM2 管理) → SQLite
```

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| 运行环境 | VPS（Ubuntu/Debian） | 单机部署，成本极低 |
| 进程管理 | PM2 | 自动重启、日志管理、内存限制 |
| 反向代理 | Caddy | 自动 HTTPS，配置简洁 |
| 应用服务 | Next.js (Standalone) | 生产模式运行 |
| 数据存储 | SQLite | 零配置，适合个人使用 |
| 速率限制 | 内存级 LRU Cache | 轻量实现，无需 Redis |

### 数据存储：SQLite

当前使用 SQLite 作为数据库，对个人使用场景完全足够：
- **优势**：零运维、零配置、文件级备份、性能优秀
- **局限**：不支持多服务器并发写入
- **容量**：实测 10 万条知识条目仍流畅运行

### 速率限制：内存 LRU Cache

当前使用 `lru-cache` 实现内存级速率限制（`src/lib/rate-limit.ts`）：

- **当前方案**：单进程内存缓存，最多记录 10000 个客户端
- **局限**：PM2 重启后限制记录丢失；多实例部署时不共享
- **升级路径**：如需多实例或持久化限流，可引入 Redis
  ```bash
  # Redis 升级示例（未来可选）
  npm install ioredis
  # 将 lru-cache 替换为 Redis SETEX 计数器
  ```

---

## 2. 环境要求

| 组件       | 最低版本  |
| ---------- | -------- |
| Node.js    | 18+      |
| npm / bun  | 最新版    |
| PM2        | 5+       |
| Nginx      | 1.18+    |
| Git        | 2.30+    |
| 操作系统   | Ubuntu 20.04+ / Debian 11+ |

### 安装 Node.js 18+

```bash
# 使用 NodeSource 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证版本
node -v   # v18.x.x
npm -v    # 9.x.x
```

### 安装 PM2

```bash
sudo npm install -g pm2

# 验证安装
pm2 -v    # 5.x.x
```

### 安装 Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx

# 启动 Nginx 并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 3. 环境变量说明

在项目根目录创建 `.env.local` 文件。以下是所有支持的环境变量：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DATABASE_URL` | ✅ | — | SQLite 数据库路径，格式：`file:./db/custom.db` |
| `JWT_SECRET` | ⚠️ | — | JWT Token 签名密钥（认证功能需要，至少 32 位随机字符串） |
| `NODE_ENV` | 否 | `production` | 运行环境，PM2 配置中已设置为 `production` |
| `PORT` | 否 | `3000` | 应用监听端口 |
| `MAX_FILE_SIZE` | 否 | `52428800` | 上传文件大小限制（字节），默认 50MB |
| `NEXT_PUBLIC_APP_URL` | 否 | — | 应用访问地址（用于 CORS 和分享链接生成） |
| `AI_API_KEY` | 否 | — | AI 服务 API 密钥（如需 AI 功能） |

### 快速配置

```bash
cd /path/to/your/project

cat > .env.local << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./db/custom.db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NEXT_PUBLIC_APP_URL=https://your-domain.com
EOF

# 设置文件权限
chmod 600 .env.local
```

> ⚠️ **安全提示**：`JWT_SECRET` 必须替换为强随机字符串。可使用以下命令生成：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 4. 安装依赖与构建

```bash
cd /path/to/your/project

# 安装依赖
npm install

# 构建生产版本
npm run build

# 验证构建产物
ls -la .next/
```

如果使用 bun：

```bash
bun install
bun run build
```

---

## 5. 数据库初始化

项目使用 SQLite + Prisma ORM。

```bash
cd /path/to/your/project

# 生成 Prisma Client
npx prisma generate

# 同步数据库 schema（创建表和索引）
npx prisma db push

# 如需迁移管理（生产环境推荐）
# npx prisma migrate deploy
```

验证数据库：

```bash
ls -la db/
# 应该看到 custom.db 文件

# 检查表是否创建成功
npx prisma studio
```

---

## 6. 一键部署

项目提供了 `scripts/deploy.sh` 一键部署脚本，自动完成 Prisma 同步、构建和 PM2 重启：

```bash
# 首次使用添加执行权限
chmod +x scripts/deploy.sh

# 执行部署
bash scripts/deploy.sh
```

脚本会依次执行：
1. 创建 `logs/` 日志目录
2. 生成 Prisma Client + 同步数据库 schema
3. 构建生产版本（`npm run build`）
4. 重启 PM2 进程
5. 显示 PM2 运行状态

---

## 7. PM2 进程管理

项目已包含 `ecosystem.config.js` 配置文件。

### 启动应用

```bash
cd /path/to/your/project

# 使用 ecosystem 配置启动
pm2 start ecosystem.config.js

# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs knowledge-brain

# 查看监控面板
pm2 monit
```

### 设置开机自启

```bash
# 生成启动脚本
pm2 startup

# 保存当前进程列表
pm2 save
```

### 常用 PM2 命令

```bash
# 重启应用
pm2 restart knowledge-brain

# 停止应用
pm2 stop knowledge-brain

# 删除应用
pm2 delete knowledge-brain

# 查看详细信息
pm2 info knowledge-brain

# 查看日志（最近 100 行）
pm2 logs knowledge-brain --lines 100

# 清空日志
pm2 flush
```

### ecosystem.config.js 说明

```javascript
module.exports = {
  apps: [{
    name: 'knowledge-brain',        // 进程名称
    script: 'node_modules/.bin/next', // Next.js 启动脚本
    args: 'start',                   // 传入 "start" 参数启动生产服务
    cwd: process.cwd(),              // 工作目录
    instances: 1,                    // 单实例模式
    autorestart: true,               // 崩溃自动重启
    watch: false,                    // 生产环境不监听文件变化
    max_memory_restart: '1G',       // 内存超过 1G 自动重启
    log_date_format: 'YYYY-MM-DD HH:mm:ss',  // 日志时间格式
    error_file: './logs/pm2-error.log',       // 错误日志路径
    out_file: './logs/pm2-out.log',           // 标准输出日志路径
    merge_logs: true,                // 多实例合并日志
    max_restarts: 10,               // 最大重启次数
    restart_delay: 5000,            // 重启间隔（毫秒）
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

---

## 8. 日常运维操作

### 部署更新

```bash
bash scripts/deploy.sh
```

### 查看日志

```bash
# 实时日志
pm2 logs knowledge-brain

# 最近 100 行
pm2 logs knowledge-brain --lines 100

# 仅错误日志
pm2 logs knowledge-brain --err

# PM2 日志文件位置
ls logs/pm2-error.log logs/pm2-out.log
```

### 重启 / 停止

```bash
# 重启应用
pm2 restart knowledge-brain

# 停止应用
pm2 stop knowledge-brain

# 重载（零停机，如果使用 cluster 模式）
pm2 reload knowledge-brain
```

### 备份数据库

```bash
# 手动快速备份
cp db/custom.db db/custom.db.backup

# 带时间戳备份
cp db/custom.db "db/custom_$(date +%Y%m%d_%H%M%S).db"
```

### 清理日志

```bash
# 清空 PM2 日志
pm2 flush

# 清空日志文件
> logs/pm2-error.log
> logs/pm2-out.log
```

---

## 9. Nginx 反向代理

### 创建 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/knowledge-brain
```

写入以下配置（替换 `your-domain.com` 为实际域名或 IP）：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或服务器 IP

    # 日志
    access_log /var/log/nginx/knowledge-brain-access.log;
    error_log  /var/log/nginx/knowledge-brain-error.log;

    # 请求体大小限制（文件上传）
    client_max_body_size 100M;

    # 代理到 Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置（大文件上传需要较长超时）
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    # 图片缓存
    location /_next/image {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public";
    }

    # 上传文件存储
    location /uploads {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### 启用配置

```bash
# 创建符号链接
sudo ln -sf /etc/nginx/sites-available/knowledge-brain /etc/nginx/sites-enabled/

# 测试配置语法
sudo nginx -t

# 重新加载 Nginx
sudo systemctl reload nginx
```

---

## 10. SSL 证书配置（HTTPS）

### 使用 Certbot 免费获取 Let's Encrypt 证书

```bash
# 安装 Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# 获取并自动配置 SSL 证书
sudo certbot --nginx -d your-domain.com

# 证书会自动配置到 Nginx，并设置自动续期
```

安装过程中 Certbot 会问你：
1. 是否重定向 HTTP 到 HTTPS → 选择 **2**（重定向，推荐）

### 验证自动续期

```bash
# 检查续期定时任务
sudo certbot renew --dry-run

# 查看 systemd timer
sudo systemctl status certbot.timer
```

### 手动续期（如需要）

```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 11. 自动备份策略

项目内置了自动备份功能（localStorage 存储），生产环境建议额外配置服务器端定时备份。

### SQLite 数据库定时备份

```bash
# 创建备份脚本
sudo mkdir -p /opt/backups/knowledge-brain
sudo nano /opt/backups/knowledge-brain/backup.sh
```

写入以下内容：

```bash
#!/bin/bash
# SQLite 数据库备份脚本
# 每天凌晨 3 点执行，保留最近 30 天备份

PROJECT_DIR="/path/to/your/project"
BACKUP_DIR="/opt/backups/knowledge-brain"
DB_PATH="$PROJECT_DIR/db/custom.db"
DATE=$(date +%Y%m%d_%H%M%S)
RETAIN_DAYS=30

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 使用 sqlite3 创建备份（热备份）
if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/custom_$DATE.db'"
    gzip "$BACKUP_DIR/custom_$DATE.db"
    echo "[$(date)] Backup completed: custom_$DATE.db.gz"
else
    echo "[$(date)] ERROR: Database file not found: $DB_PATH"
fi

# 清理过期备份
find "$BACKUP_DIR" -name "custom_*.db.gz" -mtime +$RETAIN_DAYS -delete
echo "[$(date)] Old backups cleaned up (>$RETAIN_DAYS days)"
```

```bash
# 设置执行权限
sudo chmod +x /opt/backups/knowledge-brain/backup.sh

# 添加 cron 定时任务
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backups/knowledge-brain/backup.sh >> /var/log/kb-backup.log 2>&1") | crontab -

# 验证 cron 任务
crontab -l
```

### 上传文件目录备份

```bash
# 如有上传文件目录，添加到备份脚本中
# 在 backup.sh 中添加：
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" "$PROJECT_DIR/uploads/" 2>/dev/null
```

---

## 12. 常见问题排查

### 端口被占用

```bash
# 检查 3000 端口是否被占用
lsof -i :3000

# 如果被占用，可以终止占用进程或修改 .env.local 中的 PORT
kill -9 <PID>
```

### 数据库锁定

SQLite 在写入时会短暂锁定文件，通常不影响使用。如遇到长时间锁定：

```bash
# 检查是否有阻塞进程
lsof db/custom.db

# 等待片刻后重试，或重启应用
pm2 restart knowledge-brain

# 检查数据库完整性
sqlite3 db/custom.db "PRAGMA integrity_check;"
```

### 内存问题

```bash
# 实时监控内存和 CPU
pm2 monit

# 查看详细内存信息
pm2 info knowledge-brain

# PM2 已配置 max_memory_restart: '1G'，超限会自动重启
# 如频繁重启，考虑优化查询或增加服务器内存
```

### 应用无法启动

```bash
# 检查 PM2 日志
pm2 logs knowledge-brain --lines 50

# 检查 .env.local 文件是否存在
ls -la .env.local

# 尝试手动启动调试
NODE_ENV=production PORT=3000 npx next start
```

### 数据库错误

```bash
# 检查数据库文件权限
ls -la db/custom.db

# 如果权限不对
chmod 644 db/custom.db

# 重新同步数据库
npx prisma db push
```

### Nginx 502 Bad Gateway

```bash
# 检查 Next.js 是否在运行
pm2 status
curl http://127.0.0.1:3000

# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/knowledge-brain-error.log

# 检查 Nginx 配置
sudo nginx -t
```

### 文件上传失败

```bash
# 检查 Nginx client_max_body_size
sudo nginx -T | grep client_max_body_size

# 检查磁盘空间
df -h

# 检查上传目录权限
ls -la uploads/
chmod 755 uploads/
```

### SSL 证书问题

```bash
# 检查证书状态
sudo certbot certificates

# 手动续期测试
sudo certbot renew --dry-run

# 查看 certbot 日志
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### 更新部署

```bash
cd /path/to/your/project

# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 数据库迁移（如有变更）
npx prisma db push

# 重新构建
npm run build

# 重启应用
pm2 restart knowledge-brain
```

---

## 快速部署清单（Copy & Paste）

```bash
# 1. 安装基础环境
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# 2. 克隆项目并配置
cd /opt
git clone <your-repo-url> knowledge-brain
cd knowledge-brain

# 3. 配置环境变量
cat > .env.local << 'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./db/custom.db
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NEXT_PUBLIC_APP_URL=https://your-domain.com
EOF
chmod 600 .env.local

# 4. 安装依赖
npm install

# 5. 一键部署（数据库同步 + 构建 + PM2 启动）
chmod +x scripts/deploy.sh
# 首次部署使用 start 而非 restart
pm2 start ecosystem.config.js
# 后续更新使用: bash scripts/deploy.sh

pm2 startup && pm2 save

# 6. 配置 Nginx
sudo ln -sf /opt/knowledge-brain/nginx.conf /etc/nginx/sites-available/knowledge-brain
# (先编辑 nginx.conf 写入上面的配置内容)
sudo ln -sf /etc/nginx/sites-available/knowledge-brain /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. 配置 SSL
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 完成！访问 https://your-domain.com
# 后续更新: git pull && npm install && bash scripts/deploy.sh
```

---

## 13. SaaS 多租户部署

### 13.1 SaaS 部署架构

```
用户浏览器 → Nginx (反向代理 + HTTPS) → Next.js (PM2 集群) → SQLite
                                      ↓
                              多租户数据隔离层
                                      ↓
                         租户A数据  租户B数据  租户C数据
```

### 13.2 多租户部署注意事项

#### 数据隔离

- **底层强制隔离**：所有业务表携带 `tenantId` 字段，数据访问层强制过滤
- **禁止跨租户访问**：API 层通过 `getTenantDbFromRequest()` 自动获取租户上下文
- **管理员权限**：运营后台需要特殊权限才能查看所有租户数据

#### 数据库选择

- **SQLite**：适合中小规模（1000 租户以内），零运维，备份简单
- **PostgreSQL**：推荐生产环境使用，支持更高并发和更复杂的查询
- **MySQL**：备选方案，需要调整 Prisma schema

#### 性能优化

```bash
# 启用 PM2 集群模式（推荐生产环境）
# 修改 ecosystem.config.js
instances: "max",  # 使用所有 CPU 核心
exec_mode: "cluster",
```

#### 存储规划

- **免费版用户**：建议限制单文件大小和总存储量
- **付费用户**：根据套餐等级提供不同的存储配额
- **大文件处理**：考虑使用对象存储（OSS/R2）而非本地存储

### 13.3 支付系统配置

#### 支付宝配置

1. 登录支付宝开放平台（open.alipay.com）
2. 创建网页/移动应用
3. 生成应用密钥（RSA2）
4. 配置回调地址：`https://your-domain.com/api/payment/alipay/notify`
5. 在 `.env.local` 中配置：

```bash
PAYMENT_PROVIDER=alipay
ALIPAY_APP_ID=your-app-id
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"
ALIPAY_NOTIFY_URL=https://your-domain.com/api/payment/alipay/notify
```

#### 微信支付配置

1. 登录微信支付商户平台（pay.weixin.qq.com）
2. 开通 JSAPI 支付
3. 配置支付回调：`https://your-domain.com/api/payment/wechat/notify`
4. 在 `.env.local` 中配置：

```bash
PAYMENT_PROVIDER=wechat
WECHAT_APP_ID=your-app-id
WECHAT_MCH_ID=your-mch-id
WECHAT_API_KEY=your-api-key
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
```

#### 支付安全注意事项

- **签名验证**：所有支付回调必须验证签名，防止伪造
- **幂等性**：使用订单号保证支付回调的幂等性
- **日志记录**：完整记录所有支付请求和回调
- **金额校验**：回调金额必须与订单金额一致

### 13.4 运营后台配置

#### 管理员账号

首次部署时需要创建管理员账号：

```bash
# 进入项目目录
cd /path/to/project

# 使用 Prisma Studio 创建管理员
npx prisma studio

# 或使用 SQL 直接插入
sqlite3 prisma/dev.db "INSERT INTO TenantUser ..."
```

#### 运营后台功能

- **仪表盘**：用户统计、收入统计、存储使用趋势
- **租户管理**：租户列表、详情、状态管理、套餐调整
- **订单管理**：订单列表、详情、退款处理
- **系统设置**：套餐配置、配额调整、系统参数

### 13.5 套餐配置

#### 默认套餐

| 套餐 | 存储配额 | AI 调用/天 | 价格 | 说明 |
|------|---------|-----------|------|------|
| 免费版 | 1GB | 10次 | ¥0 | 新用户默认，7天试用 |
| 专业版 | 10GB | 100次 | ¥29/月 | 适合个人用户 |
| 企业版 | 100GB | 1000次 | ¥99/月 | 适合团队使用 |

#### 自定义套餐

可通过环境变量或数据库配置自定义套餐参数：

```bash
# 免费版配额
FREE_STORAGE_QUOTA=1073741824  # 1GB
FREE_AI_QUOTA=10

# 专业版配额
PRO_STORAGE_QUOTA=10737418240  # 10GB
PRO_AI_QUOTA=100

# 企业版配额
ENTERPRISE_STORAGE_QUOTA=107374182400  # 100GB
ENTERPRISE_AI_QUOTA=1000
```

### 13.6 数据备份策略

#### 数据库备份

```bash
# 每日自动备份 SQLite 数据库
0 2 * * * sqlite3 /path/to/db.sqlite ".backup /backup/db-$(date +%Y%m%d).sqlite"

# 保留最近 30 天的备份
find /backup -name "db-*.sqlite" -mtime +30 -delete
```

#### 文件备份

- **本地存储**：定期备份整个上传目录
- **对象存储**：OSS/R2 自带多副本和版本控制
- **异地备份**：重要数据建议跨区域备份

---

## 14. 云同步部署

### 14.1 云同步架构

```
客户端 (Web/Tauri) → 同步引擎 → 云存储 (OSS/R2)
                        ↓
                   同步队列 + 冲突检测
                        ↓
                   本地 SQLite 数据库
```

### 14.2 增量同步配置

- **同步触发**：文件变更时自动触发同步
- **批量同步**：每次最多同步 100 个文件
- **冲突策略**：
  - `latest`：以最新版本为准（默认）
  - `manual`：人工选择保留版本
  - `duplicate`：两个版本都保留，重命名冲突文件

### 14.3 离线队列

- 离线操作自动加入队列
- 网络恢复后自动重试
- 队列持久化到数据库，重启不丢失
- 失败重试机制，最多重试 3 次

---

## 15. 常见问题（SaaS 版）

### Q: 如何处理租户数据迁移？

A: 提供备份导出功能，用户可通过 `/api/backup` 导出自己的所有数据，然后导入到新的租户中。

### Q: 如何防止超售？

A: 每次上传和 AI 调用前都会检查配额，超出配额直接返回错误。配额使用量实时统计，避免超售。

### Q: 支付失败怎么办？

A: 支付失败时订单状态保持为 `pending`，用户可以重新发起支付。订单有过期时间，超时自动取消。

### Q: 如何处理退款？

A: 运营后台支持手动退款，退款后会相应调整订阅到期时间。建议制定明确的退款政策。

### Q: SQLite 能支撑多少租户？

A: 单机 SQLite 可以支撑 1000-5000 个活跃租户，具体取决于使用频率。超过这个规模建议迁移到 PostgreSQL。
