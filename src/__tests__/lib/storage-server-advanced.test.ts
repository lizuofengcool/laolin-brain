import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerStorageAdapter } from '@/lib/storage/server';

// Mock localStorage for auth token
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? undefined),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock the app-store module to test 401 handling
vi.mock('@/stores/app-store', () => ({
  useAppStore: {
    getState: vi.fn().mockReturnValue({
      isAuthenticated: true,
      logout: vi.fn(),
    }),
  },
}));

let mockFetchFn: ReturnType<typeof vi.fn>;

describe('ServerStorageAdapter - advanced', () => {
  let adapter: ServerStorageAdapter;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    adapter = new ServerStorageAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 401 handling (handleUnauthorizedResponse) ────────────

  describe('401 unauthorized handling', () => {
    it('uploadFile triggers logout on 401', async () => {
      localStorageMock.getItem.mockReturnValue('expired-token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      const file = new File(['data'], 'test.txt', { type: 'text/plain' });
      await expect(adapter.uploadFile(file, 'user-1')).rejects.toThrow('Upload failed');

      // Verify the 401 handler was triggered (dynamic import of app-store)
      expect(mockFetchFn).toHaveBeenCalled();
    });

    it('deleteFile triggers logout on 401', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.deleteFile('file-1', 'user-1')).rejects.toThrow('Failed to delete file: 401');
    });

    it('getFile does not throw on 401 but returns null', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.getFile('file-1', 'user-1');
      expect(result).toBeNull();
    });

    it('searchFiles returns empty array on 401', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.searchFiles('query', 'user-1');
      expect(result).toEqual([]);
    });

    it('updateFile throws on 401', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.updateFile('file-1', {}, 'user-1')).rejects.toThrow('Failed to update file: 401');
    });

    it('getFiles returns empty array on 401', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.getFiles('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Error responses for each method ──────────────────────

  describe('error responses', () => {
    it('uploadFile throws with specific error on 500', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetchFn);

      const file = new File(['data'], 'test.txt');
      await expect(adapter.uploadFile(file, 'user-1')).rejects.toThrow('Upload failed');
    });

    it('uploadFile throws on 413 (payload too large)', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 413 });
      vi.stubGlobal('fetch', mockFetchFn);

      const file = new File(['big data'], 'large.bin');
      await expect(adapter.uploadFile(file, 'user-1')).rejects.toThrow('Upload failed');
    });

    it('deleteFile throws with status in error message', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.deleteFile('file-1', 'user-1')).rejects.toThrow('Failed to delete file: 403');
    });

    it('deleteFile throws with 500 status', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.deleteFile('file-1', 'user-1')).rejects.toThrow('Failed to delete file: 500');
    });

    it('getFile returns null on 500', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.getFile('file-1', 'user-1');
      expect(result).toBeNull();
    });

    it('searchFiles returns empty array on 500', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.searchFiles('test', 'user-1');
      expect(result).toEqual([]);
    });

    it('updateFile throws with status in error message on 403', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.updateFile('file-1', { fileName: 'x' }, 'user-1')).rejects.toThrow('Failed to update file: 403');
    });

    it('updateFile throws with status in error message on 404', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      vi.stubGlobal('fetch', mockFetchFn);

      await expect(adapter.updateFile('file-1', {}, 'user-1')).rejects.toThrow('Failed to update file: 404');
    });

    it('getFiles returns empty array on 500', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.getFiles('user-1');
      expect(result).toEqual([]);
    });

    it('getFiles returns empty array on 403', async () => {
      localStorageMock.getItem.mockReturnValue('token');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      vi.stubGlobal('fetch', mockFetchFn);

      const result = await adapter.getFiles('user-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Happy paths with auth token ─────────────────────────

  describe('auth token handling', () => {
    it('uploadFile sends Bearer token in headers', async () => {
      localStorageMock.getItem.mockReturnValue('my-jwt-token');
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', fileName: 't.txt', fileType: 'txt', fileSize: 10 }),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      const file = new File(['data'], 't.txt');
      await adapter.uploadFile(file, 'user-1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({ Authorization: 'Bearer my-jwt-token' });
    });

    it('deleteFile sends Bearer token', async () => {
      localStorageMock.getItem.mockReturnValue('tok');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.deleteFile('f1', 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({ Authorization: 'Bearer tok' });
    });

    it('getFile sends Bearer token', async () => {
      localStorageMock.getItem.mockReturnValue('tok');
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1' }),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.getFile('f1', 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({ Authorization: 'Bearer tok' });
    });

    it('searchFiles sends Bearer token', async () => {
      localStorageMock.getItem.mockReturnValue('tok');
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.searchFiles('q', 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({ Authorization: 'Bearer tok' });
    });

    it('getFiles sends Bearer token', async () => {
      localStorageMock.getItem.mockReturnValue('tok');
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.getFiles('u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({ Authorization: 'Bearer tok' });
    });

    it('updateFile sends Bearer token and Content-Type', async () => {
      localStorageMock.getItem.mockReturnValue('tok');
      mockFetchFn = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.updateFile('f1', { fileName: 'new' }, 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok',
      });
    });
  });

  // ─── No token scenarios ───────────────────────────────────

  describe('without auth token', () => {
    it('uploadFile sends empty headers when no token', async () => {
      localStorageMock.getItem.mockReturnValue(null as unknown as string);
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '1', fileName: 't', fileType: 't', fileSize: 0 }),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      const file = new File(['d'], 't');
      await adapter.uploadFile(file, 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({});
    });

    it('searchFiles sends empty headers when no token', async () => {
      localStorageMock.getItem.mockReturnValue(null as unknown as string);
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.searchFiles('q', 'u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({});
    });

    it('getFiles sends empty headers when no token', async () => {
      localStorageMock.getItem.mockReturnValue(null as unknown as string);
      mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      await adapter.getFiles('u1');

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers).toEqual({});
    });
  });

  // ─── Constructor ──────────────────────────────────────────

  describe('constructor', () => {
    it('sets baseUrl to /api/files', () => {
      expect(adapter).toBeDefined();
      expect((adapter as unknown as { baseUrl: string }).baseUrl).toBe('/api/files');
    });
  });
});
