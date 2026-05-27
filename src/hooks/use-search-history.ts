const STORAGE_KEY = "kb_search_history";
const MAX_HISTORY = 20;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string): void {
  if (typeof window === "undefined") return;
  if (!query || !query.trim()) return;

  const trimmed = query.trim();
  const history = getSearchHistory();

  // Remove duplicate if exists, then add to front
  const filtered = history.filter((h) => h !== trimmed);
  filtered.unshift(trimmed);

  // Keep only MAX_HISTORY items
  const trimmedHistory = filtered.slice(0, MAX_HISTORY);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function clearSearchHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
