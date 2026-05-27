"use client";

import { useNotificationStore } from "@/stores/notification-store";

export function useNotification() {
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    success: (title: string, message?: string) =>
      addNotification({
        type: "success",
        title,
        message,
        autoDismiss: true,
        duration: 4000,
      }),

    error: (title: string, message?: string) =>
      addNotification({
        type: "error",
        title,
        message,
        autoDismiss: true,
        duration: 6000,
      }),

    info: (title: string, message?: string) =>
      addNotification({
        type: "info",
        title,
        message,
        autoDismiss: true,
        duration: 4000,
      }),

    warning: (title: string, message?: string) =>
      addNotification({
        type: "warning",
        title,
        message,
        autoDismiss: true,
        duration: 5000,
      }),
  };
}
