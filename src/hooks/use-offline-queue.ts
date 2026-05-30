"use client";

import { useEffect, useState } from "react";
import { getOfflineQueueCount, processOfflineQueue } from "@/lib/offline-queue";
import { useAppStore } from "@/stores/app-store";

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // Track online/offline status via browser events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        setIsSyncing(true);
        try {
          const result = await processOfflineQueue();
          if (result.processed > 0) {
            await useAppStore.getState().refreshFiles();
          }
          const newCount = await getOfflineQueueCount();
          setPendingCount(newCount);
        } catch {
          // Sync failed, items remain in queue for next attempt
        } finally {
          setIsSyncing(false);
        }
      };
      process();
    }
  }, [isOnline, pendingCount]);

  return { pendingCount, isOnline, isSyncing };
}
