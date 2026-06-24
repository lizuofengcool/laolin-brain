#!/bin/bash
# ============================================
# laolin-brain 升级脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 备份数据
backup_data() {
    print_info "备份数据..."
    cd "$PROJECT_DIR"
    
    local backup_dir="backups/upgrade-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    # 备份数据库
    if [ -f "data/db.sqlite" ]; then
        cp data/db.sqlite "$backup_dir/"
        print_info "数据库已备份"
    fi
    
    # 备份配置
    if [ -f ".env" ]; then
        cp .env "$backup_dir/"
        print_info "配置文件已备份"
    fi
    
    # 备份上传文件（可选，大文件可能耗时）
    if [ -d "uploads" ] && [ "$1" = "--full" ]; then
        tar -czf "$backup_dir/uploads.tar.gz" uploads/
        print_info "上传文件已备份"
    fi
    
    print_success "数据备份完成: $backup_dir"
}

# 拉取最新代码
pull_latest() {
    print_info "拉取最新代码..."
    cd "$PROJECT_DIR"
    
    git fetch origin
    git checkout main
    git pull origin main
    
    print_success "代码更新完成"
}

# 安装依赖
install_deps() {
    print_info "更新依赖..."
    cd "$PROJECT_DIR"
    
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
    
    print_success "依赖更新完成"
}

# 数据库迁移
run_migrations() {
    print_info "执行数据库迁移..."
    cd "$PROJECT_DIR"
    
    npx prisma generate
    npx prisma db push
    
    # 运行数据迁移
    node scripts/migrate.js run 2>/dev/null || print_warning "数据迁移脚本执行失败，请手动检查"
    
    print_success "数据库迁移完成"
}

# 构建应用
build_app() {
    print_info "构建应用..."
    cd "$PROJECT_DIR"
    
    npm run build
    
    print_success "应用构建完成"
}

# 重启服务
restart_service() {
    print_info "重启服务..."
    cd "$PROJECT_DIR"
    
    # 检查是否使用PM2
    if command -v pm2 &> /dev/null && pm2 list | grep -q "laolin-brain"; then
        pm2 reload laolin-brain
        print_success "PM2 服务已重启"
    # 检查是否使用Docker
    elif command -v docker &> /dev/null && docker ps | grep -q "laolin-brain"; then
        docker-compose restart app
        print_success "Docker 容器已重启"
    else
        print_warning "未检测到 PM2 或 Docker 运行中的服务"
        print_info "请手动重启服务"
    fi
}

# 显示版本信息
show_version() {
    cd "$PROJECT_DIR"
    local commit=$(git rev-parse --short HEAD)
    local date=$(git log -1 --format=%cd --date=short)
    echo ""
    echo "============================================"
    echo "  升级完成！"
    echo "============================================"
    echo ""
    echo "当前版本: $commit ($date)"
    echo ""
}

# 主函数
main() {
    echo "============================================"
    echo "  laolin-brain 升级脚本"
    echo "============================================"
    echo ""
    
    # 检查是否在项目目录中
    if [ ! -f "$PROJECT_DIR/package.json" ]; then
        print_error "未找到项目目录，请在项目目录中运行此脚本"
        exit 1
    fi
    
    # 备份
    backup_data "$1"
    
    echo ""
    pull_latest
    
    echo ""
    install_deps
    
    echo ""
    run_migrations
    
    echo ""
    build_app
    
    echo ""
    restart_service
    
    echo ""
    show_version
    
    print_success "升级完成！"
}

# 运行主函数
main "$@"
