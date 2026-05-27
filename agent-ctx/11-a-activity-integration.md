# Task 11-a: 活动记录集成到所有文件操作

## 工作内容
修改 `src/stores/app-store.ts`，在所有关键文件操作成功后调用 `useActivityStore.getState().addActivity()` 记录活动。

## 修改的操作
1. **addFile(file)** — 上传后记录 `type: 'upload'`
2. **softDeleteFile(id)** — 软删除成功后记录 `type: 'delete'`
3. **restoreFile(id)** — 恢复成功后记录 `type: 'restore'`
4. **permanentDeleteFile(id)** — 永久删除后记录 `type: 'delete'`（新增files解构获取文件名）
5. **renameFile(id, newName)** — 重命名成功后记录 `type: 'rename'`，details包含新旧名称
6. **toggleFavorite(id)** — 收藏/取消收藏后记录 `type: 'favorite'` 或 `'unfavorite'`
7. **batchDeleteFiles(ids)** — 批量删除成功后记录 `type: 'delete'`
8. **batchToggleFavorite(ids, value)** — 批量收藏成功后记录 `type: 'favorite'` 或 `'unfavorite'`
9. **moveFileToFolder(fileId, folderId)** — 移动成功后记录 `type: 'tag'`，details包含目标文件夹名

## 技术细节
- 使用 `useActivityStore.getState().addActivity(...)` 方式调用（非React组件内）
- 所有 addActivity 调用放在 try 块中操作成功后，不阻塞原有操作
- 未修改 activity-store.ts
- lint 检查：app-store.ts 0 新增错误
