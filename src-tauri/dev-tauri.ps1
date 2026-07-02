# Tauri Dev Launcher with MSVC Environment
# Fix: global CC=gcc breaks bundled sqlite3 linking (LNK2019)
# Usage: .\dev-tauri.ps1

$ErrorActionPreference = "Continue"

$devShellDll = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (-not (Test-Path $devShellDll)) {
    Write-Host "[ERROR] VS DevShell not found: $devShellDll"
    exit 1
}

Import-Module $devShellDll -ErrorAction SilentlyContinue
try {
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation -ErrorAction SilentlyContinue 2>$null | Out-Null
} catch {
    Write-Host "[WARN] Enter-VsDevShell warning: $($_.Exception.Message)"
}

$env:CC = "cl.exe"
$env:CXX = "cl.exe"
$env:CARGO_INCREMENTAL = "0"

$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

Write-Host "[INFO] CC = $($env:CC)"
Write-Host "[INFO] CARGO_INCREMENTAL = $($env:CARGO_INCREMENTAL)"
Write-Host "[INFO] Starting Tauri dev mode..."
Write-Host "[INFO] Web server at http://localhost:3002"
Write-Host "----------------------------------------"

npm run tauri:dev
$code = $LASTEXITCODE

Write-Host "----------------------------------------"
Write-Host "[INFO] Exit code: $code"
exit $code
