'use client';

import { useState } from 'react';
import {
  Calendar,
  Search,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Edit,
  Trash2,
  Clock,
  MapPin,
  Bell,
  Repeat,
  Users,
  Tag,
  List,
  LayoutGrid,
  CalendarDays,
  CalendarRange,
  Sun,
  Moon,
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
import { Switch } from '@/components/ui/switch';

// 生成当前月份的日期
const generateCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // 上个月的日期
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthLastDay - i);
    days.push({ date, isCurrentMonth: false, isToday: false });
  }

  // 当月日期
  const today = new Date();
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    days.push({ date, isCurrentMonth: true, isToday });
  }

  // 下个月的日期
  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i);
    days.push({ date, isCurrentMonth: false, isToday: false });
  }

  return days;
};

// 模拟日程数据
const mockEvents = [
  {
    id: 'e1',
    title: '项目周会',
    description: '每周项目进度回顾会议',
    date: '2026-06-25',
    startTime: '10:00',
    endTime: '11:00',
    location: '会议室A',
    color: 'bg-blue-500',
    isAllDay: false,
    isRecurring: true,
    repeatType: 'weekly',
    attendees: ['张三', '李四', '王五'],
    tags: ['工作', '会议'],
  },
  {
    id: 'e2',
    title: '代码审查 - 用户模块',
    description: '审查用户模块的代码质量',
    date: '2026-06-25',
    startTime: '14:00',
    endTime: '15:30',
    location: '线上',
    color: 'bg-green-500',
    isAllDay: false,
    isRecurring: false,
    attendees: ['开发团队'],
    tags: ['工作', '代码审查'],
  },
  {
    id: 'e3',
    title: '产品需求评审',
    description: '新功能需求评审会议',
    date: '2026-06-26',
    startTime: '09:30',
    endTime: '11:30',
    location: '大会议室',
    color: 'bg-purple-500',
    isAllDay: false,
    isRecurring: false,
    attendees: ['产品团队', '设计团队', '开发团队'],
    tags: ['工作', '产品'],
  },
  {
    id: 'e4',
    title: '健身房锻炼',
    description: '每周三次健身',
    date: '2026-06-25',
    startTime: '19:00',
    endTime: '20:30',
    location: '健身房',
    color: 'bg-orange-500',
    isAllDay: false,
    isRecurring: true,
    repeatType: 'weekly',
    attendees: [],
    tags: ['健康', '运动'],
  },
  {
    id: 'e5',
    title: '朋友聚餐',
    description: '周末和朋友聚餐',
    date: '2026-06-28',
    startTime: '18:00',
    endTime: '20:00',
    location: 'XX餐厅',
    color: 'bg-pink-500',
    isAllDay: false,
    isRecurring: false,
    attendees: ['小明', '小红', '小华'],
    tags: ['生活', '社交'],
  },
  {
    id: 'e6',
    title: '项目截止日期',
    description: '第一阶段项目交付',
    date: '2026-06-30',
    startTime: '',
    endTime: '',
    location: '',
    color: 'bg-red-500',
    isAllDay: true,
    isRecurring: false,
    attendees: [],
    tags: ['工作', '重要'],
  },
  {
    id: 'e7',
    title: '技术分享会',
    description: 'Next.js 16 新特性分享',
    date: '2026-06-27',
    startTime: '15:00',
    endTime: '16:30',
    location: '培训室',
    color: 'bg-cyan-500',
    isAllDay: false,
    isRecurring: false,
    attendees: ['技术团队'],
    tags: ['工作', '学习'],
  },
];

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 25)); // 2026年6月
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day' | 'list'>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [showDeclined, setShowDeclined] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月',
  ];

  const calendarDays = generateCalendarDays(year, month);

  // 获取某天的日程
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return mockEvents.filter((e) => e.date === dateStr);
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // 本月统计
  const monthEvents = mockEvents.filter((e) => {
    const eventDate = new Date(e.date);
    return eventDate.getMonth() === month && eventDate.getFullYear() === year;
  });

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">日历</h1>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goToToday}>
              今天
            </Button>
            <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-lg font-semibold">
              {year}年 {monthNames[month]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜索日程..." className="pl-8" />
          </div>

          <div className="flex rounded-md border">
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-r-none ${viewMode === 'day' ? 'bg-accent' : ''}`}
              onClick={() => setViewMode('day')}
            >
              日
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${viewMode === 'week' ? 'bg-accent' : ''}`}
              onClick={() => setViewMode('week')}
            >
              周
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-l-none ${viewMode === 'month' ? 'bg-accent' : ''}`}
              onClick={() => setViewMode('month')}
            >
              月
            </Button>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建日程
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建日程</DialogTitle>
                <DialogDescription>
                  创建一个新的日程安排
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">日程标题</label>
                  <Input placeholder="请输入日程标题" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始日期</label>
                    <Input type="date" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束日期</label>
                    <Input type="date" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">开始时间</label>
                    <Input type="time" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">结束时间</label>
                    <Input type="time" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">地点</label>
                  <Input placeholder="会议地点（可选）" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="日程描述（可选）"
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="all-day" />
                  <label htmlFor="all-day" className="text-sm">
                    全天日程
                  </label>
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm">显示周末</span>
                <Switch
                  checked={showWeekends}
                  onCheckedChange={setShowWeekends}
                />
              </div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm">显示已拒绝</span>
                <Switch
                  checked={showDeclined}
                  onCheckedChange={setShowDeclined}
                />
              </div>
              <DropdownMenuItem>
                <Bell className="mr-2 h-4 w-4" />
                通知设置
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CalendarRange className="mr-2 h-4 w-4" />
                日历设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏 */}
        <div className="w-64 border-r">
          {/* 迷你日历 */}
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold">我的日历</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm">工作</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">个人</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-purple-500" />
                <span className="text-sm">家庭</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-sm">健康</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* 今日日程 */}
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold">今日日程</h3>
            <div className="space-y-2">
              {getEventsForDate(new Date(2026, 5, 25)).map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border p-2 hover:bg-accent/50"
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-1 h-2 w-2 rounded-full ${event.color}`} />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{event.title}</h4>
                      {!event.isAllDay && (
                        <p className="text-xs text-muted-foreground">
                          {event.startTime} - {event.endTime}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* 本月统计 */}
          <div className="p-4">
            <h3 className="mb-2 text-sm font-semibold">本月统计</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">日程总数</span>
                <span className="font-medium">{monthEvents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">会议</span>
                <span className="font-medium">
                  {monthEvents.filter((e) => e.tags.includes('会议')).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">全天日程</span>
                <span className="font-medium">
                  {monthEvents.filter((e) => e.isAllDay).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">重复日程</span>
                <span className="font-medium">
                  {monthEvents.filter((e) => e.isRecurring).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 主日历区域 */}
        <div className="flex-1 overflow-auto p-4">
          {viewMode === 'month' && (
            <div className="h-full">
              {/* 星期标题 */}
              <div className="grid grid-cols-7 border-b">
                {weekDays.map((day, index) => (
                  <div
                    key={day}
                    className={`py-2 text-center text-sm font-medium ${
                      !showWeekends && (index === 0 || index === 6) ? 'hidden' : ''
                    } ${index === 0 || index === 6 ? 'text-muted-foreground' : ''}`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 日期格子 */}
              <div className="grid grid-cols-7 flex-1">
                {calendarDays.map((dayInfo, index) => {
                  const dayOfWeek = index % 7;
                  if (!showWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
                    return null;
                  }

                  const events = getEventsForDate(dayInfo.date);
                  const dayNum = dayInfo.date.getDate();

                  return (
                    <div
                      key={index}
                      className={`min-h-[120px] border-b border-r p-1 ${
                        !dayInfo.isCurrentMonth ? 'bg-muted/30' : ''
                      } ${dayInfo.isToday ? 'bg-primary/5' : ''}`}
                      onClick={() => setSelectedDate(dayInfo.date)}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            dayInfo.isToday
                              ? 'bg-primary text-primary-foreground'
                              : dayInfo.isCurrentMonth
                              ? ''
                              : 'text-muted-foreground'
                          }`}
                        >
                          {dayNum}
                        </span>
                        {events.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4">
                            {events.length}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 space-y-1">
                        {events.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={`truncate rounded px-1.5 py-0.5 text-xs text-white ${event.color}`}
                          >
                            {!event.isAllDay && (
                              <span className="mr-1 opacity-80">{event.startTime}</span>
                            )}
                            {event.title}
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div className="px-1.5 text-xs text-muted-foreground">
                            +{events.length - 3} 更多
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'week' && (
            <div className="text-center text-muted-foreground">
              <CalendarDays className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>周视图</p>
              <p className="text-xs">开发中...</p>
            </div>
          )}

          {viewMode === 'day' && (
            <div className="text-center text-muted-foreground">
              <Sun className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>日视图</p>
              <p className="text-xs">开发中...</p>
            </div>
          )}
        </div>
      </div>

      {/* 选中日期的日程详情弹窗 */}
      {selectedDate && (
        <Dialog
          open={!!selectedDate}
          onOpenChange={() => setSelectedDate(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedDate.toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </DialogTitle>
              <DialogDescription>
                当天共有 {getEventsForDate(selectedDate).length} 个日程
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                {getEventsForDate(selectedDate).map((event) => (
                  <Card key={event.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-3 w-3 rounded-full ${event.color}`} />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{event.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                {event.description}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" />
                                  编辑
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Repeat className="mr-2 h-4 w-4" />
                                  重复设置
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Users className="mr-2 h-4 w-4" />
                                  邀请参与者
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  删除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {!event.isAllDay && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {event.startTime} - {event.endTime}
                              </span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {event.location}
                              </span>
                            )}
                            {event.isRecurring && (
                              <span className="flex items-center gap-1">
                                <Repeat className="h-3.5 w-3.5" />
                                每周重复
                              </span>
                            )}
                          </div>

                          {event.tags && event.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {event.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  <Tag className="mr-1 h-3 w-3" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {event.attendees && event.attendees.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                参与者：{event.attendees.join('、')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {getEventsForDate(selectedDate).length === 0 && (
                  <div className="py-8 text-center text-muted-foreground">
                    <Calendar className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>当天没有日程安排</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setSelectedDate(null);
                        setIsCreateDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      添加日程
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
