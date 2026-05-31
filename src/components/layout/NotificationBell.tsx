"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  CheckCheck,
  Trash2,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/stores/notification-store";
import type { NotificationType, Notification } from "@/stores/notification-store";
import { cn } from "@/lib/utils";

const typeIconConfig: Record<
  NotificationType,
  { icon: typeof CheckCircle; color: string; bg: string }
> = {
  success: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
  },
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
};

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function NotificationItem({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: (n: Notification) => void;
}) {
  const config = typeIconConfig[notification.type];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
      onClick={() => onClick(notification)}
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/50",
        !notification.read && "bg-muted/30"
      )}
    >
      {/* Unread indicator */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Unread dot */}
          {!notification.read && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          )}
          {notification.read && (
            <span className="h-2 w-2 shrink-0" />
          )}
          {/* Icon */}
          <div
            className={cn(
              "rounded-md p-1.5",
              config.bg,
              config.color
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-sm truncate",
                !notification.read ? "font-semibold text-foreground" : "text-muted-foreground font-normal"
              )}
            >
              {notification.title}
            </p>
          </div>
          {notification.message && (
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {notification.message}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            {formatTime(notification.timestamp)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unreadCount = useNotificationStore((s) =>
    s.notifications.reduce((c, n) => c + (n.read ? 0 : 1), 0)
  );
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markAsRead(n.id);
  };

  const displayCount = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 relative"
        onClick={() => setIsOpen(!isOpen)}
        title="通知中心"
      >
        <Bell
          className={cn(
            "h-4 w-4",
            unreadCount > 0 && "animate-[bell-shake_0.6s_ease-in-out]"
          )}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {displayCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] sm:w-[400px] rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xl shadow-black/10 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h3 className="text-sm font-semibold text-foreground">
                通知中心
                {unreadCount > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {unreadCount}条未读
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={markAllAsRead}
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    全部已读
                  </Button>
                )}
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearAll}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    清空
                  </Button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Inbox className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">暂无通知</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onClick={handleNotificationClick}
                      />
                    ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bell shake keyframes */}
      <style jsx global>{`
        @keyframes bell-shake {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-8deg); }
          75% { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
