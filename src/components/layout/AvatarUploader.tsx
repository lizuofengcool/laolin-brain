"use client";

import { useRef, useState, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAvatar } from "@/hooks/use-avatar";

const MAX_SIZE = 200;
const QUALITY = 0.8;

interface AvatarUploaderProps {
  /** 头像尺寸，默认 64px */
  size?: number;
  /** 是否显示移除按钮，默认 true */
  showRemove?: boolean;
}

/**
 * 头像上传组件
 * - 圆形头像显示，hover 显示遮罩 + 相机图标
 * - 点击上传 / 拖拽上传
 * - Canvas 居中裁剪 + 压缩（max 200x200, quality 0.8）
 * - base64 存储到 localStorage
 */
export function AvatarUploader({ size = 64, showRemove = true }: AvatarUploaderProps) {
  const { avatar, setAvatar, removeAvatar } = useAvatar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 处理文件：裁剪 + 压缩
  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setProcessing(true);

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 居中裁剪为正方形
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;

          const canvas = document.createElement("canvas");
          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setProcessing(false);
            return;
          }

          // Fill white background before clipping to avoid black corners in JPEG
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, MAX_SIZE, MAX_SIZE);

          // 绘制圆形裁剪
          ctx.beginPath();
          ctx.arc(MAX_SIZE / 2, MAX_SIZE / 2, MAX_SIZE / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_SIZE, MAX_SIZE);

          const base64 = canvas.toDataURL("image/jpeg", QUALITY);
          setAvatar(base64);
          setProcessing(false);
        };
        img.onerror = () => {
          setProcessing(false);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        setProcessing(false);
      };
      reader.readAsDataURL(file);
    },
    [setAvatar]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // 重置 input 以允许重复选择同一文件
      e.target.value = "";
    },
    [processFile]
  );

  const handleClick = () => {
    if (!processing) {
      inputRef.current?.click();
    }
  };

  // 拖拽事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeAvatar();
  };

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Avatar area */}
      <button
        type="button"
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer transition-all",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
          isDragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background scale-105",
          !avatar && "bg-primary text-primary-foreground",
          "h-full w-full"
        )}
        style={{ width: size, height: size, fontSize: size * 0.375 }}
        aria-label={avatar ? "更换头像" : "上传头像"}
      >
        {processing ? (
          <Loader2 className="animate-spin text-primary-foreground" style={{ width: size * 0.4, height: size * 0.4 }} />
        ) : avatar ? (
          <img
            src={avatar}
            alt="用户头像"
            className="w-full h-full object-cover rounded-full"
            draggable={false}
          />
        ) : (
          <Camera style={{ width: size * 0.4, height: size * 0.4 }} />
        )}
      </button>

      {/* Hover overlay */}
      {avatar && !processing && (
        <div
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          onClick={handleClick}
          aria-hidden="true"
        >
          <Camera className="text-white" style={{ width: size * 0.35, height: size * 0.35 }} />
        </div>
      )}

      {/* Remove button */}
      {showRemove && avatar && !processing && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity shadow-sm hover:scale-110"
          style={{ opacity: undefined }}
          aria-label="移除头像"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "";
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Drag-over ring */}
      {isDragOver && (
        <div className="absolute inset-0 rounded-full border-2 border-primary animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
