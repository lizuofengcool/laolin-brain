"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * Swipe direction enum
 */
export type SwipeDirection = "up" | "down" | "left" | "right" | null;

export interface UseSwipeOptions {
  /** Minimum swipe distance in pixels (default: 50) */
  minDistance?: number;
  /** Maximum time for a swipe in ms (default: 300) */
  maxDuration?: number;
  /** Ratio to determine horizontal vs vertical swipe (default: 0.7) */
  directionLockRatio?: number;
  /** Callback when swiping left */
  onSwipeLeft?: () => void;
  /** Callback when swiping right */
  onSwipeRight?: () => void;
  /** Callback when swiping up */
  onSwipeUp?: () => void;
  /** Callback when swiping down */
  onSwipeDown?: () => void;
  /** Callback on swipe start (receives initial position) */
  onSwipeStart?: (x: number, y: number) => void;
  /** Callback during swipe move (receives delta) */
  onSwipeMove?: (deltaX: number, deltaY: number) => void;
  /** Callback on swipe end */
  onSwipeEnd?: (direction: SwipeDirection) => void;
}

export interface UseSwipeReturn {
  /** Current detected swipe direction */
  swipeDirection: SwipeDirection;
  /** Touch/mouse start handler to attach */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Touch/mouse move handler to attach */
  onPointerMove: (e: React.PointerEvent) => void;
  /** Touch/mouse end handler to attach */
  onPointerUp: (e: React.PointerEvent) => void;
  /** Whether a swipe is currently in progress */
  isSwiping: boolean;
  /** Current swipe delta from start point */
  swipeDelta: { x: number; y: number };
  /** Reset internal state */
  reset: () => void;
}

/**
 * useSwipe — comprehensive swipe detection hook.
 * Supports touch and mouse events with direction locking,
 * distance thresholds, and time thresholds.
 */
export function useSwipe(options: UseSwipeOptions = {}): UseSwipeReturn {
  const {
    minDistance = 50,
    maxDuration = 300,
    directionLockRatio = 0.7,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  } = options;

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const isTrackingRef = useRef(false);
  const directionLockedRef = useRef<SwipeDirection>(null);

  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeDelta, setSwipeDelta] = useState({ x: 0, y: 0 });
  const swipeDeltaRef = useRef({ x: 0, y: 0 });
  const deltaTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Stable callback refs
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const onSwipeUpRef = useRef(onSwipeUp);
  const onSwipeDownRef = useRef(onSwipeDown);
  const onSwipeStartRef = useRef(onSwipeStart);
  const onSwipeMoveRef = useRef(onSwipeMove);
  const onSwipeEndRef = useRef(onSwipeEnd);

  useEffect(() => { onSwipeLeftRef.current = onSwipeLeft; }, [onSwipeLeft]);
  useEffect(() => { onSwipeRightRef.current = onSwipeRight; }, [onSwipeRight]);
  useEffect(() => { onSwipeUpRef.current = onSwipeUp; }, [onSwipeUp]);
  useEffect(() => { onSwipeDownRef.current = onSwipeDown; }, [onSwipeDown]);
  useEffect(() => { onSwipeStartRef.current = onSwipeStart; }, [onSwipeStart]);
  useEffect(() => { onSwipeMoveRef.current = onSwipeMove; }, [onSwipeMove]);
  useEffect(() => { onSwipeEndRef.current = onSwipeEnd; }, [onSwipeEnd]);

  const reset = useCallback(() => {
    isTrackingRef.current = false;
    directionLockedRef.current = null;
    setSwipeDirection(null);
    setIsSwiping(false);
    setSwipeDelta({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    isTrackingRef.current = true;
    directionLockedRef.current = null;
    setSwipeDirection(null);
    setIsSwiping(false);
    setSwipeDelta({ x: 0, y: 0 });
    swipeDeltaRef.current = { x: 0, y: 0 };

    onSwipeStartRef.current?.(e.clientX, e.clientY);

    // Capture pointer for tracking outside element
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore if not supported
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isTrackingRef.current) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    const newDelta = { x: deltaX, y: deltaY };
    setSwipeDelta(newDelta);
    swipeDeltaRef.current = newDelta;

    // Direction locking: once we determine direction, lock it
    if (!directionLockedRef.current && (absDeltaX > 10 || absDeltaY > 10)) {
      setIsSwiping(true);
      if (absDeltaX > absDeltaY * directionLockRatio) {
        directionLockedRef.current = deltaX > 0 ? "right" : "left";
      } else if (absDeltaY > absDeltaX * directionLockRatio) {
        directionLockedRef.current = deltaY > 0 ? "down" : "up";
      }
    }

    onSwipeMoveRef.current?.(deltaX, deltaY);
  }, [directionLockRatio]);

  const onPointerUp = useCallback(() => {
    if (!isTrackingRef.current) return;
    isTrackingRef.current = false;

    const deltaX = swipeDeltaRef.current.x;
    const deltaY = swipeDeltaRef.current.y;
    const elapsed = Date.now() - startTimeRef.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    let detectedDirection: SwipeDirection = null;

    // Check time threshold (must be within maxDuration to count as swipe)
    if (elapsed <= maxDuration) {
      if (absDeltaX > absDeltaY && absDeltaX >= minDistance) {
        detectedDirection = deltaX > 0 ? "right" : "left";
      } else if (absDeltaY > absDeltaX && absDeltaY >= minDistance) {
        detectedDirection = deltaY > 0 ? "down" : "up";
      }
    }

    setSwipeDirection(detectedDirection);
    setIsSwiping(false);

    // Fire direction callbacks
    switch (detectedDirection) {
      case "left":
        onSwipeLeftRef.current?.();
        break;
      case "right":
        onSwipeRightRef.current?.();
        break;
      case "up":
        onSwipeUpRef.current?.();
        break;
      case "down":
        onSwipeDownRef.current?.();
        break;
    }

    onSwipeEndRef.current?.(detectedDirection);

    // Reset delta after a tick
    deltaTimeoutRef.current = setTimeout(() => {
      setSwipeDelta({ x: 0, y: 0 });
      swipeDeltaRef.current = { x: 0, y: 0 };
    }, 50);
  }, [minDistance, maxDuration]);

  useEffect(() => {
    return () => {
      if (deltaTimeoutRef.current) clearTimeout(deltaTimeoutRef.current);
    };
  }, []);

  return {
    swipeDirection,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isSwiping,
    swipeDelta,
    reset,
  };
}
