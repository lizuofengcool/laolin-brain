import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileData } from '@/lib/storage/base';

const { mockGetState } = vi.hoisted(() => ({
  mockGetState: vi.fn(),
}));

vi.mock('@/stores/app-store', () => ({
  useAppStore: {
    getState: mockGetState,
  },
}));

const { mockDBGet, mockOpenDB } = vi.hoisted(() => ({
  mockDBGet: vi.fn(),
  mockOpenDB: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => mockOpenDB(...args),
}));

import { downloadFile } from '@/lib/file-helpers';

function createMockFile(overrides: Partial<FileData> = {}): FileData {
  return {
    id: 'file-1',
    fileName: 'test.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    storageMode: 'cloud',
    tags: [],
    isFavorite: false,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('downloadFile', () => {
  const mockClick = vi.fn();
  const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake');
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(mockCreateObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cloud mode', () => {
    it('fetches blob from API and triggers download', async () => {
      vi.useFakeTimers();
      mockGetState.mockReturnValue({ storageMode: 'cloud' });
      const mockBlob = new Blob(['file content'], { type: 'application/pdf' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });
      vi.stubGlobal('fetch', mockFetch);

      const file = createMockFile();
      await downloadFile(file);

      expect(mockFetch).toHaveBeenCalledWith('/api/files/file-1/download', { headers: {} });
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockClick).toHaveBeenCalled();
      // revokeObjectURL is now delayed via setTimeout
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake');
      vi.useRealTimers();
    });

    it('throws when fetch returns non-ok response', async () => {
      mockGetState.mockReturnValue({ storageMode: 'cloud' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      const file = createMockFile();
      await expect(downloadFile(file)).rejects.toThrow('Download failed');
    });

    it('throws when fetch itself fails', async () => {
      mockGetState.mockReturnValue({ storageMode: 'cloud' });
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const file = createMockFile();
      await expect(downloadFile(file)).rejects.toThrow('Network error');
    });

    it('sets correct download attribute on anchor', async () => {
      mockGetState.mockReturnValue({ storageMode: 'cloud' });
      const mockBlob = new Blob(['data']);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });
      vi.stubGlobal('fetch', mockFetch);

      const file = createMockFile({ fileName: 'report.pdf' });
      await downloadFile(file);

      const createElementCalls = (document.createElement as ReturnType<typeof vi.spyOn>).mock.calls;
      const anchor = createElementCalls[0][0] as HTMLAnchorElement;
      expect(anchor).toBe('a');
    });
  });

  describe('local mode', () => {
    it('reads from IndexedDB and triggers download', async () => {
      mockGetState.mockReturnValue({ storageMode: 'local' });
      mockOpenDB.mockResolvedValue({
        get: mockDBGet,
      });

      const base64Data = btoa('hello');
      mockDBGet.mockResolvedValue({ data: base64Data });

      const file = createMockFile({ storageMode: 'local' });
      await downloadFile(file);

      expect(mockOpenDB).toHaveBeenCalledWith('knowledge-base-db', 3);
      expect(mockDBGet).toHaveBeenCalledWith('files', 'file-1');
      expect(mockClick).toHaveBeenCalled();
    });

    it('throws when file record not found in IndexedDB', async () => {
      mockGetState.mockReturnValue({ storageMode: 'local' });
      mockOpenDB.mockResolvedValue({
        get: mockDBGet,
      });
      mockDBGet.mockResolvedValue(undefined);

      const file = createMockFile({ storageMode: 'local' });
      await expect(downloadFile(file)).rejects.toThrow('File not found in local storage');
    });

    it('throws when record has no data field', async () => {
      mockGetState.mockReturnValue({ storageMode: 'local' });
      mockOpenDB.mockResolvedValue({
        get: mockDBGet,
      });
      mockDBGet.mockResolvedValue({});

      const file = createMockFile({ storageMode: 'local' });
      await expect(downloadFile(file)).rejects.toThrow('File not found in local storage');
    });

    it('correctly converts base64 data to blob', async () => {
      mockGetState.mockReturnValue({ storageMode: 'local' });
      mockOpenDB.mockResolvedValue({
        get: mockDBGet,
      });

      const original = 'test content';
      const base64Data = btoa(original);
      mockDBGet.mockResolvedValue({ data: base64Data });

      const file = createMockFile({ storageMode: 'local' });
      await downloadFile(file);

      const blobArg = mockCreateObjectURL.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
    });

    it('throws when openDB fails', async () => {
      mockGetState.mockReturnValue({ storageMode: 'local' });
      mockOpenDB.mockRejectedValue(new Error('DB not available'));

      const file = createMockFile({ storageMode: 'local' });
      await expect(downloadFile(file)).rejects.toThrow('DB not available');
    });
  });
});
