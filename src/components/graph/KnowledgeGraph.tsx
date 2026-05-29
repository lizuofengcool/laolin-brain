"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RotateCcw, Eye, EyeOff, Filter, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  size: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  label: string;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// File type colors for graph nodes
const NODE_COLORS: Record<string, string> = {
  word: "#3b82f6",
  pdf: "#ef4444",
  image: "#22c55e",
  pptx: "#f97316",
  markdown: "#a855f7",
  txt: "#a855f7",
  other: "#6b7280",
};

const NODE_STROKE_COLORS: Record<string, string> = {
  word: "#1d4ed8",
  pdf: "#dc2626",
  image: "#16a34a",
  pptx: "#ea580c",
  markdown: "#9333ea",
  txt: "#9333ea",
  other: "#4b5563",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  word: "DOCX",
  pdf: "PDF",
  image: "图片",
  pptx: "PPTX",
  markdown: "MD",
  txt: "TXT",
  other: "其他",
};

export function KnowledgeGraphView() {
  const files = useAppStore((s) => s.files);
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; label: string; type: string } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number }>({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);

  const activeFiles = useMemo(
    () => files.filter((f) => !f.isDeleted),
    [files]
  );

  const uniqueFileTypes = useMemo(() => {
    const types = new Set(activeFiles.map((f) => f.fileType));
    return Array.from(types);
  }, [activeFiles]);

  const loadGraph = useCallback(async () => {
    if (activeFiles.length < 2) return;
    setLoading(true);
    try {
      const filesForGraph = activeFiles.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        textContent: f.textContent,
        tags: f.tags,
        fileType: f.fileType,
      }));
      const token = useAppStore.getState().token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/ai/graph", {
        method: "POST",
        headers,
        body: JSON.stringify({ files: filesForGraph }),
      });
      if (res.ok) {
        const data = await res.json();
        setGraphData({ nodes: data.nodes, edges: data.edges });
      }
    } catch (err) {
      console.error("Failed to load graph:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFiles]);

  useEffect(() => {
    if (!graphData) {
      loadGraph();
    }
  }, [loadGraph, graphData]);

  // Force simulation
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return;

    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 500;

    // Initialize node positions in a circle
    const nodes: SimNode[] = graphData.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / graphData.nodes.length;
      const radius = Math.min(width, height) * 0.3;
      return {
        ...n,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
      };
    });

    simNodesRef.current = nodes;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const maxConnections = nodes.reduce((max, n) => Math.max(max, n.size), 1);

    function tick() {
      const alpha = 0.3;
      const repulsionStrength = 2000;
      const attractionStrength = 0.005;
      const centerStrength = 0.01;
      const damping = 0.85;

      // Apply forces
      for (const node of nodes) {
        if (dragRef.current.nodeId === node.id) continue;

        // Repulsion between all nodes
        for (const other of nodes) {
          if (node.id === other.id) continue;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsionStrength / (dist * dist);
          node.vx += (dx / dist) * force * alpha;
          node.vy += (dy / dist) * force * alpha;
        }

        // Attraction along edges
        if (graphData) {
        for (const edge of graphData.edges) {
          let other: SimNode | undefined;
          if (edge.source === node.id) {
            other = nodeMap.get(edge.target);
          } else if (edge.target === node.id) {
            other = nodeMap.get(edge.source);
          }
          if (other) {
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const weight = Math.max(1, edge.weight);
            const force = attractionStrength * weight;
            node.vx += (dx / dist) * dist * force * alpha;
            node.vy += (dy / dist) * dist * force * alpha;
          }
        }
        }

        // Center gravity
        node.vx += (width / 2 - node.x) * centerStrength;
        node.vy += (height / 2 - node.y) * centerStrength;

        // Damping
        node.vx *= damping;
        node.vy *= damping;

        // Update position
        node.x += node.vx;
        node.y += node.vy;

        // Boundary constraints
        const margin = 40;
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
      }
    }

    let iterations = 0;
    const maxIterations = 200;

    function animate() {
      if (iterations < maxIterations) {
        tick();
        iterations++;
        if (svgRef.current) {
          const simNodes = simNodesRef.current;
          const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

          // Update circles
          simNodes.forEach((node) => {
            const circle = svgRef.current?.querySelector(`circle[data-id="${node.id}"]`);
            if (circle) {
              circle.setAttribute("cx", String(node.x));
              circle.setAttribute("cy", String(node.y));
            }
            // Update labels
            const label = svgRef.current?.querySelector(`text[data-label-id="${node.id}"]`);
            if (label) {
              label.setAttribute("x", String(node.x));
              label.setAttribute("y", String(node.y + getNodeRadius(node) + 14));
            }
          });

          // Update edges
          graphData?.edges.forEach((edge, idx) => {
            const line = svgRef.current?.querySelector(`line[data-edge-idx="${idx}"]`);
            if (line) {
              const src = nodeMap.get(edge.source);
              const tgt = nodeMap.get(edge.target);
              if (src && tgt) {
                line.setAttribute("x1", String(src.x));
                line.setAttribute("y1", String(src.y));
                line.setAttribute("x2", String(tgt.x));
                line.setAttribute("y2", String(tgt.y));
              }
            }
          });
        }
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [graphData]);

  function getNodeRadius(node: GraphNode): number {
    if (!graphData) return 10;
    const minR = 8;
    const maxR = 24;
    const maxConn = graphData.nodes.reduce((max, n) => Math.max(max, n.size), 1);
    const normalized = node.size / maxConn;
    return minR + normalized * (maxR - minR);
  }

  // Filter graph
  const filteredData = useMemo(() => {
    if (!graphData) return null;
    if (!filterType) return graphData;

    const filteredNodes = graphData.nodes.filter((n) => n.type === filterType);
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graphData.edges.filter(
      (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphData, filterType]);

  // Node click -> navigate to file preview
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const file = activeFiles.find((f) => f.id === nodeId);
      if (file) {
        router.push("/files");
      }
    },
    [activeFiles, router]
  );

  // Mouse wheel zoom - non-passive listener to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setViewTransform((prev) => ({
        ...prev,
        scale: Math.max(0.3, Math.min(3, prev.scale * delta)),
      }));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Mouse down for drag or pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const target = e.target as SVGElement;
      if (target.tagName === "circle") {
        const nodeId = target.getAttribute("data-id");
        if (nodeId) {
          dragRef.current = {
            nodeId,
            offsetX: 0,
            offsetY: 0,
          };
        }
      } else {
        isPanningRef.current = true;
        panRef.current = {
          startX: e.clientX - viewTransform.x,
          startY: e.clientY - viewTransform.y,
          panX: viewTransform.x,
          panY: viewTransform.y,
        };
      }
    },
    [viewTransform]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (dragRef.current.nodeId) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale;
          const y = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale;
          const node = simNodesRef.current.find((n) => n.id === dragRef.current.nodeId);
          if (node) {
            node.x = x;
            node.y = y;
            node.vx = 0;
            node.vy = 0;
            // Directly update DOM
            const circle = svgRef.current?.querySelector(`circle[data-id="${node.id}"]`);
            if (circle) {
              circle.setAttribute("cx", String(x));
              circle.setAttribute("cy", String(y));
            }
            const label = svgRef.current?.querySelector(`text[data-label-id="${node.id}"]`);
            if (label) {
              label.setAttribute("x", String(x));
              label.setAttribute("y", String(y + getNodeRadius(node) + 14));
            }
            // Update edges
            const nodeMap = new Map(simNodesRef.current.map((n) => [n.id, n]));
            graphData?.edges.forEach((edge, idx) => {
              if (edge.source === node.id || edge.target === node.id) {
                const line = svgRef.current?.querySelector(`line[data-edge-idx="${idx}"]`);
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (line && src && tgt) {
                  line.setAttribute("x1", String(src.x));
                  line.setAttribute("y1", String(src.y));
                  line.setAttribute("x2", String(tgt.x));
                  line.setAttribute("y2", String(tgt.y));
                }
              }
            });
          }
        }
      } else if (isPanningRef.current) {
        setViewTransform((prev) => ({
          ...prev,
          x: e.clientX - panRef.current.startX,
          y: e.clientY - panRef.current.startY,
        }));
      }
    },
    [viewTransform, graphData]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
    isPanningRef.current = false;
  }, []);

  const resetView = useCallback(() => {
    setViewTransform({ x: 0, y: 0, scale: 1 });
    setFilterType(null);
  }, []);

  if (activeFiles.length < 2) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">知识图谱</h2>
            <p className="text-sm text-muted-foreground">可视化文件之间的关系</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Network className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">至少需要 2 个文件才能生成知识图谱</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">知识图谱</h2>
            <p className="text-sm text-muted-foreground">
              {graphData
                ? `${graphData.nodes.length} 个节点 · ${graphData.edges.length} 条关系`
                : `${activeFiles.length} 个文件`}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by type */}
          {uniqueFileTypes.length > 1 && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 px-2 text-xs rounded-md", !filterType && "bg-background shadow-sm font-medium")}
                onClick={() => setFilterType(null)}
              >
                <Filter className="h-3 w-3 mr-1" />
                全部
              </Button>
              {uniqueFileTypes.map((t) => (
                <Button
                  key={t}
                  variant="ghost"
                  size="sm"
                  className={cn("h-7 px-2 text-xs rounded-md", filterType === t && "bg-background shadow-sm font-medium")}
                  onClick={() => setFilterType(filterType === t ? null : t)}
                >
                  {FILE_TYPE_LABELS[t] || t}
                </Button>
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={() => setShowLabels(!showLabels)}>
            {showLabels ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showLabels ? "隐藏标签" : "显示标签"}
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={resetView}>
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={loadGraph} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
            重新生成
          </Button>
        </div>
      </div>

      {/* Graph */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-lg"
            style={{ minHeight: 500, height: "calc(100vh - 280px)", maxHeight: 700 }}
          >
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">正在分析文件关系...</p>
              </div>
            ) : filteredData && filteredData.nodes.length > 0 ? (
              <svg
                ref={svgRef}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
                  {/* Edges */}
                  {filteredData.edges.map((edge, idx) => {
                    const src = simNodesRef.current.find((n) => n.id === edge.source);
                    const tgt = simNodesRef.current.find((n) => n.id === edge.target);
                    if (!src || !tgt) return null;
                    const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target;
                    return (
                      <line
                        key={`edge-${idx}`}
                        data-edge-idx={idx}
                        x1={src.x}
                        y1={src.y}
                        x2={tgt.x}
                        y2={tgt.y}
                        stroke={isHighlighted ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.2)"}
                        strokeWidth={Math.max(1, edge.weight * 0.8)}
                        strokeOpacity={isHighlighted ? 0.8 : 0.4}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {filteredData.nodes.map((node) => {
                    const simNode = simNodesRef.current.find((n) => n.id === node.id);
                    if (!simNode) return null;
                    const radius = getNodeRadius(node);
                    const color = NODE_COLORS[node.type] || NODE_COLORS.other;
                    const stroke = NODE_STROKE_COLORS[node.type] || NODE_STROKE_COLORS.other;
                    const isHovered = hoveredNode === node.id;
                    const connCount = graphData?.edges.filter(
                      (e) => e.source === node.id || e.target === node.id
                    ).length || 0;

                    return (
                      <g key={node.id}>
                        {/* Invisible larger hit area */}
                        <circle
                          cx={simNode.x}
                          cy={simNode.y}
                          r={radius + 8}
                          fill="transparent"
                          className="cursor-pointer"
                          onClick={() => handleNodeClick(node.id)}
                          onMouseEnter={(e) => {
                            setHoveredNode(node.id);
                            setTooltipInfo({
                              x: e.clientX,
                              y: e.clientY,
                              label: activeFiles.find((f) => f.id === node.id)?.fileName || node.label,
                              type: FILE_TYPE_LABELS[node.type] || node.type,
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredNode(null);
                            setTooltipInfo(null);
                          }}
                        />
                        <circle
                          data-id={node.id}
                          cx={simNode.x}
                          cy={simNode.y}
                          r={isHovered ? radius + 3 : radius}
                          fill={color}
                          stroke={stroke}
                          strokeWidth={isHovered ? 3 : 1.5}
                          className="cursor-pointer transition-all duration-150"
                          onClick={() => handleNodeClick(node.id)}
                          onMouseEnter={(e) => {
                            setHoveredNode(node.id);
                            setTooltipInfo({
                              x: e.clientX,
                              y: e.clientY,
                              label: activeFiles.find((f) => f.id === node.id)?.fileName || node.label,
                              type: FILE_TYPE_LABELS[node.type] || node.type,
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredNode(null);
                            setTooltipInfo(null);
                          }}
                        />
                        {/* Node label */}
                        {showLabels && (
                          <text
                            data-label-id={node.id}
                            x={simNode.x}
                            y={simNode.y + radius + 14}
                            textAnchor="middle"
                            className="pointer-events-none select-none"
                            fill="hsl(var(--foreground))"
                            fontSize="10"
                            fontWeight="500"
                          >
                            {node.label.length > 15 ? node.label.slice(0, 12) + "..." : node.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            ) : graphData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Network className="h-8 w-8 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">没有找到关联关系</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Network className="h-8 w-8 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">点击"重新生成"来创建知识图谱</p>
              </div>
            )}

            {/* Tooltip */}
            {tooltipInfo && (
              <div
                className="fixed z-50 bg-popover text-popover-foreground border rounded-md px-3 py-2 shadow-lg pointer-events-none text-xs"
                style={{
                  left: tooltipInfo.x + 12,
                  top: tooltipInfo.y - 8,
                }}
              >
                <p className="font-medium truncate max-w-[200px]">{tooltipInfo.label}</p>
                <p className="text-muted-foreground mt-0.5">{tooltipInfo.type}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      {graphData && graphData.nodes.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="font-medium">图例：</span>
          {Object.entries(FILE_TYPE_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-full border"
                style={{
                  backgroundColor: NODE_COLORS[type] || NODE_COLORS.other,
                  borderColor: NODE_STROKE_COLORS[type] || NODE_STROKE_COLORS.other,
                }}
              />
              <span>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-4">
            <div className="h-0.5 w-6 bg-muted-foreground/30" />
            <span>关联关系（线越粗 = 关系越强）</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeGraphView;
