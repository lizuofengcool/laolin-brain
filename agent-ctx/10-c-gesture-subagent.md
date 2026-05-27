---
Task ID: 10-c
Agent: subagent
Task: 移动端文件列表手势操作（左滑删除、右滑收藏、长按多选）

Work Log:
- 读取 worklog.md 了解项目背景和现有代码结构
- 读取 page.tsx 中 FilesView、FileGrid.tsx、FileCard.tsx（FileCard + FileListItem）、app-store.ts、use-gestures.ts
- 创建 src/hooks/use-swipe.ts — 通用滑动检测Hook
  - 支持4方向检测（上下左右）+ 方向锁定机制
  - 最小滑动距离阈值 50px、最大时间阈值 300ms
  - 同时支持 Pointer Events（统一touch+mouse）
  - 返回 swipeDirection / isSwiping / swipeDelta 状态
  - 提供 onSwipeLeft/Right/Up/Down 回调
  - 提供 onSwipeStart/Move/End 生命周期回调
- 创建 src/components/files/SwipeableFileItem.tsx — 列表视图可滑动文件项
  - 使用 framer-motion useMotionValue + animate 实现物理拖拽
  - 左滑 >120px 自动展开操作按钮（收藏+删除），<60px 弹回
  - 右滑触发分享按钮后弹回
  - 长按500ms进入多选模式 + 波纹扩散动画
  - 删除动画：滑出+淡出+缩小 → 调用 softDeleteFile
  - 收藏动画：心跳+星星闪烁 → 调用 toggleFavorite
  - 分享按钮：蓝色背景 + Share2 图标
  - 颜色方案：删除=destructive红色、收藏=amber金色、分享=primary蓝色
  - 触觉反馈：navigator.vibrate()
  - React.memo 优化渲染
- 创建 src/components/files/GestureGridItem.tsx — 网格视图手势文件项
  - 长按500ms进入多选模式 + 选中当前文件
  - 触觉反馈动画：缩放弹跳(spring) + 波纹扩散(双圈)
  - 批量模式：勾选框覆盖层 + 勾选路径动画
  - AnimatePresence 控制波纹进出
  - useEffect cleanup 清理 long press timer
  - React.memo 优化渲染
- 修改 src/components/files/FileGrid.tsx — 集成手势组件
  - 导入 useIsMobile + SwipeableFileItem + GestureGridItem
  - 新增 batchSelectedIds 的 Set memoization 用于 GestureGridItem
  - 网格视图：移动端用 GestureGridItem 包裹 FileCard，桌面端直接渲染
  - 列表视图：移动端用 SwipeableFileItem 包裹 FileListItem，桌面端直接渲染
  - 不影响 VirtualFileGrid（>50文件时自动启用虚拟滚动，不走FileGrid路径）
- ESLint: 新文件 0 错误（预存 24 个错误均为非本次引入）
- Dev server: 编译通过，GET / 200 正常

Stage Summary:
- 新增文件：3个（use-swipe.ts, SwipeableFileItem.tsx, GestureGridItem.tsx）
- 修改文件：1个（FileGrid.tsx）
- ESLint: 新文件 0 错误
- Dev server: ✅ 编译通过
