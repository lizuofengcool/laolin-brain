import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTotalChunks,
  sliceFile,
  generateUploadFileId,
  saveUploadProgress,
  getUploadProgress,
  removeUploadProgress,
  cleanupExpiredProgress,
} from '@/lib/chunk-upload';

// ─── Mock idb (IndexedDB wrapper) ─────────────────────────────
const mockPut = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockGetAll = vi.fn().mockResolvedValue([]);
const mockTransactionStore = {
  objectStore: vi.fn().mockReturnThis(),
  get: mockGet,
  put: mockPut,
  getAll: vi.fn().mockResolvedValue([]),
  delete: mockDelete,
};
const mockTransaction = vi.fn().mockReturnValue(mockTransactionStore);
const mockObjectStoreNames = { contains: vi.fn().mockReturnValue(true) };
const mockUpgradeDb = {
  objectStoreNames: mockObjectStoreNames,
  createObjectStore: vi.fn(),
};
const mockDb = {
  put: mockPut,
  get: mockGet,
  delete: mockDelete,
  transaction: mockTransaction,
  getAll: mockGetAll,
};

const mockOpenDB = vi.fn().mockResolvedValue(mockDb);

vi.mock('idb', () => ({
  openDB: mockOpenDB,
}));

describe('chunk-upload', () => {
  describe('getTotalChunks', () => {
    it('returns 1 for small files', () => {
      expect(getTotalChunks(1024)).toBe(1);
    });

    it('returns correct chunks for 5MB boundaries', () => {
      const chunkSize = 5 * 1024 * 1024;
      expect(getTotalChunks(chunkSize)).toBe(1);
      expect(getTotalChunks(chunkSize + 1)).toBe(2);
      expect(getTotalChunks(chunkSize * 3)).toBe(3);
    });

    it('handles zero size', () => {
      expect(getTotalChunks(0)).toBe(0);
    });
  });

  describe('sliceFile', () => {
    it('slices file into correct chunk', () => {
      const content = 'a'.repeat(10 * 1024 * 1024);
      const file = new File([content], 'test.bin', { type: 'application/octet-stream' });
      const chunk0 = sliceFile(file, 0);
      const chunk1 = sliceFile(file, 1);
      expect(chunk0.size).toBe(5 * 1024 * 1024);
      expect(chunk1.size).toBe(5 * 1024 * 1024);
    });

    it('handles last chunk smaller than CHUNK_SIZE', () => {
      const content = 'a'.repeat(6 * 1024 * 1024);
      const file = new File([content], 'test.bin', { type: 'application/octet-stream' });
      const chunk0 = sliceFile(file, 0);
      const chunk1 = sliceFile(file, 1);
      expect(chunk0.size).toBe(5 * 1024 * 1024);
      expect(chunk1.size).toBe(1024 * 1024);
    });
  });

  describe('generateUploadFileId', () => {
    it('generates consistent ID for same file', () => {
      const file1 = new File(['hello'], 'test.txt', { type: 'text/plain' });
      const file2 = new File(['hello'], 'test.txt', { type: 'text/plain' });
      const id = generateUploadFileId(file1);
      expect(id).toMatch(/^upload_/);
    });

    it('generates ID with correct format', () => {
      const file = new File(['world'], 'doc.pdf', { type: 'application/pdf' });
      const id = generateUploadFileId(file);
      expect(id).toMatch(/^upload_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  // ─── Advanced tests for IndexedDB-backed functions ────────

  describe('saveUploadProgress', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockOpenDB.mockResolvedValue(mockDb);
    });

    it('calls openDB with correct database name and version', async () => {
      const progress = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 1024,
        totalChunks: 1,
        uploadedChunks: [0],
        lastModified: Date.now(),
      };
      await saveUploadProgress(progress);
      expect(mockOpenDB).toHaveBeenCalledWith('chunk-upload-progress', 1, expect.any(Object));
    });

    it('calls db.transaction with correct store name and mode', async () => {
      const progress = {
        fileId: 'file-1',
        fileName: 'test.txt',
        fileSize: 1024,
        totalChunks: 1,
        uploadedChunks: [0],
        lastModified: Date.now(),
      };
      await saveUploadProgress(progress);
      // Verifies the transaction-based read-modify-write pattern is used
      expect(mockTransaction).toHaveBeenCalledWith('uploads', 'readwrite');
      expect(mockGet).toHaveBeenCalledWith('file-1');
    });

    it('handles openDB errors gracefully', async () => {
      mockOpenDB.mockRejectedValue(new Error('IndexedDB not available'));
      // Should not throw
      await expect(saveUploadProgress({
        fileId: 'f1', fileName: 't.txt', fileSize: 0,
        totalChunks: 0, uploadedChunks: [], lastModified: 0,
      })).resolves.toBeUndefined();
    });

    it('handles db.put errors gracefully', async () => {
      mockPut.mockRejectedValue(new Error('Quota exceeded'));
      await expect(saveUploadProgress({
        fileId: 'f1', fileName: 't.txt', fileSize: 0,
        totalChunks: 0, uploadedChunks: [], lastModified: 0,
      })).resolves.toBeUndefined();
    });
  });

  describe('getUploadProgress', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockOpenDB.mockResolvedValue(mockDb);
    });

    it('returns null when no progress found', async () => {
      mockGet.mockResolvedValue(undefined);
      const result = await getUploadProgress('non-existent');
      expect(result).toBeNull();
    });

    it('returns progress data when found', async () => {
      const stored = {
        fileId: 'file-1',
        fileName: 'large.bin',
        fileSize: 15 * 1024 * 1024,
        totalChunks: 3,
        uploadedChunks: [0, 1],
        lastModified: Date.now(),
      };
      mockGet.mockResolvedValue(stored);
      const result = await getUploadProgress('file-1');
      expect(result).toEqual(stored);
    });

    it('handles openDB errors gracefully', async () => {
      mockOpenDB.mockRejectedValue(new Error('IndexedDB error'));
      const result = await getUploadProgress('file-1');
      expect(result).toBeNull();
    });
  });

  describe('removeUploadProgress', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockOpenDB.mockResolvedValue(mockDb);
    });

    it('calls db.delete with correct store and fileId', async () => {
      await removeUploadProgress('file-1');
      expect(mockDelete).toHaveBeenCalledWith('uploads', 'file-1');
    });

    it('handles errors gracefully', async () => {
      mockOpenDB.mockRejectedValue(new Error('DB error'));
      await expect(removeUploadProgress('file-1')).resolves.toBeUndefined();
    });

    it('handles delete errors gracefully', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));
      await expect(removeUploadProgress('file-1')).resolves.toBeUndefined();
    });
  });

  describe('cleanupExpiredProgress', () => {
    let storeDelete: ReturnType<typeof vi.fn>;
    let storeGetAll: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockOpenDB.mockResolvedValue(mockDb);
      // Create fresh mocks for the transaction store to avoid cross-test pollution
      storeDelete = vi.fn().mockResolvedValue(undefined);
      storeGetAll = vi.fn().mockResolvedValue([]);
      mockTransactionStore.objectStore.mockReturnValue({
        getAll: storeGetAll,
        delete: storeDelete,
      });
    });

    it('removes progress entries older than 24 hours', async () => {
      const now = Date.now();
      const expiredEntry = {
        fileId: 'expired-1',
        fileName: 'old.bin',
        fileSize: 1024,
        totalChunks: 1,
        uploadedChunks: [0],
        lastModified: now - 25 * 60 * 60 * 1000, // 25 hours ago
      };
      const freshEntry = {
        fileId: 'fresh-1',
        fileName: 'new.bin',
        fileSize: 2048,
        totalChunks: 1,
        uploadedChunks: [],
        lastModified: now - 1 * 60 * 60 * 1000, // 1 hour ago
      };
      storeGetAll.mockResolvedValue([expiredEntry, freshEntry]);

      await cleanupExpiredProgress();

      expect(storeDelete).toHaveBeenCalledWith('expired-1');
      expect(storeDelete).not.toHaveBeenCalledWith('fresh-1');
    });

    it('removes all entries when all are expired', async () => {
      const now = Date.now();
      storeGetAll.mockResolvedValue([
        { fileId: 'a', lastModified: now - 48 * 60 * 60 * 1000 },
        { fileId: 'b', lastModified: now - 72 * 60 * 60 * 1000 },
      ]);

      await cleanupExpiredProgress();

      expect(storeDelete).toHaveBeenCalledTimes(2);
      expect(storeDelete).toHaveBeenNthCalledWith(1, 'a');
      expect(storeDelete).toHaveBeenNthCalledWith(2, 'b');
    });

    it('removes no entries when all are fresh', async () => {
      const now = Date.now();
      storeGetAll.mockResolvedValue([
        { fileId: 'a', lastModified: now - 1000 },
        { fileId: 'b', lastModified: now - 500 },
      ]);

      await cleanupExpiredProgress();

      expect(storeDelete).not.toHaveBeenCalled();
    });

    it('handles empty progress list', async () => {
      storeGetAll.mockResolvedValue([]);

      await cleanupExpiredProgress();

      expect(storeDelete).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockOpenDB.mockRejectedValue(new Error('DB not available'));

      await expect(cleanupExpiredProgress()).resolves.toBeUndefined();
    });

    it('uses readwrite transaction mode', async () => {
      storeGetAll.mockResolvedValue([]);

      await cleanupExpiredProgress();

      expect(mockTransaction).toHaveBeenCalledWith('uploads', 'readwrite');
    });

    it('handles exactly 24-hour old entries as expired', async () => {
      const now = Date.now();
      // Exactly 24 hours + 1ms = expired
      const entry = {
        fileId: 'boundary',
        lastModified: now - 24 * 60 * 60 * 1000 - 1,
      };
      storeGetAll.mockResolvedValue([entry]);

      await cleanupExpiredProgress();

      expect(storeDelete).toHaveBeenCalledWith('boundary');
    });
  });
});
