"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";
import { useNotificationStore } from "@/stores/notification-store";
import type { NotificationType, Notification } from "@/stores/notification-store";

const typeConfig: Record<
  NotificationType,
  {
    icon: typeof CheckCircle;
    borderClass: string;
    iconColor: string;
    progressColor: string;
    bgGradient: string;
  }
> = {
  success: {
    icon: CheckCircle,
    borderClass: "border-l-emerald-500",
    iconColor: "text-emerald-500",
    progressColor: "from-emerald-500 to-emerald-400",
    bgGradient: "from-emerald-500/5 to-transparent",
  },
  error: {
    icon: XCircle,
    borderClass: "border-l-red-500",
    iconColor: "text-red-500",
    progressColor: "from-red-500 to-red-400",
    bgGradient: "from-red-500/5 to-transparent",
  },
  info: {
    icon: Info,
    borderClass: "border-l-blue-500",
    iconColor: "text-blue-500",
    progressColor: "from-blue-500 to-blue-400",
    bgGradient: "from-blue-500/5 to-transparent",
  },
  warning: {
    icon: AlertTriangle,
    borderClass: "border-l-amber-500",
    iconColor: "text-amber-500",
    progressColor: "from-amber-500 to-amber-400",
    bgGradient: "from-amber-500/5 to-transparent",
  },
};

const MAX_VISIBLE = 3;

function ToastItem({
  notification,
  onDismiss,
  index,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
  index: number;
}) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;
  const duration = notification.duration || 5000;
  const autoDismiss = notification.autoDismiss !== false;
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const pausedProgressRef = useRef<number>(100);
  const animationRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (!autoDismiss) return;

    startTimeRef.current = Date.now();
    pausedProgressRef.current = 100;
    setProgress(100);

    const tick = () => {
      if (isPausedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        onDismiss(notification.id);
        return;
      }
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [autoDismiss, duration, notification.id, onDismiss]);

  const handleMouseEnter = () => {
    if (!autoDismiss) return;
    setIsPaused(true);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    pausedProgressRef.current = progress;
  };

  const handleMouseLeave = () => {
    if (!autoDismiss) return;
    setIsPaused(false);
    // Adjust start time so remaining time matches paused progress
    const remainingMs = (pausedProgressRef.current / 100) * duration;
    startTimeRef.current = Date.now() - (duration - remainingMs);
    animationRef.current = requestAnimationFrame(function restartTick() {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        onDismiss(notification.id);
        return;
      }
      animationRef.current = requestAnimationFrame(restartTick);
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{
        opacity: 1,
        x: 0,
        scale: 1,
        transition: {
          type: "spring",
          damping: 25,
          stiffness: 300,
          delay: index * 0.05,
        },
      }}
      exit={{
        opacity: 0,
        x: 120,
        scale: 0.85,
        transition: { duration: 0.2, ease: "easeIn" },
      }}
      className="pointer-events-auto w-80 sm:w-96"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`relative overflow-hidden rounded-xl border border-border/60 border-l-4 ${config.borderClass} bg-card/80 backdrop-blur-xl shadow-lg shadow-black/5`}
      >
        {/* Background gradient */}
        <div className={`absolute inset-0 bg-gradient-to-r ${config.bgGradient} pointer-events-none`} />

        {/* Content */}
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`mt-0.5 shrink-0 ${config.iconColor}`}>
              <Icon className="h-5 w-5" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {notification.title}
              </p>
              {notification.message && (
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {notification.message}
                </p>
              )}

              {/* Action button */}
              {notification.action && (
                <button
                  className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  onClick={() => {
                    void notification.action;
                    onDismiss(notification.id);
                  }}
                >
                  {notification.action.label} →
                </button>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => onDismiss(notification.id)}
              className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {autoDismiss && (
          <div className="h-0.5 bg-muted/30">
            <motion.div
              className={`h-full bg-gradient-to-r ${config.progressColor} ${
                isPaused ? "opacity-40" : ""
              }`}
              style={{
                width: isPaused ? `${pausedProgressRef.current}%` : `${progress}%`,
                transition: isPaused ? "none" : "width 0.05s linear",
              }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ToastNotifications() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);

  // Only show non-dismissed notifications, limited to MAX_VISIBLE
  const autoDismissNotifs = notifications.filter(
    (n) => n.autoDismiss !== false
  );
  const visibleNotifications = autoDismissNotifs.slice(0, MAX_VISIBLE);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleNotifications.map((notification, index) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onDismiss={dismissNotification}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
