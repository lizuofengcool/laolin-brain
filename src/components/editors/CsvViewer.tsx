"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

// ==================== 类型定义 ====================

export interface CsvViewerProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
  delimiter?: string;
  hasHeader?: boolean;
  className?: string;
}

// ==================== CSV解析函数 ====================

function parseCsv(
  text: string,
  delimiter: string = ",",
  hasHeader: boolean = true
): {
  headers: string[];
  rows: string[][];
  error: string | null;
} {
  if (!text.trim()) {
    return { headers: [], rows: [], error: null };
  }

  try {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

    if (lines.length === 0) {
      return { headers: [], rows: [], error: null };
    }

    let headers: string[] = [];
    let dataRows: string[][] = [];

    if (hasHeader) {
      headers = parseCsvLine(lines[0], delimiter);
      dataRows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));
    } else {
      const firstRow = parseCsvLine(lines[0], delimiter);
      headers = firstRow.map((_, i) => `列${i + 1}`);
      dataRows = lines.map((line) => parseCsvLine(line, delimiter));
    }

    // 确保所有行的列数一致
    const maxCols = Math.max(headers.length, ...dataRows.map((r) => r.length));
    headers = [...headers, ...Array(maxCols - headers.length).fill("")];
    dataRows = dataRows.map((row) => [
      ...row,
      ...Array(maxCols - row.length).fill(""),
    ]);

    return { headers, rows: dataRows, error: null };
  } catch (e: any) {
    return { headers: [], rows: [], error: e.message };
  }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// ==================== 主组件 ====================

export function CsvViewer({
  value,
  onChange,
  readOnly = false,
  height = "500px",
  delimiter: defaultDelimiter = ",",
  hasHeader: defaultHasHeader = true,
  className = "",
}: CsvViewerProps) {
  const [delimiter, setDelimiter] = useState(defaultDelimiter);
  const [hasHeader, setHasHeader] = useState(defaultHasHeader);
  const [searchText, setSearchText] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    column: number;
    direction: "asc" | "desc";
  } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [columnFilters, setColumnFilters] = useState<Record<number, string>>({});
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // 解析CSV
  const parsed = useMemo(() => {
    return parseCsv(value, delimiter, hasHeader);
  }, [value, delimiter, hasHeader]);

  const { headers, rows, error } = parsed;

  // 筛选和排序后的数据
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // 全局搜索
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(searchLower))
      );
    }

    // 列筛选
    Object.entries(columnFilters).forEach(([colIndex, filterText]) => {
      if (filterText) {
        const col = parseInt(colIndex);
        const filterLower = filterText.toLowerCase();
        result = result.filter((row) =>
          row[col]?.toLowerCase().includes(filterLower)
        );
      }
    });

    // 排序
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.column] || "";
        const bVal = b[sortConfig.column] || "";

        // 尝试数字排序
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortConfig.direction === "asc"
            ? aNum - bNum
            : bNum - aNum;
        }

        // 字符串排序
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [rows, searchText, columnFilters, sortConfig]);

  // 统计信息
  const stats = useMemo(() => {
    if (rows.length === 0) return null;

    const numericColumns: { index: number; min: number; max: number; avg: number; sum: number }[] = [];

    headers.forEach((_, colIndex) => {
      const values = rows
        .map((row) => parseFloat(row[colIndex]))
        .filter((v) => !isNaN(v));

      if (values.length > 0 && values.length === rows.length) {
        numericColumns.push({
          index: colIndex,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          sum: values.reduce((a, b) => a + b, 0),
        });
      }
    });

    return {
      totalRows: rows.length,
      totalColumns: headers.length,
      numericColumns,
      filteredRows: filteredAndSortedRows.length,
    };
  }, [rows, headers, filteredAndSortedRows]);

  // 处理列排序
  const handleSort = useCallback((columnIndex: number) => {
    setSortConfig((prev) => {
      if (prev?.column === columnIndex) {
        if (prev.direction === "asc") {
          return { column: columnIndex, direction: "desc" };
        }
        return null;
      }
      return { column: columnIndex, direction: "asc" };
    });
  }, []);

  // 处理行选择
  const toggleRowSelection = useCallback((rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedRows.size === filteredAndSortedRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredAndSortedRows.map((_, i) => i)));
    }
  }, [selectedRows.size, filteredAndSortedRows.length]);

  // 开始编辑单元格
  const startEditing = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (readOnly) return;
      const row = filteredAndSortedRows[rowIndex];
      if (!row) return;

      setEditingCell({ row: rowIndex, col: colIndex });
      setEditValue(row[colIndex] || "");
    },
    [readOnly, filteredAndSortedRows]
  );

  // 完成编辑
  const finishEditing = useCallback(() => {
    if (!editingCell || !onChange) {
      setEditingCell(null);
      return;
    }

    // 找到原始行索引
    const filteredRow = filteredAndSortedRows[editingCell.row];
    const originalRowIndex = rows.findIndex((row) => row === filteredRow);

    if (originalRowIndex === -1) {
      setEditingCell(null);
      return;
    }

    // 更新数据
    const newRows = rows.map((row, i) => {
      if (i === originalRowIndex) {
        const newRow = [...row];
        newRow[editingCell.col] = editValue;
        return newRow;
      }
      return row;
    });

    // 重新生成CSV
    let newCsv = "";
    if (hasHeader) {
      newCsv += headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter) + "\n";
    }
    newCsv += newRows
      .map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter))
      .join("\n");

    onChange(newCsv);
    setEditingCell(null);
  }, [editingCell, editValue, onChange, filteredAndSortedRows, rows, hasHeader, headers, delimiter]);

  function escapeCsvField(field: string, delimiter: string): string {
    if (field.includes(delimiter) || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  // 聚焦编辑输入框
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // 添加行
  const addRow = useCallback(() => {
    if (!onChange) return;

    const newRow = Array(headers.length).fill("");
    const newRows = [...rows, newRow];

    let newCsv = "";
    if (hasHeader) {
      newCsv += headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter) + "\n";
    }
    newCsv += newRows
      .map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter))
      .join("\n");

    onChange(newCsv);
  }, [onChange, headers, rows, hasHeader, delimiter]);

  // 删除选中行
  const deleteSelectedRows = useCallback(() => {
    if (!onChange || selectedRows.size === 0) return;

    const filteredRowSet = new Set(
      Array.from(selectedRows).map((i) => filteredAndSortedRows[i])
    );

    const newRows = rows.filter((row) => !filteredRowSet.has(row));

    let newCsv = "";
    if (hasHeader) {
      newCsv += headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter) + "\n";
    }
    newCsv += newRows
      .map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter))
      .join("\n");

    onChange(newCsv);
    setSelectedRows(new Set());
  }, [onChange, selectedRows, filteredAndSortedRows, rows, hasHeader, headers, delimiter]);

  // 导出为JSON
  const exportToJson = useCallback(() => {
    const data = filteredAndSortedRows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        obj[header || `column_${i}`] = row[i];
      });
      return obj;
    });

    const json = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(json);
    alert("已导出为JSON格式并复制到剪贴板");
  }, [filteredAndSortedRows, headers]);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const containerClasses = `
    flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900
    ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}
    ${className}
  `;

  if (error) {
    return (
      <div className={containerClasses} style={{ height }}>
        <div className="p-4 text-red-500 dark:text-red-400">
          <p className="font-semibold">CSV解析错误</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses} style={{ height: isFullscreen ? "100vh" : height }}>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* 分隔符选择 */}
        <select
          value={delimiter}
          onChange={(e) => setDelimiter(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"
        >
          <option value=",">逗号 (,)</option>
          <option value=";">分号 (;)</option>
          <option value="\t">制表符 (Tab)</option>
          <option value="|">竖线 (|)</option>
        </select>

        {/* 表头开关 */}
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="rounded"
          />
          有表头
        </label>

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 搜索 */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索..."
          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
        />

        {/* 列筛选开关 */}
        <button
          onClick={() => setShowColumnFilters(!showColumnFilters)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showColumnFilters
              ? "bg-blue-500 text-white"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          筛选
        </button>

        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

        {/* 操作按钮 */}
        {!readOnly && (
          <>
            <button
              onClick={addRow}
              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              + 添加行
            </button>
            <button
              onClick={deleteSelectedRows}
              disabled={selectedRows.size === 0}
              className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              删除选中
            </button>
          </>
        )}

        <button
          onClick={exportToJson}
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          导出JSON
        </button>

        <div className="flex-1" />

        {/* 选中统计 */}
        {selectedRows.size > 0 && (
          <span className="text-xs text-blue-600 dark:text-blue-400">
            已选 {selectedRows.size} 行
          </span>
        )}

        {/* 全屏 */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏查看"}
          className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          ⛶
        </button>
      </div>

      {/* 列筛选行 */}
      {showColumnFilters && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-x-auto">
          {headers.map((header, index) => (
            <input
              key={index}
              type="text"
              value={columnFilters[index] || ""}
              onChange={(e) =>
                setColumnFilters((prev) => ({
                  ...prev,
                  [index]: e.target.value,
                }))
              }
              placeholder={`筛选 ${header || `列${index + 1}`}`}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0 w-28"
            />
          ))}
        </div>
      )}

      {/* 表格主体 */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto"
      >
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="px-2 py-2 text-left border-b border-gray-200 dark:border-gray-700 w-10">
                <input
                  type="checkbox"
                  checked={selectedRows.size === filteredAndSortedRows.length && filteredAndSortedRows.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-2 py-2 text-left border-b border-gray-200 dark:border-gray-700 w-12 text-gray-500 font-normal">
                #
              </th>
              {headers.map((header, index) => (
                <th
                  key={index}
                  onClick={() => handleSort(index)}
                  className="px-3 py-2 text-left border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 select-none whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {header || `列${index + 1}`}
                    {sortConfig?.column === index && (
                      <span className="text-blue-500">
                        {sortConfig.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 2}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  暂无数据
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`
                    border-b border-gray-100 dark:border-gray-800
                    ${selectedRows.has(rowIndex) ? "bg-blue-50 dark:bg-blue-900/20" : ""}
                    hover:bg-gray-50 dark:hover:bg-gray-800/50
                  `}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(rowIndex)}
                      onChange={() => toggleRowSelection(rowIndex)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 text-xs">
                    {rowIndex + 1}
                  </td>
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-3 py-1.5 border-l border-gray-50 dark:border-gray-800"
                      onDoubleClick={() => startEditing(rowIndex, colIndex)}
                    >
                      {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={finishEditing}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") finishEditing();
                            if (e.key === "Escape") setEditingCell(null);
                          }}
                          className="w-full px-1 py-0.5 border border-blue-500 rounded focus:outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200"
                        />
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300 truncate block max-w-xs">
                          {cell || <span className="text-gray-400">-</span>}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <span>{filteredAndSortedRows.length} / {rows.length} 行</span>
          <span>{headers.length} 列</span>
          {searchText && <span>搜索: "{searchText}"</span>}
        </div>
        <div className="flex items-center gap-4">
          {stats?.numericColumns && stats.numericColumns.length > 0 && (
            <span>{stats.numericColumns.length} 个数值列</span>
          )}
          <span>CSV</span>
        </div>
      </div>
    </div>
  );
}

export default CsvViewer;
