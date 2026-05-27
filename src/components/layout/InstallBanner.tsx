'use client';

import { useEffect, useState } from 'react';
import { usePWA } from '@/hooks/use-service-worker';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function getWasDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return !!sessionStorage.getItem('pwa-install-dismissed');
}

export function InstallBanner() {
  const { canInstall, install } = usePWA();
  const [dismissed, setDismissed] = useState(getWasDismissed);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    // Show banner after a short delay if install is available
    if (canInstall) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, dismissed]);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      setVisible(false);
      sessionStorage.setItem('pwa-install-dismissed', 'true');
    }
  };

  if (dismissed || !canInstall || !visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-0 left-0 right-0 z-[100] p-2 sm:p-3"
        >
          <div className="mx-auto max-w-lg rounded-xl border border-primary/20 bg-card/95 backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-3 p-3 sm:p-4">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">
                  安装到桌面
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  添加到主屏幕，获得更好的移动端体验
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  onClick={handleInstall}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  安装
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleDismiss}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
