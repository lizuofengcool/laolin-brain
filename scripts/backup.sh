#!/bin/bash
# ============================================
# laolin-brain 备份脚本
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

# 备份类型
BACKUP_TYPE="${1:-full}"

# 创建备份
create_backup() {
    local backup_type="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="$PROJECT_DIR/backups/$backup_type-$timestamp"
    
    print_info "创建$backup_type备份..."
    mkdir -p "$backup_dir"
    
    # 备份数据库
    if [ -f "$PROJECT_DIR/data/db.sqlite" ]; then
        cp "$PROJECT_DIR/data/db.sqlite" "$backup_dir/db.sqlite"
        print_info "数据库已备份"
    fi
    
    # 备份配置
    if [ -f "$PROJECT_DIR/.env" ]; then
        cp "$PROJECT_DIR/.env" "$backup_dir/.env"
        print_info "配置文件已备份"
    fi
    
    # 完整备份包含上传文件
    if [ "$backup_type" = "full" ] && [ -d "$PROJECT_DIR/uploads" ]; then
        tar -czf "$backup_dir/uploads.tar.gz" -C "$PROJECT_DIR" uploads/ 2>/dev/null || true
        print_info "上传文件已备份"
    fi
    
    # 生成备份信息
    cat > "$backup_dir/backup-info.json" << EOF
{
  "type": "$backup_type",
  "timestamp": "$timestamp",
  "date": "$(date)",
  "version": "$(cd $PROJECT_DIR && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}
EOF
    
    # 计算校验和
    if command -v sha256sum &> /dev/null; then
        cd "$backup_dir"
        find . -type f -exec sha256sum {} \; > checksums.txt
        print_info "校验和已生成"
    fi
    
    print_success "备份创建完成: $backup_dir"
    
    # 清理旧备份
    cleanup_old_backups
}

# 清理旧备份
cleanup_old_backups() {
    local keep_count="${BACKUP_KEEP_COUNT:-7}"
    local backup_dir="$PROJECT_DIR/backups"
    
    if [ -d "$backup_dir" ]; then
        local count=$(ls -1d "$backup_dir"/*/ 2>/dev/null | wc -l)
        if [ "$count" -gt "$keep_count" ]; then
            print_info "清理旧备份（保留最近$keep_count个）..."
            ls -1dt "$backup_dir"/*/ | tail -n +$((keep_count + 1)) | xargs rm -rf
            print_info "旧备份已清理"
        fi
    fi
}

# 列出备份
list_backups() {
    local backup_dir="$PROJECT_DIR/backups"
    
    if [ ! -d "$backup_dir" ]; then
        print_warning "没有找到备份"
        return
    fi
    
    echo ""
    echo "备份列表："
    echo "----------------------------------------"
    
    for dir in $(ls -1dt "$backup_dir"/*/ 2>/dev/null); do
        local name=$(basename "$dir")
        local size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        local info_file="$dir/backup-info.json"
        
        if [ -f "$info_file" ]; then
            local type=$(grep '"type"' "$info_file" | cut -d'"' -f4)
            local date=$(grep '"date"' "$info_file" | cut -d'"' -f4)
            echo "  $name  ($type, $size)  $date"
        else
            echo "  $name  ($size)"
        fi
    done
    
    echo ""
}

# 主函数
main() {
    cd "$PROJECT_DIR"
    
    case "$BACKUP_TYPE" in
        full|db|config)
            create_backup "$BACKUP_TYPE"
            ;;
        list|ls)
            list_backups
            ;;
        cleanup)
            cleanup_old_backups
            ;;
        *)
            echo "用法: $0 [full|db|config|list|cleanup]"
            echo ""
            echo "  full    - 完整备份（数据库+配置+上传文件）"
            echo "  db      - 仅备份数据库"
            echo "  config  - 仅备份配置"
            echo "  list    - 列出备份"
            echo "  cleanup - 清理旧备份"
            echo ""
            exit 1
            ;;
    esac
}

main "$@"
