// 智能文档知识库 - 系统托盘配置
// 在系统托盘区域显示应用图标，支持快速访问主窗口和退出
// 左键点击托盘图标显示/聚焦主窗口

use tauri::menu::{Menu, MenuItem as TrayMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayEvent, TrayIconBuilder};

/// 创建系统托盘图标及右键菜单
/// 包含"显示主窗口"和"退出"两个菜单项
/// 左键点击托盘图标会显示并聚焦主窗口
pub fn create_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 创建托盘菜单项
    let show = TrayMenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = TrayMenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    // 组装右键菜单
    let menu = Menu::with_items(app, &[&show, &quit])?;

    // 获取应用默认图标（需要在 tauri.conf.json 的 bundle.icon 中配置）
    let icon = app
        .default_window_icon()
        .ok_or("未找到应用图标")?
        .clone();

    // 构建系统托盘
    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .tooltip("智能文档知识库")
        // 右键菜单事件处理
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    // 显示并聚焦主窗口
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    // 退出应用
                    app.exit(0);
                }
                _ => {}
            }
        })
        // 托盘图标点击事件处理
        .on_tray_icon_event(|tray, event| {
            // 左键单击（释放时触发）显示主窗口
            if let TrayEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
