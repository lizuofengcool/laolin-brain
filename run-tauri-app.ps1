# Run Tauri App with Next.js Server
# Starts Next.js dev server and launches Tauri exe
# Usage: .\run-tauri-app.ps1

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

Write-Host "========================================"
Write-Host " Tauri App Launcher"
Write-Host "========================================"
Write-Host ""

# Step 1: Start Next.js dev server in background
Write-Host "[1/3] Starting Next.js dev server on port 3002..."
$devProcess = Start-Process -FilePath "npm" -ArgumentList "run dev" -PassThru -WindowStyle Minimized
Write-Host "[INFO] Next.js dev server PID: $($devProcess.Id)"

# Step 2: Wait for server to be ready
Write-Host "[2/3] Waiting for Next.js server to be ready..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Write-Host -NoNewline "."
    }
}
Write-Host ""

if (-not $ready) {
    Write-Host "[WARN] Next.js server not ready after 120s, launching exe anyway..."
} else {
    Write-Host "[OK] Next.js server is ready at http://localhost:3002"
}

# Step 3: Launch Tauri exe
$exePath = "src-tauri\target\release\knowledge-base.exe"
Write-Host "[3/3] Launching Tauri app: $exePath"
if (Test-Path $exePath) {
    $tauriProcess = Start-Process -FilePath $exePath -PassThru
    Write-Host "[OK] Tauri app launched (PID: $($tauriProcess.Id))"
    Write-Host ""
    Write-Host "========================================"
    Write-Host " App is running!"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop Next.js server."
    Write-Host "Closing the Tauri window will exit the app."
    Write-Host ""

    # Wait for Tauri process to exit
    $tauriProcess.WaitForExit()
    Write-Host "[INFO] Tauri app closed."

    # Stop Next.js dev server
    if (-not $devProcess.HasExited) {
        Write-Host "[INFO] Stopping Next.js dev server..."
        Stop-Process -Id $devProcess.Id -Force -ErrorAction SilentlyContinue
        # Also stop any child node processes
        Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Parent.Id -eq $devProcess.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "[ERROR] Tauri exe not found: $exePath"
    Write-Host "[INFO] Run .\src-tauri\build-exe.ps1 first to build the exe"
    Stop-Process -Id $devProcess.Id -Force -ErrorAction SilentlyContinue
}
