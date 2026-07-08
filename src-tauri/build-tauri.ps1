# Tauri Build Script with MSVC Environment
# Build distributable Tauri app (exe installer)
# Usage: .\build-tauri.ps1

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
Write-Host "[INFO] Building Tauri app for production..."
Write-Host "[INFO] Output: src-tauri/target/release/bundle/"
Write-Host "----------------------------------------"

npm run tauri:build
$code = $LASTEXITCODE

Write-Host "----------------------------------------"
if ($code -eq 0) {
    Write-Host "[SUCCESS] Build completed!"
    Write-Host "[INFO] Check output in: src-tauri/target/release/bundle/"
} else {
    Write-Host "[FAILED] Exit code: $code"
}
exit $code
