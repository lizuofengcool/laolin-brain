"use client";

import React from "react";
import {
  FileText,
  Image as ImageIcon,
  File,
  Presentation,
  FileCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function formatSize(bytes: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function getFileIcon(fileType: string): LucideIcon {
  switch (fileType) {
    case "word":
      return FileText;
    case "pdf":
      return File;
    case "image":
      return ImageIcon;
    case "pptx":
      return Presentation;
    case "markdown":
    case "txt":
      return FileCode;
    default:
      return File;
  }
}

export function getFileColor(fileType: string): string {
  switch (fileType) {
    case "word":
      return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15";
    case "pdf":
      return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15";
    case "image":
      return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/15";
    case "pptx":
      return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15";
    case "markdown":
    case "txt":
      return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15";
    default:
      return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/15";
  }
}

// Pre-declare all icon components to avoid "created during render" lint issue
export function FileIconDisplay({
  fileType,
  className,
}: {
  fileType: string;
  className?: string;
}) {
  if (fileType === "word") return <FileText className={className} />;
  if (fileType === "image") return <ImageIcon className={className} />;
  if (fileType === "pptx") return <Presentation className={className} />;
  if (fileType === "markdown" || fileType === "txt") return <FileCode className={className} />;
  return <File className={className} />;
}

// Get file type label for badge display
export function getFileTypeBadge(fileType: string): { label: string; color: string } {
  switch (fileType) {
    case "word":
      return { label: "DOCX", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" };
    case "pdf":
      return { label: "PDF", color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" };
    case "image":
      return { label: "IMG", color: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20" };
    case "pptx":
      return { label: "PPTX", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20" };
    case "markdown":
      return { label: "MD", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" };
    case "txt":
      return { label: "TXT", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" };
    default:
      return { label: "FILE", color: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20" };
  }
}

// Check if file type is a document that may have text content
export function isDocumentType(fileType: string): boolean {
  return ["word", "pdf", "pptx", "markdown", "txt"].includes(fileType);
}

export function formatTime(date: Date | string): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(date).toLocaleDateString("zh-CN");
}
