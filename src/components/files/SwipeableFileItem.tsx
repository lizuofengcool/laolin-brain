"use client";

import React, { useRef, useCallback, useState, memo } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion";
import { Trash2, Star, Share2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { cn } from "@/lib/utils";

export interface SwipeableFileItemProps {
  file: FileData;
  children: React.ReactNode;
  onDelete?: (fileId: string) => void;
  onFavorite?: (fileId: string) => void;
  onShare?: (fileId: string) => void;
  onLongPress?: (fileId: string) => void;
}

// Swipe thresholds
const SWIPE_REVEAL_THRESHOLD = 60;
const SWIPE_COMMIT_THRESHOLD = 120;
const SWIPE_RIGHT_COMMIT = 80;
const BUTTON_WIDTH = 72;
const TOTAL_LEFT_ACTION_WIDTH = BUTTON_WIDTH * 2;
const TOTAL_RIGHT_ACTION_WIDTH = BUTTON_WIDTH;

// Long press config
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

/**
 * SwipeableFileItem — wraps a list item with swipe gestures.
 * Left swipe reveals delete (red) + favorite (amber) buttons.
 * Right swipe reveals share (primary) button then snaps back.
 * Long press triggers batch selection mode.
 */
export const SwipeableFileItem = memo(function SwipeableFileItem({
  file,
  children,
  onDelete,
  onFavorite,
  onShare,
  onLongPress,
}: SwipeableFileItemProps) {
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const [isActionOpen, setIsActionOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavoriting, setIsFavoriting] = useState(false);
  const [isRippling, setIsRippling] = useState(false);

  const batchMode = useAppStore((s) => s.batchMode);
  const toggleBatchMode = useAppStore((s) => s.toggleBatchMode);
  const toggleBatchSelect = useAppStore((s) => s.toggleBatchSelect);

  // Trigger haptic feedback
  const triggerHaptic = useCallback((pattern: number | number[] = 50) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Reset swipe position
  const resetSwipe = useCallback(() => {
    animate(x, 0, {
      type: "spring",
      stiffness: 400,
      damping: 35,
      mass: 0.8,
    });
    setIsActionOpen(false);
  }, [x]);

  // Open left action buttons
  const openLeftActions = useCallback(() => {
    animate(x, -TOTAL_LEFT_ACTION_WIDTH, {
      type: "spring",
      stiffness: 350,
      damping: 32,
    });
    setIsActionOpen(true);
    triggerHaptic(30);
  }, [x, triggerHaptic]);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle long press trigger
  const handleLongPressTrigger = useCallback(() => {
    triggerHaptic([50, 30, 50]);
    setIsRippling(true);
    setTimeout(() => setIsRippling(false), 600);

    if (onLongPress) {
      onLongPress(file.id);
    } else {
      if (!batchMode) {
        toggleBatchMode();
      }
      toggleBatchSelect(file.id);
    }
  }, [file.id, batchMode, toggleBatchMode, toggleBatchSelect, onLongPress, triggerHaptic]);

  // Pan start handler
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  // Pan handler (real-time) — framer-motion provides offset directly
  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Allow left swipe up to action width, right swipe up to share width
    const clampedX = Math.max(-TOTAL_LEFT_ACTION_WIDTH, Math.min(TOTAL_RIGHT_ACTION_WIDTH, info.offset.x));
    x.set(clampedX);

    // Cancel long press if moved enough
    if (Math.abs(info.offset.x) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(info.offset.y) > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPressTimer();
    }
  }, [x, clearLongPressTimer]);

  // Pan end handler
  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    isDraggingRef.current = false;
    const currentX = info.offset.x;
    const velocity = info.velocity.x;

    if (currentX < -SWIPE_COMMIT_THRESHOLD || (currentX < -SWIPE_REVEAL_THRESHOLD && velocity < -300)) {
      // Commit: open left action buttons
      openLeftActions();
    } else if (currentX > SWIPE_RIGHT_COMMIT || (currentX > 40 && velocity > 300)) {
      // Right swipe: snap back + trigger share
      animate(x, 0, {
        type: "spring",
        stiffness: 400,
        damping: 30,
      });
      setIsActionOpen(false);
      if (onShare) {
        triggerHaptic(20);
        onShare(file.id);
      }
    } else {
      // Snap back
      resetSwipe();
    }
  }, [x, openLeftActions, resetSwipe, onShare, file.id, triggerHaptic]);

  // Touch events for long press (runs alongside framer-motion drag)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    longPressTimerRef.current = setTimeout(() => {
      handleLongPressTrigger();
    }, LONG_PRESS_DELAY);
  }, [handleLongPressTrigger]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimerRef.current) return;
    const dx = Math.abs(e.touches[0].clientX - startPosRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - startPosRef.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPressTimer();
    }
  }, [clearLongPressTimer]);

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  // Handle delete with animation
  const handleDelete = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDeleting(true);
    triggerHaptic([30, 20, 30]);

    animate(x, window.innerWidth, {
      type: "spring",
      stiffness: 200,
      damping: 25,
    }).then(() => {
      if (onDelete) {
        onDelete(file.id);
      } else {
        useAppStore.getState().softDeleteFile(file.id);
      }
      setTimeout(() => {
        setIsDeleting(false);
        x.set(0);
        setIsActionOpen(false);
      }, 100);
    });
  }, [x, onDelete, file.id, triggerHaptic]);

  // Handle favorite with animation
  const handleFavorite = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsFavoriting(true);
    triggerHaptic(50);

    if (onFavorite) {
      onFavorite(file.id);
    } else {
      useAppStore.getState().toggleFavorite(file.id);
    }

    setTimeout(() => {
      setIsFavoriting(false);
      resetSwipe();
    }, 400);
  }, [onFavorite, file.id, triggerHaptic, resetSwipe]);

  // Tap content area to close actions
  const handleContentClick = useCallback(() => {
    if (isActionOpen) {
      resetSwipe();
    }
  }, [isActionOpen, resetSwipe]);

  return (
    <div ref={containerRef} className="relative overflow-hidden select-none">
      {/* Left action buttons (favorite + delete) — revealed on left swipe */}
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-stretch pointer-events-none">
        {/* Favorite button */}
        <button
          className={cn(
            "pointer-events-auto flex flex-col items-center justify-center gap-1 min-w-[72px] transition-colors",
            "bg-amber-500 text-white active:bg-amber-600",
            isFavoriting && "bg-amber-400"
          )}
          onClick={handleFavorite}
        >
          <motion.div
            animate={isFavoriting ? {
              scale: [1, 1.3, 0.9, 1.1, 1],
              rotate: [0, 15, -15, 5, 0],
            } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            <Star className={cn("h-5 w-5", file.isFavorite && "fill-current")} />
          </motion.div>
          <span className="text-[10px] font-medium">
            {file.isFavorite ? "取消收藏" : "收藏"}
          </span>
        </button>

        {/* Delete button */}
        <button
          className={cn(
            "pointer-events-auto flex flex-col items-center justify-center gap-1 min-w-[72px] transition-colors",
            "bg-destructive text-destructive-foreground active:bg-destructive/90"
          )}
          onClick={handleDelete}
        >
          <motion.div
            animate={isDeleting ? {
              scale: [1, 1.2, 0.8],
              opacity: [1, 0.5],
            } : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Trash2 className="h-5 w-5" />
          </motion.div>
          <span className="text-[10px] font-medium">删除</span>
        </button>
      </div>

      {/* Right action buttons (share) — revealed on right swipe */}
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-stretch pointer-events-none">
        <button
          className="pointer-events-auto flex flex-col items-center justify-center gap-1 bg-primary text-primary-foreground min-w-[72px] active:bg-primary/90 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (onShare) onShare(file.id);
            resetSwipe();
          }}
        >
          <Share2 className="h-5 w-5" />
          <span className="text-[10px] font-medium">分享</span>
        </button>
      </div>

      {/* Swipeable content layer */}
      <motion.div
        className="relative z-20 touch-pan-y"
        style={{ x }}
        drag={batchMode ? false : "x"}
        dragConstraints={{ left: -TOTAL_LEFT_ACTION_WIDTH, right: TOTAL_RIGHT_ACTION_WIDTH }}
        dragElastic={{ left: 0.15, right: 0.2 }}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
        animate={
          isDeleting
            ? { opacity: 0, scale: 0.8, height: 0, marginBottom: 0 }
            : undefined
        }
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {/* Ripple effect overlay for long press */}
        {isRippling && (
          <motion.div
            className="absolute inset-0 z-30 pointer-events-none rounded-lg overflow-hidden"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="absolute inset-0 bg-primary/10 rounded-lg"
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </motion.div>
        )}

        {/* Favorite success sparkle */}
        {isFavoriting && (
          <motion.div
            className="absolute top-2 right-16 z-40 pointer-events-none"
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0], y: [-10, -20] }}
            transition={{ duration: 0.5 }}
          >
            <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
          </motion.div>
        )}

        {children}
      </motion.div>
    </div>
  );
});
