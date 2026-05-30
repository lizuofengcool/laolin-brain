import { createHash } from 'crypto';

/**
 * SHA-256 hash function for backup integrity checking.
 * Matches the same algorithm used in BackupRestore.tsx client component.
 */
export function simpleHash(str: string): string {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Verify that a JSON data payload matches an expected checksum.
 * Uses simpleHash (SHA-256) on the JSON string representation of the data.
 *
 * @returns true if the checksum matches
 * @returns false if the checksum is missing or does not match (data may be tampered)
 */
export function verifyChecksum(data: unknown, expectedChecksum: string | undefined): boolean {
  if (!expectedChecksum) return false;
  const jsonStr = JSON.stringify(data);
  const actualChecksum = simpleHash(jsonStr);
  return actualChecksum === expectedChecksum;
}
