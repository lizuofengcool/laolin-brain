/**
 * Compute SHA-256 hash of a File object using Web Crypto API
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check if a file's hash matches any existing file hashes
 * Returns the first matching file name if duplicate found, null otherwise
 */
export function findDuplicateByHash(
  fileHash: string,
  existingFiles: { id: string; fileName: string; fileHash?: string }[]
): { id: string; fileName: string } | null {
  for (const existing of existingFiles) {
    if (existing.fileHash && existing.fileHash === fileHash) {
      return { id: existing.id, fileName: existing.fileName };
    }
  }
  return null;
}

/**
 * Compute file hash and check for duplicates in one step
 */
export async function checkDuplicateOnUpload(
  file: File,
  existingFiles: { id: string; fileName: string; fileHash?: string }[]
): Promise<{ isDuplicate: boolean; duplicateFile?: { id: string; fileName: string }; hash: string }> {
  const hash = await computeFileHash(file);
  const duplicate = findDuplicateByHash(hash, existingFiles);
  return {
    isDuplicate: !!duplicate,
    duplicateFile: duplicate || undefined,
    hash,
  };
}
