'use client';

import { useState, useMemo } from 'react';
import { Tag, Search, Pencil, Trash2, Merge, X, Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import { getStorageAdapter } from '@/lib/storage/factory';

interface TagInfo {
  name: string;
  count: number;
}

export default function TagManagement() {
  const files = useAppStore((s) => s.files);
  const updateFile = useAppStore((s) => s.updateFile);

  const [searchQuery, setSearchQuery] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TagInfo | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');

  // Build tag registry from all files (including soft-deleted ones — tags are still valid)
  const tagRegistry = useMemo<TagInfo[]>(() => {
    const tagMap = new Map<string, number>();
    for (const file of files) {
      const tags: string[] = file.tags || [];
      for (const tag of tags) {
        if (tag.trim()) {
          tagMap.set(tag.trim(), (tagMap.get(tag.trim()) || 0) + 1);
        }
      }
    }
    const result: TagInfo[] = [];
    for (const [name, count] of tagMap) {
      result.push({ name, count });
    }
    // Sort by file count descending, then alphabetically
    result.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return result;
  }, [files]);

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tagRegistry;
    const q = searchQuery.trim().toLowerCase();
    return tagRegistry.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tagRegistry, searchQuery]);

  // Helper: persist tag changes for a file
  const persistFileTags = (fileId: string, newTags: string[]) => {
    const { user, storageMode } = useAppStore.getState();
    const adapter = getStorageAdapter(storageMode);
    updateFile(fileId, { tags: newTags });
    adapter.updateFile(fileId, { tags: newTags }, user!.id).catch(console.error);
  };

  // ── Rename ──
  const openRenameDialog = (tag: TagInfo) => {
    setSelectedTag(tag);
    setRenameValue(tag.name);
    setRenameDialogOpen(true);
  };

  const handleRename = () => {
    if (!selectedTag || !renameValue.trim() || renameValue.trim() === selectedTag.name) {
      setRenameDialogOpen(false);
      return;
    }
    const oldName = selectedTag.name;
    const newName = renameValue.trim();

    // Find all files with the old tag and replace
    const affectedFiles = files.filter(
      (f) => f.tags && f.tags.includes(oldName)
    );
    for (const file of affectedFiles) {
      const newTags = file.tags.map((t) => (t === oldName ? newName : t));
      persistFileTags(file.id, newTags);
    }

    setRenameDialogOpen(false);
    setSelectedTag(null);
    setRenameValue('');
  };

  // ── Delete ──
  const openDeleteDialog = (tag: TagInfo) => {
    setSelectedTag(tag);
    setDeleteDialogOpen(true);
  };

  const handleDelete = () => {
    if (!selectedTag) return;
    const tagName = selectedTag.name;

    // Find all files with this tag and remove it
    const affectedFiles = files.filter(
      (f) => f.tags && f.tags.includes(tagName)
    );
    for (const file of affectedFiles) {
      const newTags = file.tags.filter((t) => t !== tagName);
      persistFileTags(file.id, newTags);
    }

    setDeleteDialogOpen(false);
    setSelectedTag(null);
  };

  // ── Merge ──
  const openMergeDialog = (tag: TagInfo) => {
    setSelectedTag(tag);
    setMergeTarget('');
    setMergeDialogOpen(true);
  };

  const handleMerge = () => {
    if (!selectedTag || !mergeTarget.trim() || mergeTarget.trim() === selectedTag.name) {
      setMergeDialogOpen(false);
      return;
    }
    const sourceTag = selectedTag.name;
    const targetTag = mergeTarget.trim();

    // Find all files with the source tag
    const affectedFiles = files.filter(
      (f) => f.tags && f.tags.includes(sourceTag)
    );
    for (const file of affectedFiles) {
      const newTags = [...file.tags.filter((t) => t !== sourceTag)];
      // Only add target if not already present
      if (!newTags.includes(targetTag)) {
        newTags.push(targetTag);
      }
      persistFileTags(file.id, newTags);
    }

    setMergeDialogOpen(false);
    setSelectedTag(null);
    setMergeTarget('');
  };

  // Merge targets: all tags except the selected one
  const mergeTargets = useMemo(() => {
    if (!selectedTag) return [];
    return tagRegistry.filter((t) => t.name !== selectedTag.name);
  }, [tagRegistry, selectedTag]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Tag className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">标签管理</h1>
        </div>
        <p className="text-muted-foreground">管理所有文件标签，支持重命名、合并和删除</p>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-lg">
              全部标签
              <Badge variant="secondary" className="ml-2">
                {tagRegistry.length}
              </Badge>
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTags.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Tag className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery ? '没有找到匹配的标签' : '暂无标签'}
              </p>
              <p className="text-xs mt-1">
                {searchQuery ? '请尝试其他搜索词' : '为文件添加标签后将在此显示'}
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto space-y-1 pr-1">
              {filteredTags.map((tag) => (
                <div
                  key={tag.name}
                  className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{tag.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {tag.count} 个文件
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openRenameDialog(tag)}
                      title="重命名"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openMergeDialog(tag)}
                      title="合并到其他标签"
                    >
                      <Merge className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(tag)}
                      title="删除标签"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Rename Dialog ── */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名标签</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rename-input">新标签名称</Label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                }}
                placeholder="输入新标签名称"
                autoFocus
              />
            </div>
            {selectedTag && (
              <p className="text-sm text-muted-foreground">
                将重命名标签 <strong>&ldquo;{selectedTag.name}&rdquo;</strong>，影响{' '}
                <strong>{selectedTag.count}</strong> 个文件。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim() || renameValue.trim() === selectedTag?.name}
            >
              <Check className="h-4 w-4 mr-1.5" />
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除标签</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {selectedTag && (
              <p className="text-sm text-muted-foreground">
                确定删除标签{' '}
                <strong className="text-foreground">&ldquo;{selectedTag.name}&rdquo;</strong>
                ？将从 <strong className="text-foreground">{selectedTag.count}</strong> 个文件中移除。
                此操作无法撤销。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Merge Dialog ── */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>合并标签</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedTag && (
              <p className="text-sm text-muted-foreground">
                将标签 <strong className="text-foreground">&ldquo;{selectedTag.name}&rdquo;</strong>{' '}
                合并到另一个标签中。合并后，所有使用该标签的文件将改为使用目标标签。
              </p>
            )}
            <div className="space-y-2">
              <Label>选择目标标签</Label>
              {mergeTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  没有其他可用的标签用于合并。
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
                  {mergeTargets.map((target) => (
                    <button
                      key={target.name}
                      onClick={() => setMergeTarget(target.name)}
                      className={cn(
                        'flex items-center justify-between w-full rounded-md px-3 py-2 text-sm transition-colors',
                        mergeTarget === target.name
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      )}
                    >
                      <span className="truncate">{target.name}</span>
                      <span
                        className={cn(
                          'text-xs ml-2 shrink-0',
                          mergeTarget === target.name
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                        )}
                      >
                        {target.count} 个文件
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!mergeTarget.trim() || mergeTarget.trim() === selectedTag?.name}
            >
              <Merge className="h-4 w-4 mr-1.5" />
              确认合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
