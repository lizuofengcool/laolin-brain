"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Detect if the device supports touch events.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * useSwipeLeft — detect left swipe gesture on an element.
 * Triggers callback when user swipes left more than threshold pixels.
 */
export function useSwipeLeft(
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
  options?: { threshold?: number }
) {
  const threshold = options?.threshold || 50;
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isTouchDevice() || !ref.current) return;

    const el = ref.current;

    const onTouchStart = (e: TouchEvent) => {
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      trackingRef.current = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startXRef.current - endX;
      const diffY = Math.abs(startYRef.current - endY);

      if (diffX > threshold && diffY < diffX * 0.6) {
        callbackRef.current();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [ref, threshold]);
}

/**
 * useSwipeRight — detect right swipe gesture on an element.
 */
export function useSwipeRight(
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
  options?: { threshold?: number }
) {
  const threshold = options?.threshold || 50;
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isTouchDevice() || !ref.current) return;

    const el = ref.current;

    const onTouchStart = (e: TouchEvent) => {
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      trackingRef.current = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      trackingRef.current = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startXRef.current;
      const diffY = Math.abs(startYRef.current - endY);

      if (diffX > threshold && diffY < diffX * 0.6) {
        callbackRef.current();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [ref, threshold]);
}

/**
 * useLongPress — detect long press gesture on an element.
 * Triggers callback after holding for delay milliseconds.
 */
export function useLongPress(
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
  options?: { delay?: number }
) {
  const delay = options?.delay || 500;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isTouchDevice() || !ref.current) return;

    const el = ref.current;

    const onTouchStart = (e: TouchEvent) => {
      startPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };

      timerRef.current = setTimeout(() => {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(50);
        }
        callbackRef.current();
      }, delay);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (timerRef.current) {
        const dx = Math.abs(e.touches[0].clientX - startPosRef.current.x);
        const dy = Math.abs(e.touches[0].clientY - startPosRef.current.y);
        if (dx > 10 || dy > 10) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    const onTouchEnd = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ref, delay]);
}

/**
 * usePullToRefresh — detect pull-down gesture for refresh.
 * Returns state and methods for pull-to-refresh functionality.
 */
export function usePullToRefresh(
  callback: () => Promise<void>,
  options?: { threshold?: number }
) {
  const threshold = options?.threshold || 80;
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef(0);
  const isAtTopRef = useRef(false);
  const callbackRef = useRef(callback);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop <= 0) {
      isAtTopRef.current = true;
      startYRef.current = e.touches[0].clientY;
    } else {
      isAtTopRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing || !isAtTopRef.current) return;

      const diff = e.touches[0].clientY - startYRef.current;

      if (diff > 0) {
        const resisted = diff * 0.4;
        const distance = Math.min(resisted, threshold * 1.5);
        setPullDistance(distance);
        pullDistanceRef.current = distance;
        setIsPulling(resisted > 10);
      }
    },
    [isRefreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    const currentPull = pullDistanceRef.current;
    setPullDistance(0);
    isAtTopRef.current = false;

    if (currentPull >= threshold && !isRefreshingRef.current) {
      setIsPulling(false);
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await callbackRef.current();
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      }
    } else {
      setIsPulling(false);
    }
  }, [threshold]);

  const bindEvents = useCallback(
    (el: HTMLElement | null) => {
      if (!el || !isTouchDevice()) return;

      el.addEventListener("touchstart", handleTouchStart, { passive: true });
      el.addEventListener("touchmove", handleTouchMove, { passive: true });
      el.addEventListener("touchend", handleTouchEnd, { passive: true });

      return () => {
        el.removeEventListener("touchstart", handleTouchStart);
        el.removeEventListener("touchmove", handleTouchMove);
        el.removeEventListener("touchend", handleTouchEnd);
      };
    },
    [handleTouchStart, handleTouchMove, handleTouchEnd]
  );

  return {
    isPulling,
    isRefreshing,
    pullDistance,
    bindEvents,
  };
}
