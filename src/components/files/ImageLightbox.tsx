"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Download, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileData } from "@/lib/storage/base";

interface ImageLightboxProps {
  images: FileData[];
  currentIndex: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, currentIndex, open, onClose }: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(currentIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Wait for client-side mount for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when lightbox opens
  useEffect(() => {
    if (open) {
      setIndex(currentIndex);
      setScale(1);
      setRotation(0);
      setTranslate({ x: 0, y: 0 });
      setImgLoaded(false);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNext();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, index, images.length]);

  const currentImage = images[index];
  const hasMultiple = images.length > 1;

  const goToPrev = useCallback(() => {
    setIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setScale(1);
    setRotation(0);
    setTranslate({ x: 0, y: 0 });
  }, [images.length]);

  const goToNext = useCallback(() => {
    setIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setScale(1);
    setRotation(0);
    setTranslate({ x: 0, y: 0 });
  }, [images.length]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.3, 10));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.3, 0.1));
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setRotation(0);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const rotateImage = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Non-passive wheel event listener for zoom (React's onWheel is passive and can't preventDefault)
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const container = containerRef.current;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale((prev) => Math.min(prev * 1.15, 10));
      } else {
        setScale((prev) => Math.max(prev / 1.15, 0.1));
      }
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [open]);

  // Pan support
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
    },
    [scale, translate]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTranslate({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch support for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchDist, setTouchDist] = useState(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && scale > 1) {
        setTouchStart({ x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y });
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        setTouchDist(Math.sqrt(dx * dx + dy * dy));
      }
    },
    [scale, translate]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && touchStart && scale > 1) {
        e.preventDefault();
        setTranslate({
          x: e.touches[0].clientX - touchStart.x,
          y: e.touches[0].clientY - touchStart.y,
        });
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx * dx + dy * dy);
        if (touchDist > 0) {
          setScale((prev) => Math.min(Math.max(prev * (newDist / touchDist), 0.1), 10));
        }
        setTouchDist(newDist);
      }
    },
    [touchStart, touchDist, scale]
  );

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setTouchDist(0);
  }, []);

  // Download current image
  const handleDownload = useCallback(async () => {
    if (!currentImage) return;
    try {
      const { downloadFile } = await import("@/lib/file-helpers");
      await downloadFile(currentImage);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [currentImage]);

  if (!mounted || !open || !currentImage) return null;

  // Render via portal at body level with highest z-index
  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ zIndex: 99999 }}
    >
      {/* Dark overlay backdrop */}
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* Top toolbar */}
      <div className="absolute top-0 left-0 right-0 z-[100000] flex items-center justify-between p-3 md:p-4">
        <div className="flex items-center gap-2 text-white/80 text-sm truncate max-w-[60%]">
          <span className="hidden md:inline">{index + 1} / {images.length}</span>
          <span className="font-medium truncate">{currentImage.fileName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={zoomOut}
            title="缩小 (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={zoomIn}
            title="放大 (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={rotateImage}
            title="旋转"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={resetZoom}
            title="重置 (0)"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={toggleFullscreen}
            title="全屏"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={handleDownload}
            title="下载"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            onClick={onClose}
            title="关闭 (ESC)"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Prev button */}
      {hasMultiple && (
        <button
          className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[100000] h-12 w-12 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          onClick={goToPrev}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next button */}
      {hasMultiple && (
        <button
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[100000] h-12 w-12 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          onClick={goToNext}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Image display area */}
      <div
        className="relative z-[99999] flex items-center justify-center w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={zoomIn}
      >
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        <img
          src={currentImage.thumbnailUrl || currentImage.previewUrl}
          alt={currentImage.fileName}
          className="max-w-[90vw] max-h-[85vh] object-contain transition-transform duration-150 pointer-events-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? "none" : "transform 0.15s ease",
            opacity: imgLoaded ? 1 : 0,
          }}
          draggable={false}
          onLoad={() => setImgLoaded(true)}
        />
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 z-[100000] p-3 md:p-4">
        <div className="flex items-center justify-center gap-3 text-white/60 text-xs">
          {currentImage.tags.length > 0 && (
            <span className="px-2 py-1 bg-white/10 rounded-full">
              {currentImage.tags.slice(0, 3).join(" · ")}
            </span>
          )}
          <span>
            {scale > 1 ? `${Math.round(scale * 100)}%` : ""}
          </span>
        </div>
        {/* Thumbnail strip for multiple images */}
        {hasMultiple && images.length <= 20 && (
          <div className="flex items-center justify-center gap-1 mt-2 overflow-x-auto px-4">
            {images.map((img, i) => (
              <button
                key={img.id}
                className={cn(
                  "h-10 w-10 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                  i === index
                    ? "border-white opacity-100"
                    : "border-transparent opacity-50 hover:opacity-80"
                )}
                onClick={() => {
                  setIndex(i);
                  setScale(1);
                  setRotation(0);
                  setTranslate({ x: 0, y: 0 });
                }}
              >
                <img
                  src={img.thumbnailUrl || img.previewUrl}
                  alt={img.fileName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
