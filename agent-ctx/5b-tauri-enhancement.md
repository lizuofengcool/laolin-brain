# Task 5b: 完善Tauri桌面端体验

## 任务概览
基于差距分析，完善 Tauri 桌面端体验，包括权限配置、新增 Rust 命令、原生菜单栏、系统托盘、TypeScript 适配器扩展等。

## 文件变更清单

### 新增文件（2个）
| 文件 | 描述 |
|------|------|
| `src-tauri/src/menu.rs` | 原生菜单栏配置（文件/编辑/视图/帮助 4个菜单组） |
| `src-tauri/src/tray.rs` | 系统托盘配置（右键菜单 + 左键点击显示窗口） |

### 修改文件（7个）
| 文件 | 变更内容 |
|------|----------|
| `src-tauri/tauri.conf.json` | 新增 capabilities 权限块（21个权限）+ drag_drop_enabled |
| `src-tauri/Cargo.toml` | 添加 6 个 Tauri v2 官方插件 + open crate |
| `src-tauri/src/lib.rs` | 新增 7 个 Rust 命令 + Base64EncodeWriter + is_deleted 支持 |
| `src-tauri/src/main.rs` | 注册全部 20 个命令 + 集成菜单栏和系统托盘 |
| `src/lib/storage/base.ts` | 扩展 IStorageAdapter 接口（7个新可选方法） |
| `src/lib/storage/tauri.ts` | 新增 8 个 TypeScript 适配器方法 |
| `src/lib/storage/factory.ts` | 修复同步版本 Tauri 环境检测 |

## 构建验证
- `npx next build`: ✅ 通过，0 TypeScript 错误
- 34 个 API 路由全部正常编译
- `src-tauri/` 目录被排除在 TypeScript 编译范围外（tsconfig.json）

## 注意事项
- Rust 未安装，所有 .rs 文件仅创建未编译
- TypeScript 适配器文件完整通过编译
- Tauri 插件配置已就绪，待 Rust 环境安装后即可构建
