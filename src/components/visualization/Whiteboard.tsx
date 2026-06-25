"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ==================== 类型定义 ====================

export type WhiteboardTool =
  | "pen"
  | "line"
  | "rectangle"
  | "circle"
  | "arrow"
  | "text"
  | "eraser"
  | "select";

export interface WhiteboardProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  editable?: boolean;
  onExport?: (blob: Blob) => void;
}

interface DrawPath {
  type: "path";
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: WhiteboardTool;
}

interface DrawShape {
  type: "shape";
  shape: "line" | "rectangle" | "circle" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
  fill?: string;
}

interface DrawText {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

type DrawItem = DrawPath | DrawShape | DrawText;

// ==================== 主组件 ====================

export function Whiteboard({
  width = "100%",
  height = "600px",
  className = "",
  editable = true,
  onExport,
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 工具状态
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [color, setColor] = useState("#3b82f6");
  const [lineWidth, setLineWidth] = useState(3);
  const [fillColor, setFillColor] = useState("transparent");
  const [fontSize, setFontSize] = useState(16);

  // 绘制状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentPoint, setCurrentPoint] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  // 历史记录
  const [items, setItems] = useState<DrawItem[]>([]);
  const [history, setHistory] = useState<DrawItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 文字输入
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // 视图
  const [showGrid, setShowGrid] = useState(false);
  const [bgColor, setBgColor] = useState("#ffffff");

  // 颜色预设
  const colorPresets = [
    "#000000",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#ffffff",
  ];

  // 工具列表
  const tools: { id: WhiteboardTool; icon: string; label: string }[] = [
    { id: "pen", icon: "✏️", label: "画笔" },
    { id: "line", icon: "📏", label: "直线" },
    { id: "rectangle", icon: "▭", label: "矩形" },
    { id: "circle", icon: "⭕", label: "圆形" },
    { id: "arrow", icon: "➡️", label: "箭头" },
    { id: "text", icon: "📝", label: "文字" },
    { id: "eraser", icon: "🧹", label: "橡皮擦" },
  ];

  // ==================== 历史记录 ====================

  const saveHistory = useCallback((newItems: DrawItem[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newItems)));
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setItems(JSON.parse(JSON.stringify(history[newIndex])));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setItems(JSON.parse(JSON.stringify(history[newIndex])));
    }
  }, [history, historyIndex]);

  // ==================== 绘制函数 ====================

  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ("touches" in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  const drawItem = useCallback(
    (ctx: CanvasRenderingContext2D, item: DrawItem) => {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (item.type === "path") {
        if (item.points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(item.points[0].x, item.points[0].y);

        for (let i = 1; i < item.points.length; i++) {
          ctx.lineTo(item.points[i].x, item.points[i].y);
        }

        if (item.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.lineWidth = item.size * 3;
        }

        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else if (item.type === "shape") {
        ctx.beginPath();

        switch (item.shape) {
          case "line":
            ctx.moveTo(item.x1, item.y1);
            ctx.lineTo(item.x2, item.y2);
            break;
          case "rectangle":
            ctx.rect(
              Math.min(item.x1, item.x2),
              Math.min(item.y1, item.y2),
              Math.abs(item.x2 - item.x1),
              Math.abs(item.y2 - item.y1)
            );
            break;
          case "circle":
            const rx = Math.abs(item.x2 - item.x1) / 2;
            const ry = Math.abs(item.y2 - item.y1) / 2;
            const cx = (item.x1 + item.x2) / 2;
            const cy = (item.y1 + item.y2) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            break;
          case "arrow":
            // 主线
            ctx.moveTo(item.x1, item.y1);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();

            // 箭头
            const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
            const headLen = 15;
            ctx.beginPath();
            ctx.moveTo(item.x2, item.y2);
            ctx.lineTo(
              item.x2 - headLen * Math.cos(angle - Math.PI / 6),
              item.y2 - headLen * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(item.x2, item.y2);
            ctx.lineTo(
              item.x2 - headLen * Math.cos(angle + Math.PI / 6),
              item.y2 - headLen * Math.sin(angle + Math.PI / 6)
            );
            break;
        }

        if (item.fill && item.fill !== "transparent" && item.shape !== "line" && item.shape !== "arrow") {
          ctx.fillStyle = item.fill;
          ctx.fill();
        }

        ctx.stroke();
      } else if (item.type === "text") {
        ctx.font = `${item.size}px sans-serif`;
        ctx.fillStyle = item.color;
        ctx.textBaseline = "top";
        ctx.fillText(item.text, item.x, item.y);
      }
    },
    []
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    if (showGrid) {
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 0.5;
      const gridSize = 20;

      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // 绘制所有元素
    items.forEach((item) => drawItem(ctx, item));

    // 绘制当前正在绘制的内容
    if (isDrawing) {
      if (tool === "pen" || tool === "eraser") {
        if (currentPath.length > 1) {
          const tempItem: DrawPath = {
            type: "path",
            points: currentPath,
            color,
            size: lineWidth,
            tool,
          };
          drawItem(ctx, tempItem);
        }
      } else if (tool === "line" || tool === "rectangle" || tool === "circle" || tool === "arrow") {
        const tempItem: DrawShape = {
          type: "shape",
          shape: tool,
          x1: startPoint.x,
          y1: startPoint.y,
          x2: currentPoint.x,
          y2: currentPoint.y,
          color,
          size: lineWidth,
          fill: fillColor,
        };
        drawItem(ctx, tempItem);
      }
    }
  }, [items, isDrawing, tool, currentPath, startPoint, currentPoint, color, lineWidth, fillColor, showGrid, bgColor, drawItem]);

  // ==================== 鼠标事件 ====================

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editable) return;

      const point = getCanvasPoint(e);

      if (tool === "text") {
        setTextPosition(point);
        setTextInput("");
        setTimeout(() => textInputRef.current?.focus(), 10);
        return;
      }

      setIsDrawing(true);
      setStartPoint(point);
      setCurrentPoint(point);

      if (tool === "pen" || tool === "eraser") {
        setCurrentPath([point]);
      }
    },
    [editable, tool, getCanvasPoint]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;

      const point = getCanvasPoint(e);
      setCurrentPoint(point);

      if (tool === "pen" || tool === "eraser") {
        setCurrentPath((prev) => [...prev, point]);
      }
    },
    [isDrawing, tool, getCanvasPoint]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;

    let newItem: DrawItem | null = null;

    if (tool === "pen" || tool === "eraser") {
      if (currentPath.length > 1) {
        newItem = {
          type: "path",
          points: [...currentPath],
          color,
          size: lineWidth,
          tool,
        };
      }
    } else if (tool === "line" || tool === "rectangle" || tool === "circle" || tool === "arrow") {
      if (
        Math.abs(currentPoint.x - startPoint.x) > 2 ||
        Math.abs(currentPoint.y - startPoint.y) > 2
      ) {
        newItem = {
          type: "shape",
          shape: tool,
          x1: startPoint.x,
          y1: startPoint.y,
          x2: currentPoint.x,
          y2: currentPoint.y,
          color,
          size: lineWidth,
          fill: fillColor,
        };
      }
    }

    if (newItem) {
      const newItems = [...items, newItem];
      setItems(newItems);
      saveHistory(newItems);
    }

    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, tool, currentPath, startPoint, currentPoint, color, lineWidth, fillColor, items, saveHistory]);

  // ==================== 文字输入 ====================

  const handleTextSubmit = useCallback(() => {
    if (!textPosition || !textInput.trim()) {
      setTextPosition(null);
      setTextInput("");
      return;
    }

    const newItem: DrawText = {
      type: "text",
      x: textPosition.x,
      y: textPosition.y - fontSize / 2,
      text: textInput.trim(),
      color,
      size: fontSize,
    };

    const newItems = [...items, newItem];
    setItems(newItems);
    saveHistory(newItems);

    setTextPosition(null);
    setTextInput("");
  }, [textPosition, textInput, color, fontSize, items, saveHistory]);

  // ==================== 清空和导出 ====================

  const clearCanvas = useCallback(() => {
    if (confirm("确定要清空画布吗？")) {
      const newItems: DrawItem[] = [];
      setItems(newItems);
      saveHistory(newItems);
    }
  }, [saveHistory]);

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        if (onExport) {
          onExport(blob);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "whiteboard.png";
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    }, "image/png");
  }, [onExport]);

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (textPosition) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (e.key === "Escape") {
        setTextPosition(null);
        setTextInput("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, textPosition]);

  // ==================== 初始化 ====================

  useEffect(() => {
    if (history.length === 0) {
      setHistory([[]]);
      setHistoryIndex(0);
    }
  }, []);

  // 重绘画布
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // 调整画布大小
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      redrawCanvas();
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [redrawCanvas]);

  // ==================== 渲染 ====================

  return (
    <div
      ref={containerRef}
      className={`
        relative border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden
        ${className}
      `}
      style={{ width, height }}
    >
      {/* 工具栏 */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
        {/* 左侧：工具 */}
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`
                p-2 rounded transition-colors text-lg
                ${tool === t.id
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }
              `}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            title="撤销 (Ctrl+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            title="重做 (Ctrl+Shift+Z)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>

        {/* 右侧：颜色和操作 */}
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          {/* 颜色选择 */}
          <div className="flex items-center gap-1 px-1">
            {colorPresets.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`
                  w-5 h-5 rounded-full border-2 transition-transform hover:scale-110
                  ${color === c ? "border-blue-500 scale-110" : "border-gray-200 dark:border-gray-600"}
                `}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* 线条粗细 */}
          <div className="flex items-center gap-1 px-2">
            <input
              type="range"
              min={1}
              max={30}
              value={lineWidth}
              onChange={(e) => setLineWidth(parseInt(e.target.value))}
              className="w-20 h-1 accent-blue-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[24px]">
              {lineWidth}px
            </span>
          </div>

          <div className="w-px h-6 bg-gray-200 dark:border-gray-700 mx-1" />

          {/* 网格 */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded transition-colors ${
              showGrid
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="网格"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 9h16M4 13h16M4 17h16M9 4v16M13 4v16M17 4v16" />
            </svg>
          </button>

          {/* 清空 */}
          <button
            onClick={clearCanvas}
            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            title="清空画布"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* 导出 */}
          <button
            onClick={exportImage}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="导出图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 画布 */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${editable ? "cursor-crosshair" : "cursor-default"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* 文字输入框 */}
      {textPosition && (
        <input
          ref={textInputRef}
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onBlur={handleTextSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleTextSubmit();
            }
            if (e.key === "Escape") {
              setTextPosition(null);
              setTextInput("");
            }
          }}
          className="absolute bg-transparent border-none outline-none text-base"
          style={{
            left: textPosition.x,
            top: textPosition.y - fontSize / 2,
            color,
            fontSize: `${fontSize}px`,
            minWidth: "100px",
          }}
          placeholder="输入文字..."
          autoFocus
        />
      )}

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-3 text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded">
        当前工具：{tools.find((t) => t.id === tool)?.label} · {items.length} 个元素
      </div>
    </div>
  );
}

export default Whiteboard;
