// 智能文档知识库 - Tauri 后端命令模块
// 提供文件管理、版本控制、文件夹管理等本地存储功能
// 数据存储在 Tauri 的 app_data_dir 下，使用 JSON 文件作为本地数据库

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

// ─── 数据结构定义 ──────────────────────────────────────────────

/// 文件数据结构（对应前端 FileData）
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KBFile {
    id: String,
    user_id: String,
    file_name: String,
    file_type: String,
    file_size: i64,
    file_path: Option<String>,
    text_content: Option<String>,
    thumbnail_url: Option<String>,
    preview_url: Option<String>,
    storage_mode: String,
    folder_id: Option<String>,
    tags: Vec<String>,
    is_favorite: bool,
    is_deleted: Option<bool>,
    deleted_at: Option<String>,
    created_at: String,
    file_hash: Option<String>,
    summary: Option<String>,
    key_points: Option<Vec<String>>,
}

/// 文件版本数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KBFileVersion {
    id: String,
    file_id: String,
    file_name: String,
    file_size: i64,
    file_path: Option<String>,
    text_content: Option<String>,
    thumbnail_url: Option<String>,
    version: i32,
    created_at: String,
}

/// 文件夹数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct KBFolder {
    id: String,
    name: String,
    parent_id: Option<String>,
    user_id: String,
    created_at: String,
}

/// 上传文件的返回结果
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UploadResult {
    id: String,
    file_name: String,
    file_type: String,
    file_size: i64,
    text_content: Option<String>,
    thumbnail_url: Option<String>,
}

// ─── Tauri 命令 ──────────────────────────────────────────────────

/// 获取应用数据目录路径
#[command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 获取用户的所有文件（过滤掉已删除的）
#[command]
fn get_files(user_id: String, app: tauri::AppHandle) -> Result<Vec<KBFile>, String> {
    let files = read_all_files(&app, &user_id)?;
    // 过滤掉已删除的文件
    Ok(files
        .into_iter()
        .filter(|f| f.is_deleted != Some(true))
        .collect())
}

/// 获取单个文件详情
#[command]
fn get_file(file_id: String, user_id: String, app: tauri::AppHandle) -> Result<Option<KBFile>, String> {
    let files = read_all_files(&app, &user_id)?;
    Ok(files.into_iter().find(|f| f.id == file_id))
}

/// 搜索文件（按文件名、文本内容、标签）
#[command]
fn search_files(
    query: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<KBFile>, String> {
    let files = read_all_files(&app, &user_id)?;
    let query_lower = query.to_lowercase();

    let results: Vec<KBFile> = files
        .into_iter()
        .filter(|f| {
            f.is_deleted != Some(true)
                && (f.file_name.to_lowercase().contains(&query_lower)
                    || f.text_content
                        .as_ref()
                        .map(|t| t.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
                    || f.tags.iter().any(|t| t.to_lowercase().contains(&query_lower)))
        })
        .collect();

    Ok(results)
}

/// 上传文件（base64 数据）
#[command]
fn upload_file(
    user_id: String,
    file_name: String,
    file_size: i64,
    file_type: String,
    file_data: String,
    app: tauri::AppHandle,
) -> Result<UploadResult, String> {
    // 确保用户文件目录存在
    let files_dir = get_user_files_dir(&app, &user_id)?;
    fs::create_dir_all(&files_dir).map_err(|e| e.to_string())?;

    // 生成唯一文件 ID
    let file_id = generate_uuid();
    let file_path = files_dir.join(&file_id);

    // 将 base64 数据解码后保存到磁盘
    let decoded = decode_base64(&file_data).map_err(|e| format!("Base64 解码失败: {}", e))?;
    fs::write(&file_path, decoded).map_err(|e| e.to_string())?;

    // 创建文件记录
    let now = now_iso8601();
    let kb_file = KBFile {
        id: file_id.clone(),
        user_id: user_id.clone(),
        file_name: file_name.clone(),
        file_type: file_type.clone(),
        file_size,
        file_path: Some(file_path.to_string_lossy().to_string()),
        text_content: None,
        thumbnail_url: None,
        preview_url: None,
        storage_mode: "local".to_string(),
        folder_id: None,
        tags: vec![],
        is_favorite: false,
        is_deleted: Some(false),
        deleted_at: None,
        created_at: now.clone(),
        file_hash: None,
        summary: None,
        key_points: None,
    };

    // 追加到用户文件数据库
    append_file_to_db(&app, &user_id, &kb_file)?;

    Ok(UploadResult {
        id: file_id,
        file_name,
        file_type,
        file_size,
        text_content: None,
        thumbnail_url: None,
    })
}

/// 删除文件（软删除）
#[command]
fn delete_file(file_id: String, user_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut files = read_all_files(&app, &user_id)?;

    if let Some(file) = files.iter_mut().find(|f| f.id == file_id) {
        file.is_deleted = Some(true);
        file.deleted_at = Some(now_iso8601());
    } else {
        return Err(format!("文件 {} 不存在", file_id));
    }

    write_all_files(&app, &user_id, &files)?;
    Ok(())
}

/// 更新文件元数据（支持 is_deleted 字段用于恢复文件）
#[command]
fn update_file(
    file_id: String,
    user_id: String,
    data: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut files = read_all_files(&app, &user_id)?;

    if let Some(file) = files.iter_mut().find(|f| f.id == file_id) {
        // 支持更新文件名
        if let Some(name) = data.get("fileName").and_then(|v| v.as_str()) {
            file.file_name = name.to_string();
        }
        // 支持更新标签
        if let Some(tags) = data.get("tags").and_then(|v| v.as_array()) {
            file.tags = tags
                .iter()
                .filter_map(|t| t.as_str().map(String::from))
                .collect();
        }
        // 支持更新收藏状态
        if let Some(fav) = data.get("isFavorite").and_then(|v| v.as_bool()) {
            file.is_favorite = fav;
        }
        // 支持更新文件夹
        if let Some(folder) = data.get("folderId") {
            file.folder_id = folder.as_str().map(String::from);
        }
        // 支持更新摘要
        if let Some(summary) = data.get("summary").and_then(|v| v.as_str()) {
            file.summary = Some(summary.to_string());
        }
        // 支持更新关键点
        if let Some(key_points) = data.get("keyPoints").and_then(|v| v.as_array()) {
            file.key_points = Some(
                key_points
                    .iter()
                    .filter_map(|t| t.as_str().map(String::from))
                    .collect(),
            );
        }
        // 支持更新删除状态（用于恢复文件）
        if let Some(deleted) = data.get("isDeleted").and_then(|v| v.as_bool()) {
            file.is_deleted = Some(deleted);
            if deleted {
                // 软删除时记录删除时间
                file.deleted_at = Some(now_iso8601());
            } else {
                // 恢复文件时清除删除时间
                file.deleted_at = None;
            }
        }
    } else {
        return Err(format!("文件 {} 不存在", file_id));
    }

    write_all_files(&app, &user_id, &files)?;
    Ok(())
}

/// 获取文件版本历史
#[command]
fn get_versions(
    file_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<KBFileVersion>, String> {
    let versions = read_all_versions(&app, &user_id)?;
    let mut file_versions: Vec<KBFileVersion> = versions
        .into_iter()
        .filter(|v| v.file_id == file_id)
        .collect();
    // 按版本号降序排列
    file_versions.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(file_versions)
}

/// 创建文件版本
#[command]
fn create_version(
    file_id: String,
    user_id: String,
    file_name: String,
    file_size: i64,
    text_content: Option<String>,
    thumbnail_url: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut versions = read_all_versions(&app, &user_id)?;

    // 计算下一个版本号
    let current_max = versions
        .iter()
        .filter(|v| v.file_id == file_id)
        .map(|v| v.version)
        .max()
        .unwrap_or(0);

    let version = KBFileVersion {
        id: generate_uuid(),
        file_id,
        file_name,
        file_size,
        file_path: None,
        text_content,
        thumbnail_url,
        version: current_max + 1,
        created_at: now_iso8601(),
    };

    versions.push(version);
    write_all_versions(&app, &user_id, &versions)?;
    Ok(())
}

/// 恢复到指定版本
#[command]
fn restore_version(
    version_id: String,
    file_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let versions = read_all_versions(&app, &user_id)?;
    let version = versions
        .iter()
        .find(|v| v.id == version_id && v.file_id == file_id)
        .ok_or_else(|| format!("版本 {} 不存在", version_id))?;

    let mut files = read_all_files(&app, &user_id)?;
    if let Some(file) = files.iter_mut().find(|f| f.id == file_id) {
        file.file_name = version.file_name.clone();
        file.file_size = version.file_size;
        file.file_path = version.file_path.clone();
        file.text_content = version.text_content.clone();
        file.thumbnail_url = version.thumbnail_url.clone();
    } else {
        return Err(format!("文件 {} 不存在", file_id));
    }

    write_all_files(&app, &user_id, &files)?;
    Ok(())
}

/// 删除文件版本
#[command]
fn delete_version(
    version_id: String,
    file_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut versions = read_all_versions(&app, &user_id)?;
    versions.retain(|v| !(v.id == version_id && v.file_id == file_id));
    write_all_versions(&app, &user_id, &versions)?;
    Ok(())
}

/// 创建文件夹
#[command]
fn create_folder(
    folder_name: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<KBFolder, String> {
    let mut folders = read_all_folders(&app, &user_id)?;

    let folder = KBFolder {
        id: generate_uuid(),
        name: folder_name,
        parent_id: None,
        user_id: user_id.clone(),
        created_at: now_iso8601(),
    };

    folders.push(folder.clone());
    write_all_folders(&app, &user_id, &folders)?;
    Ok(folder)
}

// ─── 新增命令 ──────────────────────────────────────────────────

/// 获取用户的所有文件夹
#[command]
fn get_folders(user_id: String, app: tauri::AppHandle) -> Result<Vec<KBFolder>, String> {
    let folders = read_all_folders(&app, &user_id)?;
    Ok(folders)
}

/// 删除文件夹（从 JSON 数据库中移除）
#[command]
fn delete_folder(folder_id: String, user_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut folders = read_all_folders(&app, &user_id)?;

    let before_len = folders.len();
    folders.retain(|f| f.id != folder_id);

    if folders.len() == before_len {
        return Err(format!("文件夹 {} 不存在", folder_id));
    }

    // 同时将该文件夹下的文件移出文件夹（folder_id 设为 null）
    let mut files = read_all_files(&app, &user_id)?;
    for file in files.iter_mut() {
        if file.folder_id.as_deref() == Some(&folder_id) {
            file.folder_id = None;
        }
    }
    write_all_files(&app, &user_id, &files)?;
    write_all_folders(&app, &user_id, &folders)?;
    Ok(())
}

/// 重命名文件夹
#[command]
fn rename_folder(
    folder_id: String,
    new_name: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut folders = read_all_folders(&app, &user_id)?;

    if let Some(folder) = folders.iter_mut().find(|f| f.id == folder_id) {
        folder.name = new_name;
    } else {
        return Err(format!("文件夹 {} 不存在", folder_id));
    }

    write_all_folders(&app, &user_id, &folders)?;
    Ok(())
}

/// 永久删除文件（从数据库中彻底移除 + 删除物理文件）
#[command]
fn permanent_delete_file(
    file_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut files = read_all_files(&app, &user_id)?;

    // 查找文件并获取物理路径
    let file = files
        .iter()
        .find(|f| f.id == file_id)
        .ok_or_else(|| format!("文件 {} 不存在", file_id))?;

    // 删除物理文件
    if let Some(ref path) = file.file_path {
        let file_path = PathBuf::from(path);
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("删除物理文件失败: {}", e))?;
        }
    }

    // 从数据库中移除文件记录
    files.retain(|f| f.id != file_id);

    // 同时删除该文件的所有版本记录
    let mut versions = read_all_versions(&app, &user_id)?;
    versions.retain(|v| v.file_id != file_id);
    write_all_versions(&app, &user_id, &versions)?;

    write_all_files(&app, &user_id, &files)?;
    Ok(())
}

/// 清空回收站（删除所有 is_deleted=true 的文件，返回删除数量）
#[command]
fn empty_recycle_bin(user_id: String, app: tauri::AppHandle) -> Result<usize, String> {
    let mut files = read_all_files(&app, &user_id)?;

    // 找出所有已删除的文件
    let deleted_ids: Vec<String> = files
        .iter()
        .filter(|f| f.is_deleted == Some(true))
        .map(|f| f.id.clone())
        .collect();

    if deleted_ids.is_empty() {
        return Ok(0);
    }

    // 删除已删除文件的物理文件
    for file in &files {
        if file.is_deleted == Some(true) {
            if let Some(ref path) = file.file_path {
                let file_path = PathBuf::from(path);
                if file_path.exists() {
                    let _ = fs::remove_file(&file_path);
                }
            }
        }
    }

    // 从数据库中移除已删除的文件
    files.retain(|f| f.is_deleted != Some(true));

    // 删除已删除文件的所有版本记录
    let mut versions = read_all_versions(&app, &user_id)?;
    versions.retain(|v| !deleted_ids.contains(&v.file_id));
    write_all_versions(&app, &user_id, &versions)?;

    let count = deleted_ids.len();
    write_all_files(&app, &user_id, &files)?;
    Ok(count)
}

/// 获取文件数据（读取物理文件并返回 base64 编码，用于文件预览）
#[command]
fn get_file_data(
    file_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let files = read_all_files(&app, &user_id)?;

    let file = files
        .iter()
        .find(|f| f.id == file_id)
        .ok_or_else(|| format!("文件 {} 不存在", file_id))?;

    // 读取物理文件
    let file_path = file
        .file_path
        .as_ref()
        .ok_or_else(|| "文件没有物理存储路径".to_string())?;

    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err(format!("物理文件不存在: {}", file_path));
    }

    let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 编码为 base64（标准字母表）
    use std::io::Write;
    let mut base64_output = String::new();
    {
        let mut encoder = base64_encode_writer(&mut base64_output);
        encoder.write_all(&data).map_err(|e| e.to_string())?;
    }

    Ok(base64_output)
}

/// 使用系统默认程序打开文件
#[command]
fn open_file_externally(file_path: String) -> Result<(), String> {
    // 使用 open crate 打开文件（需要 Cargo.toml 添加 open = "5" 依赖）
    // 如果 open crate 不可用，尝试使用平台原生命令
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }

    Ok(())
}

// ─── 辅助函数 ────────────────────────────────────────────────────

/// 获取用户数据目录
fn get_user_dir(app: &tauri::AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let user_dir = base.join("users").join(user_id);
    fs::create_dir_all(&user_dir).map_err(|e| e.to_string())?;
    Ok(user_dir)
}

/// 获取用户文件存储目录
fn get_user_files_dir(app: &tauri::AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let user_dir = get_user_dir(app, user_id)?;
    Ok(user_dir.join("files"))
}

/// 获取用户文件数据库路径
fn get_files_db_path(app: &tauri::AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let user_dir = get_user_dir(app, user_id)?;
    Ok(user_dir.join("files.json"))
}

/// 获取用户版本数据库路径
fn get_versions_db_path(app: &tauri::AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let user_dir = get_user_dir(app, user_id)?;
    Ok(user_dir.join("versions.json"))
}

/// 获取用户文件夹数据库路径
fn get_folders_db_path(app: &tauri::AppHandle, user_id: &str) -> Result<PathBuf, String> {
    let user_dir = get_user_dir(app, user_id)?;
    Ok(user_dir.join("folders.json"))
}

/// 读取所有文件记录
fn read_all_files(app: &tauri::AppHandle, user_id: &str) -> Result<Vec<KBFile>, String> {
    let db_path = get_files_db_path(app, user_id)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 写入所有文件记录
fn write_all_files(
    app: &tauri::AppHandle,
    user_id: &str,
    files: &[KBFile],
) -> Result<(), String> {
    let db_path = get_files_db_path(app, user_id)?;
    let content =
        serde_json::to_string_pretty(files).map_err(|e| format!("JSON 序列化失败: {}", e))?;
    fs::write(db_path, content).map_err(|e| e.to_string())
}

/// 追加单个文件到数据库
fn append_file_to_db(
    app: &tauri::AppHandle,
    user_id: &str,
    file: &KBFile,
) -> Result<(), String> {
    let mut files = read_all_files(app, user_id)?;
    files.push(file.clone());
    write_all_files(app, user_id, &files)
}

/// 读取所有版本记录
fn read_all_versions(app: &tauri::AppHandle, user_id: &str) -> Result<Vec<KBFileVersion>, String> {
    let db_path = get_versions_db_path(app, user_id)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 写入所有版本记录
fn write_all_versions(
    app: &tauri::AppHandle,
    user_id: &str,
    versions: &[KBFileVersion],
) -> Result<(), String> {
    let db_path = get_versions_db_path(app, user_id)?;
    let content =
        serde_json::to_string_pretty(versions).map_err(|e| format!("JSON 序列化失败: {}", e))?;
    fs::write(db_path, content).map_err(|e| e.to_string())
}

/// 读取所有文件夹记录
fn read_all_folders(app: &tauri::AppHandle, user_id: &str) -> Result<Vec<KBFolder>, String> {
    let db_path = get_folders_db_path(app, user_id)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("JSON 解析失败: {}", e))
}

/// 写入所有文件夹记录
fn write_all_folders(
    app: &tauri::AppHandle,
    user_id: &str,
    folders: &[KBFolder],
) -> Result<(), String> {
    let db_path = get_folders_db_path(app, user_id)?;
    let content =
        serde_json::to_string_pretty(folders).map_err(|e| format!("JSON 序列化失败: {}", e))?;
    fs::write(db_path, content).map_err(|e| e.to_string())
}

/// 简单的 UUID v4 生成器（不依赖外部 crate）
/// 生成格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
fn generate_uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    // 使用时间戳 + 简单混合生成伪随机
    let mut seed = nanos as u64;
    // 简单的线性同余生成器
    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);

    let a = ((seed >> 32) ^ seed) & 0xFFFFFFFF;
    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    let b = ((seed >> 32) ^ seed) & 0xFFFFFFFF;
    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    let c = ((seed >> 32) ^ seed) & 0xFFFFFFFF;
    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
    let d = ((seed >> 32) ^ seed) & 0xFFFFFFFF;

    // 设置 UUID v4 版本位（第 3 段首位为 4）
    let c = (c & 0x0FFF) | 0x4000;
    // 设置变体位（第 4 段首位为 10xx）
    let d = (d & 0x3FFF) | 0x8000;

    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        a & 0xFFFFFFFF,
        (b >> 16) & 0xFFFF,
        c,
        d,
        b & 0xFFFF
    )
}

/// 获取当前时间的 ISO 8601 格式字符串（不依赖 chrono crate）
fn now_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    let total_secs = duration.as_secs();
    let nanos = duration.subsec_nanos();

    // 计算 UTC 时间各字段
    let days = total_secs / 86400;
    let time_of_day = total_secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // 从 Unix 纪元的天数计算年月日（简化的算法）
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, minutes, seconds, nanos / 1_000_000
    )
}

/// 将 Unix 纪元天数转换为年月日
fn days_to_ymd(days_since_epoch: u64) -> (u64, u64, u64) {
    // 1970-01-01 起算
    let mut days = days_since_epoch;
    let mut year = 1970u64;

    // 每年天数（不考虑闰年的近似值，用于快速迭代）
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    let mut month = 1u64;
    let days_in_months: [u64; 12] = [
        31,
        if is_leap_year(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    for &dim in &days_in_months {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }

    (year, month, days + 1)
}

/// 判断是否为闰年
fn is_leap_year(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Base64 解码（标准字母表，不依赖外部 crate）
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let input: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();

    if input.is_empty() {
        return Ok(vec![]);
    }

    // 移除 padding
    let input_trimmed: Vec<u8> = input
        .iter()
        .copied()
        .take_while(|b| *b != b'=')
        .collect();

    let lookup = |c: u8| -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(format!("无效的 Base64 字符: {}", c as char)),
        }
    };

    let mut result = Vec::with_capacity(input_trimmed.len() * 3 / 4);
    let chunks = input_trimmed.chunks(4);

    for chunk in chunks {
        let a = lookup(chunk[0])?;
        let b = if chunk.len() > 1 {
            lookup(chunk[1])?
        } else {
            0
        };

        result.push((a << 2) | (b >> 4));

        if chunk.len() > 2 {
            let c = lookup(chunk[2])?;
            result.push(((b & 0x0F) << 4) | (c >> 2));

            if chunk.len() > 3 {
                let d = lookup(chunk[3])?;
                result.push(((c & 0x03) << 6) | d);
            }
        }
    }

    Ok(result)
}

/// 简单的 Base64 编码器（用于将文件数据编码为 base64 字符串）
struct Base64EncodeWriter<'a> {
    output: &'a mut String,
    buffer: [u8; 3],
    position: usize,
}

fn base64_encode_writer(output: &mut String) -> Base64EncodeWriter<'_> {
    Base64EncodeWriter {
        output,
        buffer: [0; 3],
        position: 0,
    }
}

impl<'a> std::io::Write for Base64EncodeWriter<'a> {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        const CHARS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        for &byte in data {
            self.buffer[self.position] = byte;
            self.position += 1;

            if self.position == 3 {
                let b0 = self.buffer[0] as usize;
                let b1 = self.buffer[1] as usize;
                let b2 = self.buffer[2] as usize;

                self.output.push(CHARS[(b0 >> 2) as usize] as char);
                self.output.push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
                self.output.push(CHARS[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
                self.output.push(CHARS[(b2 & 0x3F) as usize] as char);

                self.position = 0;
            }
        }

        Ok(data.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        const CHARS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        if self.position > 0 {
            let b0 = self.buffer[0] as usize;
            let b1 = if self.position > 1 {
                self.buffer[1] as usize
            } else {
                0
            };

            self.output.push(CHARS[(b0 >> 2) as usize] as char);
            self.output
                .push(CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

            if self.position == 2 {
                self.output
                    .push(CHARS[((b1 & 0x0F) << 2) as usize] as char);
            } else {
                self.output.push('=');
            }

            self.output.push('=');
        }

        Ok(())
    }
}
