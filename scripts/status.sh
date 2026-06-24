#!/bin/bash
# ============================================
# laolin-brain 状态检查脚本
# ============================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 检查服务状态
check_service() {
    echo ""
    echo -e "${CYAN}=== 服务状态 ===${NC}"
    
    # 检查PM2
    if command -v pm2 &> /dev/null; then
        if pm2 list | grep -q "laolin-brain"; then
            local status=$(pm2 list | grep "laolin-brain" | awk '{print $10}')
            if [ "$status" = "online" ]; then
                print_success "PM2 服务运行中"
            else
                print_error "PM2 服务状态: $status"
            fi
        else
            print_warning "PM2 中未找到 laolin-brain 服务"
        fi
    fi
    
    # 检查Docker
    if command -v docker &> /dev/null; then
        if docker ps | grep -q "laolin-brain"; then
            print_success "Docker 容器运行中"
        else
            print_warning "Docker 容器未运行"
        fi
    fi
    
    # 检查端口
    if command -v lsof &> /dev/null; then
        if lsof -i :3000 -sTCP:LISTEN &> /dev/null; then
            print_success "端口 3000 正在监听"
        else
            print_warning "端口 3000 未监听"
        fi
    fi
    
    # 检查HTTP响应
    if command -v curl &> /dev/null; then
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        if [ "$http_code" = "200" ] || [ "$http_code" = "302" ]; then
            print_success "HTTP 响应正常 ($http_code)"
        else
            print_warning "HTTP 响应异常 ($http_code)"
        fi
    fi
}

# 检查系统资源
check_system() {
    echo ""
    echo -e "${CYAN}=== 系统资源 ===${NC}"
    
    # CPU
    if command -v top &> /dev/null; then
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        print_info "CPU 使用率: ${cpu_usage}%"
    fi
    
    # 内存
    if command -v free &> /dev/null; then
        local mem_total=$(free -h | grep Mem | awk '{print $2}')
        local mem_used=$(free -h | grep Mem | awk '{print $3}')
        local mem_percent=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100}')
        print_info "内存使用: $mem_used / $mem_total (${mem_percent}%)"
    fi
    
    # 磁盘
    if command -v df &> /dev/null; then
        local disk_usage=$(df -h "$PROJECT_DIR" | tail -1 | awk '{print $5}')
        local disk_total=$(df -h "$PROJECT_DIR" | tail -1 | awk '{print $2}')
        local disk_used=$(df -h "$PROJECT_DIR" | tail -1 | awk '{print $3}')
        print_info "磁盘使用: $disk_used / $disk_total ($disk_usage)"
    fi
}

# 检查数据
check_data() {
    echo ""
    echo -e "${CYAN}=== 数据状态 ===${NC}"
    
    cd "$PROJECT_DIR"
    
    # 数据库
    if [ -f "data/db.sqlite" ]; then
        local db_size=$(du -h data/db.sqlite | cut -f1)
        print_info "数据库: $db_size"
    else
        print_warning "数据库文件不存在"
    fi
    
    # 上传文件
    if [ -d "uploads" ]; then
        local upload_count=$(find uploads -type f | wc -l)
        local upload_size=$(du -sh uploads | cut -f1)
        print_info "上传文件: $upload_count 个 ($upload_size)"
    else
        print_warning "上传目录不存在"
    fi
    
    # 备份
    if [ -d "backups" ]; then
        local backup_count=$(ls -1d backups/*/ 2>/dev/null | wc -l)
        local backup_size=$(du -sh backups | cut -f1)
        print_info "备份: $backup_count 个 ($backup_size)"
    else
        print_info "暂无备份"
    fi
    
    # 日志
    if [ -d "logs" ]; then
        local log_size=$(du -sh logs | cut -f1)
        print_info "日志: $log_size"
    fi
}

# 检查版本
check_version() {
    echo ""
    echo -e "${CYAN}=== 版本信息 ===${NC}"
    
    cd "$PROJECT_DIR"
    
    # Git版本
    if command -v git &> /dev/null && [ -d ".git" ]; then
        local commit=$(git rev-parse --short HEAD)
        local branch=$(git rev-parse --abbrev-ref HEAD)
        local date=$(git log -1 --format=%cd --date=short)
        print_info "Git 版本: $commit ($branch, $date)"
    fi
    
    # Node版本
    if command -v node &> /dev/null; then
        print_info "Node.js: $(node --version)"
    fi
    
    # npm版本
    if command -v npm &> /dev/null; then
        print_info "npm: $(npm --version)"
    fi
}

# 主函数
main() {
    echo "============================================"
    echo "  laolin-brain 状态检查"
    echo "============================================"
    
    check_service
    check_system
    check_data
    check_version
    
    echo ""
    echo "============================================"
    echo "  检查完成"
    echo "============================================"
    echo ""
}

main "$@"
