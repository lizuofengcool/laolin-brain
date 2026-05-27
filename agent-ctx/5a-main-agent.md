---
Task ID: 5a
Agent: Main Agent
Task: 完善PWA移动端体验（Enhance PWA Mobile Experience）

Work Log:
- 创建 src/components/files/CameraCapture.tsx — 移动端相机拍照组件
  - 后置摄像头按钮（capture="environment"）+ 前置自拍按钮（capture="user"）
  - 桌面端隐藏（md:hidden），主色调按钮 + Camera图标
  - 通过 hidden file input 触发原生相机，onCapture 回调传递 File 对象
- 集成 CameraCapture 到 src/components/files/UploadZone.tsx
  - 上传区域外层添加 relative 容器
  - 底部右侧 absolute 定位相机按钮（仅移动端可见）
  - handleCameraCapture 复用现有 onDrop 上传流程
- 添加 iOS 安全区域 CSS（src/app/globals.css）
  - :root 新增 --sat, --sar, --sab, --sal 四个 safe-area CSS 变量
- 添加 iOS 安全区域内边距
  - src/components/layout/MobileNav.tsx: 底部导航栏 pb-[env(safe-area-inset-bottom)]
  - src/components/layout/Header.tsx: 顶部导航栏 pt-[env(safe-area-inset-top)]
- 增强 src/hooks/use-service-worker.ts
  - 新增 registerBackgroundSync() — 注册 Background Sync 上传同步
  - 新增 updateAvailable 状态 — 检测 SW updatefound 事件
  - 新增 applyUpdate() — 发送 SKIP_WAITING 消息并刷新页面
  - 返回值扩展：{ ..., registerBackgroundSync, updateAvailable, applyUpdate }
- 增强 public/manifest.json
  - 新增 lang: "zh-CN", dir: "ltr", scope: "/"
  - 新增 display_override: ["window-controls-overlay", "standalone", "minimal-ui"]
  - 新增 share_target — 支持从其他应用分享文件（PDF/DOCX/图片）
  - shortcuts 新增 icons 字段和 short_name
- 增强 public/sw.js（v2）
  - 缓存版本升级 v1 → v2
  - 新增 OFFLINE_HTML 完整离线页面（深色主题 + 重新连接按钮）
  - Install 事件：预缓存离线页面 + 日志输出缓存配额使用情况
  - Shell 请求失败：返回完整 HTML 离线页面（替代纯文本）
  - 静态资源匹配增加 /_next/image/ 路径
  - 完善 SKIP_WAITING 消息处理（使用 event.data?.type 语法）
- 修改 src/components/files/PullToRefresh.tsx — 离线感知
  - 导入 usePWA hook 获取 isOnline 状态
  - handleTouchEnd 中检查离线状态，离线时显示 toast 提示"离线模式，无法刷新"

Files Created:
- src/components/files/CameraCapture.tsx

Files Modified:
- src/components/files/UploadZone.tsx
- src/app/globals.css
- src/components/layout/MobileNav.tsx
- src/components/layout/Header.tsx
- src/hooks/use-service-worker.ts
- public/manifest.json
- public/sw.js
- src/components/files/PullToRefresh.tsx
- /home/z/my-project/worklog.md

Build Result:
- ✅ next build 通过，0 TypeScript 错误
- 修复了 SyncManager 类型缺失问题（使用类型断言绕过 TS 默认类型）

Issues:
- 无破坏性问题，所有现有功能保持不变
