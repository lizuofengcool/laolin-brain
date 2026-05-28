import type { StorageAdapter, FileData } from "./base";

/**
 * Get the current auth token from localStorage (client-side only).
 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kb_token");
}

/**
 * Build headers with Authorization token.
 */
function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { "Authorization": `Bearer ${token}` };
  }
  return {};
}

/**
 * Wrapper around fetch with a 15-second timeout via AbortController.
 */
function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Check if response is 401 and trigger logout + redirect.
 */
function handleUnauthorizedResponse(_response: Response): void {
  if (typeof window === "undefined") return;
  // Dynamic import to avoid circular dependency at module level
  import("@/stores/app-store").then(({ useAppStore }) => {
    const state = useAppStore.getState();
    if (state.isAuthenticated) {
      state.logout();
      window.location.href = "/";
    }
  });
}

export class ServerStorageAdapter implements StorageAdapter {
  private baseUrl: string;

  constructor() {
    this.baseUrl = "/api/files";
  }

  async uploadFile(
    file: File,
    userId: string
  ): Promise<{
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    filePath?: string;
    textContent?: string;
    thumbnailUrl?: string;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetchWithTimeout(this.baseUrl, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  }

  async deleteFile(fileId: string, _userId: string): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/${fileId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) {
      throw new Error(`Failed to delete file: ${res.status}`);
    }
  }

  async getFile(fileId: string, _userId: string): Promise<FileData | null> {
    const res = await fetchWithTimeout(`${this.baseUrl}/${fileId}`, {
      headers: authHeaders(),
    });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) return null;
    return res.json();
  }

  async searchFiles(query: string, _userId: string): Promise<FileData[]> {
    const token = getAuthToken();
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetchWithTimeout(url, { headers });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) return [];
    return res.json();
  }

  async updateFile(
    fileId: string,
    data: Partial<FileData>,
    _userId: string
  ): Promise<void> {
    const res = await fetchWithTimeout(`${this.baseUrl}/${fileId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) {
      throw new Error(`Failed to update file: ${res.status}`);
    }
  }

  async getFiles(_userId: string): Promise<FileData[]> {
    const token = getAuthToken();
    const url = `${this.baseUrl}`;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetchWithTimeout(url, { headers });
    if (res.status === 401) handleUnauthorizedResponse(res);
    if (!res.ok) return [];
    return res.json();
  }
}
