"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { FilePreview } from "@/components/files/FilePreview";

export function SearchViewContent() {
  const { searchQuery, setSearchQuery, aiChatFile, setAiChatFile, files } = useAppStore();
  const [localQuery, setLocalQuery] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect all tags and file names for suggestions
  const allSuggestions = useMemo(() => {
    const tags = [...new Set(files.filter((f) => !f.isDeleted).flatMap((f) => f.tags))];
    const names = files.filter((f) => !f.isDeleted).map((f) => f.fileName);
    return [...tags, ...names];
  }, [files]);

  // Sync from store (e.g. when navigating from header search)
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalQuery(searchQuery);
  }

  const handleSearch = () => {
    setSearchQuery(localQuery);
    setSearchTrigger((prev) => prev + 1);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
        setSearchTrigger((prev) => prev + 1);
      }, 300);
    } else {
      setSearchQuery("");
      setSearchTrigger((prev) => prev + 1);
    }
  };

  const handlePreview = (file: FileData) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-6">搜索文件</h1>
        <SearchBar
          value={localQuery}
          onChange={handleChange}
          onSearch={handleSearch}
          suggestions={allSuggestions}
        />
      </div>

      <SearchResults
        query={localQuery}
        triggerSearch={searchTrigger}
        onPreview={handlePreview}
      />

      <FilePreview
        file={previewFile}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
