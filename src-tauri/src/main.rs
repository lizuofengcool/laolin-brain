// 智能文档知识库 - Tauri 桌面版入口
// 此文件为 Tauri v2 应用主入口，使用 Rust 编写
// 注意：需要安装 Rust 工具链才能编译，请参考 docs/TAURI_SETUP.md

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lib;
mod menu;
mod tray;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 设置原生菜单栏
            let native_menu = menu::create_menu(app.handle())
                .expect("创建菜单栏失败");
            app.set_menu(native_menu);

            // 创建系统托盘
            tray::create_tray(app.handle())
                .expect("创建系统托盘失败");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            lib::get_app_data_dir,
            lib::get_files,
            lib::get_favorite_files,
            lib::get_files_by_folder,
            lib::get_deleted_files,
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
            lib::get_folders,
            lib::delete_folder,
            lib::rename_folder,
            lib::permanent_delete_file,
            lib::empty_recycle_bin,
            lib::get_file_data,
            lib::open_file_externally,
            // 系统搜索命令
            lib::system_search_build_index,
            lib::system_search_query,
            lib::system_search_query_in_path,
            lib::system_search_status,
            lib::system_search_is_building,
            lib::system_search_is_admin,
            lib::system_search_content,
            lib::system_search_duplicates,
            lib::system_search_refresh,
            lib::system_search_start_watcher,
            lib::system_search_stop_watcher,
            lib::system_search_watcher_status,
            lib::dialog_open_dir,
            lib::app_exit,
            // 搜索服务命令
            lib::search_service_is_running,
            lib::search_service_is_installed,
            lib::search_service_install,
            lib::search_service_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用运行时发生错误");
}
