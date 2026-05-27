"use client";

import { useRef, useCallback } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function CameraCapture({ onCapture, disabled, className }: CameraCaptureProps) {
  const rearInputRef = useRef<HTMLInputElement>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onCapture(file);
      }
      // Reset input so same file can be captured again
      e.target.value = "";
    },
    [onCapture]
  );

  const handleRearCapture = useCallback(() => {
    rearInputRef.current?.click();
  }, []);

  const handleFrontCapture = useCallback(() => {
    frontInputRef.current?.click();
  }, []);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Hidden file inputs */}
      <input
        ref={rearInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="后置摄像头拍照"
      />
      <input
        ref={frontInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
        className="hidden"
        aria-label="前置摄像头拍照"
      />

      {/* Rear camera button (primary) */}
      <Button
        type="button"
        variant="default"
        size="sm"
        className="gap-1.5 md:hidden"
        onClick={handleRearCapture}
        disabled={disabled}
        aria-label="拍照上传"
      >
        <Camera className="h-4 w-4" />
        <span className="text-xs">拍照</span>
      </Button>

      {/* Front camera button (secondary) */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs md:hidden"
        onClick={handleFrontCapture}
        disabled={disabled}
        aria-label="自拍上传"
      >
        <span className="text-xs">📷</span>
        <span className="text-xs">自拍</span>
      </Button>
    </div>
  );
}
