"use client";

/**
 * TableWidget —— ReportWidget type='table' 的渲染层。
 *
 * 消费 src/lib/reports/types.ts 的 TableConfig：渲染 columns + rows，
 * 与 report-manager.buildTableCsv 的 CSV 导出走同一份数据源（rows 按
 * 列 dataIndex 取值，列 format 优先于原始值），确保"所见即所导"。
 *
 * 功能：
 * - 列渲染：title / width / align / format 与 CSV 导出语义一致
 * - 排序：列 sortable 或 config.sortable 时点击表头切换 asc/desc/无
 * - 搜索：config.searchable 时按所有列 dataIndex 字符串模糊匹配
 * - 分页：config.pagination + pageSize 时切片展示
 * - 空态：无 rows / 无 columns 分别给出明确提示
 *
 * 不负责：数据获取（rows 由调用方传入）、CSV 导出（由 report-manager 处理）。
 */
import { useMemo, useState, useCallback } from "react";
import type { TableConfig, TableColumn } from "@/lib/reports/types";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TableWidgetProps {
  config: TableConfig;
  title?: string;
  description?: string;
  className?: string;
}

type SortDirection = "asc" | "desc" | null;

interface SortState {
  columnKey: string | null;
  direction: SortDirection;
}

/**
 * 取单元格原始值（按列 dataIndex 从 row 中读取）。
 * 与 report-manager.buildTableCsv 的取值逻辑保持一致。
 */
function getRawCellValue(row: Record<string, unknown>, column: TableColumn): unknown {
  return row[column.dataIndex];
}

/**
 * 计算单元格展示文本：列 format 优先，否则取原始值的字符串形式。
 * 与 CSV 导出的 value 计算保持一致（format 优先于原始值）。
 */
function getDisplayValue(row: Record<string, unknown>, column: TableColumn): string {
  const raw = getRawCellValue(row, column);
  if (typeof column.format === "function") {
    return column.format(raw);
  }
  if (raw === null || raw === undefined) {
    return "";
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

/**
 * 比较两行的指定列用于排序。空值统一视为最小（asc 时排在最前）。
 */
function compareRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  column: TableColumn,
  direction: Exclude<SortDirection, null>,
): number {
  const av = getRawCellValue(a, column);
  const bv = getRawCellValue(b, column);
  // null / undefined 排在最前
  if (av === null || av === undefined) {
    if (bv === null || bv === undefined) return 0;
    return direction === "asc" ? -1 : 1;
  }
  if (bv === null || bv === undefined) {
    return direction === "asc" ? 1 : -1;
  }
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
  }
  return direction === "asc" ? cmp : -cmp;
}

/**
 * 行级模糊匹配：在任一列的展示文本中命中 query 即视为匹配。
 */
function rowMatchesQuery(
  row: Record<string, unknown>,
  columns: TableColumn[],
  query: string,
): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  return columns.some((col) => getDisplayValue(row, col).toLowerCase().includes(lower));
}

const ALIGN_CLASS: Record<NonNullable<TableColumn["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function TableWidget({
  config,
  title,
  description,
  className,
}: TableWidgetProps) {
  const { columns = [], rows = [], pagination = false, pageSize = 10, sortable = false, searchable = false } = config;
  const [sort, setSort] = useState<SortState>({ columnKey: null, direction: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  const effectivePageSize = pageSize > 0 ? pageSize : 10;

  // 处理后的行：搜索过滤 + 排序
  const processedRows = useMemo(() => {
    let result = rows;
    if (searchable && searchQuery) {
      result = result.filter((row) => rowMatchesQuery(row, columns, searchQuery));
    }
    if (sort.columnKey && sort.direction) {
      const column = columns.find((c) => c.key === sort.columnKey);
      if (column) {
        result = [...result].sort((a, b) =>
          compareRows(a, b, column, sort.direction as Exclude<SortDirection, null>),
        );
      }
    }
    return result;
  }, [rows, columns, searchable, searchQuery, sort]);

  // 分页计算
  const totalPages = pagination ? Math.max(1, Math.ceil(processedRows.length / effectivePageSize)) : 1;
  const currentPage = Math.min(pageIndex, totalPages - 1);
  const safePageIndex = Math.max(0, currentPage);
  const pagedRows = useMemo(() => {
    if (!pagination) return processedRows;
    const start = safePageIndex * effectivePageSize;
    return processedRows.slice(start, start + effectivePageSize);
  }, [processedRows, pagination, safePageIndex, effectivePageSize]);

  const handleSort = useCallback(
    (column: TableColumn) => {
      const columnSortable = column.sortable ?? sortable;
      if (!columnSortable) return;
      setSort((prev) => {
        if (prev.columnKey !== column.key) {
          return { columnKey: column.key, direction: "asc" };
        }
        // asc → desc → null → asc 循环
        if (prev.direction === "asc") {
          return { columnKey: column.key, direction: "desc" };
        }
        if (prev.direction === "desc") {
          return { columnKey: null, direction: null };
        }
        return { columnKey: column.key, direction: "asc" };
      });
    },
    [sortable],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPageIndex(0); // 搜索后回到首页
  }, []);

  // 空态：无列定义
  if (columns.length === 0) {
    return (
      <div className={cn("rounded-md border p-6 text-center text-sm text-muted-foreground", className)}>
        {title ? <div className="mb-2 font-medium text-foreground">{title}</div> : null}
        无列定义
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(title || description) ? (
        <div>
          {title ? <div className="text-sm font-medium">{title}</div> : null}
          {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
        </div>
      ) : null}

      {searchable ? (
        <Input
          type="search"
          placeholder="搜索…"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs"
          aria-label="表格搜索"
        />
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const columnSortable = column.sortable ?? sortable;
              const isSorted = sort.columnKey === column.key && sort.direction !== null;
              const alignClass = ALIGN_CLASS[column.align ?? "left"];
              return (
                <TableHead
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    alignClass,
                    columnSortable ? "cursor-pointer select-none hover:bg-muted/50" : undefined,
                  )}
                  onClick={columnSortable ? () => handleSort(column) : undefined}
                  aria-sort={
                    isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{column.title}</span>
                    {isSorted ? (
                      <span aria-hidden="true">
                        {sort.direction === "asc" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                暂无数据
              </TableCell>
            </TableRow>
          ) : (
            pagedRows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => {
                  const alignClass = ALIGN_CLASS[column.align ?? "left"];
                  return (
                    <TableCell key={column.key} className={alignClass}>
                      {getDisplayValue(row, column)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pagination && totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            第 {safePageIndex + 1} / {totalPages} 页 · 共 {processedRows.length} 条
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(safePageIndex - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex(safePageIndex + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
