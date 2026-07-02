// 全盘文件名搜索模块
// 三级降级策略：
//   1. Everything IPC（用户已安装 Everything，零管理员，毫秒级）
//   2. NTFS MFT + USN Journal（需要管理员权限，极速）
//   3. 目录遍历（无需管理员权限，较慢）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use once_cell::sync::Lazy;

/// 安全获取 Mutex 锁，忽略 poison（前一个持有者 panic 不应阻止后续使用）
fn lock_ignore_poison<T>(m: &Mutex<T>) -> std::sync::MutexGuard<T> {
    match m.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// 索引缓存文件路径
fn index_cache_path() -> std::path::PathBuf {
    let app_data = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    app_data.join("知识库").join("search_index.json")
}

/// 持久化索引数据（可序列化的子集）
#[derive(Serialize, Deserialize)]
struct IndexCache {
    entries: Vec<FileEntry>,
    mode: String,
    indexed_drives: Vec<String>,
    index_time_ms: u64,
    total_files: usize,
    total_dirs: usize,
}

/// 持久化索引数据（引用版本，避免 clone）
#[derive(Serialize)]
struct IndexCacheRef<'a> {
    entries: &'a [FileEntry],
    mode: String,
    indexed_drives: Vec<String>,
    index_time_ms: u64,
    total_files: usize,
    total_dirs: usize,
}

/// 保存索引到磁盘
fn save_index_cache(cache: &IndexCache) {
    if let Some(parent) = index_cache_path().parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = match serde_json::to_string(cache) {
        Ok(j) => j,
        Err(e) => { eprintln!("序列化索引失败: {}", e); return; }
    };
    // 先写临时文件再重命名，避免写入中断导致损坏
    let path = index_cache_path();
    let tmp_path = path.with_extension("tmp");
    if std::fs::write(&tmp_path, &json).is_ok() {
        let _ = std::fs::rename(&tmp_path, &path);
    }
}

/// 保存索引到磁盘（引用版本，避免 clone entries）
fn save_index_cache_ref(cache: &IndexCacheRef) {
    if let Some(parent) = index_cache_path().parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = match serde_json::to_string(cache) {
        Ok(j) => j,
        Err(e) => { eprintln!("序列化索引失败: {}", e); return; }
    };
    let path = index_cache_path();
    let tmp_path = path.with_extension("tmp");
    if std::fs::write(&tmp_path, &json).is_ok() {
        let _ = std::fs::rename(&tmp_path, &path);
    }
}

/// 从磁盘加载索引
fn load_index_cache() -> Option<IndexCache> {
    let path = index_cache_path();
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

// ─── 数据结构 ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub is_dir: bool,
    pub size: u64,
    pub created: Option<String>,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStatus {
    pub is_ready: bool,
    pub total_files: usize,
    pub total_dirs: usize,
    pub indexed_drives: Vec<String>,
    pub index_time_ms: u64,
    pub last_update: Option<String>,
    pub mode: String, // "everything_ipc" | "mft" | "walk"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileChangeType {
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone)]
pub struct FileChange {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub change_type: FileChangeType,
}

// ─── 索引模式 ──────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum SearchMode {
    EverythingIpc,  // 最优：Everything 服务（无管理员，极速）
    Mft,            // 降级：NTFS MFT（需管理员，极速）
    Walk,           // 兜底：目录遍历（无管理员，慢速）
}

static CURRENT_MODE: Lazy<Mutex<SearchMode>> = Lazy::new(|| Mutex::new(SearchMode::Walk));

/// 是否正在构建索引
static BUILDING_INDEX: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

// ─── 全局索引 ──────────────────────────────────────────────────

struct FileIndex {
    entries: Vec<FileEntry>,
    name_index: HashMap<String, Vec<usize>>,
    ext_index: HashMap<String, Vec<usize>>,
    status: IndexStatus,
}

impl Default for FileIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl FileIndex {
    fn new() -> Self {
        let mut index = FileIndex {
            entries: Vec::new(),
            name_index: HashMap::new(),
            ext_index: HashMap::new(),
            status: IndexStatus {
                is_ready: false,
                total_files: 0,
                total_dirs: 0,
                indexed_drives: Vec::new(),
                index_time_ms: 0,
                last_update: None,
                mode: "walk".to_string(),
            },
        };

        // 尝试从磁盘加载缓存
        if let Some(cache) = load_index_cache() {
            eprintln!("从缓存加载索引: {} 个文件", cache.entries.len());
            index.rebuild(cache.entries, cache.indexed_drives, cache.index_time_ms, &cache.mode);
        }

        index
    }

    fn rebuild(&mut self, new_entries: Vec<FileEntry>, drives: Vec<String>, elapsed_ms: u64, mode: &str) {
        // 直接 move entries，避免 clone 导致峰值内存翻倍
        self.entries = new_entries;
        self.name_index.clear();
        self.ext_index.clear();

        let mut file_count = 0usize;
        let mut dir_count = 0usize;

        for (i, entry) in self.entries.iter().enumerate() {
            let lower_name = entry.name.to_lowercase();
            self.name_index.entry(lower_name).or_default().push(i);

            if !entry.ext.is_empty() {
                let lower_ext = entry.ext.to_lowercase();
                self.ext_index.entry(lower_ext).or_default().push(i);
            }

            if entry.is_dir {
                dir_count += 1;
            } else {
                file_count += 1;
            }
        }

        self.status = IndexStatus {
            is_ready: true,
            total_files: file_count,
            total_dirs: dir_count,
            indexed_drives: drives.clone(),
            index_time_ms: elapsed_ms,
            last_update: Some(chrono_now()),
            mode: mode.to_string(),
        };

        // 保存索引到磁盘（直接引用 self.entries，不 clone）
        let cache = IndexCacheRef {
            entries: &self.entries,
            mode: mode.to_string(),
            indexed_drives: drives,
            index_time_ms: elapsed_ms,
            total_files: file_count,
            total_dirs: dir_count,
        };
        save_index_cache_ref(&cache);
    }

    fn search(
        &self,
        query: &str,
        ext_filter: Option<&str>,
        category: Option<&str>,
        max_results: usize,
    ) -> Vec<FileEntry> {
        if !self.status.is_ready || query.is_empty() {
            return Vec::new();
        }

        let lower_query = query.to_lowercase();
        let mut results: Vec<FileEntry> = Vec::new();

        // 解析扩展名筛选（支持逗号分隔的多个扩展名）
        let ext_set: Option<std::collections::HashSet<String>> = ext_filter.map(|exts| {
            exts.to_lowercase()
                .split(',')
                .map(|e| e.trim().trim_start_matches('.').to_string())
                .filter(|e| !e.is_empty())
                .collect()
        });

        // 是否只筛选文件夹
        let folders_only = category == Some("folder");

        if let Some(ref exts) = ext_set {
            // 使用扩展名索引加速
            for ext in exts {
                if let Some(indices) = self.ext_index.get(ext) {
                    for &i in indices {
                        let entry = &self.entries[i];
                        if folders_only && !entry.is_dir {
                            continue;
                        }
                        if matches_query(&lower_query, entry) {
                            results.push(entry.clone());
                            if results.len() >= max_results {
                                return results;
                            }
                        }
                    }
                }
            }
            if !folders_only {
                return results;
            }
        }

        // 无扩展名筛选或文件夹筛选：全量搜索
        // 只匹配文件名，不匹配路径
        use std::sync::mpsc;
        let (tx, rx) = mpsc::channel::<FileEntry>();
        let num_threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .min(8);
        let chunk_size = (self.entries.len() + num_threads - 1) / num_threads;
        let entries = &self.entries;

        std::thread::scope(|s| {
            let mut handles = Vec::new();
            for chunk in entries.chunks(chunk_size) {
                let tx = tx.clone();
                let lower_query = lower_query.clone();
                let ext_set = ext_set.clone();
                let folders_only = folders_only;
                let handle = s.spawn(move || {
                    for entry in chunk {
                        if folders_only && !entry.is_dir {
                            continue;
                        }
                        if let Some(ref exts) = ext_set {
                            if !entry.ext.is_empty() && !exts.contains(&entry.ext.to_lowercase()) {
                                continue;
                            }
                        }
                        if matches_query(&lower_query, entry) {
                            if tx.send(entry.clone()).is_err() {
                                break;
                            }
                        }
                    }
                });
                handles.push(handle);
            }
            drop(tx);

            for entry in rx.iter() {
                results.push(entry);
                if results.len() >= max_results * 2 {
                    break;
                }
            }

            for handle in handles {
                let _ = handle.join();
            }
        });

        // 按相关度排序：文件名以关键词开头的排前面，文件名包含关键词的次之，文件排文件夹前面
        let query_words: Vec<&str> = lower_query.split_whitespace().collect();
        results.sort_by(|a, b| {
            let score_a = relevance_score(&a.name.to_lowercase(), &a.path.to_lowercase(), &query_words, a);
            let score_b = relevance_score(&b.name.to_lowercase(), &b.path.to_lowercase(), &query_words, b);
            score_b.cmp(&score_a)
        });

        results.truncate(max_results);
        results
    }
}

fn matches_query(lower_query: &str, entry: &FileEntry) -> bool {
    // 默认只匹配文件名，不匹配路径
    // 避免搜索"知识库"时把 D:\知识库\ 下的所有文件都显示出来
    name_matches_query(lower_query, entry)
}

/// 仅检查文件名是否匹配（不含路径）
fn name_matches_query(lower_query: &str, entry: &FileEntry) -> bool {
    let lower_name = entry.name.to_lowercase();

    for keyword in lower_query.split_whitespace() {
        if !lower_name.contains(keyword) {
            return false;
        }
    }
    true
}

/// 计算搜索相关度分数（分数越高越相关）
/// 仅基于文件名匹配 + 文件类型优先级
fn relevance_score(lower_name: &str, _lower_path: &str, query_words: &[&str], entry: &FileEntry) -> u32 {
    let mut score = 0u32;

    // 文件名匹配
    for word in query_words {
        if lower_name == *word {
            score += 1000; // 文件名完全匹配
        } else if lower_name.starts_with(word) {
            score += 500; // 文件名以关键词开头
        } else if lower_name.contains(word) {
            score += 100; // 文件名包含关键词
        }
    }

    // 文件类型优先级：重要文档 > 其他文件 > 文件夹
    if entry.is_dir {
        score += 1; // 文件夹最低优先级
    } else {
        let ext_lower = entry.ext.to_lowercase();
        match ext_lower.as_str() {
            "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "pdf" => score += 50,
            "txt" | "md" | "rtf" | "csv" => score += 40,
            "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" => score += 30,
            "mp4" | "avi" | "mkv" | "mp3" | "wav" => score += 20,
            "zip" | "rar" | "7z" | "tar" | "gz" => score += 10,
            _ => score += 5,
        }
    }

    score
}

pub fn chrono_now() -> String {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_millis())
}

static FILE_INDEX: Lazy<Mutex<FileIndex>> = Lazy::new(|| Mutex::new(FileIndex::new()));
static USN_CURSOR: Lazy<Mutex<HashMap<String, i64>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static WATCHER_RUNNING: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

// ─── Everything IPC 实现 ───────────────────────────────────────

#[cfg(target_os = "windows")]
pub mod ev_ipc {
    use super::*;

    /// 检测 Everything 是否正在运行
    pub fn is_everything_running() -> bool {
        // 尝试通过 IpcWindow 连接 Everything 1.4+
        ::everything_ipc::IpcWindow::new().is_some()
    }

    /// 通过 Everything IPC 搜索文件
    pub fn search(query: &str, max_results: usize) -> Result<Vec<FileEntry>, String> {
        let client = ::everything_ipc::wm::EverythingClient::new()
            .map_err(|e| format!("连接 Everything 失败: {:?}", e))?;

        let list = client
            .query_wait(query)
            .request_flags(
                ::everything_ipc::wm::RequestFlags::FileName
                    | ::everything_ipc::wm::RequestFlags::Path
                    | ::everything_ipc::wm::RequestFlags::Size,
            )
            .max_results(max_results as u32)
            .call()
            .map_err(|e| format!("Everything 搜索失败: {:?}", e))?;

        let mut results = Vec::new();
        for item in list.iter() {
            let name = item.get_string(::everything_ipc::wm::RequestFlags::FileName)
                .unwrap_or_default();
            let path = item.get_str(::everything_ipc::wm::RequestFlags::Path)
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            let size = item.get_size(::everything_ipc::wm::RequestFlags::Size)
                .unwrap_or(0);

            let full_path = if path.is_empty() {
                name.clone()
            } else {
                format!("{}\\{}", path, name)
            };

            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();

            // 通过扩展名判断是否为目录（无扩展名且路径存在且为目录）
            let is_dir = ext.is_empty() && std::path::Path::new(&full_path).is_dir();

            results.push(FileEntry {
                path: full_path,
                name,
                ext,
                is_dir,
                size,
                created: None,
                modified: None,
            });
        }

        Ok(results)
    }
}

#[cfg(not(target_os = "windows"))]
pub mod ev_ipc {
    use super::*;
    pub fn is_everything_running() -> bool { false }
    pub fn search(_query: &str, _max_results: usize) -> Result<Vec<FileEntry>, String> {
        Err("Everything IPC 仅支持 Windows".to_string())
    }
}

// ─── Windows NTFS 实现 ─────────────────────────────────────────

#[cfg(target_os = "windows")]
pub mod ntfs {
    use super::*;

    /// 使用 usn-journal-rs 的 MFT 枚举（比 ntfs-reader 更快更稳定）
    fn read_mft_entries_usn(drive_char: char) -> Result<Vec<FileEntry>, String> {
        let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive_char)
            .map_err(|e| format!("打开卷 {} 失败: {}", drive_char, e))?;
        let mft = volume.mft();

        // 第一遍：收集所有 fid → (name, parent_fid, is_dir) 映射
        let mut fid_map: std::collections::HashMap<u64, (String, u64, bool)> = std::collections::HashMap::new();
        let mut raw_entries: Vec<(u64, String, u64, bool)> = Vec::new(); // (fid, name, parent_fid, is_dir)

        for result in mft.iter() {
            match result {
                Ok(entry) => {
                    let name = entry.file_name.to_string_lossy().to_string();
                    let is_dir = entry.is_dir();
                    fid_map.insert(entry.fid, (name.clone(), entry.parent_fid, is_dir));
                    raw_entries.push((entry.fid, name, entry.parent_fid, is_dir));
                }
                Err(_) => continue,
            }
        }

        eprintln!("[search] MFT 第一遍扫描完成，共 {} 条记录", fid_map.len());

        // 第二遍：解析路径并构建 FileEntry
        let mut entries = Vec::new();
        let mut path_cache: std::collections::HashMap<u64, String> = std::collections::HashMap::new();

        for (_fid, name, parent_fid, is_dir) in raw_entries {
            if name.is_empty() || name.starts_with('$') {
                continue;
            }

            // 解析父目录路径
            let parent_path = resolve_path_from_cache(parent_fid, &fid_map, &mut path_cache);
            let full_path = if parent_path.is_empty() {
                format!("{}:\\{}", drive_char, name)
            } else {
                format!("{}:\\{}\\{}", drive_char, parent_path, name)
            };

            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();

            entries.push(FileEntry {
                path: full_path,
                name,
                ext,
                is_dir,
                size: 0,
                created: None,
                modified: None,
            });
        }

        Ok(entries)
    }

    /// 从缓存中解析路径（递归向上查找父目录）
    fn resolve_path_from_cache(
        fid: u64,
        fid_map: &std::collections::HashMap<u64, (String, u64, bool)>,
        cache: &mut std::collections::HashMap<u64, String>,
    ) -> String {
        // 检查缓存
        if let Some(path) = cache.get(&fid) {
            return path.clone();
        }

        // 根目录 (MFT entry 5)
        if fid == 5 {
            return String::new();
        }

        // 获取当前条目信息
        let (name, parent_fid, _is_dir) = match fid_map.get(&fid) {
            Some(info) => info.clone(),
            None => return String::new(),
        };

        // 递归解析父目录路径
        let parent_path = resolve_path_from_cache(parent_fid, fid_map, cache);

        let result = if parent_path.is_empty() {
            name
        } else {
            format!("{}\\{}", parent_path, name)
        };

        cache.insert(fid, result.clone());
        result
    }

    pub fn get_ntfs_drives() -> Vec<String> {
        let mut drives = Vec::new();
        for b in b'A'..=b'Z' {
            let drive = format!("{}:", b as char);
            let root = format!("{}\\", drive);
            if std::path::Path::new(&root).exists() {
                let fs_type = get_filesystem_type(&drive);
                if let Some(t) = &fs_type {
                    if t.to_uppercase().contains("NTFS") {
                        drives.push(drive);
                    }
                } else {
                    drives.push(drive);
                }
            }
        }
        drives
    }

    fn get_filesystem_type(drive: &str) -> Option<String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let root = format!("{}\\", drive);
        let wide: Vec<u16> = OsStr::new(&root).encode_wide().chain(std::iter::once(0)).collect();

        let mut fs_name = [0u16; 256];
        let mut fs_flags = 0u32;
        let mut max_component_len = 0u32;

        let result = unsafe {
            windows_sys::Win32::Storage::FileSystem::GetVolumeInformationW(
                wide.as_ptr(),
                std::ptr::null_mut(),
                0,
                std::ptr::null_mut(),
                &mut max_component_len,
                &mut fs_flags,
                fs_name.as_mut_ptr(),
                fs_name.len() as u32,
            )
        };

        if result != 0 {
            let len = fs_name.iter().position(|&c| c == 0).unwrap_or(0);
            Some(String::from_utf16_lossy(&fs_name[..len]))
        } else {
            None
        }
    }

    pub fn read_mft_entries(drive: &str) -> Result<Vec<FileEntry>, String> {
        // 优先使用 usn-journal-rs 的 MFT 枚举（更快更稳定）
        let drive_char = drive.chars().next().ok_or("无效盘符")?;

        // 用 catch_unwind 保护，避免 MFT 读取 panic 导致服务崩溃
        let usn_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            read_mft_entries_usn(drive_char)
        }));

        match usn_result {
            Ok(Ok(entries)) => {
                eprintln!("[search] usn-journal-rs MFT 读取成功: {} 条目", entries.len());
                return Ok(entries);
            }
            Ok(Err(e)) => {
                eprintln!("[search] usn-journal-rs MFT 读取失败: {}, 尝试 ntfs-reader...", e);
            }
            Err(panic_info) => {
                eprintln!("[search] usn-journal-rs MFT 读取 panic: {:?}", panic_info);
            }
        }

        // 降级到 ntfs-reader（同样用 catch_unwind 保护）
        let ntfs_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            read_mft_entries_ntfs_reader(drive)
        }));

        match ntfs_result {
            Ok(Ok(entries)) => {
                eprintln!("[search] ntfs-reader MFT 读取成功: {} 条目", entries.len());
                return Ok(entries);
            }
            Ok(Err(e)) => {
                eprintln!("[search] ntfs-reader MFT 读取失败: {}", e);
            }
            Err(panic_info) => {
                eprintln!("[search] ntfs-reader MFT 读取 panic: {:?}", panic_info);
            }
        }

        Err(format!("MFT 读取失败: {} (usn-journal-rs 和 ntfs-reader 均失败)", drive))
    }

    fn read_mft_entries_ntfs_reader(drive: &str) -> Result<Vec<FileEntry>, String> {
        let volume_path = format!("\\\\.\\{}", drive);
        let volume = ntfs_reader::volume::Volume::new(&volume_path)
            .map_err(|e| format!("打开卷 {} 失败: {}", drive, e))?;

        let mft = ntfs_reader::mft::Mft::new(volume)
            .map_err(|e| format!("读取 MFT 失败: {}", e))?;

        let mut entries = Vec::new();

        #[allow(deprecated)]
        mft.iterate_files(|file| {
            let info = ntfs_reader::file_info::FileInfo::new(&mft, file);

            let name = info.name.clone();
            if name.is_empty() || name.starts_with('$') {
                return;
            }

            let path_str = info.path.to_string_lossy().to_string();
            let full_path = if path_str.is_empty() {
                format!("{}\\{}", drive, name)
            } else {
                format!("{}\\{}", drive, path_str.trim_start_matches('\\'))
            };

            let ext = std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();

            entries.push(FileEntry {
                path: full_path,
                name,
                ext,
                is_dir: info.is_directory,
                size: info.size,
                created: info.created.map(|t| format_datetime(t)),
                modified: info.modified.map(|t| format_datetime(t)),
            });
        });

        Ok(entries)
    }

    fn format_datetime(dt: time::OffsetDateTime) -> String {
        let unix_ms = dt.unix_timestamp() * 1000 + dt.millisecond() as i64;
        format!("{}", unix_ms)
    }

    pub fn get_journal_next_usn(drive: &str) -> Result<i64, String> {
        let drive_char = drive.chars().next().ok_or("无效盘符")?;
        let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive_char)
            .map_err(|e| format!("打开卷 {} 失败: {}", drive, e))?;
        let journal = usn_journal_rs::journal::UsnJournal::new(&volume);
        let data = journal.query(false)
            .map_err(|e| format!("查询 USN Journal 失败: {}", e))?;
        Ok(data.next_usn)
    }

    pub fn read_usn_changes(drive: &str, start_usn: i64) -> Result<(Vec<FileChange>, i64), String> {
        let drive_char = drive.chars().next().ok_or("无效盘符")?;
        let volume = usn_journal_rs::volume::Volume::from_drive_letter(drive_char)
            .map_err(|e| format!("打开卷 {} 失败: {}", drive, e))?;

        let journal = usn_journal_rs::journal::UsnJournal::new(&volume);
        let options = usn_journal_rs::journal::EnumOptions {
            start_usn,
            reason_mask: usn_journal_rs::USN_REASON_MASK_ALL,
            only_on_close: true,
            timeout: 0,
            wait_for_more: false,
            buffer_size: 65536,
        };

        let mut iter = journal.iter_with_options(options)
            .map_err(|e| format!("读取 USN Journal 失败: {}", e))?;

        let mut changes = Vec::new();
        let mut max_usn = start_usn;

        let mut resolver = usn_journal_rs::path::PathResolver::new_with_cache(&volume);

        for entry_result in iter.by_ref().take(10000) {
            match entry_result {
                Ok(entry) => {
                    max_usn = max_usn.max(entry.usn);

                    let name = entry.file_name.to_string_lossy().to_string();
                    if name.is_empty() || name.starts_with('$') {
                        continue;
                    }

                    let full_path = resolver.resolve_path(&entry)
                        .map(|p| p.to_string_lossy().to_string());

                    let change_type = if entry.reason & 0x80 != 0 {
                        FileChangeType::Deleted
                    } else if entry.reason & 0x100 != 0 {
                        FileChangeType::Renamed
                    } else {
                        FileChangeType::Modified
                    };

                    changes.push(FileChange {
                        path: full_path.unwrap_or_else(|| format!("{}\\{}", drive, name)),
                        name,
                        is_dir: entry.is_dir(),
                        change_type,
                    });
                }
                Err(_) => continue,
            }
        }

        Ok((changes, max_usn))
    }
}

#[cfg(not(target_os = "windows"))]
pub mod ntfs {
    use super::*;
    pub fn get_ntfs_drives() -> Vec<String> { Vec::new() }
    pub fn read_mft_entries(_drive: &str) -> Result<Vec<FileEntry>, String> {
        Err("全盘搜索仅支持 Windows NTFS".to_string())
    }
    pub fn get_journal_next_usn(_drive: &str) -> Result<i64, String> {
        Err("全盘搜索仅支持 Windows NTFS".to_string())
    }
    pub fn read_usn_changes(_drive: &str, _start_usn: i64) -> Result<(Vec<FileChange>, i64), String> {
        Err("全盘搜索仅支持 Windows NTFS".to_string())
    }
}

// ─── 公共 API ──────────────────────────────────────────────────

/// 构建全盘索引（自动降级：Everything IPC → MFT → 目录遍历）
/// 使用低优先级线程，避免阻塞 UI
pub fn build_index() -> Result<IndexStatus, String> {
    // 设置构建中标志
    {
        let mut building = lock_ignore_poison(&BUILDING_INDEX);
        if *building {
            // 检查是否有其他线程真的在构建（通过检查索引状态）
            let index = lock_ignore_poison(&FILE_INDEX);
            if index.status.is_ready {
                // 索引已就绪但标志卡住，说明之前 panic，强制重置
                eprintln!("[search] 构建标志卡住（索引已就绪），强制重置");
                *building = false;
            } else {
                return Err("索引正在构建中，请稍候".to_string());
            }
        }
        *building = true;
    }

    // 降低当前线程优先级，避免阻塞 UI
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL};
        unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL); }
    }

    let result = build_index_inner();

    // 清除构建中标志
    {
        let mut building = lock_ignore_poison(&BUILDING_INDEX);
        *building = false;
    }

    result
}

fn build_index_inner() -> Result<IndexStatus, String> {
    let start = std::time::Instant::now();

    // 日志辅助函数：同时输出到 stderr 和日志文件
    let log_msg = |msg: &str| {
        eprintln!("[search] {}", msg);
        let log_path = std::env::current_exe()
            .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("search_service.log"))
            .unwrap_or_else(|_| std::path::PathBuf::from("search_service.log"));
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            let _ = writeln!(f, "[{}] [index] {}", chrono_now(), msg);
        }
    };

    // ── 优先级 1：Everything IPC（无需管理员，毫秒级）──
    if ev_ipc::is_everything_running() {
        log_msg("检测到 Everything 正在运行，使用 IPC 模式");
        {
            let mut mode = lock_ignore_poison(&CURRENT_MODE);
            *mode = SearchMode::EverythingIpc;
        }

        let elapsed_ms = start.elapsed().as_millis() as u64;
        {
            let mut index = lock_ignore_poison(&FILE_INDEX);
            index.rebuild(
                Vec::new(),
                vec!["Everything IPC".to_string()],
                elapsed_ms,
                "everything_ipc",
            );
        }
        return get_status();
    }

    // ── 优先级 2 & 3：MFT 或目录遍历 ──
    // 流式写入索引文件，避免全量 Vec 常驻内存
    let drives = ntfs::get_ntfs_drives();
    log_msg(&format!("检测到 NTFS 驱动器: {:?}", drives));

    // 确定扫描模式和路径
    let (mode_str, indexed_drives, entries) = if !drives.is_empty() {
        // 尝试 MFT 读取
        let mut all_entries = Vec::new();
        let mut indexed_drives = Vec::new();
        let mut mft_success = false;

        for drive in &drives {
            log_msg(&format!("尝试读取 {} MFT...", drive));
            match ntfs::read_mft_entries(drive) {
                Ok(entries) => {
                    let count = entries.len();
                    log_msg(&format!("{} MFT 读取成功: {} 条目", drive, count));
                    all_entries.extend(entries);
                    indexed_drives.push(format!("{} (MFT: {} 条目)", drive, count));
                    mft_success = true;
                }
                Err(e) => {
                    log_msg(&format!("读取 {} MFT 失败: {}", drive, e));
                    indexed_drives.push(format!("{} (MFT 失败)", drive));
                }
            }
        }

        if mft_success {
            log_msg(&format!("MFT 模式成功，索引 {} 条目", all_entries.len()));

            // 初始化 USN cursor
            {
                let mut usn_cursor = lock_ignore_poison(&USN_CURSOR);
                for drive in &drives {
                    if let Ok(next_usn) = ntfs::get_journal_next_usn(drive) {
                        usn_cursor.insert(drive.clone(), next_usn);
                    }
                }
            }

            ("mft", indexed_drives, all_entries)
        } else {
            // MFT 失败，降级为目录遍历
            log_msg("MFT 全部失败，降级为目录遍历模式");
            let mut all_entries = Vec::new();
            let mut walk_drives = Vec::new();

            for path in drives.iter().map(|d| format!("{}\\", d)) {
                match walk_directory(&path) {
                    Ok(entries) => {
                        let count = entries.len();
                        all_entries.extend(entries);
                        walk_drives.push(format!("{} (遍历: {} 条目)", path, count));
                    }
                    Err(e) => {
                        walk_drives.push(format!("{} (失败: {})", path, e));
                    }
                }
            }

            if all_entries.is_empty() {
                return Err("无法索引任何路径。请确保应用有文件系统访问权限。".to_string());
            }

            ("walk", walk_drives, all_entries)
        }
    } else {
        // 无 NTFS 驱动器，遍历用户目录
        log_msg("降级为目录遍历模式");
        let home = dirs_home();
        let mut all_entries = Vec::new();
        let mut walk_drives = Vec::new();

        match walk_directory(&home) {
            Ok(entries) => {
                let count = entries.len();
                all_entries.extend(entries);
                walk_drives.push(format!("{} (遍历: {} 条目)", home, count));
            }
            Err(e) => {
                walk_drives.push(format!("{} (失败: {})", home, e));
            }
        }

        if all_entries.is_empty() {
            return Err("无法索引任何路径。请确保应用有文件系统访问权限。".to_string());
        }

        ("walk", walk_drives, all_entries)
    };

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // 设置搜索模式
    {
        let mode_val = match mode_str {
            "mft" => SearchMode::Mft,
            _ => SearchMode::Walk,
        };
        let mut mode = lock_ignore_poison(&CURRENT_MODE);
        *mode = mode_val;
    }

    // 流式写入索引文件，然后立即释放 entries
    {
        let mut index = lock_ignore_poison(&FILE_INDEX);
        index.rebuild(entries, indexed_drives, elapsed_ms, mode_str);
    }

    // 如果是服务进程，构建完索引后立即释放内存
    // （主进程需要保留索引用于搜索，服务进程不需要）
    let is_service = std::env::args().any(|a| a == "--service");
    if is_service {
        log_msg("服务进程：索引已保存到文件，立即释放内存...");
        clear_index();
        log_msg("服务进程：内存已释放");
    }

    get_status()
}

fn dirs_home() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| "C:\\".to_string())
}

/// 搜索文件（自动根据模式选择搜索方式）
pub fn search_files(
    query: &str,
    ext_filter: Option<&str>,
    category: Option<&str>,
    max_results: usize,
) -> Result<Vec<FileEntry>, String> {
    let mode = lock_ignore_poison(&CURRENT_MODE);

    match *mode {
        SearchMode::EverythingIpc => {
            // Everything IPC 直接搜索，不需要自建索引
            ev_ipc::search(query, max_results)
        }
        SearchMode::Mft | SearchMode::Walk => {
            let index = lock_ignore_poison(&FILE_INDEX);
            if !index.status.is_ready {
                return Err("索引未就绪，请先构建索引".to_string());
            }
            Ok(index.search(query, ext_filter, category, max_results))
        }
    }
}

/// 在指定路径下搜索文件
pub fn search_files_in_path(
    query: &str,
    path_prefix: &str,
    category: Option<&str>,
    max_results: usize,
) -> Result<Vec<FileEntry>, String> {
    let mode = lock_ignore_poison(&CURRENT_MODE);

    match *mode {
        SearchMode::EverythingIpc => {
            // Everything IPC 支持路径过滤语法：path:prefix keyword
            let everything_query = format!("path:{} {}", path_prefix, query);
            ev_ipc::search(&everything_query, max_results)
        }
        SearchMode::Mft | SearchMode::Walk => {
            let index = lock_ignore_poison(&FILE_INDEX);
            if !index.status.is_ready {
                return Err("索引未就绪，请先构建索引".to_string());
            }

            let lower_query = query.to_lowercase();
            let lower_path = path_prefix.to_lowercase();
            let folders_only = category == Some("folder");
            let mut results: Vec<FileEntry> = Vec::new();

            for entry in &index.entries {
                if !entry.path.to_lowercase().starts_with(&lower_path) {
                    continue;
                }
                if folders_only && !entry.is_dir {
                    continue;
                }
                if matches_query(&lower_query, entry) {
                    results.push(entry.clone());
                }
            }

            // 按相关度排序
            let query_words: Vec<&str> = lower_query.split_whitespace().collect();
            results.sort_by(|a, b| {
                let score_a = relevance_score(&a.name.to_lowercase(), &a.path.to_lowercase(), &query_words, a);
                let score_b = relevance_score(&b.name.to_lowercase(), &b.path.to_lowercase(), &query_words, b);
                score_b.cmp(&score_a)
            });
            results.truncate(max_results);

            Ok(results)
        }
    }
}

/// 获取索引状态
/// 清空内存中的索引数据（服务构建完索引后调用，释放内存）
pub fn clear_index() {
    // 先释放索引数据
    {
        let mut index = lock_ignore_poison(&FILE_INDEX);
        index.entries = Vec::new();
        index.name_index = HashMap::new();
        index.ext_index = HashMap::new();
        index.status = IndexStatus {
            is_ready: false,
            total_files: 0,
            total_dirs: 0,
            indexed_drives: Vec::new(),
            index_time_ms: 0,
            last_update: None,
            mode: String::new(),
        };
    }

    // 强制将释放的内存归还给操作系统
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::Memory::{HeapCompact, GetProcessHeap};
        unsafe {
            let heap = GetProcessHeap();
            if !heap.is_null() {
                // 多次调用 HeapCompact，因为一次可能不够
                for _ in 0..3 {
                    HeapCompact(heap, 0);
                }
            }
        }
    }
}

/// 从索引文件加载索引到内存（服务运行时使用）
pub fn load_index_from_file() -> Result<IndexStatus, String> {
    let cache = load_index_cache().ok_or("索引文件不存在，请等待服务构建索引完成")?;
    let mut index = lock_ignore_poison(&FILE_INDEX);
    let status = IndexStatus {
        is_ready: true,
        total_files: cache.total_files,
        total_dirs: cache.total_dirs,
        indexed_drives: cache.indexed_drives,
        index_time_ms: cache.index_time_ms,
        last_update: Some(chrono_now()),
        mode: cache.mode.clone(),
    };
    index.entries = cache.entries;
    index.status = status.clone();

    // 设置当前模式
    let mode_val = match cache.mode.as_str() {
        "everything_ipc" => SearchMode::EverythingIpc,
        "mft" => SearchMode::Mft,
        _ => SearchMode::Walk,
    };
    let mut mode = lock_ignore_poison(&CURRENT_MODE);
    *mode = mode_val;

    Ok(status)
}

pub fn get_status() -> Result<IndexStatus, String> {
    let mode = lock_ignore_poison(&CURRENT_MODE);
    if *mode == SearchMode::EverythingIpc {
        // Everything 模式，返回虚拟状态
        return Ok(IndexStatus {
            is_ready: true,
            total_files: 0,
            total_dirs: 0,
            indexed_drives: vec!["Everything IPC (实时搜索)".to_string()],
            index_time_ms: 0,
            last_update: None,
            mode: "everything_ipc".to_string(),
        });
    }

    let mut index = lock_ignore_poison(&FILE_INDEX);

    // 如果本地索引为空，尝试从索引文件加载（不检查服务状态，避免每次搜索都调sc query）
    if !index.status.is_ready {
        if let Some(cache) = load_index_cache() {
            index.entries = cache.entries;
            index.status = IndexStatus {
                is_ready: true,
                total_files: cache.total_files,
                total_dirs: cache.total_dirs,
                indexed_drives: cache.indexed_drives,
                index_time_ms: cache.index_time_ms,
                last_update: Some(chrono_now()),
                mode: cache.mode,
            };
        }
    }

    Ok(index.status.clone())
}

/// 是否正在构建索引
pub fn is_building() -> Result<bool, String> {
    let building = lock_ignore_poison(&BUILDING_INDEX);
    Ok(*building)
}

/// 检测是否以管理员权限运行
pub fn is_admin() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        // 简单检测：尝试打开 C 盘根目录的 MFT
        let volume_path = r"\\.\C:";
        match ntfs_reader::volume::Volume::new(volume_path) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// 刷新索引
pub fn refresh_index() -> Result<IndexStatus, String> {
    build_index()
}

/// 启动文件变更监听器
pub fn start_watcher() -> Result<bool, String> {
    let mut running = lock_ignore_poison(&WATCHER_RUNNING);
    if *running {
        return Ok(true);
    }
    *running = true;
    Ok(true)
}

/// 停止文件变更监听器
pub fn stop_watcher() -> Result<bool, String> {
    let mut running = lock_ignore_poison(&WATCHER_RUNNING);
    *running = false;
    Ok(true)
}

/// 获取监听器状态
pub fn watcher_status() -> Result<bool, String> {
    let running = lock_ignore_poison(&WATCHER_RUNNING);
    Ok(*running)
}

// ─── 目录遍历辅助函数 ──────────────────────────────────────────

fn walk_directory(root: &str) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let root_path = std::path::Path::new(root);

    if !root_path.exists() {
        return Err(format!("路径不存在: {}", root));
    }

    walk_dir_recursive(root_path, &mut entries, 0);
    Ok(entries)
}

fn walk_dir_recursive(dir: &std::path::Path, entries: &mut Vec<FileEntry>, depth: usize) {
    if depth > 30 {
        return;
    }

    let read_dir = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('$') || name == "System Volume Information" {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let modified = metadata.modified().ok().map(|t| format_system_time(t));
        let created = metadata.created().ok().map(|t| format_system_time(t));

        entries.push(FileEntry {
            path: path.to_string_lossy().to_string(),
            name,
            ext,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            created,
            modified,
        });

        // 每处理 1000 个条目让出 CPU，避免阻塞 UI 线程
        if entries.len() % 1000 == 0 {
            std::thread::yield_now();
        }

        if metadata.is_dir() {
            walk_dir_recursive(&path, entries, depth + 1);
        }
    }
}

fn format_system_time(t: std::time::SystemTime) -> String {
    let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}", duration.as_millis())
}

// ─── 文件内容搜索 ──────────────────────────────────────────

/// 文本文件扩展名（可直接读取内容）
const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "csv", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf",
    "log", "rs", "py", "js", "ts", "jsx", "tsx", "c", "cpp", "h", "java", "go",
    "rb", "php", "sh", "bat", "ps1", "sql", "html", "css", "scss", "less",
    "vue", "svelte", "astro", "env", "gitignore", "dockerfile", "makefile",
];

/// 搜索文件内容
/// 在已索引的文件中，搜索包含指定关键词的文本文件
pub fn search_content(query: &str, path_prefix: Option<&str>, max_results: usize) -> Result<Vec<ContentSearchResult>, String> {
    let lower_query = query.to_lowercase();
    let start_time = std::time::Instant::now();
    const TIMEOUT_SECS: u64 = 15;
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10MB 以上的文件跳过

    // 短暂持锁，只收集候选文件列表
    let candidates: Vec<FileEntry> = {
        let index = lock_ignore_poison(&FILE_INDEX);
        if !index.status.is_ready {
            return Err("索引未就绪，请先构建索引".to_string());
        }

        let lower_path = path_prefix.map(|p| p.to_lowercase());
        let mut candidates = Vec::new();

        for entry in &index.entries {
            if entry.is_dir {
                continue;
            }

            // 跳过超大文件
            if entry.size > MAX_FILE_SIZE {
                continue;
            }

            // 路径筛选
            if let Some(ref lp) = lower_path {
                if !entry.path.to_lowercase().starts_with(lp) {
                    continue;
                }
            }

            // 只搜索文本文件
            let ext_lower = entry.ext.to_lowercase();
            if !TEXT_EXTENSIONS.contains(&ext_lower.as_str()) {
                continue;
            }

            candidates.push(entry.clone());
        }
        candidates
    }; // 锁在这里释放

    // 释放锁后逐个读取文件内容
    let mut results = Vec::new();

    for entry in candidates {
        // 超时检查
        if start_time.elapsed().as_secs() >= TIMEOUT_SECS {
            break;
        }

        match std::fs::read_to_string(&entry.path) {
            Ok(content) => {
                let lower_content = content.to_lowercase();
                if lower_content.contains(&lower_query) {
                    let context = extract_context(&content, &lower_query, 2);
                    results.push(ContentSearchResult {
                        path: entry.path.clone(),
                        name: entry.name.clone(),
                        ext: entry.ext.clone(),
                        size: entry.size,
                        modified: entry.modified.clone(),
                        context,
                    });
                    if results.len() >= max_results {
                        break;
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Ok(results)
}

/// 提取匹配关键词的上下文
fn extract_context(content: &str, lower_query: &str, context_lines: usize) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let mut matched_lines = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        if line.to_lowercase().contains(lower_query) {
            let start = if i >= context_lines { i - context_lines } else { 0 };
            let end = (i + context_lines + 1).min(lines.len());
            let snippet: Vec<&str> = lines[start..end].to_vec();
            matched_lines.push(snippet.join("\n"));
            if matched_lines.len() >= 3 {
                break;
            }
        }
    }

    if matched_lines.is_empty() {
        String::new()
    } else {
        matched_lines.join("\n---\n")
    }
}

/// 文件内容搜索结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContentSearchResult {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub size: u64,
    pub modified: Option<String>,
    pub context: String,
}

// ─── 重复文件查找 ──────────────────────────────────────────

/// 重复文件组
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DuplicateGroup {
    pub file_name: String,
    pub file_size: u64,
    pub files: Vec<DuplicateFile>,
}

/// 重复文件条目
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: Option<String>,
}

/// 查找重复文件
/// 按文件大小+文件名分组，相同大小和名称的文件视为重复
pub fn find_duplicates(path_prefix: Option<&str>, min_size: u64) -> Result<Vec<DuplicateGroup>, String> {
    let index = lock_ignore_poison(&FILE_INDEX);
    if !index.status.is_ready {
        return Err("索引未就绪，请先构建索引".to_string());
    }

    let lower_path = path_prefix.map(|p| p.to_lowercase());

    // 按大小+名称分组
    let mut groups: HashMap<(u64, String), Vec<FileEntry>> = HashMap::new();

    for entry in &index.entries {
        if entry.is_dir {
            continue;
        }
        if entry.size < min_size {
            continue;
        }

        // 路径筛选
        if let Some(ref lp) = lower_path {
            if !entry.path.to_lowercase().starts_with(lp) {
                continue;
            }
        }

        // 跳过 0 字节文件
        if entry.size == 0 {
            continue;
        }

        let key = (entry.size, entry.name.to_lowercase());
        groups.entry(key).or_default().push(entry.clone());
    }

    // 只保留有重复的组（>=2个文件）
    let mut duplicates: Vec<DuplicateGroup> = groups
        .into_iter()
        .filter(|(_, files)| files.len() >= 2)
        .map(|((size, name), files)| {
            let dup_files: Vec<DuplicateFile> = files
                .into_iter()
                .map(|f| DuplicateFile {
                    path: f.path,
                    name: f.name,
                    size: f.size,
                    modified: f.modified,
                })
                .collect();
            DuplicateGroup {
                file_name: name,
                file_size: size,
                files: dup_files,
            }
        })
        .collect();

    // 按文件大小降序排序（大文件的重复更值得关注）
    duplicates.sort_by(|a, b| b.file_size.cmp(&a.file_size));

    // 限制最多返回 500 组
    duplicates.truncate(500);

    Ok(duplicates)
}