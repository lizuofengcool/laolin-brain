/**
 * Simple hash function for backup integrity checking.
 * Matches the same algorithm used in BackupRestore.tsx client component.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Verify that a JSON data payload matches an expected checksum.
 * Uses simpleHash on the JSON string representation of the data.
 *
 * @returns true if the checksum matches or if no checksum was provided (skip verification)
 * @returns false if the checksum does not match (data may be tampered)
 */
export function verifyChecksum(data: unknown, expectedChecksum: string | undefined): boolean {
  if (!expectedChecksum) return true; // no checksum provided, skip verification
  const jsonStr = JSON.stringify(data);
  const actualChecksum = simpleHash(jsonStr);
  return actualChecksum === expectedChecksum;
}
