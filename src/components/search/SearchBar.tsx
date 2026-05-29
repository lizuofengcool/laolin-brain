"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Clock, Trash2 } from "lucide-react";
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "@/hooks/use-search-history";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  suggestions?: string[];
}

export function SearchBar({ value, onChange, onSearch, suggestions = [] }: SearchBarProps) {
  const [showHistory, setShowHistory] = useState(false);
  // Load history
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    return getSearchHistory();
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (value.trim()) {
        addSearchHistory(value.trim());
        setHistory(getSearchHistory());
      }
      setShowHistory(false);
      onSearch();
    }
    if (e.key === "Escape") {
      setShowHistory(false);
    }
  };

  const handleHistoryClick = (item: string) => {
    onChange(item);
    addSearchHistory(item);
    setHistory(getSearchHistory());
    setShowHistory(false);
    // Don't call onSearch() — onChange triggers parent's debounced search
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setHistory([]);
  };

  const handleFocus = () => {
    setHistory(getSearchHistory());
    if (!value) {
      setShowHistory(true);
    }
  };

  // Filter suggestions based on current input
  const filteredSuggestions = useMemo(() => {
    if (!value.trim()) return [];
    const lower = value.toLowerCase();
    return suggestions
      .filter((s) => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower)
      .slice(0, 8);
  }, [value, suggestions]);

  const showDropdown = showHistory && (history.length > 0 || filteredSuggestions.length > 0);

  return (
    <div className="relative w-full max-w-2xl mx-auto" ref={containerRef}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="搜索文件名、文档内容、标签..."
        className="pl-12 pr-12 h-12 text-base rounded-xl bg-card border-muted-foreground/20 shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-12 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
      <Button
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-lg"
        size="sm"
        onClick={() => {
          if (value.trim()) {
            addSearchHistory(value.trim());
            setHistory(getSearchHistory());
          }
          setShowHistory(false);
          onSearch();
        }}
      >
        搜索
      </Button>

      {/* Dropdown: history + suggestions */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Search history */}
          {history.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-muted-foreground">搜索历史</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  清除
                </Button>
              </div>
              {history.slice(0, 10).map((item) => (
                <button
                  key={item}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-lg hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleHistoryClick(item)}
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {filteredSuggestions.length > 0 && (
            <div className="p-2 border-t">
              <span className="text-xs font-medium text-muted-foreground px-2 py-1 block">搜索建议</span>
              {filteredSuggestions.map((item) => (
                <button
                  key={item}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-lg hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleHistoryClick(item)}
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
