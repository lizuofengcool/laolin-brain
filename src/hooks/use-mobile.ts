import * as React from "react"
import { useState, useEffect, useCallback, useRef } from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

// 设备类型
export type DeviceType = "mobile" | "tablet" | "desktop"

// 触摸手势类型
export type SwipeDirection = "up" | "down" | "left" | "right"

// 手势事件
export interface SwipeEvent {
  direction: SwipeDirection
  distance: number
  velocity: number
  startX: number
  startY: number
  endX: number
  endY: number
}

/**
 * 检测设备类型
 */
export const getDeviceType = (): DeviceType => {
  if (typeof window === "undefined") return "desktop"

  const width = window.innerWidth

  if (width < MOBILE_BREAKPOINT) return "mobile"
  if (width < TABLET_BREAKPOINT) return "tablet"
  return "desktop"
}

/**
 * 检测是否是移动端
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/**
 * 检测是否是触摸设备
 */
export const isTouchDevice = (): boolean => {
  if (typeof window === "undefined") return false
  return "ontouchstart" in window || navigator.maxTouchPoints > 0
}

/**
 * 检测是否是PWA模式（已安装）
 */
export const isPWAMode = (): boolean => {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  )
}

/**
 * 检测是否支持PWA安装
 */
export const canInstallPWA = (): boolean => {
  if (typeof window === "undefined") return false
  return "BeforeInstallPromptEvent" in window
}

/**
 * Hook: 检测是否是移动端
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * Hook: 获取设备信息
 */
export function useDeviceInfo() {
  const [deviceType, setDeviceType] = useState<DeviceType>("desktop")
  const [isTouch, setIsTouch] = useState(false)
  const [isPWA, setIsPWA] = useState(false)
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "portrait"
  )

  useEffect(() => {
    const updateDeviceInfo = () => {
      setDeviceType(getDeviceType())
      setIsTouch(isTouchDevice())
      setIsPWA(isPWAMode())
      setOrientation(
        window.innerHeight > window.innerWidth ? "portrait" : "landscape"
      )
    }

    updateDeviceInfo()
    window.addEventListener("resize", updateDeviceInfo)
    window.addEventListener("orientationchange", updateDeviceInfo)

    return () => {
      window.removeEventListener("resize", updateDeviceInfo)
      window.removeEventListener("orientationchange", updateDeviceInfo)
    }
  }, [])

  return {
    deviceType,
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isTouch,
    isPWA,
    orientation,
    isPortrait: orientation === "portrait",
    isLandscape: orientation === "landscape",
  }
}

/**
 * Hook: 滑动手势检测
 */
export function useSwipe(
  elementRef: React.RefObject<HTMLElement>,
  onSwipe?: (event: SwipeEvent) => void,
  options?: {
    threshold?: number
    timeout?: number
  }
) {
  const startX = useRef(0)
  const startY = useRef(0)
  const startTime = useRef(0)
  const isSwiping = useRef(false)

  const threshold = options?.threshold ?? 50
  const timeout = options?.timeout ?? 500

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    startX.current = touch.clientX
    startY.current = touch.clientY
    startTime.current = Date.now()
    isSwiping.current = true
  }, [])

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!isSwiping.current) return

      const touch = e.changedTouches[0]
      const endX = touch.clientX
      const endY = touch.clientY
      const endTime = Date.now()

      const deltaX = endX - startX.current
      const deltaY = endY - startY.current
      const deltaTime = endTime - startTime.current

      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      const velocity = distance / deltaTime

      if (distance < threshold || deltaTime > timeout) {
        isSwiping.current = false
        return
      }

      let direction: SwipeDirection
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        direction = deltaX > 0 ? "right" : "left"
      } else {
        direction = deltaY > 0 ? "down" : "up"
      }

      const swipeEvent: SwipeEvent = {
        direction,
        distance,
        velocity,
        startX: startX.current,
        startY: startY.current,
        endX,
        endY,
      }

      onSwipe?.(swipeEvent)
      isSwiping.current = false
    },
    [onSwipe, threshold, timeout]
  )

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    element.addEventListener("touchstart", handleTouchStart)
    element.addEventListener("touchend", handleTouchEnd)

    return () => {
      element.removeEventListener("touchstart", handleTouchStart)
      element.removeEventListener("touchend", handleTouchEnd)
    }
  }, [elementRef, handleTouchStart, handleTouchEnd])
}

/**
 * Hook: 下拉刷新
 */
export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void>,
  options?: {
    threshold?: number
    maxDistance?: number
  }
) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  const startY = useRef(0)
  const isPulling = useRef(false)

  const threshold = options?.threshold ?? 80
  const maxDistance = options?.maxDistance ?? 150

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const container = containerRef.current
    if (!container) return

    if (container.scrollTop > 0) return

    const touch = e.touches[0]
    startY.current = touch.clientY
    isPulling.current = true
  }, [containerRef])

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return

      const touch = e.touches[0]
      const deltaY = touch.clientY - startY.current

      if (deltaY > 0) {
        e.preventDefault()
        const distance = Math.min(deltaY * 0.5, maxDistance)
        setPullDistance(distance)
      }
    },
    [isRefreshing, maxDistance]
  )

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return
    isPulling.current = false

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("touchstart", handleTouchStart)
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    })
    container.addEventListener("touchend", handleTouchEnd)

    return () => {
      container.removeEventListener("touchstart", handleTouchStart)
      container.removeEventListener("touchmove", handleTouchMove)
      container.removeEventListener("touchend", handleTouchEnd)
    }
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd])

  return {
    isRefreshing,
    pullDistance,
    isPulling: pullDistance > 0,
  }
}

/**
 * Hook: 无限滚动（上拉加载更多）
 */
export function useInfiniteScroll(
  containerRef: React.RefObject<HTMLElement>,
  loadMore: () => Promise<void>,
  options?: {
    threshold?: number
  }
) {
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const threshold = options?.threshold ?? 200

  const handleScroll = useCallback(async () => {
    const container = containerRef.current
    if (!container || isLoading || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    if (distanceToBottom < threshold) {
      setIsLoading(true)
      try {
        await loadMore()
      } finally {
        setIsLoading(false)
      }
    }
  }, [containerRef, isLoading, hasMore, threshold, loadMore])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [containerRef, handleScroll])

  return {
    isLoading,
    hasMore,
    setHasMore,
  }
}

/**
 * 安全区域inset（针对刘海屏等）
 */
export const getSafeAreaInsets = (): {
  top: number
  bottom: number
  left: number
  right: number
} => {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }

  const style = getComputedStyle(document.documentElement)

  return {
    top: parseInt(style.getPropertyValue("--sat") || "0", 10) || 0,
    bottom: parseInt(style.getPropertyValue("--sab") || "0", 10) || 0,
    left: parseInt(style.getPropertyValue("--sal") || "0", 10) || 0,
    right: parseInt(style.getPropertyValue("--sar") || "0", 10) || 0,
  }
}

/**
 * Hook: 安全区域inset
 */
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  })

  useEffect(() => {
    const updateInsets = () => {
      setInsets(getSafeAreaInsets())
    }

    updateInsets()
    window.addEventListener("resize", updateInsets)
    window.addEventListener("orientationchange", updateInsets)

    return () => {
      window.removeEventListener("resize", updateInsets)
      window.removeEventListener("orientationchange", updateInsets)
    }
  }, [])

  return insets
}
