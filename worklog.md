---
Task ID: 1
Agent: Main Agent
Task: 三个阶段全部开发 - 安全完善 + 功能增强 + 高级特性

Work Log:
- 审查了20个核心源文件的完整代码
- 评估了用户建议的7个Phase 1优化项，确定了可行性
- 创建 README.md 项目文档（包含完整功能介绍、技术栈、项目结构）
- 创建 app/error.tsx 全局错误边界（Next.js内置支持）
- 创建 app/not-found.tsx 404页面
- 创建 src/middleware.ts API速率限制中间件（内存版滑动窗口，零外部依赖）
- 创建 src/lib/chunk-upload.ts 分片上传工具库（支持断点续传、IndexedDB进度记录）
- 创建 src/components/help/ShortcutHelpPanel.tsx 键盘快捷键速查面板（按?或Ctrl+/唤出）
- 创建 src/components/voice/VoiceNote.tsx 语音笔记（Web Speech API，支持实时识别和保存）
- 创建 src/components/files/BatchActions.tsx 批量操作增强（批量标签+批量移动到文件夹）
- 创建 src/components/settings/ThemeCustomizer.tsx 主题自定义系统（8色预设+自定义色+CSS变量）
- 创建 src/lib/i18n/index.tsx 国际化框架（中/英文，React Context，localStorage持久化）
- 集成所有新组件到主页面（page.tsx设置视图、收藏夹分组）
- Header新增语言切换按钮
- 收藏夹新增按文件类型分组展示
- 编写25个新单元测试（sanitize、chunk-upload、rate-limit）
- 验证构建100%通过，新增测试全部通过

Stage Summary:
- 新增 10 个源文件（组件6个 + lib3个 + middleware1个）
- 新增 25 个单元测试
- 修改文件：page.tsx, Header.tsx
- 构建：0 TypeScript 错误，0 ESLint 错误
- 数据库索引已存在，无需修改（schema.prisma已有7个索引）
- 备份恢复功能已有完整实现（BackupRestore.tsx使用JSZip）
