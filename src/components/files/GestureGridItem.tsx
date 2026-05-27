"use client";

import React, { useRef, useCallback, useState, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { cn } from "@/lib/utils";

export interface GestureGridItemProps {
  file: FileData;
  isSelected?: boolean;
  children: React.ReactNode;
  onLongPress?: (fileId: string) => void;
}

// Long press config
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

/**
 * GestureGridItem — wraps a grid card with touch gestures for mobile.
 * - Long press: enters batch mode + selects current file
 * - Long press + drag: drag-select multiple adjacent files
 * - Haptic feedback + ripple animation on long press
 * - Desktop: passthrough (no gesture handling)
 */
export const GestureGridItem = memo(function GestureGridItem({
  file,
  isSelected = false,
  children,
  onLongPress,
}: GestureGridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isLongPressingRef = useRef(false);

  const [isRippling, setIsRippling] = useState(false);
  const [isPressing, setIsPressing] = useState(false);

  const batchMode = useAppStore((s) => s.batchMode);
  const toggleBatchMode = useAppStore((s) => s.toggleBatchMode);
  const toggleBatchSelect = useAppStore((s) => s.toggleBatchSelect);

  // Trigger haptic feedback
  const triggerHaptic = useCallback((pattern: number | number[] = 50) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressingRef.current = false;
  }, []);

  // Handle long press trigger
  const handleLongPressTrigger = useCallback(() => {
    isLongPressingRef.current = true;
    triggerHaptic([50, 30, 50]);
    setIsPressing(true);

    // Show ripple effect
    setIsRippling(true);
    setTimeout(() => {
      setIsRippling(false);
      setIsPressing(false);
    }, 500);

    // Enter batch mode and select this file
    if (onLongPress) {
      onLongPress(file.id);
    } else {
      const state = useAppStore.getState();
      if (!state.batchMode) {
        state.toggleBatchMode();
      }
      // Ensure this file is selected after toggling batch mode
      const currentState = useAppStore.getState();
      if (!currentState.batchSelectedIds.includes(file.id)) {
        currentState.toggleBatchSelect(file.id);
      }
    }
  }, [file.id, onLongPress, triggerHaptic]);

  // Touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startPosRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };

    longPressTimerRef.current = setTimeout(() => {
      handleLongPressTrigger();
    }, LONG_PRESS_DELAY);
  }, [handleLongPressTrigger]);

  // Touch move — cancel long press if moved too far
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      const dx = Math.abs(e.touches[0].clientX - startPosRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - startPosRef.current.y);
      if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
        clearLongPressTimer();
      }
    }
  }, [clearLongPressTimer]);

  // Touch end — cancel long press timer
  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

  return (
    <div
      ref={itemRef}
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={clearLongPressTimer}
    >
      {/* Scale bounce animation during long press */}
      <motion.div
        animate={
          isPressing
            ? { scale: [1, 0.95, 1.02, 1], transition: { duration: 0.3 } }
            : batchMode
              ? { scale: isSelected ? [1, 1.02, 1] : 1 }
              : { scale: 1 }
        }
        className="relative"
      >
        {/* Ripple effect on long press */}
        <AnimatePresence>
          {isRippling && (
            <motion.div
              className="absolute inset-0 z-30 pointer-events-none rounded-xl overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Expanding ring */}
              <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-primary/40"
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
              {/* Center pulse */}
              <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/15"
                initial={{ scale: 0.5, opacity: 0.6 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Batch mode selection overlay */}
        {batchMode && (
          <motion.div
            className="absolute top-2 left-2 z-20"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <div
              className={cn(
                "h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm",
                isSelected
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background/90 border-muted-foreground/30"
              )}
            >
              {isSelected && (
                <motion.svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                </motion.svg>
              )}
            </div>
          </motion.div>
        )}

        {/* Children (the actual file card content) */}
        {children}
      </motion.div>
    </div>
  );
});
