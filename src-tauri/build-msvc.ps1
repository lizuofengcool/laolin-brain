# Tauri 项目 MSVC 编译脚本（PowerShell 版）
# 解决问题：用户系统全局 CC=gcc 导致 bundled sqlite3 用 gcc 编译，
# 而 Rust MSVC target 用 link.exe 链接，符号不兼容 (LNK2019)
# 解决方案：调用 VS DevShell 设置 MSVC 环境，强制 CC=cl.exe
# 用法：.\build-msvc.ps1 [cargo参数]
param([string]$CargoArgs = "build")

$ErrorActionPreference = "Continue"

# 导入 VS DevShell 模块
$devShellDll = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (-not (Test-Path $devShellDll)) {
    Write-Host "[错误] 未找到 VS DevShell 模块: $devShellDll"
    Write-Host "请确认已安装 Visual Studio 2022 Build Tools"
    exit 1
}

Import-Module $devShellDll -ErrorAction SilentlyContinue
try {
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation -ErrorAction SilentlyContinue 2>$null | Out-Null
} catch {
    Write-Host "[警告] Enter-VsDevShell 报告警告（通常不影响编译）: $($_.Exception.Message)"
}

# 强制使用 cl.exe 编译 C 代码
$env:CC = "cl.exe"
$env:CXX = "cl.exe"

# 切换到脚本所在目录
Set-Location $PSScriptRoot

Write-Host "[信息] CC = $env:CC"
Write-Host "[信息] 开始执行 cargo $CargoArgs ..."
Write-Host "----------------------------------------"

# 执行 cargo 命令
cargo $CargoArgs.Split(' ')
$exitCode = $LASTEXITCODE

Write-Host "----------------------------------------"
if ($exitCode -eq 0) {
    Write-Host "[成功] cargo $CargoArgs 完成"
} else {
    Write-Host "[失败] cargo $CargoArgs 返回码: $exitCode"
}
exit $exitCode
