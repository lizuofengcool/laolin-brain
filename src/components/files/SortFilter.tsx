"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortFilterProps {
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
  totalFiles: number;
  filteredCount: number;
}

const sortOptions = [
  { value: "date", label: "按时间排序" },
  { value: "name", label: "按名称排序" },
  { value: "size", label: "按大小排序" },
  { value: "type", label: "按类型排序" },
] as const;

function SortIcon({
  sortBy,
  optionValue,
  sortOrder,
}: {
  sortBy: string;
  optionValue: string;
  sortOrder: "asc" | "desc";
}) {
  if (sortBy !== optionValue) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
  }

  return sortOrder === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 text-foreground" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-foreground" />
  );
}

function getActiveLabel(sortBy: string): string {
  const option = sortOptions.find((o) => o.value === sortBy);
  return option ? option.label : "按时间排序";
}

export function SortFilter({
  sortBy,
  sortOrder,
  onSortChange,
  totalFiles,
  filteredCount,
}: SortFilterProps) {
  const isFiltered = filteredCount !== totalFiles;

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          共 <span className="font-medium text-foreground">{totalFiles}</span>{" "}
          个文件
        </span>
        {isFiltered && (
          <>
            <Separator orientation="vertical" className="h-3.5" />
            <span>
              已筛选{" "}
              <span className="font-medium text-foreground">
                {filteredCount}
              </span>{" "}
              个
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {getActiveLabel(sortBy)}
          {sortOrder === "asc" ? "升序" : "降序"}
        </span>
        <Separator orientation="vertical" className="h-3.5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-sm">
              <ArrowUpDown className="h-3.5 w-3.5" />
              排序
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {sortOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => {
                  const newOrder =
                    sortBy === option.value
                      ? sortOrder === "asc"
                        ? "desc"
                        : "asc"
                      : "desc";
                  onSortChange(option.value, newOrder);
                }}
                className={cn(
                  "flex items-center justify-between gap-2 text-sm",
                  sortBy === option.value && "bg-accent"
                )}
              >
                <span>{option.label}</span>
                <SortIcon
                  sortBy={sortBy}
                  optionValue={option.value}
                  sortOrder={sortOrder}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
