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

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          setRegistration(reg);

          // Check for updates periodically
          setInterval(() => {
            reg.update();
          }, 60 * 60 * 1000); // Every hour
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

  return {
    isInstalled,
    canInstall,
    install,
    isOnline,
    registration,
    clearCaches,
  };
}
