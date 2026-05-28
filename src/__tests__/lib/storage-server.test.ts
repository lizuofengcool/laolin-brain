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

// Track fetch calls
let mockFetchFn: ReturnType<typeof vi.fn>;

describe('ServerStorageAdapter', () => {
  let adapter: ServerStorageAdapter;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    adapter = new ServerStorageAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploadFile sends POST with FormData', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ id: '1', fileName: 'test.txt', fileType: 'txt', fileSize: 100 }),
    };
    mockFetchFn = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', mockFetchFn);

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const result = await adapter.uploadFile(file, 'user-1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchFn.mock.calls[0];
    expect(url).toBe('/api/files');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect(options.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ id: '1', fileName: 'test.txt', fileType: 'txt', fileSize: 100 });
  });

  it('uploadFile throws on non-OK response', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetchFn);

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    await expect(adapter.uploadFile(file, 'user-1')).rejects.toThrow('Upload failed');
  });

  it('deleteFile sends DELETE request', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetchFn);

    await adapter.deleteFile('file-123', 'user-1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchFn.mock.calls[0];
    expect(url).toBe('/api/files/file-123');
    expect(options.method).toBe('DELETE');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('getFile returns parsed JSON on OK', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    const fileData = { id: '1', fileName: 'test.txt', fileType: 'txt', fileSize: 100 };
    mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fileData),
    });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.getFile('file-1', 'user-1');

    expect(mockFetchFn).toHaveBeenCalledWith('/api/files/file-1', {
      headers: { Authorization: 'Bearer test-token' },
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual(fileData);
  });

  it('getFile returns null on non-OK response', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.getFile('file-nonexistent', 'user-1');

    expect(result).toBeNull();
  });

  it('searchFiles URL-encodes query and userId params', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    const searchResults = [{ id: '1', fileName: 'result.txt' }];
    mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(searchResults),
    });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.searchFiles('hello world', 'user 1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchFn.mock.calls[0];
    expect(url).toBe('/api/search?q=hello%20world');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect(result).toEqual(searchResults);
  });

  it('searchFiles returns empty array on non-OK', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.searchFiles('test', 'user-1');

    expect(result).toEqual([]);
  });

  it('updateFile sends PUT with JSON body', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetchFn);

    const data = { fileName: 'renamed.txt', isFavorite: true };
    await adapter.updateFile('file-1', data, 'user-1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchFn.mock.calls[0];
    expect(url).toBe('/api/files/file-1');
    expect(options.method).toBe('PUT');
    expect(options.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
    expect(options.body).toBe(JSON.stringify(data));
  });

  it('getFiles returns array on OK', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    const files = [
      { id: '1', fileName: 'a.txt', fileType: 'txt', fileSize: 100 },
      { id: '2', fileName: 'b.txt', fileType: 'txt', fileSize: 200 },
    ];
    mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(files),
    });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.getFiles('user-1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetchFn.mock.calls[0];
    expect(url).toBe('/api/files');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect(result).toEqual(files);
  });

  it('getFiles returns empty array on non-OK', async () => {
    localStorageMock.getItem.mockReturnValue('test-token');
    mockFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', mockFetchFn);

    const result = await adapter.getFiles('user-1');

    expect(result).toEqual([]);
  });

  it('omits Authorization header when no token in localStorage', async () => {
    localStorageMock.getItem.mockReturnValue(null as unknown as string);
    mockFetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', mockFetchFn);

    await adapter.getFiles('user-1');

    expect(mockFetchFn).toHaveBeenCalledTimes(1);
    const [, options] = mockFetchFn.mock.calls[0];
    expect(options.headers).toEqual({});
  });
});
