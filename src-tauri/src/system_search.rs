use serde::{Deserialize, Serialize};

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
    pub mode: String,
    pub indexed_drives: Vec<String>,
    pub index_time_ms: u64,
    pub total_files: usize,
    pub total_dirs: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSearchResult {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
}

pub fn build_index() -> Result<IndexStatus, String> {
    Ok(IndexStatus {
        mode: "stub".to_string(),
        indexed_drives: vec![],
        index_time_ms: 0,
        total_files: 0,
        total_dirs: 0,
    })
}

pub fn search_files(
    _query: &str,
    _ext_filter: Option<&str>,
    _category: Option<&str>,
    _max_results: usize,
) -> Result<Vec<FileEntry>, String> {
    Ok(vec![])
}

pub fn search_files_in_path(
    _query: &str,
    _path: &str,
    _category: Option<&str>,
    _max_results: usize,
) -> Result<Vec<FileEntry>, String> {
    Ok(vec![])
}

pub fn load_index_from_file() -> Result<IndexStatus, String> {
    Ok(IndexStatus {
        mode: "stub".to_string(),
        indexed_drives: vec![],
        index_time_ms: 0,
        total_files: 0,
        total_dirs: 0,
    })
}

pub fn get_status() -> Result<IndexStatus, String> {
    Ok(IndexStatus {
        mode: "stub".to_string(),
        indexed_drives: vec![],
        index_time_ms: 0,
        total_files: 0,
        total_dirs: 0,
    })
}

pub fn is_building() -> Result<bool, String> {
    Ok(false)
}

pub fn is_admin() -> Result<bool, String> {
    Ok(false)
}

pub fn search_content(
    _query: &str,
    _path_prefix: Option<&str>,
    _max_results: usize,
) -> Result<Vec<ContentSearchResult>, String> {
    Ok(vec![])
}

pub fn find_duplicates(
    _path_prefix: Option<&str>,
    _min_size: u64,
) -> Result<Vec<DuplicateGroup>, String> {
    Ok(vec![])
}

pub fn refresh_index() -> Result<IndexStatus, String> {
    build_index()
}

pub fn start_watcher() -> Result<bool, String> {
    Ok(false)
}

pub fn stop_watcher() -> Result<bool, String> {
    Ok(false)
}

pub fn watcher_status() -> Result<bool, String> {
    Ok(false)
}

pub fn clear_index() {}
