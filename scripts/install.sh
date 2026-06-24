#!/bin/bash
# ============================================
# laolin-brain 一键安装脚本
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_warning "建议使用root用户运行，否则可能需要sudo权限"
    fi
}

# 检查系统
check_system() {
    print_info "检查系统环境..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js 已安装: $NODE_VERSION"
    else
        print_error "Node.js 未安装，请先安装 Node.js >= 20.0.0"
        exit 1
    fi
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm 已安装: $NPM_VERSION"
    else
        print_error "npm 未安装"
        exit 1
    fi
    
    if command -v git &> /dev/null; then
        GIT_VERSION=$(git --version)
        print_success "Git 已安装: $GIT_VERSION"
    else
        print_error "Git 未安装"
        exit 1
    fi
}

# 克隆仓库
clone_repo() {
    local install_dir="$1"
    
    if [ -d "$install_dir" ]; then
        print_warning "目录 $install_dir 已存在，跳过克隆"
    else
        print_info "克隆仓库到 $install_dir ..."
        git clone https://gitee.com/fay1314/laolin-brain.git "$install_dir"
        print_success "仓库克隆完成"
    fi
}

# 安装依赖
install_dependencies() {
    local install_dir="$1"
    
    print_info "安装依赖..."
    cd "$install_dir"
    
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
    
    print_success "依赖安装完成"
}

# 初始化数据库
init_database() {
    local install_dir="$1"
    
    print_info "初始化数据库..."
    cd "$install_dir"
    
    npx prisma generate
    npx prisma db push
    
    print_success "数据库初始化完成"
}

# 配置环境变量
setup_env() {
    local install_dir="$1"
    
    if [ -f "$install_dir/.env" ]; then
        print_warning ".env 文件已存在，跳过配置"
    else
        print_info "配置环境变量..."
        cd "$install_dir"
        
        cp .env.example .env
        
        # 生成随机密钥
        local secret=$(openssl rand -hex 32 2>/dev/null || echo "change-me-to-a-random-32-char-string-at-least-32-chars")
        
        # 替换默认密钥
        sed -i "s/change-me-to-a-random-32-char-string-at-least-32-chars/$secret/g" .env
        
        print_success "环境变量配置完成"
        print_warning "请编辑 .env 文件，根据需要修改配置"
    fi
}

# 创建数据目录
create_data_dirs() {
    local install_dir="$1"
    
    print_info "创建数据目录..."
    cd "$install_dir"
    
    mkdir -p data
    mkdir -p uploads
    mkdir -p backups
    mkdir -p logs
    
    print_success "数据目录创建完成"
}

# 构建应用
build_app() {
    local install_dir="$1"
    
    print_info "构建应用..."
    cd "$install_dir"
    
    npm run build
    
    print_success "应用构建完成"
}

# 显示使用说明
show_usage() {
    local install_dir="$1"
    
    echo ""
    echo "============================================"
    echo "  laolin-brain 安装完成！"
    echo "============================================"
    echo ""
    echo "安装目录: $install_dir"
    echo ""
    echo "启动方式："
    echo "  1. 直接启动:"
    echo "     cd $install_dir"
    echo "     npm start"
    echo ""
    echo "  2. 使用 PM2 (推荐生产环境):"
    echo "     cd $install_dir"
    echo "     npm install -g pm2"
    echo "     pm2 start ecosystem.config.js"
    echo ""
    echo "  3. 使用 Docker:"
    echo "     cd $install_dir"
    echo "     docker-compose up -d"
    echo ""
    echo "默认访问地址: http://localhost:3000"
    echo ""
    echo "配置文件: $install_dir/.env"
    echo "请根据需要修改配置后重启服务"
    echo ""
}

# 主函数
main() {
    local install_dir="${1:-./laolin-brain}"
    
    echo "============================================"
    echo "  laolin-brain 一键安装脚本"
    echo "============================================"
    echo ""
    
    check_root
    check_system
    
    echo ""
    clone_repo "$install_dir"
    
    echo ""
    install_dependencies "$install_dir"
    
    echo ""
    setup_env "$install_dir"
    
    echo ""
    create_data_dirs "$install_dir"
    
    echo ""
    init_database "$install_dir"
    
    echo ""
    build_app "$install_dir"
    
    echo ""
    show_usage "$install_dir"
    
    print_success "安装完成！"
}

# 运行主函数
main "$@"
