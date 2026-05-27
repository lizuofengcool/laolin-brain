"use client";

import { create } from "zustand";

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
}

const STORAGE_KEY = "kb_notifications";
const MAX_NOTIFICATIONS = 50;

function loadNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_NOTIFICATIONS);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveNotifications(notifications: Notification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS))
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
      setTimeout(() => {
        get().dismissNotification(id);
      }, duration);
    }

    return id;
  },

  dismissNotification: (id) => {
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
    saveNotifications([]);
    set({ notifications: [] });
  },

  getUnreadCount: () => {
    return get().notifications.filter((n) => !n.read).length;
  },
}));

// Hydrate from localStorage on client
if (typeof window !== "undefined") {
  const stored = loadNotifications();
  if (stored.length > 0) {
    useNotificationStore.setState({ notifications: stored });
  }
}
