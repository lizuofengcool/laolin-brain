# Tauri 桌面版搭建指南

本文档介绍如何在本地环境搭建和运行「智能文档知识库」的 Tauri 桌面版。

## 概述

Tauri 是一个使用 Web 技术构建桌面应用的框架，它将 Next.js 前端嵌入到原生窗口中，并通过 Rust 后端提供系统级 API 访问。

**核心优势：**
- 安装包体积小（约 5-10MB，远小于 Electron）
- 原生文件系统访问，无需服务端
- 内存占用低，性能优秀
- 跨平台支持（Windows、macOS、Linux）

**存储架构：**
```
┌─────────────────────────────────────┐
│          前端（Next.js / React）       │
│  ┌───────────────────────────────┐  │
│  │  StorageAdapter 工厂          │  │
│  │  ┌─────────┐ ┌────────────┐  │  │
│  │  │ Tauri   │ │ IndexedDB  │  │  │
│  │  │ Adapter │ │ Adapter    │  │  │
│  │  └────┬────┘ └────────────┘  │  │
│  └───────┼──────────────────────┘  │
└──────────┼─────────────────────────┘
           │ invoke()
┌──────────┼─────────────────────────┐
│     Rust 后端（Tauri v2）           │
│  ┌───────┴───────────────────────┐ │
│  │  文件存储（JSON 数据库）         │ │
│  │  版本管理 / 文件夹管理           │ │
│  │  原生文件对话框 / 系统托盘       │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 前置条件

### 1. 安装 Rust 工具链

访问 [https://rustup.rs](https://rustup.rs) 安装 Rust：

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装完成后，重新加载环境变量
source $HOME/.cargo/env

# 验证安装
rustc --version
cargo --version
```

### 2. 平台特定依赖

#### macOS（需要 Xcode Command Line Tools）
```bash
xcode-select --install
```

#### Linux（Ubuntu/Debian）
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### Windows
- 安装 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- 安装 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)（Windows 11 已内置）

### 3. Node.js 依赖

确保已安装项目所需依赖：
```bash
bun install
```

## 快速开始

### 开发模式

```bash
# 同时启动 Next.js 前端开发服务器和 Tauri 桌面窗口
bun run tauri:dev
```

此命令会：
1. 自动执行 `beforeDevCommand`（启动 `bun run dev`）
2. 等待 Next.js 开发服务器就绪（http://localhost:3000）
3. 打开 Tauri 桌面窗口加载前端页面
4. 前端代码修改后自动热更新

### 构建生产版本

```bash
# 生成安装包
bun run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`：
- **macOS**: `.dmg` 和 `.app`
- **Windows**: `.msi` 和 `.exe`（NSIS 安装包）
- **Linux**: `.deb` 和 `.AppImage`

## 配置说明

### Tauri 配置文件

主配置文件：`src-tauri/tauri.conf.json`

| 配置项 | 说明 |
|--------|------|
| `productName` | 应用名称（安装后显示） |
| `identifier` | 应用唯一标识符 |
| `build.devUrl` | 开发模式前端地址 |
| `build.frontendDist` | 生产构建前端静态文件目录 |
| `app.windows` | 窗口配置（尺寸、标题等） |
| `bundle` | 安装包配置（图标、目标平台） |

### 存储适配器自动切换

存储适配器通过 `isTauriEnvironment()` 自动检测运行环境：

- **Tauri 桌面端**：使用 `TauriStorageAdapter`，通过 `invoke()` 调用 Rust 后端
- **浏览器端**：使用 `IndexedDBAdapter`，直接操作浏览器 IndexedDB

无需手动切换，代码自动处理。

### 本地数据存储位置

Tauri 桌面版的数据存储在系统应用数据目录：

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.knowledgebase.app/` |
| Windows | `C:\Users\{用户}\AppData\Roaming\com.knowledgebase.app\` |
| Linux | `~/.config/com.knowledgebase.app/` |

数据目录结构：
```
com.knowledgebase.app/
├── users/
│   └── {用户ID}/
│       ├── files.json      # 文件元数据数据库
│       ├── versions.json    # 版本历史数据库
│       ├── folders.json     # 文件夹数据库
│       └── files/           # 文件二进制数据存储
│           └── {文件ID}
```

## 桌面特有功能

### 原生文件对话框

可通过 Tauri API 调用系统原生文件选择对话框：

```typescript
import { open } from '@tauri-apps/plugin-dialog';

const file = await open({
  multiple: false,
  filters: [{
    name: '文档',
    extensions: ['pdf', 'docx', 'pptx', 'txt', 'md']
  }]
});
```

### 系统托盘

可在 `src-tauri/src/lib.rs` 中配置系统托盘：

```rust
use tauri::{
    tray::TrayIconBuilder,
    Manager,
};

// 在 Builder 中添加
.tray_icon(TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .tooltip("智能文档知识库")
    .on_tray_icon_event(|tray, event| {
        // 处理托盘事件
    })
    .build(app)
    .unwrap())
```

### 开机自启动

在 `tauri.conf.json` 中添加：

```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [...]
  },
  "plugins": {
    "autostart": {
      "macosExtraArgs": [],
      "args": [],
      "enabled": true
    }
  }
}
```

### 修改 Next.js 输出模式

Tauri 需要静态导出模式。修改 `next.config.ts`：

```typescript
const nextConfig: NextConfig = {
  output: "export",  // 改为 export 以支持 Tauri 静态加载
  // ...
};
```

> **注意**：使用 `output: "export"` 时，所有 API 路由将不可用。
> 桌面版通过 Tauri 的 Rust 后端直接处理文件操作，无需 API 路由。

## 故障排除

### 常见问题

**Q: 编译时出现 `linker 'cc' not found`**
```bash
# Linux 下安装 build-essential
sudo apt install build-essential
```

**Q: macOS 上出现 `WebView2 not found`**
- macOS 使用 WKWebView（系统自带），无需额外安装
- 如果仍有问题，更新 macOS 到最新版本

**Q: `cargo install tauri-cli` 编译时间很长**
- 这是正常的，首次编译需要下载和编译大量依赖
- 后续编译会使用缓存，速度大幅提升

**Q: 如何调试 Rust 后端？**
```bash
# 在终端中查看 Rust 日志
RUST_LOG=debug bun run tauri:dev
```

## 参考链接

- [Tauri v2 官方文档](https://v2.tauri.app/)
- [Tauri Rust API](https://docs.rs/tauri/latest/tauri/)
- [Tauri JavaScript API](https://v2.tauri.app/develop/calling-rust/)
- [Tauri 插件列表](https://v2.tauri.app/plugin/)
