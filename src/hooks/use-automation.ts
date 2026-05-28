"use client";

import { useEffect, useRef, useCallback } from "react";
import type { FileData } from "@/lib/storage/base";
import {
  type AutomationRule,
  loadRules,
  saveRules,
  updateLastRun,
  getCleanupThreshold,
} from "@/lib/automation/engine";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";

/**
 * Hook that manages automation rules.
 * - Checks auto_cleanup periodically
 * - Can be called on file upload events
 */
export function useAutomation() {
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rulesRef = useRef<AutomationRule[]>([]);

  const runAutoCleanup = useCallback(async () => {
    const currentFiles = useAppStore.getState().files;
    const rules = loadRules();
    const threshold = getCleanupThreshold(rules);
    if (threshold <= 0) return;

    const now = new Date();
    const deletedFiles = currentFiles.filter((f) => {
      if (!f.isDeleted || !f.deletedAt) return false;
      const deletedAt = new Date(f.deletedAt);
      const daysDiff = (now.getTime() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff >= threshold;
    });

    if (deletedFiles.length === 0) return;

    console.log(`[Automation] Cleaning up ${deletedFiles.length} files older than ${threshold} days`);

    const doPermanentDelete = useAppStore.getState().permanentDeleteFile;
    for (const file of deletedFiles) {
      try {
        await doPermanentDelete(file.id);
      } catch (err) {
        console.error(`[Automation] Failed to delete ${file.id}:`, err);
      }
    }

    // Update lastRun
    const updatedRules = updateLastRun(rules, "auto-cleanup");
    saveRules(updatedRules);
    rulesRef.current = updatedRules;

    toast({
      title: "自动清理完成",
      description: `已清理 ${deletedFiles.length} 个超过 ${threshold} 天的文件`,
    });
  }, []);

  // Load rules on mount and set up cleanup interval
  useEffect(() => {
    rulesRef.current = loadRules();

    // Run cleanup check every hour
    cleanupIntervalRef.current = setInterval(() => {
      runAutoCleanup();
    }, 60 * 60 * 1000);

    // Also run once on mount (with a delay)
    const timeout = setTimeout(() => {
      runAutoCleanup();
    }, 5000);

    return () => {
      if (cleanupIntervalRef.current) clearInterval(cleanupIntervalRef.current);
      clearTimeout(timeout);
    };
  }, [runAutoCleanup]);

  // Trigger on file upload (called from UploadZone)
  const onFileUploaded = useCallback((_file: FileData) => {
    const rules = loadRules();
    rulesRef.current = rules;
  }, []);

  return {
    onFileUploaded,
    runAutoCleanup,
  };
}
