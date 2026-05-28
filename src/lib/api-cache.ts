/**
 * api-cache.ts — Lightweight in-memory cache for API responses.
 *
 * Usage:
 *   import { cachedFetch, invalidateCache } from "@/lib/api-cache";
 *   const data = await cachedFetch("/api/files", { method: "GET" }, 5 * 60 * 1000);
 *   invalidateCache("/api/files"); // clear after mutations
 */

// ─── Types ───────────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

type CacheKey = string;

// ─── In-memory store ────────────────────────────────────────

const API_CACHE_MAX = 1000;
const cache = new Map<CacheKey, CacheEntry>();

function cacheEvictFifo(): void {
  // First, proactively remove expired entries
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp >= entry.ttl) {
      cache.delete(key);
    }
  }

  // If still at capacity, fall back to FIFO eviction
  if (cache.size >= API_CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
}

// Default TTL values (ms)
const DEFAULT_TTL = {
  /** File list endpoints: 5 minutes */
  fileList: 5 * 60 * 1000,
  /** Search endpoints: 30 seconds */
  search: 30 * 1000,
  /** Dashboard / analytics: 2 minutes */
  dashboard: 2 * 60 * 1000,
  /** Generic fallback: 1 minute */
  generic: 60 * 1000,
};

// ─── Key generation ─────────────────────────────────────────

function generateCacheKey(url: string, options?: RequestInit): CacheKey {
  const method = options?.method?.toUpperCase() || "GET";
  const body = options?.body ? `:${String(options.body).slice(0, 256)}` : "";
  return `${method}:${url}${body}`;
}

// ─── Auto-detect TTL based on URL pattern ───────────────────

function detectTTL(url: string, explicitTtl?: number): number {
  if (explicitTtl !== undefined) return explicitTtl;

  if (url.includes("/search") || url.includes("/semantic")) return DEFAULT_TTL.search;
  if (url.includes("/files") || url.includes("/folders")) return DEFAULT_TTL.fileList;
  if (url.includes("/dashboard") || url.includes("/analytics") || url.includes("/stats"))
    return DEFAULT_TTL.dashboard;
  return DEFAULT_TTL.generic;
}

// ─── Core functions ─────────────────────────────────────────

/**
 * cachedFetch — wraps fetch() with in-memory caching.
 *
 * @param url    API URL (relative or absolute)
 * @param options fetch options (method, headers, body, etc.)
 * @param ttl    Cache TTL in ms. Auto-detected by URL if omitted.
 * @returns Parsed JSON response
 */
export async function cachedFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  ttl?: number
): Promise<T> {
  const key = generateCacheKey(url, options);
  const resolvedTtl = detectTTL(url, ttl);
  const now = Date.now();

  // Check cache
  const cached = cache.get(key);
  if (cached && now - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }

  // Cache miss or expired — fetch fresh data
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`cachedFetch error: ${response.status} ${response.statusText} for ${url}`);
  }

  const data = await response.json();

  // Store in cache (only cache successful GET requests)
  const method = options?.method?.toUpperCase() || "GET";
  if (method === "GET") {
    cacheEvictFifo();
    cache.set(key, {
      data,
      timestamp: now,
      ttl: resolvedTtl,
    });
  }

  return data as T;
}

/**
 * invalidateCache — removes cache entries matching a URL pattern.
 * If no pattern is given, clears the entire cache.
 *
 * @param pattern  Substring to match against cache keys (e.g., "/api/files")
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }

  for (const [key] of cache) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

/**
 * getCacheStats — returns diagnostic info about the cache (useful for debugging).
 */
export function getCacheStats(): { size: number; entries: Array<{ key: string; age: number; ttl: number }> } {
  const now = Date.now();
  const entries: Array<{ key: string; age: number; ttl: number }> = [];
  for (const [key, entry] of cache) {
    entries.push({
      key: key.slice(0, 80) + (key.length > 80 ? "…" : ""),
      age: Math.round((now - entry.timestamp) / 1000),
      ttl: Math.round(entry.ttl / 1000),
    });
  }
  return { size: cache.size, entries };
}
