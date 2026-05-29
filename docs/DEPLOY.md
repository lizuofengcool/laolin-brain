# 部署指南 — 个人私有第二大脑

本文档介绍如何将「个人私有第二大脑」项目部署到 Linux 服务器（Ubuntu/Debian），使用 PM2 进程管理和 Nginx 反向代理。

---

## 目录

1. [环境要求](#1-环境要求)
2. [环境变量配置](#2-环境变量配置)
3. [安装依赖与构建](#3-安装依赖与构建)
4. [数据库初始化](#4-数据库初始化)
5. [PM2 进程管理](#5-pm2-进程管理)
6. [Nginx 反向代理](#6-nginx-反向代理)
7. [SSL 证书配置（HTTPS）](#7-ssl-证书配置https)
8. [自动备份策略](#8-自动备份策略)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 环境要求

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

## 2. 环境变量配置

在项目根目录创建 `.env.local` 文件：

```bash
cd /path/to/your/project

cat > .env.local << 'EOF'
# 应用配置
NODE_ENV=production
PORT=3000

# 数据库（SQLite，无需额外配置）
DATABASE_URL=file:./db/custom.db

# JWT 密钥（请替换为强密码，至少 32 位随机字符串）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# 上传文件大小限制（单位：字节）
MAX_FILE_SIZE=52428800

# AI 服务配置（如需使用 AI 功能）
# AI_API_KEY=your-ai-api-key

# 域名配置（用于 CORS 和分享链接）
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

## 3. 安装依赖与构建

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

## 4. 数据库初始化

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

## 5. PM2 进程管理

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
    name: 'knowledge-brain',     // 进程名称
    script: 'node_modules/.bin/next',  // Next.js 启动脚本
    args: 'start',                // 传入 "start" 参数启动生产服务
    cwd: process.cwd(),           // 工作目录
    instances: 1,                 // 单实例模式
    autorestart: true,            // 崩溃自动重启
    watch: false,                 // 生产环境不监听文件变化
    max_memory_restart: '1G',    // 内存超过 1G 自动重启
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

---

## 6. Nginx 反向代理

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

## 7. SSL 证书配置（HTTPS）

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

## 8. 自动备份策略

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

## 9. 常见问题排查

### 应用无法启动

```bash
# 检查 PM2 日志
pm2 logs knowledge-brain --lines 50

# 检查端口占用
sudo lsof -i :3000

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

# 检查数据库完整性
sqlite3 db/custom.db "PRAGMA integrity_check;"
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

### 内存占用过高

```bash
# 查看内存使用
pm2 monit

# 查看进程详情
pm2 info knowledge-brain

# PM2 配置已设置 max_memory_restart: '1G'，内存超限会自动重启
# 如果频繁重启，考虑增加服务器内存或优化查询
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
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NEXT_PUBLIC_APP_URL=https://your-domain.com
EOF
chmod 600 .env.local

# 4. 安装、构建、数据库
npm install
npx prisma generate
npx prisma db push
npm run build

# 5. 启动 PM2
pm2 start ecosystem.config.js
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
```
