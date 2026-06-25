pub fn is_service_running_fast() -> bool {
    false
}

pub fn is_service_running() -> bool {
    false
}

pub fn service_rebuild() -> Result<(), String> {
    Err("搜索服务暂未实现（stub模式）".to_string())
}

pub fn is_service_installed() -> bool {
    false
}

pub fn install_service() -> Result<(), String> {
    Err("搜索服务暂未实现（stub模式）".to_string())
}

pub fn uninstall_service() -> Result<(), String> {
    Err("搜索服务暂未实现（stub模式）".to_string())
}
