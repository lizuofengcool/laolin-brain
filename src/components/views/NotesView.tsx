'use client';

import { useState } from 'react';
import {
  StickyNote,
  Search,
  Plus,
  Settings,
  Star,
  Clock,
  Tag,
  FileText,
  Folder,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Share2,
  Pin,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

// 模拟数据
const mockNotebooks = [
  { id: 'nb1', name: '工作笔记', icon: '💼', count: 42, color: 'bg-blue-500' },
  { id: 'nb2', name: '学习笔记', icon: '📚', count: 56, color: 'bg-green-500' },
  { id: 'nb3', name: '生活记录', icon: '🏠', count: 28, color: 'bg-purple-500' },
  { id: 'nb4', name: '灵感收集', icon: '💡', count: 15, color: 'bg-yellow-500' },
  { id: 'nb5', name: '读书心得', icon: '📖', count: 33, color: 'bg-pink-500' },
];

const mockNotes = [
  {
    id: 'n1',
    title: '项目会议纪要 - 2026.06.24',
    content: '今天的项目会议主要讨论了以下内容：\n\n1. 项目进度回顾\n2. 下周工作计划\n3. 风险点识别\n4. 资源协调\n\n下周重点：完成前端开发，开始联调测试。',
    notebook: '工作笔记',
    tags: ['会议', '项目', '周报'],
    updatedAt: '2026-06-24 14:30',
    isFavorite: true,
    isPinned: true,
    wordCount: 128,
  },
  {
    id: 'n2',
    title: 'React 19 新特性学习笔记',
    content: 'React 19 带来了很多令人兴奋的新特性：\n\n- Actions：简化表单处理\n- useOptimistic：乐观更新\n- use：支持 Promise 和 context\n- 服务器组件增强\n- 文档元数据 API\n\n这些特性将大大提升开发体验。',
    notebook: '学习笔记',
    tags: ['React', '前端', '学习'],
    updatedAt: '2026-06-23 20:15',
    isFavorite: true,
    isPinned: false,
    wordCount: 256,
  },
  {
    id: 'n3',
    title: '周末旅行计划',
    content: '本周末计划去长白山旅游：\n\nDay 1：出发，抵达长白山脚下\nDay 2：登长白山，看天池\nDay 3：泡温泉，返程\n\n需要准备的物品：\n- 厚外套\n- 防晒霜\n- 墨镜\n- 相机',
    notebook: '生活记录',
    tags: ['旅行', '计划', '周末'],
    updatedAt: '2026-06-22 16:45',
    isFavorite: false,
    isPinned: false,
    wordCount: 89,
  },
  {
    id: 'n4',
    title: '产品创意：智能笔记助手',
    content: '一个基于 AI 的智能笔记助手想法：\n\n核心功能：\n1. 自动整理笔记结构\n2. 智能标签推荐\n3. 相关笔记关联\n4. 知识图谱生成\n5. 问答式检索\n\n技术方案：\n- 向量数据库存储\n- 大语言模型处理\n- 知识图谱可视化',
    notebook: '灵感收集',
    tags: ['创意', '产品', 'AI'],
    updatedAt: '2026-06-21 09:20',
    isFavorite: true,
    isPinned: true,
    wordCount: 167,
  },
  {
    id: 'n5',
    title: '《深度工作》读书笔记',
    content: '《深度工作》核心观点：\n\n1. 深度工作的价值\n   - 专注力是稀缺资源\n   - 深度工作产生高价值产出\n\n2. 深度工作的规则\n   - 工作要深入\n   - 拥抱无聊\n   - 远离社交媒体\n   - 摒弃浮浅\n\n3. 实践方法\n   - 固定日程\n   - 仪式感\n   - 合作协作',
    notebook: '读书心得',
    tags: ['读书', '效率', '成长'],
    updatedAt: '2026-06-20 22:00',
    isFavorite: false,
    isPinned: false,
    wordCount: 312,
  },
  {
    id: 'n6',
    title: 'TypeScript 类型体操练习',
    content: '今天练习了几个 TypeScript 高级类型：\n\n1. 条件类型\n2. 映射类型\n3. 模板字面量类型\n4. 递归类型\n\n实现了几个工具类型：\n- DeepPartial\n- DeepRequired\n- PickByType\n- OmitByType',
    notebook: '学习笔记',
    tags: ['TypeScript', '前端', '练习'],
    updatedAt: '2026-06-19 15:30',
    isFavorite: false,
    isPinned: false,
    wordCount: 145,
  },
];

const mockTags = [
  { name: '工作', count: 45 },
  { name: '学习', count: 38 },
  { name: '生活', count: 25 },
  { name: '创意', count: 18 },
  { name: '读书', count: 32 },
  { name: '技术', count: 56 },
];

export function NotesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>('n1');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  const currentNote = mockNotes.find((n) => n.id === selectedNote);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <StickyNote className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">笔记</h1>
          <Badge variant="secondary" className="ml-2">
            {mockNotes.length} 篇笔记
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索笔记..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建笔记
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建笔记</DialogTitle>
                <DialogDescription>
                  创建一篇新的笔记，支持 Markdown 格式。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">笔记标题</label>
                  <Input
                    placeholder="请输入笔记标题"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">所属笔记本</label>
                  <select className="w-full rounded-md border px-3 py-2">
                    <option value="">选择笔记本</option>
                    {mockNotebooks.map((nb) => (
                      <option key={nb.id} value={nb.id}>
                        {nb.icon} {nb.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={() => setIsCreateDialogOpen(false)}>创建</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧笔记本列表 */}
        <div className="w-56 border-r">
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">笔记本</h3>
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="space-y-1">
                {mockNotebooks.map((notebook) => (
                  <button
                    key={notebook.id}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                      selectedNotebook === notebook.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedNotebook(notebook.id)}
                  >
                    <span>{notebook.icon}</span>
                    <span className="flex-1 text-left">{notebook.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {notebook.count}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">标签</h3>
            <div className="flex flex-wrap gap-1.5">
              {mockTags.map((tag) => (
                <Badge
                  key={tag.name}
                  variant="secondary"
                  className="cursor-pointer hover:bg-accent"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* 中间笔记列表 */}
        <div className="w-72 border-r">
          <div className="border-b p-3">
            <Tabs defaultValue="all">
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1 text-xs">
                  全部
                </TabsTrigger>
                <TabsTrigger value="pinned" className="flex-1 text-xs">
                  置顶
                </TabsTrigger>
                <TabsTrigger value="favorites" className="flex-1 text-xs">
                  收藏
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="divide-y">
              {mockNotes.map((note) => (
                <div
                  key={note.id}
                  className={`cursor-pointer p-3 hover:bg-accent/50 ${
                    selectedNote === note.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedNote(note.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1">
                      {note.isPinned && (
                        <Pin className="h-3 w-3 text-primary" />
                      )}
                      {note.isFavorite && (
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 -mr-1 -mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pin className="mr-2 h-4 w-4" />
                          {note.isPinned ? '取消置顶' : '置顶'}
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Star className="mr-2 h-4 w-4" />
                          {note.isFavorite ? '取消收藏' : '添加收藏'}
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="mr-2 h-4 w-4" />
                          分享
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          导出
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h4 className="font-medium line-clamp-1">{note.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {note.content}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{note.notebook}</span>
                    <span>{note.wordCount} 字</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* 右侧笔记详情/编辑器 */}
        <div className="flex-1 overflow-hidden">
          {currentNote ? (
            <div className="flex h-full flex-col">
              {/* 笔记标题栏 */}
              <div className="border-b p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{currentNote.title}</h2>
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Folder className="h-3.5 w-3.5" />
                        {currentNote.notebook}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {currentNote.updatedAt}
                      </span>
                      <span>{currentNote.wordCount} 字</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      编辑
                    </Button>
                    <Button variant="outline" size="sm">
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      分享
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {currentNote.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      <Tag className="mr-1 h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 笔记内容 */}
              <ScrollArea className="flex-1">
                <div className="p-6">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {currentNote.content.split('\n').map((line, index) => (
                      <p key={index} className="whitespace-pre-wrap">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>选择一篇笔记查看</p>
                <p className="text-xs">或创建一篇新笔记</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
