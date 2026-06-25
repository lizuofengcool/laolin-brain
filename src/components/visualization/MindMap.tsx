"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface MindMapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  parentId: string | null;
  children: string[];
  color: string;
  level: number;
}

export interface MindMapProps {
  initialData?: MindMapNode[];
  onDataChange?: (nodes: MindMapNode[]) => void;
  width?: string | number;
  height?: string | number;
  className?: string;
  editable?: boolean;
}

// ==================== 工具函数 ====================

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

const nodeColors = [
  "#3b82f6", // 蓝色
  "#22c55e", // 绿色
  "#f97316", // 橙色
  "#ec4899", // 粉色
  "#8b5cf6", // 紫色
  "#06b6d4", // 青色
  "#eab308", // 黄色
  "#ef4444", // 红色
];

const getNodeColor = (level: number): string => {
  return nodeColors[level % nodeColors.length];
};

// ==================== 主组件 ====================

export function MindMap({
  initialData,
  onDataChange,
  width = "100%",
  height = "600px",
  className = "",
  editable = true,
}: MindMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 节点数据
  const [nodes, setNodes] = useState<MindMapNode[]>(() => {
    if (initialData && initialData.length > 0) return initialData;
    // 默认数据
    const centerId = generateId();
    return [
      {
        id: centerId,
        text: "中心主题",
        x: 0,
        y: 0,
        parentId: null,
        children: [],
        color: nodeColors[0],
        level: 0,
      },
    ];
  });

  // 视图状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 编辑状态
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 历史记录
  const [history, setHistory] = useState<MindMapNode[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 保存历史
  const saveHistory = useCallback((newNodes: MindMapNode[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newNodes)));
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // 撤销
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(JSON.parse(JSON.stringify(history[newIndex])));
    }
  }, [history, historyIndex]);

  // 重做
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(JSON.parse(JSON.stringify(history[newIndex])));
    }
  }, [history, historyIndex]);

  // 更新节点
  const updateNodes = useCallback(
    (updater: (prev: MindMapNode[]) => MindMapNode[]) => {
      setNodes((prev) => {
        const newNodes = updater(prev);
        saveHistory(newNodes);
        onDataChange?.(newNodes);
        return newNodes;
      });
    },
    [saveHistory, onDataChange]
  );

  // 添加子节点
  const addChildNode = useCallback(
    (parentId: string) => {
      const parent = nodes.find((n) => n.id === parentId);
      if (!parent) return;

      const newId = generateId();
      const childCount = parent.children.length;
      const level = parent.level + 1;

      // 计算位置
      const angle = (childCount * 0.5 - 0.5) * Math.PI / 3;
      const distance = 180;
      const x = parent.x + Math.cos(angle) * distance * (parent.level === 0 ? 1 : 1);
      const y = parent.y + (childCount - (parent.children.length - 1) / 2) * 60;

      updateNodes((prev) => {
        const newNode: MindMapNode = {
          id: newId,
          text: "新节点",
          x,
          y,
          parentId,
          children: [],
          color: getNodeColor(level),
          level,
        };

        return prev.map((n) =>
          n.id === parentId ? { ...n, children: [...n.children, newId] } : n
        ).concat(newNode);
      });

      setSelectedNode(newId);
      setEditingNode(newId);
      setEditText("新节点");
    },
    [nodes, updateNodes]
  );

  // 删除节点
  const deleteNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node || node.level === 0) return; // 不能删除根节点

      // 收集所有要删除的节点（包括子节点）
      const toDelete = new Set<string>();
      const collectChildren = (id: string) => {
        toDelete.add(id);
        const n = nodes.find((x) => x.id === id);
        if (n) {
          n.children.forEach(collectChildren);
        }
      };
      collectChildren(nodeId);

      updateNodes((prev) => {
        return prev
          .filter((n) => !toDelete.has(n.id))
          .map((n) => ({
            ...n,
            children: n.children.filter((c) => !toDelete.has(c)),
          }));
      });

      setSelectedNode(null);
    },
    [nodes, updateNodes]
  );

  // 编辑节点文本
  const startEditing = useCallback((node: MindMapNode) => {
    setEditingNode(node.id);
    setEditText(node.text);
    setSelectedNode(node.id);
  }, []);

  const finishEditing = useCallback(() => {
    if (editingNode && editText.trim()) {
      updateNodes((prev) =>
        prev.map((n) =>
          n.id === editingNode ? { ...n, text: editText.trim() } : n
        )
      );
    }
    setEditingNode(null);
    setEditText("");
  }, [editingNode, editText, updateNodes]);

  // 缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, scale * delta));
      setScale(newScale);
    },
    [scale]
  );

  // 平移
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0 && !selectedNode) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    },
    [selectedNode, offset]
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
      if (isDragging && dragNode) {
        const svg = svgRef.current;
        if (!svg) return;

        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left - offset.x) / scale - dragOffset.x;
        const y = (e.clientY - rect.top - offset.y) / scale - dragOffset.y;

        updateNodes((prev) =>
          prev.map((n) => (n.id === dragNode ? { ...n, x, y } : n))
        );
      }
    },
    [isPanning, panStart, isDragging, dragNode, dragOffset, offset, scale, updateNodes]
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setDragNode(null);
  }, []);

  // 节点拖拽
  const handleNodeDragStart = useCallback(
    (e: React.MouseEvent, node: MindMapNode) => {
      e.stopPropagation();
      if (!editable) return;

      setSelectedNode(node.id);
      setIsDragging(true);
      setDragNode(node.id);

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - offset.x) / scale;
      const mouseY = (e.clientY - rect.top - offset.y) / scale;

      setDragOffset({
        x: mouseX - node.x,
        y: mouseY - node.y,
      });
    },
    [editable, offset, scale]
  );

  // 适应窗口
  const fitToView = useCallback(() => {
    if (nodes.length === 0) return;

    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y));

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const padding = 100;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const newScale = Math.min(scaleX, scaleY, 1.5);

    setScale(newScale);
    setOffset({
      x: rect.width / 2 - ((minX + maxX) / 2) * newScale,
      y: rect.height / 2 - ((minY + maxY) / 2) * newScale,
    });
  }, [nodes]);

  // 重置视图
  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // 导出图片
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
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "mindmap.png";
          a.click();
        }
      }, "image/png");

      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  // 导出JSON
  const exportJson = useCallback(() => {
    const data = JSON.stringify(nodes, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindmap.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNode) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNode) {
          e.preventDefault();
          deleteNode(selectedNode);
        }
      }

      if (e.key === "Tab" && selectedNode) {
        e.preventDefault();
        addChildNode(selectedNode);
      }

      if (e.key === "Enter" && selectedNode) {
        e.preventDefault();
        const node = nodes.find((n) => n.id === selectedNode);
        if (node) {
          startEditing(node);
        }
      }

      if (e.key === "Escape") {
        setSelectedNode(null);
        setEditingNode(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingNode, selectedNode, nodes, undo, redo, deleteNode, addChildNode, startEditing]);

  // 初始化历史
  useEffect(() => {
    if (history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(nodes))]);
      setHistoryIndex(0);
    }
  }, []);

  // 适应窗口（初始）
  useEffect(() => {
    const timer = setTimeout(() => {
      fitToView();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 获取连线
  const connections = useMemo(() => {
    const lines: { from: MindMapNode; to: MindMapNode }[] = [];
    nodes.forEach((node) => {
      if (node.parentId) {
        const parent = nodes.find((n) => n.id === node.parentId);
        if (parent) {
          lines.push({ from: parent, to: node });
        }
      }
    });
    return lines;
  }, [nodes]);

  // 计算节点尺寸
  const getNodeWidth = (node: MindMapNode): number => {
    return Math.max(80, node.text.length * 14 + 30);
  };

  const getNodeHeight = (): number => 40;

  // ==================== 渲染 ====================

  return (
    <div
      ref={containerRef}
      className={`
        relative border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden
        bg-white dark:bg-gray-900
        ${className}
      `}
      style={{ width, height }}
    >
      {/* 工具栏 */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
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
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
          <button
            onClick={() => setScale((s) => Math.min(3, s * 1.2))}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="放大"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 px-1 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.max(0.2, s * 0.8))}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="缩小"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM7 10h6" />
            </svg>
          </button>
          <button
            onClick={resetView}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="重置视图"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={fitToView}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="适应窗口"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          {editable && selectedNode && (
            <>
              <button
                onClick={() => addChildNode(selectedNode)}
                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                title="添加子节点 (Tab)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => deleteNode(selectedNode)}
                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                title="删除节点 (Delete)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
            </>
          )}
          <button
            onClick={exportImage}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="导出图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={exportJson}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="导出JSON"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* SVG画布 */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onClick={() => {
          if (!isPanning && !isDragging) {
            setSelectedNode(null);
            setEditingNode(null);
          }
        }}
      >
        <defs>
          {/* 阴影滤镜 */}
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
          {/* 连线 */}
          {connections.map(({ from, to }, i) => {
            const fromWidth = getNodeWidth(from);
            const toWidth = getNodeWidth(to);
            const fromX = from.x + (to.x > from.x ? fromWidth / 2 : -fromWidth / 2);
            const toX = to.x + (to.x > from.x ? -toWidth / 2 : toWidth / 2);
            const midX = (fromX + toX) / 2;

            return (
              <path
                key={i}
                d={`M ${fromX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${toX} ${to.y}`}
                fill="none"
                stroke={to.color}
                strokeWidth={Math.max(1, 3 - to.level * 0.5)}
                strokeOpacity={0.6}
              />
            );
          })}

          {/* 节点 */}
          {nodes.map((node) => {
            const nodeWidth = getNodeWidth(node);
            const nodeHeight = getNodeHeight();
            const isSelected = selectedNode === node.id;
            const isEditing = editingNode === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})`}
                onMouseDown={(e) => handleNodeDragStart(e, node)}
                onDoubleClick={() => editable && startEditing(node)}
                style={{ cursor: editable ? "move" : "default" }}
              >
                {/* 节点背景 */}
                <rect
                  x={0}
                  y={0}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={node.level === 0 ? 12 : 8}
                  fill={node.color}
                  fillOpacity={node.level === 0 ? 1 : 0.15}
                  stroke={node.color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter="url(#shadow)"
                />

                {/* 节点文字 */}
                {isEditing ? (
                  <foreignObject x={5} y={5} width={nodeWidth - 10} height={nodeHeight - 10}>
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={finishEditing}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          finishEditing();
                        }
                        if (e.key === "Escape") {
                          setEditingNode(null);
                          setEditText("");
                        }
                      }}
                      autoFocus
                      className="w-full h-full text-sm text-center bg-transparent outline-none border-none"
                      style={{ color: node.level === 0 ? "white" : node.color }}
                    />
                  </foreignObject>
                ) : (
                  <text
                    x={nodeWidth / 2}
                    y={nodeHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={node.level === 0 ? 14 : 13}
                    fontWeight={node.level === 0 ? 600 : 500}
                    fill={node.level === 0 ? "white" : node.color}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {node.text}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-3 text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded">
        双击编辑 · Tab添加子节点 · Delete删除 · 滚轮缩放 · 拖拽平移
      </div>

      {/* 节点统计 */}
      <div className="absolute bottom-3 right-3 text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded">
        {nodes.length} 个节点
      </div>
    </div>
  );
}

export default MindMap;
