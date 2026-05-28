"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTouchDevice } from "@/hooks/use-gestures";
import { usePWA } from "@/hooks/use-service-worker";
import { toast } from "@/hooks/use-toast";

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
  threshold?: number;
}

export function PullToRefresh({ children, onRefresh, className, threshold = 80 }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef(0);
  const isAtTopRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isOnline } = usePWA();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop || 0;
    isAtTopRef.current = scrollTop <= 0;

    if (isAtTopRef.current) {
      startYRef.current = e.touches[0].clientY;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing || !isAtTopRef.current) return;

      const diff = e.touches[0].clientY - startYRef.current;

      if (diff > 0) {
        const resisted = diff * 0.4;
        setPullDistance(Math.min(resisted, threshold * 1.5));
        setIsPulling(resisted > 10);
      }
    },
    [isRefreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (isPulling && pullDistance >= threshold && !isRefreshing) {
      // Check offline status before triggering refresh
      if (!isOnline) {
        toast({
          title: "离线模式",
          description: "无法刷新，请检查网络连接",
          variant: "destructive",
        });
        setIsPulling(false);
        setPullDistance(0);
        isAtTopRef.current = false;
        return;
      }

      setIsRefreshing(true);
      setIsPulling(false);
      setPullDistance(0);

      try {
        await onRefresh();
      } catch (err) {
        console.error("Pull to refresh failed:", err);
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setIsPulling(false);
      setPullDistance(0);
    }
    isAtTopRef.current = false;
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh, isOnline]);

  useEffect(() => {
    if (!isTouchDevice()) return;

    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = isPulling || isRefreshing;

  return (
    <div className={cn("relative", className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          "flex flex-col items-center justify-center transition-all duration-200 overflow-hidden md:hidden",
          showIndicator ? "h-12 opacity-100" : "h-0 opacity-0"
        )}
        style={{
          transform: isRefreshing ? "scale(1)" : `scale(${0.5 + progress * 0.5})`,
        }}
      >
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <RefreshCw
            className="h-5 w-5 text-muted-foreground transition-transform"
            style={{
              transform: `rotate(${progress * 180}deg)`,
            }}
          />
        )}
        <span className="text-[10px] text-muted-foreground mt-1">
          {isRefreshing ? "刷新中..." : pullDistance >= threshold ? "释放刷新" : "下拉刷新"}
        </span>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="w-full"
        style={{
          transform: showIndicator && !isRefreshing ? `translateY(${pullDistance}px)` : undefined,
          transition: isRefreshing ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
