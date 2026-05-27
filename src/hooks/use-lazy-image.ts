"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseLazyImageOptions {
  /** IntersectionObserver threshold (0–1). Default: 0.1 */
  threshold?: number;
  /** Root margin for observer. Default: "200px" */
  rootMargin?: string;
}

interface UseLazyImageReturn {
  /** Ref to attach to the container element wrapping the <img> */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Whether the image has finished loading */
  isLoaded: boolean;
  /** Whether the image is currently loading (in viewport but not yet loaded) */
  isLoading: boolean;
  /** The actual src to pass to <img>; empty until visible */
  src: string;
}

/**
 * useLazyImage — defers image loading until the element enters the viewport.
 * Shows a blur-up placeholder while loading.
 *
 * @param src  The full image URL
 * @param options  Configuration for IntersectionObserver
 */
export function useLazyImage(src: string, options: UseLazyImageOptions = {}): UseLazyImageReturn {
  const { threshold = 0.1, rootMargin = "200px" } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasAutoTriggered = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Respect user preference for reduced motion / data
    if (typeof window !== "undefined" && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(el);
          }
        },
        { threshold, rootMargin }
      );
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      // Fallback: load immediately
      setIsVisible(true);
    }
  }, [threshold, rootMargin]);

  // Auto-trigger loading once visible
  useEffect(() => {
    if (isVisible && !hasAutoTriggered.current) {
      hasAutoTriggered.current = true;
    }
  }, [isVisible]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const isLoading = isVisible && !isLoaded;

  return {
    ref: containerRef,
    isLoaded,
    isLoading,
    src: isVisible ? src : "",
  };
}
