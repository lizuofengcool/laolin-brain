'use client';

import { useState } from 'react';
import {
  CheckSquare,
  Search,
  Plus,
  Settings,
  Star,
  Clock,
  Tag,
  Calendar,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Check,
  Square,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Flag,
  Repeat,
  Bell,
  List,
  LayoutGrid,
  Filter,
  SortAsc,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

// 模拟数据
const mockLists = [
  { id: 'l1', name: '工作任务', icon: '💼', count: 12, completed: 8, color: 'bg-blue-500' },
  { id: 'l2', name: '个人事务', icon: '🏠', count: 8, completed: 3, color: 'bg-green-500' },
  { id: 'l3', name: '学习计划', icon: '📚', count: 15, completed: 6, color: 'bg-purple-500' },
  { id: 'l4', name: '购物清单', icon: '🛒', count: 6, completed: 2, color: 'bg-orange-500' },
];

const mockTasks = [
  {
    id: 't1',
    title: '完成项目需求文档',
    description: '整理并完善项目需求文档，提交给产品经理审核',
    list: '工作任务',
    tags: ['项目', '文档'],
    priority: 'high' as const,
    dueDate: '2026-06-26',
    isCompleted: false,
    isFavorite: true,
    hasSubtasks: true,
    subtasks: [
      { id: 'st1', title: '收集需求', completed: true },
      { id: 'st2', title: '整理功能列表', completed: true },
      { id: 'st3', title: '编写文档', completed: false },
      { id: 'st4', title: '提交审核', completed: false },
    ],
    createdAt: '2026-06-20',
  },
  {
    id: 't2',
    title: '代码审查 - 用户模块',
    description: '审查用户模块的代码，确保代码质量和安全性',
    list: '工作任务',
    tags: ['代码审查', '质量'],
    priority: 'medium' as const,
    dueDate: '2026-06-25',
    isCompleted: true,
    isFavorite: false,
    hasSubtasks: false,
    completedAt: '2026-06-24',
    createdAt: '2026-06-22',
  },
  {
    id: 't3',
    title: '学习 Next.js 16 新特性',
    description: '学习 Next.js 16 的新特性，包括 App Router、Server Actions 等',
    list: '学习计划',
    tags: ['学习', '前端', 'Next.js'],
    priority: 'medium' as const,
    dueDate: '2026-06-30',
    isCompleted: false,
    isFavorite: true,
    hasSubtasks: true,
    subtasks: [
      { id: 'st5', title: '阅读官方文档', completed: true },
      { id: 'st6', title: '实践项目练习', completed: false },
      { id: 'st7', title: '总结笔记', completed: false },
    ],
    createdAt: '2026-06-18',
  },
  {
    id: 't4',
    title: '超市购物',
    description: '周末去超市采购生活用品',
    list: '购物清单',
    tags: ['生活', '购物'],
    priority: 'low' as const,
    dueDate: '2026-06-28',
    isCompleted: false,
    isFavorite: false,
    hasSubtasks: true,
    subtasks: [
      { id: 'st8', title: '牛奶', completed: false },
      { id: 'st9', title: '面包', completed: true },
      { id: 'st10', title: '鸡蛋', completed: false },
      { id: 'st11', title: '水果', completed: false },
      { id: 'st12', title: '蔬菜', completed: false },
    ],
    createdAt: '2026-06-23',
  },
  {
    id: 't5',
    title: '健身房锻炼',
    description: '每周三次健身房锻炼，保持身体健康',
    list: '个人事务',
    tags: ['健康', '运动'],
    priority: 'medium' as const,
    dueDate: '',
    isCompleted: false,
    isFavorite: false,
    hasSubtasks: false,
    isRecurring: true,
    repeatType: 'weekly',
    createdAt: '2026-06-01',
  },
  {
    id: 't6',
    title: '整理工作邮件',
    description: '清理和整理工作邮箱，归档重要邮件',
    list: '工作任务',
    tags: ['效率', '整理'],
    priority: 'low' as const,
    dueDate: '2026-06-27',
    isCompleted: false,
    isFavorite: false,
    hasSubtasks: false,
    createdAt: '2026-06-24',
  },
];

const priorityColors = {
  high: 'text-red-500 bg-red-50 dark:bg-red-950/30',
  medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30',
  low: 'text-green-600 bg-green-50 dark:bg-green-950/30',
};

const priorityLabels = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

export function TodosView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set(['t1', 't3']));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);

  const toggleTaskExpand = (id: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTasks(newExpanded);
  };

  // 统计数据
  const totalTasks = mockTasks.length;
  const completedTasks = mockTasks.filter((t) => t.isCompleted).length;
  const completionRate = Math.round((completedTasks / totalTasks) * 100);
  const todayTasks = mockTasks.filter((t) => t.dueDate === '2026-06-25').length;
  const overdueTasks = mockTasks.filter(
    (t) => t.dueDate && t.dueDate < '2026-06-25' && !t.isCompleted
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">待办事项</h1>
          <Badge variant="secondary" className="ml-2">
            {completedTasks}/{totalTasks} 已完成
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterPriority(null)}>
                全部优先级
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('high')}>
                <span className="mr-2 h-2 w-2 rounded-full bg-red-500" />
                高优先级
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('medium')}>
                <span className="mr-2 h-2 w-2 rounded-full bg-yellow-500" />
                中优先级
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterPriority('low')}>
                <span className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                低优先级
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-r-none ${viewMode === 'list' ? 'bg-accent' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-l-none ${viewMode === 'board' ? 'bg-accent' : ''}`}
              onClick={() => setViewMode('board')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建任务
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建任务</DialogTitle>
                <DialogDescription>
                  创建一个新的待办任务
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">任务标题</label>
                  <Input placeholder="请输入任务标题" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">任务描述</label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="任务描述（可选）"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">所属列表</label>
                    <select className="w-full rounded-md border px-3 py-2">
                      {mockLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.icon} {list.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">优先级</label>
                    <select className="w-full rounded-md border px-3 py-2">
                      <option value="high">高优先级</option>
                      <option value="medium">中优先级</option>
                      <option value="low">低优先级</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">截止日期</label>
                  <Input type="date" />
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

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 border-b p-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">完成率</div>
            <div className="mt-1 text-2xl font-bold">{completionRate}%</div>
            <Progress value={completionRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">今日任务</div>
            <div className="mt-1 text-2xl font-bold">{todayTasks}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              需要今天完成
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">已逾期</div>
            <div className="mt-1 text-2xl font-bold text-red-500">{overdueTasks}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              需要尽快处理
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">本周完成</div>
            <div className="mt-1 text-2xl font-bold text-green-600">{completedTasks}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              继续保持！
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧任务列表 */}
        <div className="w-56 border-r">
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">任务列表</h3>
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="space-y-1">
                {mockLists.map((list) => (
                  <button
                    key={list.id}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                      selectedList === list.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedList(list.id)}
                  >
                    <span>{list.icon}</span>
                    <span className="flex-1 text-left">{list.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {list.completed}/{list.count}
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
              <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                工作
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                学习
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                生活
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                健康
              </Badge>
              <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                项目
              </Badge>
            </div>
          </div>
        </div>

        {/* 主任务区 */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="all" className="h-full">
            <div className="border-b px-4 pt-2">
              <TabsList>
                <TabsTrigger value="all">全部任务</TabsTrigger>
                <TabsTrigger value="today">今日任务</TabsTrigger>
                <TabsTrigger value="upcoming">即将到来</TabsTrigger>
                <TabsTrigger value="completed">已完成</TabsTrigger>
                <TabsTrigger value="favorites">收藏</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="space-y-2">
                {mockTasks.map((task) => {
                  const isExpanded = expandedTasks.has(task.id);
                  const subtaskCompleted = task.subtasks?.filter((s) => s.completed).length || 0;
                  const subtaskTotal = task.subtasks?.length || 0;

                  return (
                    <Card
                      key={task.id}
                      className={`transition-all ${
                        task.isCompleted ? 'opacity-60' : ''
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={task.isCompleted}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4
                                  className={`font-medium ${
                                    task.isCompleted ? 'line-through' : ''
                                  }`}
                                >
                                  {task.title}
                                </h4>
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                                  {task.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {task.isFavorite && (
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                )}
                                {task.isRecurring && (
                                  <Repeat className="h-4 w-4 text-blue-500" />
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
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
                                      {task.isFavorite ? '取消收藏' : '添加收藏'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Bell className="mr-2 h-4 w-4" />
                                      设置提醒
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive">
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      删除
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center gap-3 text-xs">
                              <Badge
                                variant="secondary"
                                className={`${priorityColors[task.priority]} border-0`}
                              >
                                <Flag className="mr-1 h-3 w-3" />
                                {priorityLabels[task.priority]}
                              </Badge>
                              {task.dueDate && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {task.dueDate}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                {task.list}
                              </span>
                              {task.hasSubtasks && (
                                <span className="text-muted-foreground">
                                  {subtaskCompleted}/{subtaskTotal} 子任务
                                </span>
                              )}
                            </div>

                            {task.tags && task.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {task.tags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {/* 子任务 */}
                            {task.hasSubtasks && task.subtasks && (
                              <div className="mt-3">
                                <button
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => toggleTaskExpand(task.id)}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3" />
                                  ) : (
                                    <ChevronDownIcon className="h-3 w-3" />
                                  )}
                                  子任务 ({subtaskCompleted}/{subtaskTotal})
                                </button>
                                {isExpanded && (
                                  <div className="mt-2 space-y-1.5 pl-4">
                                    {task.subtasks.map((subtask) => (
                                      <div
                                        key={subtask.id}
                                        className="flex items-center gap-2 text-sm"
                                      >
                                        <Checkbox
                                          checked={subtask.completed}
                                          className="h-3.5 w-3.5"
                                        />
                                        <span
                                          className={
                                            subtask.completed
                                              ? 'line-through text-muted-foreground'
                                              : ''
                                          }
                                        >
                                          {subtask.title}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="today" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="space-y-2">
                {mockTasks
                  .filter((t) => t.dueDate === '2026-06-25')
                  .map((task) => (
                    <Card key={task.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Checkbox checked={task.isCompleted} />
                          <div className="flex-1">
                            <h4 className="font-medium">{task.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {task.list}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="completed" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="space-y-2">
                {mockTasks
                  .filter((t) => t.isCompleted)
                  .map((task) => (
                    <Card key={task.id} className="opacity-60">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Checkbox checked={true} />
                          <div className="flex-1">
                            <h4 className="font-medium line-through">
                              {task.title}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              完成于 {task.completedAt}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="favorites" className="h-[calc(100%-49px)] overflow-auto p-4">
              <div className="space-y-2">
                {mockTasks
                  .filter((t) => t.isFavorite)
                  .map((task) => (
                    <Card key={task.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                          <div className="flex-1">
                            <h4 className="font-medium">{task.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {task.list} · {priorityLabels[task.priority]}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
