// SQLite 数据库模块
// 提供文件、版本、文件夹的持久化存储，替代原有的 JSON 文件存储
// 性能提升 10x+，支持复杂查询和事务
// 多租户支持：所有业务表携带 tenant_id，查询自动按租户隔离

use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use tauri::Manager;
use crate::{KBFile, KBFileVersion, KBFolder};

/// 数据库错误类型
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("数据库错误: {0}")]
    Rusqlite(#[from] rusqlite::Error),
    #[error("IO错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("Tauri错误: {0}")]
    Tauri(#[from] tauri::Error),
}

pub type DbResult<T> = Result<T, DbError>;

/// 获取数据库文件路径
pub fn get_db_path(app: &tauri::AppHandle, user_id: &str) -> DbResult<PathBuf> {
    let base = app.path().app_data_dir()?;
    let user_dir = base.join("users").join(user_id);
    std::fs::create_dir_all(&user_dir)?;
    Ok(user_dir.join("knowledge.db"))
}

/// 打开数据库连接并初始化表结构
/// 如果数据库是新创建的，会自动从旧的 JSON 文件迁移数据
pub fn open_db(app: &tauri::AppHandle, user_id: &str) -> DbResult<Connection> {
    let db_path = get_db_path(app, user_id)?;
    let is_new_db = !db_path.exists();
    let conn = Connection::open(db_path)?;

    // 启用 WAL 模式，提升并发性能
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // 启用外键约束
    conn.pragma_update(None, "foreign_keys", "ON")?;

    // 初始化表结构
    init_tables(&conn)?;

    // 如果是新数据库，尝试从旧的 JSON 文件迁移数据
    if is_new_db {
        if let Err(e) = migrate_from_json(app, user_id, &conn) {
            eprintln!("数据迁移失败: {}", e);
            // 迁移失败不影响使用，只是旧数据没了
        }
    }
    Ok(conn)
}

/// 从旧的 JSON 文件迁移数据到 SQLite
fn migrate_from_json(app: &tauri::AppHandle, user_id: &str, conn: &Connection) -> DbResult<()> {
    let base = app.path().app_data_dir()?;
    let user_dir = base.join("users").join(user_id);

    // 检查旧的 JSON 文件是否存在
    let files_json = user_dir.join("files.json");
    let versions_json = user_dir.join("versions.json");
    let folders_json = user_dir.join("folders.json");

    if !files_json.exists() && !versions_json.exists() && !folders_json.exists() {
        // 没有旧数据，不需要迁移
        return Ok(());
    }

    println!("检测到旧版 JSON 数据，开始迁移...");

    // 使用事务，确保迁移的原子性
    let tx = conn.unchecked_transaction()?;

    // 迁移文件夹
    if folders_json.exists() {
        let content = std::fs::read_to_string(&folders_json)?;
        let folders: Vec<crate::KBFolder> =
            serde_json::from_str(&content).map_err(|e| DbError::Rusqlite(
                rusqlite::Error::InvalidParameterName(format!("JSON解析失败: {}", e)),
            ))?;
        for folder in &folders {
            insert_folder(&tx, folder)?;
        }
        println!("迁移了 {} 个文件夹", folders.len());
    }

    // 迁移文件
    if files_json.exists() {
        let content = std::fs::read_to_string(&files_json)?;
        let files: Vec<crate::KBFile> =
            serde_json::from_str(&content).map_err(|e| DbError::Rusqlite(
                rusqlite::Error::InvalidParameterName(format!("JSON解析失败: {}", e)),
            ))?;
        for file in &files {
            insert_file(&tx, file)?;
        }
        println!("迁移了 {} 个文件", files.len());
    }

    // 迁移版本
    if versions_json.exists() {
        let content = std::fs::read_to_string(&versions_json)?;
        let versions: Vec<crate::KBFileVersion> =
            serde_json::from_str(&content).map_err(|e| DbError::Rusqlite(
                rusqlite::Error::InvalidParameterName(format!("JSON解析失败: {}", e)),
            ))?;
        for version in &versions {
            create_version(&tx, version)?;
        }
        println!("迁移了 {} 个版本", versions.len());
    }

    // 提交事务
    tx.commit()?;

    // 备份旧的 JSON 文件（添加 .bak 后缀）
    let _ = std::fs::rename(&files_json, files_json.with_extension("json.bak"));
    let _ = std::fs::rename(&versions_json, versions_json.with_extension("json.bak"));
    let _ = std::fs::rename(&folders_json, folders_json.with_extension("json.bak"));

    println!("数据迁移完成，旧文件已备份为 .bak");
    Ok(())
}

/// 初始化数据库表结构
fn init_tables(conn: &Connection) -> DbResult<()> {
    // 文件表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT '',
            user_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_path TEXT,
            text_content TEXT,
            thumbnail_url TEXT,
            preview_url TEXT,
            storage_mode TEXT NOT NULL DEFAULT 'local',
            folder_id TEXT,
            tags TEXT NOT NULL DEFAULT '[]',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            file_hash TEXT,
            summary TEXT,
            key_points TEXT
        )",
        [],
    )?;

    // 文件表索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_tenant_id ON files(tenant_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_user_deleted ON files(user_id, is_deleted)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_tenant_deleted ON files(tenant_id, is_deleted)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_user_favorite ON files(user_id, is_favorite)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type)",
        [],
    )?;

    // 文件版本表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS file_versions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT '',
            file_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_path TEXT,
            text_content TEXT,
            thumbnail_url TEXT,
            version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 版本表索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_versions_file_id ON file_versions(file_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_versions_tenant_id ON file_versions(tenant_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_versions_file_version ON file_versions(file_id, version)",
        [],
    )?;

    // 文件夹表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            parent_id TEXT,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
        )",
        [],
    )?;

    // 文件夹表索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_tenant_id ON folders(tenant_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)",
        [],
    )?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_user_name_parent ON folders(user_id, name, parent_id)",
        [],
    )?;

    Ok(())
}

// ─── 文件操作 ────────────────────────────────────────────────────

/// 获取所有文件（过滤已删除的）
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_all_files(conn: &Connection, tenant_id: &str) -> DbResult<Vec<KBFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                thumbnail_url, preview_url, storage_mode, folder_id, tags,
                is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
         FROM files WHERE is_deleted = 0 AND (tenant_id = ?1 OR ?1 = '') ORDER BY created_at DESC",
    )?;
    let files = stmt
        .query_map(params![tenant_id], |row| row_to_file(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

/// 根据 ID 获取单个文件
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_file_by_id(conn: &Connection, file_id: &str, tenant_id: &str) -> DbResult<Option<KBFile>> {
    let file = conn
        .query_row(
            "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                    thumbnail_url, preview_url, storage_mode, folder_id, tags,
                    is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
             FROM files WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
            params![file_id, tenant_id],
            |row| row_to_file(row),
        )
        .optional()?;
    Ok(file)
}

/// 搜索文件（按文件名、文本内容、标签）
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn search_files(conn: &Connection, query: &str, tenant_id: &str) -> DbResult<Vec<KBFile>> {
    let query_lower = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                thumbnail_url, preview_url, storage_mode, folder_id, tags,
                is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
         FROM files
         WHERE is_deleted = 0
           AND (tenant_id = ?1 OR ?1 = '')
           AND (LOWER(file_name) LIKE ?2
                OR LOWER(COALESCE(text_content, '')) LIKE ?2
                OR LOWER(tags) LIKE ?2)
         ORDER BY created_at DESC",
    )?;
    let files = stmt
        .query_map(params![tenant_id, query_lower], |row| row_to_file(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

/// 获取收藏的文件
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_favorite_files(conn: &Connection, tenant_id: &str) -> DbResult<Vec<KBFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                thumbnail_url, preview_url, storage_mode, folder_id, tags,
                is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
         FROM files WHERE is_deleted = 0 AND is_favorite = 1 AND (tenant_id = ?1 OR ?1 = '')
         ORDER BY created_at DESC",
    )?;
    let files = stmt
        .query_map(params![tenant_id], |row| row_to_file(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

/// 获取文件夹下的文件
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_files_by_folder(conn: &Connection, folder_id: &str, tenant_id: &str) -> DbResult<Vec<KBFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                thumbnail_url, preview_url, storage_mode, folder_id, tags,
                is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
         FROM files WHERE is_deleted = 0 AND folder_id = ?1 AND (tenant_id = ?2 OR ?2 = '')
         ORDER BY created_at DESC",
    )?;
    let files = stmt
        .query_map(params![folder_id, tenant_id], |row| row_to_file(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

/// 插入新文件
pub fn insert_file(conn: &Connection, file: &KBFile) -> DbResult<()> {
    let tags_json = serde_json::to_string(&file.tags).unwrap_or_else(|_| "[]".to_string());
    let key_points_json = file
        .key_points
        .as_ref()
        .and_then(|kp| serde_json::to_string(kp).ok())
        .unwrap_or_default();
    conn.execute(
        "INSERT INTO files (
            id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
            thumbnail_url, preview_url, storage_mode, folder_id, tags,
            is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        params![
            file.id,
            file.tenant_id,
            file.user_id,
            file.file_name,
            file.file_type,
            file.file_size,
            file.file_path,
            file.text_content,
            file.thumbnail_url,
            file.preview_url,
            file.storage_mode,
            file.folder_id,
            tags_json,
            file.is_favorite,
            file.is_deleted.unwrap_or(false),
            file.deleted_at,
            file.created_at,
            file.created_at, // updated_at 初始值和 created_at 相同
            file.file_hash,
            file.summary,
            key_points_json,
        ],
    )?;
    Ok(())
}

/// 更新文件元数据
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn update_file(conn: &Connection, file_id: &str, updates: &FileUpdates, tenant_id: &str) -> DbResult<bool> {
    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(name) = &updates.file_name {
        sets.push("file_name = ?");
        params.push(Box::new(name.clone()));
    }
    if let Some(tags) = &updates.tags {
        sets.push("tags = ?");
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        params.push(Box::new(tags_json));
    }
    if let Some(fav) = updates.is_favorite {
        sets.push("is_favorite = ?");
        params.push(Box::new(fav));
    }
    if let Some(folder_id) = &updates.folder_id {
        sets.push("folder_id = ?");
        params.push(Box::new(folder_id.clone()));
    }
    if let Some(summary) = &updates.summary {
        sets.push("summary = ?");
        params.push(Box::new(summary.clone()));
    }
    if let Some(key_points) = &updates.key_points {
        sets.push("key_points = ?");
        let kp_json = serde_json::to_string(key_points).unwrap_or_default();
        params.push(Box::new(kp_json));
    }
    if let Some(deleted) = updates.is_deleted {
        sets.push("is_deleted = ?");
        params.push(Box::new(deleted));
        if deleted {
            sets.push("deleted_at = ?");
            let now = crate::now_iso8601();
            params.push(Box::new(now));
        } else {
            sets.push("deleted_at = NULL");
        }
    }

    if sets.is_empty() {
        return Ok(false);
    }

    // 添加 updated_at
    sets.push("updated_at = ?");
    let now = crate::now_iso8601();
    params.push(Box::new(now));

    // 添加 WHERE 参数
    params.push(Box::new(file_id.to_string()));
    params.push(Box::new(tenant_id.to_string()));

    let sql = format!("UPDATE files SET {} WHERE id = ? AND (tenant_id = ? OR ? = '')", sets.join(", "));
    let rows = conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|b| b.as_ref())))?;
    Ok(rows > 0)
}

/// 文件更新字段
pub struct FileUpdates {
    pub file_name: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
    pub folder_id: Option<String>,
    pub summary: Option<String>,
    pub key_points: Option<Vec<String>>,
    pub is_deleted: Option<bool>,
}

impl Default for FileUpdates {
    fn default() -> Self {
        FileUpdates {
            file_name: None,
            tags: None,
            is_favorite: None,
            folder_id: None,
            summary: None,
            key_points: None,
            is_deleted: None,
        }
    }
}

/// 永久删除文件
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn permanent_delete_file(conn: &Connection, file_id: &str, tenant_id: &str) -> DbResult<bool> {
    let rows = conn.execute(
        "DELETE FROM files WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
        params![file_id, tenant_id],
    )?;
    Ok(rows > 0)
}

/// 清空回收站（删除所有 is_deleted = 1 的文件）
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn empty_recycle_bin(conn: &Connection, tenant_id: &str) -> DbResult<usize> {
    let rows = conn.execute(
        "DELETE FROM files WHERE is_deleted = 1 AND (tenant_id = ?1 OR ?1 = '')",
        params![tenant_id],
    )?;
    Ok(rows)
}

/// 获取已删除的文件（回收站）
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_deleted_files(conn: &Connection, tenant_id: &str) -> DbResult<Vec<KBFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, user_id, file_name, file_type, file_size, file_path, text_content,
                thumbnail_url, preview_url, storage_mode, folder_id, tags,
                is_favorite, is_deleted, deleted_at, created_at, updated_at, file_hash, summary, key_points
         FROM files WHERE is_deleted = 1 AND (tenant_id = ?1 OR ?1 = '')
         ORDER BY deleted_at DESC",
    )?;
    let files = stmt
        .query_map(params![tenant_id], |row| row_to_file(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

// ─── 版本操作 ────────────────────────────────────────────────────

/// 获取文件的所有版本（按版本号降序）
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_file_versions(conn: &Connection, file_id: &str, tenant_id: &str) -> DbResult<Vec<KBFileVersion>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, file_id, file_name, file_size, file_path, text_content, thumbnail_url, version, created_at
         FROM file_versions WHERE file_id = ?1 AND (tenant_id = ?2 OR ?2 = '') ORDER BY version DESC",
    )?;
    let versions = stmt
        .query_map(params![file_id, tenant_id], |row| row_to_version(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(versions)
}

/// 获取文件的最新版本号
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_latest_version(conn: &Connection, file_id: &str, tenant_id: &str) -> DbResult<i32> {
    let max_version: Option<i32> = conn
        .query_row(
            "SELECT MAX(version) FROM file_versions WHERE file_id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
            params![file_id, tenant_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(max_version.unwrap_or(0))
}

/// 创建新版本
pub fn create_version(conn: &Connection, version: &KBFileVersion) -> DbResult<()> {
    conn.execute(
        "INSERT INTO file_versions (
            id, tenant_id, file_id, file_name, file_size, file_path, text_content, thumbnail_url, version, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            version.id,
            version.tenant_id,
            version.file_id,
            version.file_name,
            version.file_size,
            version.file_path,
            version.text_content,
            version.thumbnail_url,
            version.version,
            version.created_at,
        ],
    )?;
    Ok(())
}

/// 根据 ID 获取版本
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_version_by_id(conn: &Connection, version_id: &str, tenant_id: &str) -> DbResult<Option<KBFileVersion>> {
    let version = conn
        .query_row(
            "SELECT id, tenant_id, file_id, file_name, file_size, file_path, text_content, thumbnail_url, version, created_at
             FROM file_versions WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
            params![version_id, tenant_id],
            |row| row_to_version(row),
        )
        .optional()?;
    Ok(version)
}

/// 删除版本
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn delete_version(conn: &Connection, version_id: &str, tenant_id: &str) -> DbResult<bool> {
    let rows = conn.execute(
        "DELETE FROM file_versions WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
        params![version_id, tenant_id],
    )?;
    Ok(rows > 0)
}

// ─── 文件夹操作 ──────────────────────────────────────────────────

/// 获取所有文件夹
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_all_folders(conn: &Connection, tenant_id: &str) -> DbResult<Vec<KBFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, name, parent_id, user_id, created_at, updated_at FROM folders
         WHERE (tenant_id = ?1 OR ?1 = '') ORDER BY created_at ASC",
    )?;
    let folders = stmt
        .query_map(params![tenant_id], |row| row_to_folder(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(folders)
}

/// 插入新文件夹
pub fn insert_folder(conn: &Connection, folder: &KBFolder) -> DbResult<()> {
    conn.execute(
        "INSERT INTO folders (id, tenant_id, name, parent_id, user_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            folder.id,
            folder.tenant_id,
            folder.name,
            folder.parent_id,
            folder.user_id,
            folder.created_at,
        ],
    )?;
    Ok(())
}

/// 重命名文件夹
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn rename_folder(conn: &Connection, folder_id: &str, new_name: &str, tenant_id: &str) -> DbResult<bool> {
    let now = crate::now_iso8601();
    let rows = conn.execute(
        "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3 AND (tenant_id = ?4 OR ?4 = '')",
        params![new_name, now, folder_id, tenant_id],
    )?;
    Ok(rows > 0)
}

/// 删除文件夹
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn delete_folder(conn: &Connection, folder_id: &str, tenant_id: &str) -> DbResult<bool> {
    // 先将该文件夹下的文件移出
    conn.execute(
        "UPDATE files SET folder_id = NULL, updated_at = ?1 WHERE folder_id = ?2 AND (tenant_id = ?3 OR ?3 = '')",
        params![crate::now_iso8601(), folder_id, tenant_id],
    )?;
    let rows = conn.execute(
        "DELETE FROM folders WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
        params![folder_id, tenant_id],
    )?;
    Ok(rows > 0)
}

/// 根据 ID 获取文件夹
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_folder_by_id(conn: &Connection, folder_id: &str, tenant_id: &str) -> DbResult<Option<KBFolder>> {
    let folder = conn
        .query_row(
            "SELECT id, tenant_id, name, parent_id, user_id, created_at, updated_at
             FROM folders WHERE id = ?1 AND (tenant_id = ?2 OR ?2 = '')",
            params![folder_id, tenant_id],
            |row| row_to_folder(row),
        )
        .optional()?;
    Ok(folder)
}

/// 获取子文件夹
/// tenant_id 为空字符串时不限制租户（向后兼容）
pub fn get_child_folders(conn: &Connection, parent_id: &str, tenant_id: &str) -> DbResult<Vec<KBFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, tenant_id, name, parent_id, user_id, created_at, updated_at FROM folders
         WHERE parent_id = ?1 AND (tenant_id = ?2 OR ?2 = '') ORDER BY created_at ASC",
    )?;
    let folders = stmt
        .query_map(params![parent_id, tenant_id], |row| row_to_folder(row))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(folders)
}

// ─── 行转换辅助函数 ──────────────────────────────────────────────

fn row_to_file(row: &rusqlite::Row) -> rusqlite::Result<KBFile> {
    let tags_str: String = row.get("tags")?;
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    let key_points_str: Option<String> = row.get("key_points")?;
    let key_points = key_points_str.and_then(|s| serde_json::from_str(&s).ok());
    Ok(KBFile {
        id: row.get("id")?,
        tenant_id: row.get("tenant_id")?,
        user_id: row.get("user_id")?,
        file_name: row.get("file_name")?,
        file_type: row.get("file_type")?,
        file_size: row.get("file_size")?,
        file_path: row.get("file_path")?,
        text_content: row.get("text_content")?,
        thumbnail_url: row.get("thumbnail_url")?,
        preview_url: row.get("preview_url")?,
        storage_mode: row.get("storage_mode")?,
        folder_id: row.get("folder_id")?,
        tags,
        is_favorite: row.get("is_favorite")?,
        is_deleted: Some(row.get("is_deleted")?),
        deleted_at: row.get("deleted_at")?,
        created_at: row.get("created_at")?,
        file_hash: row.get("file_hash")?,
        summary: row.get("summary")?,
        key_points,
    })
}

fn row_to_version(row: &rusqlite::Row) -> rusqlite::Result<KBFileVersion> {
    Ok(KBFileVersion {
        id: row.get("id")?,
        tenant_id: row.get("tenant_id")?,
        file_id: row.get("file_id")?,
        file_name: row.get("file_name")?,
        file_size: row.get("file_size")?,
        file_path: row.get("file_path")?,
        text_content: row.get("text_content")?,
        thumbnail_url: row.get("thumbnail_url")?,
        version: row.get("version")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_folder(row: &rusqlite::Row) -> rusqlite::Result<KBFolder> {
    Ok(KBFolder {
        id: row.get("id")?,
        tenant_id: row.get("tenant_id")?,
        name: row.get("name")?,
        parent_id: row.get("parent_id")?,
        user_id: row.get("user_id")?,
        created_at: row.get("created_at")?,
    })
}
