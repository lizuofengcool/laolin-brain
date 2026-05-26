"use client";

import React from "react";
import {
  FileText,
  Image as ImageIcon,
  File,
  Presentation,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function formatSize(bytes: number): string {
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
    default:
      return File;
  }
}

export function getFileColor(fileType: string): string {
  switch (fileType) {
    case "word":
      return "text-blue-600 bg-blue-50";
    case "pdf":
      return "text-red-600 bg-red-50";
    case "image":
      return "text-green-600 bg-green-50";
    case "pptx":
      return "text-orange-600 bg-orange-50";
    default:
      return "text-gray-600 bg-gray-50";
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
  return <File className={className} />;
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
