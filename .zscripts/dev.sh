#!/bin/bash
# .zscripts/dev.sh — FC workspace 自定义启动脚本
# 由 /start.sh 在后台子shell中调用 (sudo -u z bash .zscripts/dev.sh)
# 职责：快速启动 Next.js 生产服务器，确保 Caddy 健康检查通过

set -e

cd /home/z/my-project

echo "[DEV.SH] $(date '+%Y-%m-%d %H:%M:%S') Starting custom dev script..."

# ============================================================
# 1. 确保 .env 存在必要变量
# ============================================================
if [ ! -f ".env" ]; then
    echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" > .env
fi
if ! grep -q "TOKEN_SECRET" .env 2>/dev/null; then
    echo "TOKEN_SECRET=kb-local-dev-secret-change-in-production" >> .env
fi

# ============================================================
# 2. Prisma 生成 & 数据库同步（首次启动需要）
# ============================================================
if [ -f "prisma/schema.prisma" ]; then
    echo "[DEV.SH] Generating Prisma client..."
    npx prisma generate --quiet 2>/dev/null || true

    echo "[DEV.SH] Syncing database schema..."
    npx prisma db push --accept-data-loss 2>/dev/null || true
fi

# ============================================================
# 3. 检查/构建生产版本
# ============================================================
if [ ! -f ".next/standalone/server.js" ]; then
    echo "[DEV.SH] Production build not found, running next build..."
    npm run build
else
    echo "[DEV.SH] Production build found, skipping build."
fi

# 确保 static 和 public 资源在 standalone 目录中
if [ -d ".next/static" ]; then
    cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
fi
if [ -d "public" ]; then
    cp -r public .next/standalone/ 2>/dev/null || true
fi

# ============================================================
# 4. 启动生产服务器（毫秒级启动）
# ============================================================
echo "[DEV.SH] Starting Next.js production server on port 3000..."

export NODE_ENV=production
export PORT=3000
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export TOKEN_SECRET="kb-local-dev-secret-change-in-production"

# 前台运行生产服务器（stdout/stderr 直接输出到调用方的日志）
# 不用 while 循环和 tee，避免管道断裂导致进程被杀
exec node .next/standalone/server.js
