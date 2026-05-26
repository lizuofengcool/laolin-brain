"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export function SearchBar({ value, onChange, onSearch }: SearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        type="text"
        placeholder="搜索文件名、文档内容、标签..."
        className="pl-12 pr-12 h-12 text-base rounded-xl bg-card border-muted-foreground/20 shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-12 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => onChange("")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <Button
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-lg"
        size="sm"
        onClick={onSearch}
      >
        搜索
      </Button>
    </div>
  );
}
