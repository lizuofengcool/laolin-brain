// 智能文档知识库 - 原生菜单栏配置
// 提供文件、编辑、视图、帮助四个菜单组
// 使用 Tauri v2 的 Menu API 构建原生系统菜单

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

/// 创建应用原生菜单栏
/// 包含文件、编辑、视图、帮助四个子菜单
pub fn create_menu(app: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, String> {
    // ─── 文件菜单 ──────────────────────────────────────────
    let file_menu = Submenu::with_items(
        app,
        "文件",
        true,
        &[
            &MenuItem::with_id(app, "new_file", "新建文件", true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "open_file", "打开文件...", true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "import_data", "导入数据...", true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "export_data", "导出数据...", true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::close_window(app, Some("关闭窗口"))
                .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ─── 编辑菜单 ──────────────────────────────────────────
    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, None::<&str>).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::redo(app, None::<&str>).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::cut(app, None::<&str>).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::copy(app, None::<&str>).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::paste(app, None::<&str>).map_err(|e| e.to_string())?,
            &PredefinedMenuItem::select_all(app, None::<&str>).map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ─── 视图菜单 ──────────────────────────────────────────
    let view_menu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &MenuItem::with_id(
                app,
                "toggle_sidebar",
                "切换侧边栏",
                true,
                Some("CmdOrCtrl+B"),
            )
            .map_err(|e| e.to_string())?,
            &MenuItem::with_id(
                app,
                "toggle_fullscreen",
                "全屏",
                true,
                Some("F11"),
            )
            .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(
                app,
                "view_dashboard",
                "仪表盘",
                true,
                Some("CmdOrCtrl+1"),
            )
            .map_err(|e| e.to_string())?,
            &MenuItem::with_id(
                app,
                "view_files",
                "文件管理",
                true,
                Some("CmdOrCtrl+2"),
            )
            .map_err(|e| e.to_string())?,
            &MenuItem::with_id(
                app,
                "view_search",
                "搜索",
                true,
                Some("CmdOrCtrl+3"),
            )
            .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ─── 帮助菜单 ──────────────────────────────────────────
    let help_menu = Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(
                app,
                "check_updates",
                "检查更新...",
                true,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "about", "关于知识库", true, None::<&str>)
                .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ─── 组装主菜单 ────────────────────────────────────────
    let menu = Menu::with_items(
        app,
        &[&file_menu, &edit_menu, &view_menu, &help_menu],
    )
    .map_err(|e| e.to_string())?;

    Ok(menu)
}
