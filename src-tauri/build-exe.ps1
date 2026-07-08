# Build Rust Release EXE Only (skip Next.js build)
# This is faster for testing the Tauri desktop app
# Usage: .\build-exe.ps1

$ErrorActionPreference = "Continue"

$devShellDll = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (-not (Test-Path $devShellDll)) {
    Write-Host "[ERROR] VS DevShell not found"
    exit 1
}

Import-Module $devShellDll -ErrorAction SilentlyContinue
try {
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation -ErrorAction SilentlyContinue 2>$null | Out-Null
} catch {
    Write-Host "[WARN] $($_.Exception.Message)"
}

$env:CC = "cl.exe"
$env:CXX = "cl.exe"
$env:CARGO_INCREMENTAL = "0"

Set-Location $PSScriptRoot

Write-Host "[INFO] Building Rust release exe (no Next.js build)..."
Write-Host "[INFO] Output: target\release\knowledge-base.exe"
Write-Host "----------------------------------------"

cargo build --release
$code = $LASTEXITCODE

Write-Host "----------------------------------------"
if ($code -eq 0) {
    $exe = "target\release\knowledge-base.exe"
    if (Test-Path $exe) {
        $size = (Get-Item $exe).Length / 1MB
        Write-Host "[SUCCESS] Build completed: $exe ($([math]::Round($size,1)) MB)"
    } else {
        Write-Host "[SUCCESS] Build completed"
    }
} else {
    Write-Host "[FAILED] Exit code: $code"
}
exit $code
