"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number; // 0-100
  color?: string;
  group?: string;
  parentId?: string;
}

export interface GanttProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  editable?: boolean;
  initialTasks?: GanttTask[];
}

// ==================== 工具函数 ====================

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const diffDays = (date1: Date, date2: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// ==================== 主组件 ====================

export function GanttChart({
  width = "100%",
  height = "600px",
  className = "",
  editable = true,
  initialTasks,
}: GanttProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 默认任务数据
  const defaultTasks: GanttTask[] = useMemo(() => {
    const today = new Date();
    return [
      {
        id: "t1",
        name: "需求分析",
        startDate: today,
        endDate: addDays(today, 5),
        progress: 100,
        color: "#22c55e",
        group: "第一阶段",
      },
      {
        id: "t2",
        name: "UI设计",
        startDate: addDays(today, 3),
        endDate: addDays(today, 10),
        progress: 70,
        color: "#3b82f6",
        group: "第一阶段",
      },
      {
        id: "t3",
        name: "前端开发",
        startDate: addDays(today, 8),
        endDate: addDays(today, 20),
        progress: 40,
        color: "#8b5cf6",
        group: "第二阶段",
      },
      {
        id: "t4",
        name: "后端开发",
        startDate: addDays(today, 8),
        endDate: addDays(today, 22),
        progress: 35,
        color: "#f97316",
        group: "第二阶段",
      },
      {
        id: "t5",
        name: "测试",
        startDate: addDays(today, 18),
        endDate: addDays(today, 28),
        progress: 10,
        color: "#ef4444",
        group: "第三阶段",
      },
      {
        id: "t6",
        name: "上线部署",
        startDate: addDays(today, 26),
        endDate: addDays(today, 30),
        progress: 0,
        color: "#06b6d4",
        group: "第三阶段",
      },
    ];
  }, []);

  const [tasks, setTasks] = useState<GanttTask[]>(initialTasks || defaultTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 视图
  const [dayWidth, setDayWidth] = useState(40); // 每天的像素宽度
  const [viewOffset, setViewOffset] = useState(0); // 水平滚动偏移
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<"move" | "resize-start" | "resize-end" | "progress" | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartData, setDragStartData] = useState<{ startDate: Date; endDate: Date; progress: number } | null>(null);

  // 计算日期范围
  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      return { start: today, end: addDays(today, 30), days: 30 };
    }

    let minDate = tasks[0].startDate;
    let maxDate = tasks[0].endDate;

    tasks.forEach((task) => {
      if (task.startDate < minDate) minDate = task.startDate;
      if (task.endDate > maxDate) maxDate = task.endDate;
    });

    // 前后各留3天余量
    minDate = addDays(minDate, -3);
    maxDate = addDays(maxDate, 3);

    const days = diffDays(minDate, maxDate);

    return { start: minDate, end: maxDate, days };
  }, [tasks]);

  // 今日
  const today = useMemo(() => new Date(), []);

  // 行高
  const rowHeight = 40;
  const headerHeight = 60;
  const taskListWidth = 200;

  // ==================== 日期位置计算 ====================

  const getDateX = useCallback(
    (date: Date): number => {
      const days = diffDays(dateRange.start, date);
      return days * dayWidth;
    },
    [dateRange.start, dayWidth]
  );

  const getXDate = useCallback(
    (x: number): Date => {
      const days = Math.round(x / dayWidth);
      return addDays(dateRange.start, days);
    },
    [dateRange.start, dayWidth]
  );

  // ==================== 任务操作 ====================

  const addTask = useCallback(() => {
    const newTask: GanttTask = {
      id: `t${Date.now()}`,
      name: "新任务",
      startDate: today,
      endDate: addDays(today, 3),
      progress: 0,
      color: "#3b82f6",
    };
    setTasks([...tasks, newTask]);
    setSelectedTaskId(newTask.id);
  }, [tasks, today]);

  const deleteTask = useCallback(
    (taskId: string) => {
      setTasks(tasks.filter((t) => t.id !== taskId));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
    },
    [tasks, selectedTaskId]
  );

  const updateTask = useCallback(
    (taskId: string, updates: Partial<GanttTask>) => {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
    },
    [tasks]
  );

  // ==================== 拖拽处理 ====================

  const handleTaskMouseDown = useCallback(
    (e: React.MouseEvent, taskId: string, type: "move" | "resize-start" | "resize-end" | "progress") => {
      if (!editable) return;
      e.stopPropagation();

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      setIsDragging(true);
      setDragType(type);
      setDragTaskId(taskId);
      setDragStartX(e.clientX);
      setDragStartData({
        startDate: new Date(task.startDate),
        endDate: new Date(task.endDate),
        progress: task.progress,
      });
      setSelectedTaskId(taskId);
    },
    [editable, tasks]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragTaskId || !dragStartData || !dragType) return;

      const deltaX = e.clientX - dragStartX;
      const deltaDays = Math.round(deltaX / dayWidth);

      if (dragType === "move") {
        const newStart = addDays(dragStartData.startDate, deltaDays);
        const duration = diffDays(dragStartData.startDate, dragStartData.endDate);
        const newEnd = addDays(newStart, duration);
        updateTask(dragTaskId, { startDate: newStart, endDate: newEnd });
      } else if (dragType === "resize-start") {
        const newStart = addDays(dragStartData.startDate, deltaDays);
        if (newStart < dragStartData.endDate) {
          updateTask(dragTaskId, { startDate: newStart });
        }
      } else if (dragType === "resize-end") {
        const newEnd = addDays(dragStartData.endDate, deltaDays);
        if (newEnd > dragStartData.startDate) {
          updateTask(dragTaskId, { endDate: newEnd });
        }
      } else if (dragType === "progress") {
        const task = tasks.find((t) => t.id === dragTaskId);
        if (!task) return;

        const taskWidth = getDateX(task.endDate) - getDateX(task.startDate);
        const progressWidth = deltaX + dragStartData.progress * taskWidth / 100;
        const newProgress = Math.max(0, Math.min(100, Math.round((progressWidth / taskWidth) * 100)));
        updateTask(dragTaskId, { progress: newProgress });
      }
    },
    [isDragging, dragTaskId, dragStartData, dragType, dragStartX, dayWidth, tasks, getDateX, updateTask]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    setDragTaskId(null);
    setDragStartData(null);
  }, []);

  // ==================== 水平滚动 ====================

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // 水平滚动
        setViewOffset((prev) => prev - e.deltaX - e.deltaY);
      } else if (e.ctrlKey || e.metaKey) {
        // 缩放
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setDayWidth((prev) => Math.max(15, Math.min(100, prev * delta)));
      }
    },
    []
  );

  // ==================== 导出图片 ====================

  const exportImage = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "gantt.png";
            a.click();
          }
        }, "image/png");
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  // ==================== 渲染时间轴 ====================

  const renderTimeline = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i <= dateRange.days; i++) {
      days.push(addDays(dateRange.start, i));
    }

    return (
      <>
        {/* 月份标签 */}
        {(() => {
          const months: { label: string; x: number; width: number }[] = [];
          let currentMonth = -1;
          let monthStart = 0;

          days.forEach((day, i) => {
            const month = day.getMonth();
            if (month !== currentMonth) {
              if (currentMonth !== -1) {
                months.push({
                  label: `${days[monthStart].getFullYear()}年${currentMonth + 1}月`,
                  x: monthStart * dayWidth,
                  width: (i - monthStart) * dayWidth,
                });
              }
              currentMonth = month;
              monthStart = i;
            }
          });

          if (currentMonth !== -1 && monthStart < days.length) {
            months.push({
              label: `${days[monthStart].getFullYear()}年${currentMonth + 1}月`,
              x: monthStart * dayWidth,
              width: (days.length - monthStart) * dayWidth,
            });
          }

          return months.map((m, i) => (
            <g key={`month-${i}`}>
              <rect
                x={m.x}
                y={0}
                width={m.width}
                height={28}
                fill="#f3f4f6"
                stroke="#e5e7eb"
                strokeWidth={0.5}
              />
              <text
                x={m.x + m.width / 2}
                y={18}
                textAnchor="middle"
                fontSize={12}
                fill="#374151"
                fontWeight={500}
              >
                {m.label}
              </text>
            </g>
          ));
        })()}

        {/* 日期标签 */}
        {days.map((day, i) => (
          <g key={`day-${i}`}>
            <rect
              x={i * dayWidth}
              y={28}
              width={dayWidth}
              height={32}
              fill={isWeekend(day) ? "#f9fafb" : "#ffffff"}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <text
              x={i * dayWidth + dayWidth / 2}
              y={48}
              textAnchor="middle"
              fontSize={11}
              fill={isWeekend(day) ? "#9ca3af" : "#6b7280"}
            >
              {day.getDate()}
            </text>
            <text
              x={i * dayWidth + dayWidth / 2}
              y={58}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}
            </text>
          </g>
        ))}

        {/* 今日线 */}
        {(() => {
          const todayX = getDateX(today);
          if (todayX < 0 || todayX > dateRange.days * dayWidth) return null;
          return (
            <g>
              <line
                x1={todayX}
                y1={28}
                x2={todayX}
                y2={headerHeight + tasks.length * rowHeight}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4,2"
              />
              <rect
                x={todayX - 20}
                y={0}
                width={40}
                height={20}
                fill="#ef4444"
                rx={4}
              />
              <text
                x={todayX}
                y={14}
                textAnchor="middle"
                fontSize={10}
                fill="white"
                fontWeight={500}
              >
                今天
              </text>
            </g>
          );
        })()}
      </>
    );
  }, [dateRange, dayWidth, tasks.length, today, getDateX]);

  // ==================== 渲染任务条 ====================

  const renderTasks = useMemo(() => {
    return tasks.map((task, index) => {
      const y = headerHeight + index * rowHeight;
      const x = getDateX(task.startDate);
      const width = Math.max(10, getDateX(task.endDate) - getDateX(task.startDate));
      const isSelected = selectedTaskId === task.id;
      const color = task.color || "#3b82f6";

      return (
        <g key={task.id}>
          {/* 行背景 */}
          <rect
            x={0}
            y={y}
            width={dateRange.days * dayWidth}
            height={rowHeight}
            fill={index % 2 === 0 ? "#ffffff" : "#f9fafb"}
            stroke="#e5e7eb"
            strokeWidth={0.5}
          />

          {/* 周末背景 */}
          {Array.from({ length: dateRange.days }).map((_, i) => {
            const day = addDays(dateRange.start, i);
            if (!isWeekend(day)) return null;
            return (
              <rect
                key={`weekend-${i}`}
                x={i * dayWidth}
                y={y}
                width={dayWidth}
                height={rowHeight}
                fill="#f3f4f6"
                opacity={0.5}
              />
            );
          })}

          {/* 任务条背景 */}
          <rect
            x={x}
            y={y + 8}
            width={width}
            height={rowHeight - 16}
            rx={6}
            ry={6}
            fill={color}
            fillOpacity={0.2}
            stroke={color}
            strokeWidth={isSelected ? 2 : 1}
            className={`cursor-move ${isSelected ? "drop-shadow" : ""}`}
            onMouseDown={(e) => handleTaskMouseDown(e, task.id, "move")}
          />

          {/* 进度条 */}
          <rect
            x={x}
            y={y + 8}
            width={width * (task.progress / 100)}
            height={rowHeight - 16}
            rx={6}
            ry={6}
            fill={color}
            className="cursor-ew-resize"
            onMouseDown={(e) => handleTaskMouseDown(e, task.id, "progress")}
          />

          {/* 任务名称 */}
          <text
            x={x + 8}
            y={y + rowHeight / 2 + 4}
            fontSize={12}
            fill="#374151"
            className="select-none pointer-events-none"
          >
            {task.name}
          </text>

          {/* 进度百分比 */}
          {width > 80 && (
            <text
              x={x + width - 8}
              y={y + rowHeight / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="#6b7280"
              className="select-none pointer-events-none"
            >
              {task.progress}%
            </text>
          )}

          {/* 左侧调整手柄 */}
          {isSelected && editable && (
            <rect
              x={x - 3}
              y={y + 10}
              width={6}
              height={rowHeight - 20}
              rx={3}
              fill="#ffffff"
              stroke={color}
              strokeWidth={1.5}
              className="cursor-ew-resize"
              onMouseDown={(e) => handleTaskMouseDown(e, task.id, "resize-start")}
            />
          )}

          {/* 右侧调整手柄 */}
          {isSelected && editable && (
            <rect
              x={x + width - 3}
              y={y + 10}
              width={6}
              height={rowHeight - 20}
              rx={3}
              fill="#ffffff"
              stroke={color}
              strokeWidth={1.5}
              className="cursor-ew-resize"
              onMouseDown={(e) => handleTaskMouseDown(e, task.id, "resize-end")}
            />
          )}
        </g>
      );
    });
  }, [tasks, selectedTaskId, dateRange, dayWidth, getDateX, editable, handleTaskMouseDown]);

  // ==================== 渲染任务列表 ====================

  const renderTaskList = useMemo(() => {
    return tasks.map((task, index) => {
      const y = headerHeight + index * rowHeight;
      const isSelected = selectedTaskId === task.id;

      return (
        <div
          key={task.id}
          className={`
            flex items-center px-3 text-sm border-b border-gray-100 dark:border-gray-700
            ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-800/50"}
          `}
          style={{ height: rowHeight }}
          onClick={() => setSelectedTaskId(task.id)}
        >
          <div
            className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
            style={{ backgroundColor: task.color || "#3b82f6" }}
          />
          <span className="truncate text-gray-700 dark:text-gray-300">{task.name}</span>
        </div>
      );
    });
  }, [tasks, selectedTaskId]);

  // ==================== 渲染 ====================

  const totalWidth = dateRange.days * dayWidth;
  const totalHeight = headerHeight + tasks.length * rowHeight;

  return (
    <div
      ref={containerRef}
      className={`
        relative border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900
        ${className}
      `}
      style={{ width, height }}
    >
      {/* 工具栏 */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          <button
            onClick={addTask}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            + 添加任务
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => setDayWidth(Math.max(15, dayWidth * 0.8))}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="缩小"
          >
            −
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[36px] text-center">
            {Math.round(dayWidth)}px
          </span>
          <button
            onClick={() => setDayWidth(Math.min(100, dayWidth * 1.2))}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="放大"
          >
            +
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={exportImage}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="导出图片"
          >
            📷
          </button>
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded">
          {tasks.length} 个任务 · 拖拽调整 · Ctrl+滚轮缩放
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex h-full pt-14">
        {/* 左侧任务列表 */}
        <div
          className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden"
          style={{ width: taskListWidth }}
        >
          {/* 列表头 */}
          <div
            className="flex items-center px-3 text-sm font-medium text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700/50"
            style={{ height: headerHeight }}
          >
            任务名称
          </div>
          {/* 任务列表 */}
          <div>{renderTaskList}</div>
        </div>

        {/* 右侧甘特图 */}
        <div
          className="flex-1 overflow-auto"
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            ref={svgRef}
            width={totalWidth}
            height={totalHeight}
            className="select-none"
          >
            {/* 时间轴 */}
            {renderTimeline}

            {/* 任务 */}
            {renderTasks}
          </svg>
        </div>
      </div>

      {/* 选中任务详情 */}
      {selectedTaskId && (() => {
        const task = tasks.find((t) => t.id === selectedTaskId);
        if (!task) return null;
        return (
          <div className="absolute bottom-3 right-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 w-64">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {task.name}
            </div>
            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
              <div>开始：{formatDate(task.startDate)}</div>
              <div>结束：{formatDate(task.endDate)}</div>
              <div>工期：{diffDays(task.startDate, task.endDate)} 天</div>
              <div>进度：{task.progress}%</div>
            </div>
            {editable && (
              <button
                onClick={() => deleteTask(task.id)}
                className="mt-2 w-full px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
              >
                删除任务
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default GanttChart;
