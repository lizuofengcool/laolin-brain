#!/bin/bash
# ============================================================
# deploy.sh — 个人私有第二大脑 一键部署脚本
# 用法: bash scripts/deploy.sh
# 首次使用请添加执行权限: chmod +x scripts/deploy.sh
# ============================================================

set -e  # 任何命令失败立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目根目录（脚本所在目录的上一级）
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  个人私有第二大脑 — 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "项目目录: ${PROJECT_DIR}"
echo ""

# 1. 创建日志目录
echo -e "${YELLOW}[1/5] 创建日志目录...${NC}"
mkdir -p logs
echo -e "${GREEN}  ✓ logs/ 目录已就绪${NC}"

# 2. 生成 Prisma Client 并同步数据库
echo -e "${YELLOW}[2/5] Prisma 生成 & 数据库同步...${NC}"
npx prisma generate
npx prisma db push
echo -e "${GREEN}  ✓ 数据库已同步${NC}"

# 3. 构建生产版本
echo -e "${YELLOW}[3/5] 构建 Next.js 生产版本...${NC}"
npm run build
echo -e "${GREEN}  ✓ 构建完成${NC}"

# 4. 重启 PM2 进程
echo -e "${YELLOW}[4/5] 重启 PM2...${NC}"
pm2 restart ecosystem.config.js
echo -e "${GREEN}  ✓ PM2 已重启${NC}"

# 5. 显示状态
echo -e "${YELLOW}[5/5] PM2 状态:${NC}"
echo ""
pm2 status

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  查看日志: ${YELLOW}pm2 logs knowledge-brain${NC}"
echo -e "  监控面板: ${YELLOW}pm2 monit${NC}"
echo -e "  访问地址: ${YELLOW}http://localhost:3000${NC}"
