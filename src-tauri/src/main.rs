// 智能文档知识库 - Tauri 桌面版入口
// 此文件为 Tauri v2 应用主入口，使用 Rust 编写
// 注意：需要安装 Rust 工具链才能编译，请参考 docs/TAURI_SETUP.md
//
// Tauri v2 标准结构：
// - main.rs 只调用 lib.rs 中的 run() 函数
// - 所有命令、菜单、托盘逻辑都在 lib.rs 中
// 这样可以避免 #[tauri::command] 宏的 __cmd__* 重复 import 问题

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    knowledge_base::run()
}
