"use client";

import { useEffect, useState } from "react";
import { getOfflineQueueCount, processOfflineQueue } from "@/lib/offline-queue";
import { useAppStore } from "@/stores/app-store";

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline] = useState(true);

  useEffect(() => {
    // Check pending operations count
    const checkQueue = async () => {
      try {
        const count = await getOfflineQueueCount();
        setPendingCount(count);
      } catch {}
    };

    checkQueue();
    const interval = setInterval(checkQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  // Process queue when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      const process = async () => {
        try {
          const result = await processOfflineQueue();
          if (result.processed > 0) {
            await useAppStore.getState().refreshFiles();
            setPendingCount(await getOfflineQueueCount());
          }
        } catch {}
      };
      process();
    }
  }, [isOnline, pendingCount]);

  return { pendingCount };
}
