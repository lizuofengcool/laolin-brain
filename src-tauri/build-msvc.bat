@echo off
REM ============================================================
REM Tauri 项目 MSVC 编译脚本
REM 解决问题：用户系统全局 CC=gcc 导致 bundled sqlite3 用 gcc 编译，
REM 而 Rust MSVC target 用 link.exe 链接，符号不兼容 (LNK2019)
REM 解决方案：调用 vcvarsall.bat 设置 MSVC 环境，强制 CC=cl.exe
REM 用法：build-msvc.bat [cargo参数，如 build / release / check]
REM ============================================================

setlocal

REM 设置 MSVC 环境
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
if errorlevel 1 (
    echo [错误] 设置 MSVC 环境失败
    exit /b 1
)

REM 强制使用 cl.exe 编译 C 代码
set CC=cl.exe
set CXX=cl.exe

REM 切换到脚本所在目录
cd /d "%~dp0"

REM 执行 cargo 命令（默认 build，可传参）
if "%~1"=="" (
    echo [信息] 执行 cargo build ...
    cargo build
) else (
    echo [信息] 执行 cargo %*
    cargo %*
)

endlocal
