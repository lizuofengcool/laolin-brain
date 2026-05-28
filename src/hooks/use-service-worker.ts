'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ─── External store for online/offline status ─────────────────────
let onlineListeners: Array<() => void> = [];
let currentOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function subscribeOnline(callback: () => void) {
  onlineListeners.push(callback);
  return () => {
    onlineListeners = onlineListeners.filter((l) => l !== callback);
  };
}

function getOnlineSnapshot() {
  return currentOnline;
}

function getServerOnlineSnapshot() {
  return true;
}

// Initialize online/offline listeners (side-effect free registration)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    currentOnline = true;
    onlineListeners.forEach((l) => l());
  });
  window.addEventListener('offline', () => {
    currentOnline = false;
    onlineListeners.forEach((l) => l());
  });
}

// ─── External store for install prompt ────────────────────────────
let installPromptListeners: Array<() => void> = [];
let currentPrompt: BeforeInstallPromptEvent | null = null;

function subscribePrompt(callback: () => void) {
  installPromptListeners.push(callback);
  return () => {
    installPromptListeners = installPromptListeners.filter((l) => l !== callback);
  };
}

function getPromptSnapshot() {
  return currentPrompt;
}

function getServerPromptSnapshot() {
  return null;
}

// Initialize beforeinstallprompt listener
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    currentPrompt = e as BeforeInstallPromptEvent;
    installPromptListeners.forEach((l) => l());
  });
}

export function usePWA() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Use useSyncExternalStore for reactive online/offline status
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);

  // Use useSyncExternalStore for install prompt
  const installPrompt = useSyncExternalStore(subscribePrompt, getPromptSnapshot, getServerPromptSnapshot);

  // Check if already installed (standalone mode) - computed, not state
  const isInstalled = (() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone;
  })();

  const canInstall = !!installPrompt;

  let updateInterval: ReturnType<typeof setInterval> | null = null;

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          setRegistration(reg);

          // Check for updates periodically
          updateInterval = setInterval(() => {
            reg.update();
          }, 60 * 60 * 1000); // Every hour

          // Listen for new service worker update
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    }

    // Listen for app installed event
    const installedHandler = () => {
      // Clear the prompt on install
      currentPrompt = null;
      installPromptListeners.forEach((l) => l());
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!currentPrompt) return false;
    try {
      await currentPrompt.prompt();
      const { outcome } = await currentPrompt.userChoice;
      if (outcome === 'accepted') {
        currentPrompt = null;
        installPromptListeners.forEach((l) => l());
      }
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  const clearCaches = useCallback(async () => {
    if (registration) {
      registration.active?.postMessage({ type: 'CLEAR_CACHES' });
    }
  }, [registration]);

  // Register background sync for failed uploads
  const registerBackgroundSync = useCallback(async () => {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // SyncManager is not in default TS types, cast via any
        await (reg as unknown as { sync: { register(tag: string): Promise<void> } }).sync.register('upload-sync');
      } catch {
        // Sync not supported, background sync will be handled by SW on next online
      }
    }
  }, []);

  // Apply a pending service worker update
  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      registration.waiting.addEventListener('activated', () => {
        window.location.reload();
      });
    }
  }, [registration]);

  return {
    isInstalled,
    canInstall,
    install,
    isOnline,
    registration,
    clearCaches,
    registerBackgroundSync,
    updateAvailable,
    applyUpdate,
  };
}
