"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ==================== 类型定义 ====================

export type FlowNodeType = "start" | "end" | "process" | "decision" | "input" | "output" | "comment";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
}

export interface FlowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface FlowchartProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  editable?: boolean;
  initialNodes?: FlowNode[];
  initialEdges?: FlowEdge[];
}

// ==================== 节点类型配置 ====================

const NODE_TYPES: { type: FlowNodeType; label: string; icon: string; defaultColor: string }[] = [
  { type: "start", label: "开始", icon: "▶", defaultColor: "#22c55e" },
  { type: "end", label: "结束", icon: "■", defaultColor: "#ef4444" },
  { type: "process", label: "过程", icon: "▭", defaultColor: "#3b82f6" },
  { type: "decision", label: "判断", icon: "◇", defaultColor: "#f97316" },
  { type: "input", label: "输入", icon: "📥", defaultColor: "#8b5cf6" },
  { type: "output", label: "输出", icon: "📤", defaultColor: "#06b6d4" },
  { type: "comment", label: "注释", icon: "💬", defaultColor: "#6b7280" },
];

// ==================== 主组件 ====================

export function Flowchart({
  width = "100%",
  height = "600px",
  className = "",
  editable = true,
  initialNodes,
  initialEdges,
}: FlowchartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 节点和连线
  const [nodes, setNodes] = useState<FlowNode[]>(
    initialNodes || [
      { id: "n1", type: "start", x: 300, y: 50, width: 100, height: 50, text: "开始" },
      { id: "n2", type: "process", x: 280, y: 150, width: 140, height: 60, text: "处理数据" },
      { id: "n3", type: "decision", x: 280, y: 260, width: 120, height: 80, text: "判断条件" },
      { id: "n4", type: "process", x: 100, y: 380, width: 120, height: 60, text: "分支A" },
      { id: "n5", type: "process", x: 440, y: 380, width: 120, height: 60, text: "分支B" },
      { id: "n6", type: "end", x: 300, y: 490, width: 100, height: 50, text: "结束" },
    ]
  );
  const [edges, setEdges] = useState<FlowEdge[]>(
    initialEdges || [
      { id: "e1", sourceId: "n1", targetId: "n2" },
      { id: "e2", sourceId: "n2", targetId: "n3" },
      { id: "e3", sourceId: "n3", targetId: "n4", label: "是" },
      { id: "e4", sourceId: "n3", targetId: "n5", label: "否" },
      { id: "e5", sourceId: "n4", targetId: "n6" },
      { id: "e6", sourceId: "n5", targetId: "n6" },
    ]
  );

  // 选中状态
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 视图
  const [scale, setScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);

  // 历史记录
  const [history, setHistory] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 连线模式
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectStart, setConnectStart] = useState<string | null>(null);
  const [connectEnd, setConnectEnd] = useState({ x: 0, y: 0 });

  // ==================== 历史记录 ====================

  const saveHistory = useCallback(
    (newNodes: FlowNode[], newEdges: FlowEdge[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({
        nodes: JSON.parse(JSON.stringify(newNodes)),
        edges: JSON.parse(JSON.stringify(newEdges)),
      });
      if (newHistory.length > 50) {
        newHistory.shift();
      }
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex]
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(JSON.parse(JSON.stringify(history[newIndex].nodes)));
      setEdges(JSON.parse(JSON.stringify(history[newIndex].edges)));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(JSON.parse(JSON.stringify(history[newIndex].nodes)));
      setEdges(JSON.parse(JSON.stringify(history[newIndex].edges)));
    }
  }, [history, historyIndex]);

  // ==================== 节点操作 ====================

  const addNode = useCallback(
    (type: FlowNodeType) => {
      const nodeConfig = NODE_TYPES.find((n) => n.type === type);
      if (!nodeConfig) return;

      const newNode: FlowNode = {
        id: `n${Date.now()}`,
        type,
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        width: type === "decision" ? 120 : type === "start" || type === "end" ? 100 : 140,
        height: type === "decision" ? 80 : type === "start" || type === "end" ? 50 : 60,
        text: nodeConfig.label,
        color: nodeConfig.defaultColor,
      };

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setSelectedNodeId(newNode.id);
      saveHistory(newNodes, edges);
    },
    [nodes, edges, saveHistory]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const newNodes = nodes.filter((n) => n.id !== nodeId);
      const newEdges = edges.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId);
      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNodeId(null);
      saveHistory(newNodes, newEdges);
    },
    [nodes, edges, saveHistory]
  );

  const updateNode = useCallback(
    (nodeId: string, updates: Partial<FlowNode>) => {
      const newNodes = nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n));
      setNodes(newNodes);
    },
    [nodes]
  );

  const updateNodeAndSave = useCallback(
    (nodeId: string, updates: Partial<FlowNode>) => {
      const newNodes = nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n));
      setNodes(newNodes);
      saveHistory(newNodes, edges);
    },
    [nodes, edges, saveHistory]
  );

  // ==================== 连线操作 ====================

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const newEdges = edges.filter((e) => e.id !== edgeId);
      setEdges(newEdges);
      setSelectedEdgeId(null);
      saveHistory(nodes, newEdges);
    },
    [nodes, edges, saveHistory]
  );

  // ==================== 鼠标事件 ====================

  const getSvgPoint = useCallback(
    (e: React.MouseEvent): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };

      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - viewOffset.x) / scale,
        y: (e.clientY - rect.top - viewOffset.y) / scale,
      };
    },
    [scale, viewOffset]
  );

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (!editable) return;
      e.stopPropagation();

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const point = getSvgPoint(e);

      if (isConnecting && connectStart) {
        // 完成连线
        if (connectStart !== nodeId) {
          const newEdge: FlowEdge = {
            id: `e${Date.now()}`,
            sourceId: connectStart,
            targetId: nodeId,
          };
          const newEdges = [...edges, newEdge];
          setEdges(newEdges);
          saveHistory(nodes, newEdges);
        }
        setIsConnecting(false);
        setConnectStart(null);
        return;
      }

      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setIsDragging(true);
      setDragOffset({
        x: point.x - node.x,
        y: point.y - node.y,
      });
    },
    [editable, nodes, edges, isConnecting, connectStart, getSvgPoint, saveHistory]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const point = getSvgPoint(e);

      if (isDragging && selectedNodeId) {
        updateNode(selectedNodeId, {
          x: point.x - dragOffset.x,
          y: point.y - dragOffset.y,
        });
      }

      if (isPanning) {
        setViewOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }

      if (isConnecting) {
        setConnectEnd(point);
      }
    },
    [isDragging, selectedNodeId, dragOffset, isPanning, panStart, isConnecting, getSvgPoint, updateNode]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && selectedNodeId) {
      saveHistory(nodes, edges);
    }
    setIsDragging(false);
    setIsPanning(false);
  }, [isDragging, selectedNodeId, nodes, edges, saveHistory]);

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        // 中键或Alt+左键：平移
        setIsPanning(true);
        setPanStart({
          x: e.clientX - viewOffset.x,
          y: e.clientY - viewOffset.y,
        });
        return;
      }

      if (isConnecting) {
        setIsConnecting(false);
        setConnectStart(null);
        return;
      }

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    },
    [viewOffset, isConnecting]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, scale * delta));
      setScale(newScale);
    },
    [scale]
  );

  // ==================== 连线模式 ====================

  const startConnecting = useCallback(
    (nodeId: string) => {
      setIsConnecting(true);
      setConnectStart(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setConnectEnd({ x: node.x + node.width / 2, y: node.y + node.height });
      }
    },
    [nodes]
  );

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        }
        if (selectedEdgeId) {
          e.preventDefault();
          deleteEdge(selectedEdgeId);
        }
      }

      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setIsConnecting(false);
        setConnectStart(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedNodeId, selectedEdgeId, deleteNode, deleteEdge]);

  // ==================== 初始化 ====================

  useEffect(() => {
    if (history.length === 0) {
      setHistory([{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
      setHistoryIndex(0);
    }
  }, []);

  // ==================== 节点渲染 ====================

  const renderNode = (node: FlowNode) => {
    const isSelected = selectedNodeId === node.id;
    const nodeConfig = NODE_TYPES.find((n) => n.type === node.type);
    const color = node.color || nodeConfig?.defaultColor || "#3b82f6";

    let shapeElement: React.ReactNode = null;

    switch (node.type) {
      case "start":
      case "end":
        shapeElement = (
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={node.height / 2}
            ry={node.height / 2}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
          />
        );
        break;
      case "process":
        shapeElement = (
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={6}
            ry={6}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
          />
        );
        break;
      case "decision":
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        shapeElement = (
          <polygon
            points={`${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
          />
        );
        break;
      case "input":
      case "output":
        shapeElement = (
          <polygon
            points={`${node.x + 15},${node.y} ${node.x + node.width},${node.y} ${node.x + node.width - 15},${node.y + node.height} ${node.x},${node.y + node.height}`}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
          />
        );
        break;
      case "comment":
        shapeElement = (
          <>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={6}
              ry={6}
              fill={color}
              fillOpacity={0.1}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="5,3"
            />
          </>
        );
        break;
    }

    return (
      <g
        key={node.id}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
        className={`cursor-move ${isSelected ? "drop-shadow-lg" : ""}`}
      >
        {isSelected && (
          <rect
            x={node.x - 4}
            y={node.y - 4}
            width={node.width + 8}
            height={node.height + 8}
            rx={10}
            ry={10}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="4,2"
          />
        )}

        {shapeElement}

        <text
          x={node.x + node.width / 2}
          y={node.y + node.height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={13}
          fill="#374151"
          className="select-none pointer-events-none"
        >
          {node.text}
        </text>

        {/* 连接点 */}
        {isSelected && editable && (
          <>
            <circle
              cx={node.x + node.width / 2}
              cy={node.y}
              r={5}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
              className="cursor-crosshair"
              onMouseDown={(e) => {
                e.stopPropagation();
                startConnecting(node.id);
              }}
            />
            <circle
              cx={node.x + node.width / 2}
              cy={node.y + node.height}
              r={5}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
              className="cursor-crosshair"
              onMouseDown={(e) => {
                e.stopPropagation();
                startConnecting(node.id);
              }}
            />
            <circle
              cx={node.x}
              cy={node.y + node.height / 2}
              r={5}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
              className="cursor-crosshair"
              onMouseDown={(e) => {
                e.stopPropagation();
                startConnecting(node.id);
              }}
            />
            <circle
              cx={node.x + node.width}
              cy={node.y + node.height / 2}
              r={5}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={2}
              className="cursor-crosshair"
              onMouseDown={(e) => {
                e.stopPropagation();
                startConnecting(node.id);
              }}
            />
          </>
        )}
      </g>
    );
  };

  // ==================== 连线渲染 ====================

  const renderEdge = (edge: FlowEdge) => {
    const source = nodes.find((n) => n.id === edge.sourceId);
    const target = nodes.find((n) => n.id === edge.targetId);
    if (!source || !target) return null;

    const isSelected = selectedEdgeId === edge.id;

    const sx = source.x + source.width / 2;
    const sy = source.y + source.height;
    const tx = target.x + target.width / 2;
    const ty = target.y;

    const midY = (sy + ty) / 2;

    const pathD = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

    return (
      <g key={edge.id}>
        <path
          d={pathD}
          fill="none"
          stroke={isSelected ? "#3b82f6" : "#6b7280"}
          strokeWidth={isSelected ? 2.5 : 1.5}
          markerEnd="url(#arrowhead)"
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
        />

        {edge.label && (
          <text
            x={(sx + tx) / 2}
            y={midY - 5}
            textAnchor="middle"
            fontSize={11}
            fill="#6b7280"
            className="select-none pointer-events-none"
          >
            {edge.label}
          </text>
        )}
      </g>
    );
  };

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
            a.download = "flowchart.png";
            a.click();
          }
        }, "image/png");
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  // ==================== 重置视图 ====================

  const resetView = useCallback(() => {
    setScale(1);
    setViewOffset({ x: 0, y: 0 });
  }, []);

  // ==================== 渲染 ====================

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
        {/* 左侧：添加节点 */}
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.type}
              onClick={() => addNode(nt.type)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
              title={`添加${nt.label}`}
            >
              {nt.icon}
            </button>
          ))}

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-40"
            title="撤销"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-40"
            title="重做"
          >
            ↷
          </button>
        </div>

        {/* 右侧：视图和操作 */}
        <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setScale(Math.max(0.2, scale * 0.9))}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="缩小"
          >
            −
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(Math.min(3, scale * 1.1))}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="放大"
          >
            +
          </button>
          <button
            onClick={resetView}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="重置视图"
          >
            ⌂
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded ${
              showGrid
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="网格"
          >
            ⊞
          </button>

          <button
            onClick={exportImage}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="导出图片"
          >
            📷
          </button>
        </div>
      </div>

      {/* SVG画布 */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
        </defs>

        <g transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${scale})`}>
          {/* 网格 */}
          {showGrid && (
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          )}
          {showGrid && <rect width="5000" height="5000" fill="url(#grid)" />}

          {/* 连线 */}
          {edges.map(renderEdge)}

          {/* 正在绘制的连线 */}
          {isConnecting && connectStart && (() => {
            const source = nodes.find((n) => n.id === connectStart);
            if (!source) return null;
            const sx = source.x + source.width / 2;
            const sy = source.y + source.height / 2;
            return (
              <line
                x1={sx}
                y1={sy}
                x2={connectEnd.x}
                y2={connectEnd.y}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5,3"
              />
            );
          })()}

          {/* 节点 */}
          {nodes.map(renderNode)}
        </g>
      </svg>

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-3 text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-2 py-1 rounded">
        {nodes.length} 个节点 · {edges.length} 条连线 · 滚轮缩放 · Alt+拖拽平移
      </div>

      {/* 选中节点属性面板 */}
      {selectedNodeId && editable && (() => {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (!node) return null;
        return (
          <div className="absolute bottom-3 right-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700 w-56">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">节点属性</div>
            <input
              type="text"
              value={node.text}
              onChange={(e) => updateNodeAndSave(node.id, { text: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 mb-2"
              placeholder="节点文字"
            />
            <button
              onClick={() => deleteNode(node.id)}
              className="w-full px-2 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              删除节点
            </button>
          </div>
        );
      })()}
    </div>
  );
}

export default Flowchart;
