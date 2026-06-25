'use client';

import { useState } from 'react';
import {
  BookOpen,
  FolderTree,
  Search,
  Plus,
  Settings,
  Star,
  Clock,
  Tag,
  FileText,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Share2,
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

// 模拟数据
const mockCategories = [
  { id: 'cat1', name: '技术文档', icon: '📚', count: 42 },
  { id: 'cat2', name: '产品设计', icon: '🎨', count: 28 },
  { id: 'cat3', name: '项目管理', icon: '📋', count: 15 },
  { id: 'cat4', name: '学习笔记', icon: '📝', count: 56 },
  { id: 'cat5', name: '行业资讯', icon: '📰', count: 23 },
];

const mockEntries = [
  {
    id: 'e1',
    title: 'Next.js 16 新特性详解',
    summary: '介绍 Next.js 16 的核心新特性，包括 React 19 支持、App Router 增强、性能优化等...',
    category: '技术文档',
    tags: ['Next.js', 'React', '前端'],
    updatedAt: '2026-06-24',
    isFavorite: true,
    views: 128,
  },
  {
    id: 'e2',
    title: '产品需求文档模板',
    summary: '标准的产品需求文档模板，包含背景、目标、用户故事、功能列表、非功能需求等章节...',
    category: '产品设计',
    tags: ['PRD', '模板', '产品'],
    updatedAt: '2026-06-23',
    isFavorite: false,
    views: 89,
  },
  {
    id: 'e3',
    title: '敏捷开发最佳实践',
    summary: '敏捷开发的最佳实践指南，包括 Scrum 流程、看板管理、迭代规划、回顾会议等...',
    category: '项目管理',
    tags: ['敏捷', 'Scrum', '项目管理'],
    updatedAt: '2026-06-22',
    isFavorite: true,
    views: 156,
  },
  {
    id: 'e4',
    title: 'TypeScript 高级类型技巧',
    summary: '深入讲解 TypeScript 的高级类型技巧，包括条件类型、映射类型、模板字面量类型等...',
    category: '技术文档',
    tags: ['TypeScript', '类型系统', '前端'],
    updatedAt: '2026-06-21',
    isFavorite: false,
    views: 203,
  },
  {
    id: 'e5',
    title: '用户体验设计原则',
    summary: '用户体验设计的核心原则，包括可用性、一致性、反馈、容错性、可访问性等...',
    category: '产品设计',
    tags: ['UX', '设计', '用户体验'],
    updatedAt: '2026-06-20',
    isFavorite: false,
    views: 167,
  },
  {
    id: 'e6',
    title: 'Python 数据分析入门',
    summary: 'Python 数据分析入门教程，涵盖 NumPy、Pandas、Matplotlib 等常用库的使用...',
    category: '学习笔记',
    tags: ['Python', '数据分析', '入门'],
    updatedAt: '2026-06-19',
    isFavorite: true,
    views: 312,
  },
];

const mockTags = [
  { name: '前端', count: 45, color: 'bg-blue-500' },
  { name: '后端', count: 32, color: 'bg-green-500' },
  { name: '产品', count: 28, color: 'bg-purple-500' },
  { name: '设计', count: 24, color: 'bg-pink-500' },
  { name: '项目管理', count: 18, color: 'bg-orange-500' },
];

export function KnowledgeBaseView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['cat1', 'cat2']));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const toggleCategory = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">知识库</h1>
          <Badge variant="secondary" className="ml-2">
            {mockEntries.length} 篇文档
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索知识库..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建文档
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建知识文档</DialogTitle>
                <DialogDescription>
                  创建一篇新的知识文档，支持 Markdown 格式。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">文档标题</label>
                  <Input placeholder="请输入文档标题" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">所属分类</label>
                  <select className="w-full rounded-md border px-3 py-2">
                    <option value="">选择分类</option>
                    {mockCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">标签</label>
                  <Input placeholder="输入标签，用逗号分隔" />
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
        {/* 左侧分类树 */}
        <div className="w-64 border-r">
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">分类目录</h3>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-1">
                {mockCategories.map((category) => (
                  <div key={category.id}>
                    <button
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                        selectedCategory === category.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => {
                        setSelectedCategory(category.id);
                        toggleCategory(category.id);
                      }}
                    >
                      {expandedCategories.has(category.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{category.icon}</span>
                      <span className="flex-1 text-left">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {category.count}
                      </Badge>
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">热门标签</h3>
            <div className="flex flex-wrap gap-2">
              {mockTags.map((tag) => (
                <Badge
                  key={tag.name}
                  variant="secondary"
                  className="cursor-pointer hover:bg-accent"
                >
                  {tag.name} ({tag.count})
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="all" className="h-full">
            <div className="border-b px-4 pt-2">
              <TabsList>
                <TabsTrigger value="all">全部文档</TabsTrigger>
                <TabsTrigger value="recent">最近编辑</TabsTrigger>
                <TabsTrigger value="favorites">我的收藏</TabsTrigger>
                <TabsTrigger value="graph">知识图谱</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockEntries.map((entry) => (
                  <Card
                    key={entry.id}
                    className="cursor-pointer transition-all hover:shadow-md"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base font-semibold line-clamp-1">
                          {entry.title}
                        </CardTitle>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 -mr-2 -mt-1"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Star className="mr-2 h-4 w-4" />
                              {entry.isFavorite ? '取消收藏' : '添加收藏'}
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
                      <CardDescription className="line-clamp-2 text-sm">
                        {entry.summary}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          <span>{entry.category}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{entry.updatedAt}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recent" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="space-y-2">
                {mockEntries.slice(0, 4).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 rounded-lg border p-3 hover:bg-accent/50"
                  >
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1">
                      <div className="font-medium">{entry.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.category} · {entry.updatedAt}
                      </div>
                    </div>
                    <Badge variant="secondary">{entry.views} 次阅读</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="favorites" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockEntries
                  .filter((e) => e.isFavorite)
                  .map((entry) => (
                    <Card key={entry.id} className="cursor-pointer hover:shadow-md">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{entry.title}</CardTitle>
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        </div>
                        <CardDescription className="line-clamp-2 text-sm">
                          {entry.summary}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="graph" className="h-[calc(100%-49px)] overflow-auto p-4">
              <Card>
                <CardHeader>
                  <CardTitle>知识图谱</CardTitle>
                  <CardDescription>
                    可视化展示知识之间的关联关系
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex h-64 items-center justify-center rounded-lg border border-dashed bg-muted/20">
                    <div className="text-center text-muted-foreground">
                      <FolderTree className="mx-auto mb-2 h-12 w-12 opacity-50" />
                      <p>知识图谱可视化</p>
                      <p className="text-xs">展示实体和关系的网络图谱</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
