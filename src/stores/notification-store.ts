"use client";

import { create } from "zustand";
import { useAppStore } from "./app-store";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
  action?: {
    label: string;
    onClick?: () => void;
  };
  autoDismiss?: boolean;
  duration?: number;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">
  ) => string;
  dismissNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  getUnreadCount: () => number;
  rehydrate: () => void;
}

const MAX_NOTIFICATIONS = 50;
const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getNotificationStorageKey(): string {
  if (typeof window === "undefined") return "kb_notifications";
  const userId = useAppStore.getState().user?.id;
  return userId ? `kb_notifications_${userId}` : "kb_notifications";
}

function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(getNotificationStorageKey());
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
        .slice(0, MAX_NOTIFICATIONS);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveNotifications(notifications: Notification[]) {
  if (typeof window === "undefined") return;
  try {
    // Only persist non-auto-dismiss notifications (timers can't be restored)
    const persistable = notifications.filter((n) => n.autoDismiss === false);
    localStorage.setItem(
      getNotificationStorageKey(),
      JSON.stringify(persistable.slice(0, MAX_NOTIFICATIONS))
    );
  } catch {
    // ignore
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = crypto.randomUUID();
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };

    set((state) => {
      const updated = [newNotification, ...state.notifications].slice(
        0,
        MAX_NOTIFICATIONS
      );
      saveNotifications(updated);
      return { notifications: updated };
    });

    // Auto dismiss
    if (notification.autoDismiss !== false) {
      const duration = notification.duration || 5000;
      autoDismissTimers.set(
        id,
        setTimeout(() => {
          autoDismissTimers.delete(id);
          get().dismissNotification(id);
        }, duration)
      );
    }

    return id;
  },

  dismissNotification: (id) => {
    const timer = autoDismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      autoDismissTimers.delete(id);
    }
    set((state) => {
      const updated = state.notifications.filter((n) => n.id !== id);
      saveNotifications(updated);
      return { notifications: updated };
    });
  },

  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      saveNotifications(updated);
      return { notifications: updated };
    });
  },

  markAllAsRead: () => {
    set((state) => {
      const updated = state.notifications.map((n) => ({ ...n, read: true }));
      saveNotifications(updated);
      return { notifications: updated };
    });
  },

  clearAll: () => {
    for (const timer of autoDismissTimers.values()) {
      clearTimeout(timer);
    }
    autoDismissTimers.clear();
    saveNotifications([]);
    set({ notifications: [] });
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },

  rehydrate: () => {
    // Clear any existing auto-dismiss timers
    for (const timer of autoDismissTimers.values()) {
      clearTimeout(timer);
    }
    autoDismissTimers.clear();
    const stored = loadNotifications();
    // Filter out auto-dismissable notifications on rehydration
    // (timers cannot be reliably restored after page refresh)
    const active = stored.filter((n) => n.autoDismiss === false);
    set({ notifications: active });
  },
}));

// Hydrate from localStorage on client
if (typeof window !== "undefined") {
  const stored = loadNotifications();
  if (stored.length > 0) {
    // Filter out auto-dismissable notifications (timers lost on page refresh)
    const active = stored.filter((n) => n.autoDismiss === false);
    if (active.length > 0) {
      useNotificationStore.setState({ notifications: active });
    }
  }
}
