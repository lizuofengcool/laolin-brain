// 智能文档知识库 - Tauri 桌面版入口
// 此文件为 Tauri v2 应用主入口，使用 Rust 编写
// 注意：需要安装 Rust 工具链才能编译，请参考 docs/TAURI_SETUP.md

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lib;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            lib::get_app_data_dir,
            lib::get_files,
            lib::upload_file,
            lib::delete_file,
            lib::update_file,
            lib::get_file,
            lib::search_files,
            lib::get_versions,
            lib::create_version,
            lib::restore_version,
            lib::delete_version,
            lib::create_folder,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用运行时发生错误");
}
