'use client';

import { usePWA } from '@/hooks/use-service-worker';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-[101] pointer-events-none"
        >
          <div className="flex items-center justify-center">
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-destructive/90 px-4 py-1.5 text-xs font-medium text-destructive-foreground shadow-lg backdrop-blur-sm">
              <WifiOff className="h-3.5 w-3.5" />
              <span>离线模式 - 部分功能不可用</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Online status badge for use inside the app (e.g., in header) */
export function OnlineStatusBadge() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      <WifiOff className="h-3 w-3 text-destructive" />
      <span>离线</span>
    </div>
  );
}
