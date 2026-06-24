#!/bin/bash
# ============================================
# laolin-brain 恢复脚本
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

# 验证备份
verify_backup() {
    local backup_dir="$1"
    
    print_info "验证备份..."
    
    if [ ! -d "$backup_dir" ]; then
        print_error "备份目录不存在: $backup_dir"
        return 1
    fi
    
    # 检查数据库文件
    if [ ! -f "$backup_dir/db.sqlite" ]; then
        print_warning "备份中没有数据库文件"
    fi
    
    # 检查配置文件
    if [ ! -f "$backup_dir/.env" ]; then
        print_warning "备份中没有配置文件"
    fi
    
    # 验证校验和
    if [ -f "$backup_dir/checksums.txt" ] && command -v sha256sum &> /dev/null; then
        cd "$backup_dir"
        if sha256sum -c checksums.txt --status 2>/dev/null; then
            print_success "备份校验和验证通过"
        else
            print_warning "备份校验和验证失败，文件可能已损坏"
        fi
    fi
    
    # 显示备份信息
    if [ -f "$backup_dir/backup-info.json" ]; then
        echo ""
        echo "备份信息："
        cat "$backup_dir/backup-info.json"
        echo ""
    fi
    
    return 0
}

# 恢复数据库
restore_database() {
    local backup_dir="$1"
    
    if [ ! -f "$backup_dir/db.sqlite" ]; then
        print_warning "备份中没有数据库文件，跳过数据库恢复"
        return
    fi
    
    print_info "恢复数据库..."
    
    # 备份当前数据库
    if [ -f "$PROJECT_DIR/data/db.sqlite" ]; then
        cp "$PROJECT_DIR/data/db.sqlite" "$PROJECT_DIR/data/db.sqlite.before-restore-$(date +%Y%m%d-%H%M%S)"
        print_info "当前数据库已备份"
    fi
    
    # 恢复数据库
    cp "$backup_dir/db.sqlite" "$PROJECT_DIR/data/db.sqlite"
    
    print_success "数据库恢复完成"
}

# 恢复配置
restore_config() {
    local backup_dir="$1"
    
    if [ ! -f "$backup_dir/.env" ]; then
        print_warning "备份中没有配置文件，跳过配置恢复"
        return
    fi
    
    print_info "恢复配置..."
    
    # 备份当前配置
    if [ -f "$PROJECT_DIR/.env" ]; then
        cp "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.before-restore-$(date +%Y%m%d-%H%M%S)"
        print_info "当前配置已备份"
    fi
    
    # 恢复配置
    cp "$backup_dir/.env" "$PROJECT_DIR/.env"
    
    print_success "配置恢复完成"
}

# 恢复上传文件
restore_uploads() {
    local backup_dir="$1"
    
    if [ ! -f "$backup_dir/uploads.tar.gz" ]; then
        print_warning "备份中没有上传文件，跳过上传文件恢复"
        return
    fi
    
    print_info "恢复上传文件..."
    
    # 备份当前上传文件
    if [ -d "$PROJECT_DIR/uploads" ]; then
        mv "$PROJECT_DIR/uploads" "$PROJECT_DIR/uploads.before-restore-$(date +%Y%m%d-%H%M%S)"
        print_info "当前上传文件已备份"
    fi
    
    # 恢复上传文件
    tar -xzf "$backup_dir/uploads.tar.gz" -C "$PROJECT_DIR"
    
    print_success "上传文件恢复完成"
}

# 主函数
main() {
    local backup_name="$1"
    local restore_type="${2:-all}"
    
    if [ -z "$backup_name" ]; then
        echo "用法: $0 <备份名称> [all|db|config|uploads]"
        echo ""
        echo "示例："
        echo "  $0 full-20240101-120000"
        echo "  $0 full-20240101-120000 db"
        echo ""
        echo "可用备份："
        ls -1d "$PROJECT_DIR"/backups/*/ 2>/dev/null | xargs -I {} basename {}
        echo ""
        exit 1
    fi
    
    local backup_dir="$PROJECT_DIR/backups/$backup_name"
    
    echo "============================================"
    echo "  laolin-brain 恢复脚本"
    echo "============================================"
    echo ""
    
    # 验证备份
    if ! verify_backup "$backup_dir"; then
        exit 1
    fi
    
    # 确认恢复
    echo ""
    print_warning "即将从备份恢复数据，这将覆盖当前数据！"
    read -p "确认继续？(y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "已取消恢复"
        exit 0
    fi
    
    echo ""
    
    # 根据类型恢复
    case "$restore_type" in
        all)
            restore_database "$backup_dir"
            restore_config "$backup_dir"
            restore_uploads "$backup_dir"
            ;;
        db)
            restore_database "$backup_dir"
            ;;
        config)
            restore_config "$backup_dir"
            ;;
        uploads)
            restore_uploads "$backup_dir"
            ;;
        *)
            print_error "未知的恢复类型: $restore_type"
            exit 1
            ;;
    esac
    
    echo ""
    print_success "恢复完成！"
    print_warning "请重启服务以使更改生效"
}

main "$@"
