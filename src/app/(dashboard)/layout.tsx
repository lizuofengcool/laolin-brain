"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppStore } from "@/stores/app-store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { LoginForm } from "@/components/auth/LoginForm";
import { ShortcutHelpPanel } from "@/components/help/ShortcutHelpPanel";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { motion, AnimatePresence } from "framer-motion";

// Heavy global overlays (code-split, SSR disabled)
const ImageLightbox = dynamic(
  () => import("@/components/files/ImageLightbox").then((m) => ({ default: m.ImageLightbox })),
  { ssr: false }
);
const AIChatPanel = dynamic(
  () => import("@/components/ai/AIChatPanel").then((m) => ({ default: m.AIChatPanel })),
  { ssr: false }
);

// Page transition variants
const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    isAuthenticated,
    hydrateAuth,
    _setupCrossTabSync,
    aiChatFile,
    setAiChatFile,
    lightboxOpen,
    lightboxImages,
    lightboxIndex,
    closeLightbox,
  } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    hydrateAuth();
    const cleanupSync = _setupCrossTabSync();
    const id = requestAnimationFrame(() => setMounted(true));
    // Clean up expired upload progress on app init
    import("@/lib/chunk-upload").then(({ cleanupExpiredProgress }) => {
      cleanupExpiredProgress().catch(() => {});
    });
    return () => {
      cleanupSync?.();
      cancelAnimationFrame(id);
    };
  }, [hydrateAuth, _setupCrossTabSync]);

  // AI chat panel open state derived from aiChatFile
  const aiChatOpen = !!aiChatFile;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2">
        <LoginForm />
        <p className="text-xs text-muted-foreground mt-4">
          按 <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted px-1 text-xs font-mono">?</kbd> 查看快捷键
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar - desktop */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile nav */}
      <MobileNav />

      {/* Global AI Chat Panel */}
      <AIChatPanel open={aiChatOpen} onOpenChange={(open) => { if (!open) setAiChatFile(null); }} />

      {/* Global Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={closeLightbox}
      />

      {/* Global Shortcut Help Panel */}
      <ShortcutHelpPanel />
    </div>
  );
}
