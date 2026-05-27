/**
 * Safe JSON.parse utility with try-catch and fallback.
 * Returns the fallback value if parsing fails.
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON.parse for array values, defaults to empty array.
 */
export function safeJsonParseArray(value: string | null | undefined): unknown[] {
  return safeJsonParse(value, []);
}
