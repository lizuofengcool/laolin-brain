"use client";

import type { FileData } from "@/lib/storage/base";
import { useAppStore } from "@/stores/app-store";

/**
 * Download a file from either cloud or local storage
 */
export async function downloadFile(file: FileData): Promise<void> {
  const { storageMode } = useAppStore.getState();

  if (storageMode === "cloud") {
    const res = await fetch(`/api/files/${file.id}/download`);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    triggerDownload(blob, file.fileName);
  } else {
    const { openDB } = await import("idb");
    const db = await openDB("knowledge-base-db", 1);
    const record = await db.get("files", file.id);
    if (!record?.data) throw new Error("File not found in local storage");
    const binaryStr = atob(record.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    triggerDownload(new Blob([bytes]), file.fileName);
  }
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
