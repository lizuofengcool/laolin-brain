// Windows 服务模块
// 以 SYSTEM 权限运行的后台服务，提供极速文件搜索
// 通过 TCP 本地端口与主程序通信

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 服务监听端口
pub const SERVICE_PORT: u16 = 19527;

/// 服务名称
pub const SERVICE_NAME: &str = "LaolinSearch";

/// 服务显示名称
pub const SERVICE_DISPLAY_NAME: &str = "Laolin Search";

/// 服务描述
pub const SERVICE_DESCRIPTION: &str = "Laolin Search - 老霖AI知识库全盘文件极速搜索服务";

// ─── 通信协议 ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceRequest {
    pub action: String,
    pub query: Option<String>,
    pub path: Option<String>,
    pub ext_filter: Option<String>,
    pub category: Option<String>,
    pub max_results: Option<usize>,
    pub min_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// 通过 TCP 发送请求并获取响应
pub fn send_request(request: &ServiceRequest) -> Result<ServiceResponse, String> {
    let json = serde_json::to_string(request)
        .map_err(|e| format!("序列化请求失败: {}", e))?;

    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", SERVICE_PORT))
        .map_err(|e| format!("连接搜索服务失败（服务可能未运行）: {}", e))?;

    // 发送请求（4字节长度前缀 + JSON）
    let len = json.len() as u32;
    stream.write_all(&len.to_le_bytes())
        .map_err(|e| format!("发送请求长度失败: {}", e))?;
    stream.write_all(json.as_bytes())
        .map_err(|e| format!("发送请求数据失败: {}", e))?;
    stream.flush()
        .map_err(|e| format!("刷新流失败: {}", e))?;

    // 读取响应
    let mut resp_len_bytes = [0u8; 4];
    stream.read_exact(&mut resp_len_bytes)
        .map_err(|e| format!("读取响应长度失败: {}", e))?;
    let resp_len = u32::from_le_bytes(resp_len_bytes) as usize;

    if resp_len > 50 * 1024 * 1024 {
        return Err("响应数据过大".to_string());
    }

    let mut resp_data = vec![0u8; resp_len];
    stream.read_exact(&mut resp_data)
        .map_err(|e| format!("读取响应数据失败: {}", e))?;

    serde_json::from_slice(&resp_data)
        .map_err(|e| format!("解析响应失败: {}", e))
}

/// 快速检查服务是否运行（只查 sc query，不做 TCP ping，适合频繁调用）
pub fn is_service_running_fast() -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("sc")
            .args(["query", SERVICE_NAME])
            .creation_flags(0x08000000)
            .output();
        match output {
            Ok(out) => String::from_utf8_lossy(&out.stdout).contains("RUNNING"),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

/// 检查搜索服务是否正在运行
pub fn is_service_running() -> bool {
    // 先用 sc query 快速检查服务状态（避免 TCP 连接超时）
    let output = std::process::Command::new("sc")
        .args(["query", SERVICE_NAME])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if !stdout.contains("RUNNING") {
                return false;
            }
        }
        Err(_) => return false,
    }

    // 服务状态为 RUNNING，再用 TCP ping 确认服务真的在响应
    if let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", SERVICE_PORT).parse().unwrap(),
        std::time::Duration::from_secs(2),
    ) {
        let ping = ServiceRequest {
            action: "ping".to_string(),
            query: None,
            path: None,
            ext_filter: None,
            category: None,
            max_results: None,
            min_size: None,
        };
        if let Ok(json) = serde_json::to_string(&ping) {
            let len = json.len() as u32;
            if stream.write_all(&len.to_le_bytes()).is_ok()
                && stream.write_all(json.as_bytes()).is_ok()
                && stream.flush().is_ok() {
                let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));
                let mut resp_len_bytes = [0u8; 4];
                if stream.read_exact(&mut resp_len_bytes).is_ok() {
                    let resp_len = u32::from_le_bytes(resp_len_bytes) as usize;
                    if resp_len > 0 && resp_len < 1024 {
                        let mut resp_data = vec![0u8; resp_len];
                        if stream.read_exact(&mut resp_data).is_ok() {
                            if let Ok(resp) = serde_json::from_slice::<ServiceResponse>(&resp_data) {
                                return resp.success;
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

/// 通过服务搜索文件
/// 通过服务重建索引（发送rebuild命令，等待服务完成）
pub fn service_rebuild() -> Result<(), String> {
    let mut stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", SERVICE_PORT).parse().unwrap(),
        std::time::Duration::from_secs(5),
    ).map_err(|e| format!("连接服务失败: {}", e))?;

    stream.set_read_timeout(Some(std::time::Duration::from_secs(300)))
        .map_err(|e| format!("设置超时失败: {}", e))?;

    let request = ServiceRequest {
        action: "rebuild".to_string(),
        query: None,
        path: None,
        ext_filter: None,
        category: None,
        max_results: None,
        min_size: None,
    };

    let json = serde_json::to_string(&request)
        .map_err(|e| format!("序列化请求失败: {}", e))?;
    let len = json.len() as u32;
    stream.write_all(&len.to_le_bytes())
        .map_err(|e| format!("发送请求长度失败: {}", e))?;
    stream.write_all(json.as_bytes())
        .map_err(|e| format!("发送请求数据失败: {}", e))?;
    stream.flush()
        .map_err(|e| format!("刷新流失败: {}", e))?;

    // 等待服务响应（索引构建可能需要几分钟）
    let mut resp_len_bytes = [0u8; 4];
    stream.read_exact(&mut resp_len_bytes)
        .map_err(|e| format!("读取响应长度失败: {}", e))?;
    let resp_len = u32::from_le_bytes(resp_len_bytes) as usize;
    if resp_len > 10 * 1024 * 1024 {
        return Err("响应数据过大".to_string());
    }
    let mut resp_data = vec![0u8; resp_len];
    stream.read_exact(&mut resp_data)
        .map_err(|e| format!("读取响应数据失败: {}", e))?;

    let resp: ServiceResponse = serde_json::from_slice(&resp_data)
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if resp.success {
        Ok(())
    } else {
        Err(resp.error.unwrap_or_else(|| "未知错误".to_string()))
    }
}

pub fn service_search(
    query: &str,
    path: Option<&str>,
    ext_filter: Option<&str>,
    category: Option<&str>,
    max_results: usize,
) -> Result<Vec<crate::system_search::FileEntry>, String> {
    let request = ServiceRequest {
        action: "search".to_string(),
        query: Some(query.to_string()),
        path: path.map(|s| s.to_string()),
        ext_filter: ext_filter.map(|s| s.to_string()),
        category: category.map(|s| s.to_string()),
        max_results: Some(max_results),
        min_size: None,
    };

    let response = send_request(&request)?;

    if !response.success {
        return Err(response.error.unwrap_or_else(|| "未知错误".to_string()));
    }

    let entries: Vec<crate::system_search::FileEntry> = response.data
        .ok_or("无返回数据")?
        .get("entries")
        .ok_or("缺少 entries 字段")?
        .as_array()
        .ok_or("entries 不是数组")?
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();

    Ok(entries)
}

/// 通过服务查找重复文件
pub fn service_find_duplicates(
    path: Option<&str>,
    min_size: u64,
) -> Result<Vec<crate::system_search::DuplicateGroup>, String> {
    let request = ServiceRequest {
        action: "find_duplicates".to_string(),
        query: None,
        path: path.map(|s| s.to_string()),
        ext_filter: None,
        category: None,
        max_results: None,
        min_size: Some(min_size),
    };

    let response = send_request(&request)?;

    if !response.success {
        return Err(response.error.unwrap_or_else(|| "未知错误".to_string()));
    }

    let groups: Vec<crate::system_search::DuplicateGroup> = response.data
        .ok_or("无返回数据")?
        .get("groups")
        .ok_or("缺少 groups 字段")?
        .as_array()
        .ok_or("groups 不是数组")?
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();

    Ok(groups)
}

/// 通过服务搜索文件内容
pub fn service_search_content(
    query: &str,
    path: Option<&str>,
    max_results: usize,
) -> Result<Vec<crate::system_search::ContentSearchResult>, String> {
    let request = ServiceRequest {
        action: "search_content".to_string(),
        query: Some(query.to_string()),
        path: path.map(|s| s.to_string()),
        ext_filter: None,
        category: None,
        max_results: Some(max_results),
        min_size: None,
    };

    let response = send_request(&request)?;

    if !response.success {
        return Err(response.error.unwrap_or_else(|| "未知错误".to_string()));
    }

    let results: Vec<crate::system_search::ContentSearchResult> = response.data
        .ok_or("无返回数据")?
        .get("results")
        .ok_or("缺少 results 字段")?
        .as_array()
        .ok_or("results 不是数组")?
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();

    Ok(results)
}

/// 获取服务状态
pub fn service_get_status() -> Result<crate::system_search::IndexStatus, String> {
    let request = ServiceRequest {
        action: "status".to_string(),
        query: None,
        path: None,
        ext_filter: None,
        category: None,
        max_results: None,
        min_size: None,
    };

    let response = send_request(&request)?;

    if !response.success {
        return Err(response.error.unwrap_or_else(|| "未知错误".to_string()));
    }

    serde_json::from_value(response.data.ok_or("无返回数据")?)
        .map_err(|e| format!("解析状态失败: {}", e))
}

// ─── 服务安装/卸载（通过 UAC 提权）──────────────────────────

/// 安装并启动搜索服务
/// 通过 UAC 提权，以管理员权限运行自身 --install-service 参数
pub fn install_service() -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取当前路径失败: {}", e))?;
    let exe_str = exe_path.to_string_lossy().to_string();

    // 使用 ShellExecuteW 的 "runas" 动词触发 UAC 提权
    // 启动自身并传入 --install-service 参数
    run_elevated(&exe_str, "--install-service")
}

/// 卸载搜索服务
/// 通过 UAC 提权
pub fn uninstall_service() -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取当前路径失败: {}", e))?;
    let exe_str = exe_path.to_string_lossy().to_string();

    run_elevated(&exe_str, "--uninstall-service")
}

/// 使用 PowerShell 的 Start-Process -Verb RunAs 以管理员权限运行
/// 这会触发 Windows UAC 提示框
fn run_elevated(exe_path: &str, args: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // 使用 PowerShell 的 Start-Process -Verb RunAs 触发 UAC
        let ps_script = format!(
            "try {{ Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -WindowStyle Hidden; Write-Output 'OK' }} catch {{ Write-Error $_.Exception.Message; exit 1 }}",
            exe_path.replace('\'', "''"),
            args.replace('\'', "''")
        );

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &ps_script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| format!("启动提权进程失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // 用户取消 UAC 或拒绝授权
            if stderr.contains("denied") || stderr.contains("拒绝") || stderr.contains("cancelled") || stderr.contains("取消") || stderr.contains("InvalidOperationException") || stderr.contains("0x80070522") || stderr.contains("The operation was canceled") {
                return Err("需要管理员权限才能安装搜索服务，请点击\"是\"授权".to_string());
            }
            return Err("需要管理员权限才能安装搜索服务，请在弹出的授权窗口中点击\"是\"".to_string());
        }

        // 等待提权进程完成
        std::thread::sleep(std::time::Duration::from_secs(3));
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (exe_path, args);
        Err("仅支持 Windows 平台".to_string())
    }
}

/// 以管理员权限执行服务安装（在提权后的进程中调用）
pub fn do_install_service() -> Result<(), String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取当前路径失败: {}", e))?;
    let exe_str = exe_path.to_string_lossy().to_string();
    let service_cmd = format!("\"{}\" --service", exe_str);

    // 先尝试停止并删除旧服务（包括旧版本的服务名）
    let old_service_names = [SERVICE_NAME, "KnowledgeBaseSearchService"];
    for name in &old_service_names {
        let _ = std::process::Command::new("sc")
            .args(["stop", name])
            .creation_flags(0x08000000)
            .output();
        // 等待服务停止
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let check = std::process::Command::new("sc")
                .args(["query", name])
                .creation_flags(0x08000000)
                .output();
            if let Ok(out) = check {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("STOPPED") || stdout.contains("does not exist") || stdout.contains("1060") {
                    break;
                }
            }
        }
        let _ = std::process::Command::new("sc")
            .args(["delete", name])
            .creation_flags(0x08000000)
            .output();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    // 创建服务
    let output = std::process::Command::new("sc")
        .args(["create", SERVICE_NAME, "binPath=", &service_cmd, "start=", "auto", "DisplayName=", SERVICE_DISPLAY_NAME])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("创建服务失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("创建服务失败: {} {}", stdout, stderr));
    }

    // 设置服务描述
    let _ = std::process::Command::new("sc")
        .args(["description", SERVICE_NAME, SERVICE_DESCRIPTION])
        .creation_flags(0x08000000)
        .output();

    // 启动服务
    let output = std::process::Command::new("sc")
        .args(["start", SERVICE_NAME])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("启动服务失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("启动服务失败: {} {}", stdout, stderr));
    }

    Ok(())
}

/// 以管理员权限执行服务卸载（在提权后的进程中调用）
pub fn do_uninstall_service() -> Result<(), String> {
    // 先停止服务
    let _ = std::process::Command::new("sc")
        .args(["stop", SERVICE_NAME])
        .creation_flags(0x08000000)
        .output();

    // 等待服务停止
    std::thread::sleep(std::time::Duration::from_secs(2));

    // 删除服务
    let output = std::process::Command::new("sc")
        .args(["delete", SERVICE_NAME])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("删除服务失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("删除服务失败: {}", stderr));
    }

    Ok(())
}

/// 检查服务是否已安装
pub fn is_service_installed() -> bool {
    let output = std::process::Command::new("sc")
        .args(["query", SERVICE_NAME])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.contains("RUNNING") || stdout.contains("STOPPED") || stdout.contains("PAUSED")
        }
        Err(_) => false,
    }
}

// ─── 服务端（使用 windows-service crate 正确实现 SCM 注册）──────────

/// 运行搜索服务
/// 这是服务模式的入口点，在 main.rs 中通过 --service 参数触发
pub fn run_service() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_service::{
            define_windows_service,
            service::{
                ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
                ServiceType,
            },
            service_control_handler::{self, ServiceControlHandlerResult},
            service_dispatcher,
        };

        define_windows_service!(ffi_service_main, service_main);

        fn service_main(_arguments: Vec<std::ffi::OsString>) {
            if let Err(e) = run_service_inner() {
                eprintln!("[service] 服务运行错误: {}", e);
            }
        }

        fn run_service_inner() -> Result<(), String> {
            // 初始化日志文件（服务运行在 SYSTEM 上下文，eprintln 不可见）
            let log_path = std::env::current_exe()
                .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("search_service.log"))
                .unwrap_or_else(|_| std::path::PathBuf::from("search_service.log"));

            let log_file: std::cell::RefCell<Option<std::fs::File>> = std::cell::RefCell::new(
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .ok()
            );

            let log_msg = |msg: &str| {
                eprintln!("[service] {}", msg);
                if let Ok(mut borrow) = log_file.try_borrow_mut() {
                    if let Some(ref mut f) = *borrow {
                        let _ = writeln!(f, "[{}] {}", crate::system_search::chrono_now(), msg);
                    }
                }
            };

            log_msg("服务启动中...");

            let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel::<()>();

            let event_handler = move |control_event| -> ServiceControlHandlerResult {
                match control_event {
                    ServiceControl::Stop | ServiceControl::Shutdown => {
                        let _ = shutdown_tx.send(());
                        ServiceControlHandlerResult::NoError
                    }
                    ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                    _ => ServiceControlHandlerResult::NotImplemented,
                }
            };

            let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)
                .map_err(|e| format!("注册服务控制处理器失败: {}", e))?;

            // 报告服务正在启动
            let start_pending_status = ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::StartPending,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: std::time::Duration::from_secs(10),
                process_id: None,
            };
            status_handle
                .set_service_status(start_pending_status)
                .map_err(|e| format!("设置服务状态失败: {}", e))?;

            // 绑定 TCP 端口（服务只做权限桥梁，不自动建索引）
            let listener = match std::net::TcpListener::bind(format!("127.0.0.1:{}", SERVICE_PORT)) {
                Ok(l) => l,
                Err(e) => {
                    log_msg(&format!("绑定端口 {} 失败: {}", SERVICE_PORT, e));
                    let stopped_status = ServiceStatus {
                        service_type: ServiceType::OWN_PROCESS,
                        current_state: ServiceState::Stopped,
                        controls_accepted: ServiceControlAccept::empty(),
                        exit_code: ServiceExitCode::ServiceSpecific(2),
                        checkpoint: 0,
                        wait_hint: std::time::Duration::default(),
                        process_id: None,
                    };
                    let _ = status_handle.set_service_status(stopped_status);
                    return Err(format!("绑定端口 {} 失败: {}", SERVICE_PORT, e));
                }
            };
            listener.set_nonblocking(true)
                .map_err(|e| format!("设置非阻塞失败: {}", e))?;

            // 报告服务正在运行
            let running_status = ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Running,
                controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: std::time::Duration::default(),
                process_id: None,
            };
            status_handle
                .set_service_status(running_status)
                .map_err(|e| format!("设置服务状态失败: {}", e))?;

            log_msg(&format!("服务已启动，监听端口 {}", SERVICE_PORT));

            // 主循环
            loop {
                if shutdown_rx.try_recv().is_ok() {
                    log_msg("收到停止信号");
                    break;
                }

                match listener.accept() {
                    Ok((mut stream, _addr)) => {
                        if let Err(e) = handle_client(&mut stream) {
                            log_msg(&format!("处理客户端请求错误: {}", e));
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                    Err(e) => {
                        log_msg(&format!("接受连接错误: {}", e));
                    }
                }
            }

            // 报告服务已停止
            let stopped_status = ServiceStatus {
                service_type: ServiceType::OWN_PROCESS,
                current_state: ServiceState::Stopped,
                controls_accepted: ServiceControlAccept::empty(),
                exit_code: ServiceExitCode::Win32(0),
                checkpoint: 0,
                wait_hint: std::time::Duration::default(),
                process_id: None,
            };
            status_handle.set_service_status(stopped_status).unwrap_or_default();

            log_msg("服务已停止");
            Ok(())
        }

        service_dispatcher::start(SERVICE_NAME, ffi_service_main)
            .map_err(|e| format!("启动服务分发器失败: {}", e))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("仅支持 Windows 平台".to_string())
    }
}

fn handle_client(stream: &mut TcpStream) -> Result<(), String> {
    // 设置读取超时，避免连接挂起
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(5)));

    // 读取请求
    let mut len_bytes = [0u8; 4];
    match stream.read_exact(&mut len_bytes) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::TimedOut => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::ConnectionReset => return Ok(()),
        Err(e) => return Err(format!("读取请求长度失败: {}", e)),
    }
    let len = u32::from_le_bytes(len_bytes) as usize;

    if len > 10 * 1024 * 1024 {
        return Err("请求数据过大".to_string());
    }

    let mut data = vec![0u8; len];
    match stream.read_exact(&mut data) {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::TimedOut => return Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::ConnectionReset => return Ok(()),
        Err(e) => return Err(format!("读取请求数据失败: {}", e)),
    }

    let request: ServiceRequest = match serde_json::from_slice(&data) {
        Ok(r) => r,
        Err(e) => {
            let resp = ServiceResponse {
                success: false,
                data: None,
                error: Some(format!("解析请求失败: {}", e)),
            };
            send_response(stream, &resp)?;
            return Ok(());
        }
    };

    // 处理请求
    let response = handle_service_request(request);

    // 发送响应
    send_response(stream, &response)
}

fn send_response(stream: &mut TcpStream, response: &ServiceResponse) -> Result<(), String> {
    let resp_json = serde_json::to_vec(response).unwrap_or_default();
    let resp_len = resp_json.len() as u32;
    stream.write_all(&resp_len.to_le_bytes())
        .map_err(|e| format!("发送响应长度失败: {}", e))?;
    stream.write_all(&resp_json)
        .map_err(|e| format!("发送响应数据失败: {}", e))?;
    stream.flush()
        .map_err(|e| format!("刷新流失败: {}", e))?;
    Ok(())
}

fn handle_service_request(request: ServiceRequest) -> ServiceResponse {
    let log_to_file = |msg: &str| {
        let log_path = std::env::current_exe()
            .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("search_service.log"))
            .unwrap_or_else(|_| std::path::PathBuf::from("search_service.log"));
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            let _ = writeln!(f, "[{}] {}", crate::system_search::chrono_now(), msg);
        }
    };

    match request.action.as_str() {
        "ping" => ServiceResponse {
            success: true,
            data: Some(serde_json::json!({ "status": "ok" })),
            error: None,
        },
        "rebuild" => {
            log_to_file("收到重建索引命令，开始构建索引...");
            let result = crate::system_search::build_index();
            match result {
                Ok(status) => {
                    log_to_file(&format!("索引构建完成: {} 文件, {} 目录, 模式: {}", status.total_files, status.total_dirs, status.indexed_drives.join(", ")));
                    // build_index 内部已自动检测服务进程并释放内存
                    log_to_file("索引已保存到文件，服务进程内存已释放");
                    let status_json = serde_json::to_value(&status).unwrap_or(serde_json::Value::Null);
                    ServiceResponse {
                        success: true,
                        data: Some(status_json),
                        error: None,
                    }
                }
                Err(e) => {
                    log_to_file(&format!("索引构建失败: {}", e));
                    ServiceResponse {
                        success: false,
                        data: None,
                        error: Some(e),
                    }
                }
            }
        }
        _ => ServiceResponse {
            success: false,
            data: None,
            error: Some(format!("未知操作: {}", request.action)),
        },
    }
}