"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftRight,
  Rows3,
  Plus,
  Minus,
  Equal,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
  className?: string;
}

type DiffType = "add" | "remove" | "unchanged";

interface DiffLine {
  type: DiffType;
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

// ─── LCS-based Diff Algorithm ────────────────────────────────────────────────

function computeLCS(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Safety limit: fall back to line-by-line comparison for large files
  // to avoid O(n*m) memory allocation that can crash the browser
  const MAX_DIFF_LINES = 5000;
  if (m > MAX_DIFF_LINES || n > MAX_DIFF_LINES) {
    const diffLines: DiffLine[] = [];
    const maxLen = Math.max(m, n);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < m ? oldLines[i] : undefined;
      const newLine = i < n ? newLines[i] : undefined;
      if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
        diffLines.push({ type: 'unchanged', content: oldLine, oldLineNum: i + 1, newLineNum: i + 1 });
      } else {
        if (oldLine !== undefined) {
          diffLines.push({ type: 'remove', content: oldLine, oldLineNum: i + 1 });
        }
        if (newLine !== undefined) {
          diffLines.push({ type: 'add', content: newLine, newLineNum: i + 1 });
        }
      }
    }
    return diffLines;
  }

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const diffLines: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffLines.unshift({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.unshift({
        type: "add",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j--;
    } else {
      diffLines.unshift({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i--;
    }
  }

  return diffLines;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DiffViewer({
  oldText,
  newText,
  oldLabel = "旧版本",
  newLabel = "新版本",
  className,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"side-by-side" | "unified">(
    "side-by-side"
  );
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Compute diff
  const diffLines = useMemo(() => {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    return computeLCS(oldLines, newLines);
  }, [oldText, newText]);

  // Stats
  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === "add").length;
    const removed = diffLines.filter((l) => l.type === "remove").length;
    const unchanged = diffLines.filter((l) => l.type === "unchanged").length;
    return { added, removed, unchanged, total: diffLines.length };
  }, [diffLines]);

  // Build side-by-side data
  const { leftLines, rightLines } = useMemo(() => {
    const left: { lineNum: number | null; content: string; type: DiffType }[] =
      [];
    const right: { lineNum: number | null; content: string; type: DiffType }[] =
      [];

    for (const line of diffLines) {
      if (line.type === "unchanged") {
        left.push({ lineNum: line.oldLineNum!, content: line.content, type: "unchanged" });
        right.push({ lineNum: line.newLineNum!, content: line.content, type: "unchanged" });
      } else if (line.type === "remove") {
        left.push({ lineNum: line.oldLineNum!, content: line.content, type: "remove" });
        right.push({ lineNum: null, content: "", type: "remove" });
      } else {
        left.push({ lineNum: null, content: "", type: "add" });
        right.push({ lineNum: line.newLineNum!, content: line.content, type: "add" });
      }
    }
    return { leftLines: left, rightLines: right };
  }, [diffLines]);

  // Synchronized scrolling
  const handleLeftScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (leftEl && rightEl) {
      rightEl.scrollTop = leftEl.scrollTop;
      rightEl.scrollLeft = leftEl.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  const handleRightScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const leftEl = leftScrollRef.current;
    const rightEl = rightScrollRef.current;
    if (leftEl && rightEl) {
      leftEl.scrollTop = rightEl.scrollTop;
      leftEl.scrollLeft = rightEl.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  // Empty state
  const isEmpty = oldText === "" && newText === "";

  if (isEmpty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex flex-col items-center justify-center py-16 text-muted-foreground",
          className
        )}
      >
        <FileText className="h-12 w-12 mb-4 opacity-20" />
        <p className="text-sm font-medium">两个版本均为空内容</p>
        <p className="text-xs mt-1">没有可对比的差异</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("flex flex-col gap-0 rounded-xl overflow-hidden border", className)}
    >
      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60 backdrop-blur-xl border-b shrink-0">
        {/* Labels */}
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant="secondary" className="font-mono text-xs shrink-0">
            {oldLabel}
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">vs</span>
          <Badge variant="outline" className="font-mono text-xs shrink-0">
            {newLabel}
          </Badge>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <Plus className="h-3 w-3" />{stats.added}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            <Minus className="h-3 w-3" />{stats.removed}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium hidden sm:inline-flex">
            <Equal className="h-3 w-3" />{stats.unchanged}
          </span>

          {/* View toggle */}
          <div className="ml-2 flex items-center bg-background/80 rounded-md border p-0.5">
            <Button
              variant={viewMode === "side-by-side" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setViewMode("side-by-side")}
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">并排</span>
            </Button>
            <Button
              variant={viewMode === "unified" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setViewMode("unified")}
            >
              <Rows3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">统一</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === "side-by-side" ? (
          <motion.div
            key="side-by-side"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-h-0"
          >
            {/* Left panel (old) */}
            <div className="w-1/2 border-r border-border/50">
              <div
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border/50"
              >
                {oldLabel}
              </div>
              <div
                ref={leftScrollRef}
                onScroll={handleLeftScroll}
                className="overflow-auto max-h-[50vh] font-mono text-[13px] leading-6"
              >
                <SideBySidePanel lines={leftLines} side="left" />
              </div>
            </div>

            {/* Right panel (new) */}
            <div className="w-1/2">
              <div
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border/50"
              >
                {newLabel}
              </div>
              <div
                ref={rightScrollRef}
                onScroll={handleRightScroll}
                className="overflow-auto max-h-[50vh] font-mono text-[13px] leading-6"
              >
                <SideBySidePanel lines={rightLines} side="right" />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="unified"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-auto max-h-[55vh] font-mono text-[13px] leading-6"
          >
            <UnifiedPanel lines={diffLines} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Side-by-side line renderer ──────────────────────────────────────────────

function SideBySidePanel({
  lines,
  side,
}: {
  lines: { lineNum: number | null; content: string; type: DiffType }[];
  side: "left" | "right";
}) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, idx) => {
          const isEmptyPlaceholder = line.lineNum === null;
          const isRemove = line.type === "remove" && side === "left";
          const isAdd = line.type === "add" && side === "right";

          return (
            <tr
              key={idx}
              className={cn(
                isEmptyPlaceholder && "opacity-30",
                isRemove && "bg-rose-500/10",
                isAdd && "bg-emerald-500/10"
              )}
            >
              {/* Line number */}
              <td className="select-none text-right pr-3 pl-3 py-0 text-muted-foreground/50 w-12 shrink-0 align-top border-r border-border/30">
                {line.lineNum ?? ""}
              </td>
              {/* Color indicator */}
              <td className="w-1 shrink-0 p-0 align-stretch">
                <div
                  className={cn(
                    "w-full h-full",
                    isRemove && "bg-rose-500",
                    isAdd && "bg-emerald-500"
                  )}
                />
              </td>
              {/* Content */}
              <td className="whitespace-pre px-3 py-0 break-all">
                <span
                  className={cn(
                    "text-foreground/90",
                    isRemove && "text-rose-600 dark:text-rose-400",
                    isAdd && "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {line.content}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Unified line renderer ───────────────────────────────────────────────────

function UnifiedPanel({ lines }: { lines: DiffLine[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {lines.map((line, idx) => {
          const isAdd = line.type === "add";
          const isRemove = line.type === "remove";

          return (
            <tr
              key={idx}
              className={cn(
                isRemove && "bg-rose-500/10",
                isAdd && "bg-emerald-500/10"
              )}
            >
              {/* Old line number */}
              <td className="select-none text-right pr-2 pl-3 py-0 text-muted-foreground/50 w-12 shrink-0 align-top border-r border-border/30">
                {line.oldLineNum ?? ""}
              </td>
              {/* New line number */}
              <td className="select-none text-right pr-2 pl-2 py-0 text-muted-foreground/50 w-12 shrink-0 align-top border-r border-border/30">
                {line.newLineNum ?? ""}
              </td>
              {/* Color indicator */}
              <td className="w-1 shrink-0 p-0 align-stretch">
                <div
                  className={cn(
                    "w-full h-full",
                    isRemove && "bg-rose-500",
                    isAdd && "bg-emerald-500"
                  )}
                />
              </td>
              {/* Content */}
              <td className="whitespace-pre px-3 py-0 break-all">
                <span
                  className={cn(
                    "text-foreground/90",
                    isRemove && "text-rose-600 dark:text-rose-400",
                    isAdd && "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {isAdd ? "+" : isRemove ? "\u2212" : " "}
                  {line.content}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Custom icon for side-by-side ────────────────────────────────────────────

function ColumnsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </svg>
  );
}
