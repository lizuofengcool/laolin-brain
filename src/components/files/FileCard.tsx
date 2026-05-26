"use client";

import type { FileData } from "@/lib/storage/base";
import {
  FileText,
  Image as ImageIcon,
  File,
  Star,
  MoreVertical,
  Trash2,
  Tag,
  FolderInput,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface FileCardProps {
  file: FileData;
  onPreview: (file: FileData) => void;
}

const getFileColor = (fileType: string) => {
  switch (fileType) {
    case "word":
      return "text-blue-600 bg-blue-50";
    case "pdf":
      return "text-red-600 bg-red-50";
    case "image":
      return "text-green-600 bg-green-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

function FileIconDisplay({
  fileType,
  className,
}: {
  fileType: string;
  className?: string;
}) {
  if (fileType === "word") return <FileText className={className} />;
  if (fileType === "image") return <ImageIcon className={className} />;
  if (fileType === "pdf") return <File className={className} />;
  return <File className={className} />;
}

export function FileCard({ file, onPreview }: FileCardProps) {
  const { toggleFavorite, deleteFile, setAiChatFile } = useAppStore();
  const colorClass = getFileColor(file.fileType);

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(file.id);
  };

  const handleDelete = async () => {
    if (confirm("确定要删除这个文件吗？")) {
      await deleteFile(file.id);
    }
  };

  const handleAIChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAiChatFile(file);
  };

  const hasAITags = file.tags && file.tags.length > 0;
  const hasAITextContent =
    file.textContent && file.fileType === "image" && file.textContent.trim().length > 0;

  return (
    <Card
      className="group cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden"
      onClick={() => onPreview(file)}
    >
      {/* Preview area */}
      <div
        className={cn(
          "h-36 flex items-center justify-center relative",
          file.fileType === "image" && file.thumbnailUrl
            ? "bg-muted/30"
            : "bg-muted/50"
        )}
      >
        {file.fileType === "image" && file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt={file.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "h-14 w-14 rounded-xl flex items-center justify-center",
              colorClass
            )}
          >
            <FileIconDisplay fileType={file.fileType} className="h-7 w-7" />
          </div>
        )}

        {/* AI badge */}
        {hasAITags && (
          <div className="absolute top-2 left-2">
            <Badge
              variant="secondary"
              className="text-[10px] bg-primary/90 text-primary-foreground hover:bg-primary/90 gap-1"
            >
              <Sparkles className="h-2.5 w-2.5" />
              AI
            </Badge>
          </div>
        )}

        {/* Favorite button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80",
            file.isFavorite && "opacity-100"
          )}
          onClick={handleFavorite}
        >
          <Star
            className={cn(
              "h-4 w-4",
              file.isFavorite
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            )}
          />
        </Button>

        {/* More actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPreview(file); }}>
              预览
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAIChat}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI 解读
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Tag className="h-4 w-4 mr-2" />
              编辑标签
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FolderInput className="h-4 w-4 mr-2" />
              移动到文件夹
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Info area */}
      <div className="p-3">
        <p className="text-sm font-medium truncate">{file.fileName}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-muted-foreground">
            {formatSize(file.fileSize)}
          </span>
          <div className="flex gap-1">
            {file.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        {/* AI OCR text preview */}
        {hasAITextContent && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
            {file.textContent!.slice(0, 50)}
          </p>
        )}
      </div>
    </Card>
  );
}

// List item variant
export function FileListItem({ file, onPreview }: FileCardProps) {
  const { toggleFavorite, deleteFile, setAiChatFile } = useAppStore();
  const colorClass = getFileColor(file.fileType);

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(file.id);
  };

  const handleDelete = async () => {
    if (confirm("确定要删除这个文件吗？")) {
      await deleteFile(file.id);
    }
  };

  const handleAIChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAiChatFile(file);
  };

  const hasAITags = file.tags && file.tags.length > 0;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
      onClick={() => onPreview(file)}
    >
      {file.fileType === "image" && file.thumbnailUrl ? (
        <img
          src={file.thumbnailUrl}
          alt={file.fileName}
          className="h-10 w-10 rounded-md object-cover shrink-0"
        />
      ) : (
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            colorClass
          )}
        >
          <FileIconDisplay fileType={file.fileType} className="h-5 w-5" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{file.fileName}</p>
          {hasAITags && (
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatSize(file.fileSize)} ·{" "}
          {new Date(file.createdAt).toLocaleDateString("zh-CN")}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {file.tags.slice(0, 2).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] px-1.5 py-0 hidden sm:inline-flex"
          >
            {tag}
          </Badge>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleFavorite}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              file.isFavorite
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hidden sm:flex"
          onClick={handleAIChat}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPreview(file)}>
              预览
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleAIChat}>
              <Sparkles className="h-4 w-4 mr-2" />
              AI 解读
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={handleDelete}
            >
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
