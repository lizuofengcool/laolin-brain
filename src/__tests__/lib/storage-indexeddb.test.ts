import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexedDBAdapter } from '@/lib/storage/indexeddb';
import type { FileData } from '@/lib/storage/base';

// Mock the idb library
const mockPut = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(undefined);
const mockGetAll = vi.fn().mockResolvedValue([]);

const mockTransaction = vi.fn().mockImplementation(() => ({
  done: Promise.resolve(),
  store: {
    put: mockPut,
    delete: mockDelete,
    get: mockGet,
    getAll: mockGetAll,
  },
}));

const mockObjectStore = vi.fn().mockReturnValue({
  put: mockPut,
  delete: mockDelete,
  get: mockGet,
  getAll: mockGetAll,
  createIndex: vi.fn(),
});

const mockDB = {
  put: mockPut,
  delete: mockDelete,
  get: mockGet,
  getAll: mockGetAll,
  transaction: mockTransaction,
  objectStore: mockObjectStore,
  close: vi.fn(),
};

const mockOpenDB = vi.fn().mockResolvedValue(mockDB);

vi.mock('idb', () => ({
  openDB: (...args: unknown[]) => mockOpenDB(...args),
}));

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;

  beforeEach(() => {
    adapter = new IndexedDBAdapter();
    vi.clearAllMocks();
    mockOpenDB.mockResolvedValue(mockDB);
    mockPut.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(undefined);
    mockGetAll.mockResolvedValue([]);
  });

  describe('uploadFile', () => {
    it('stores a file record in IndexedDB with correct fields', async () => {
      const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
      const result = await adapter.uploadFile(file, 'user-1');

      expect(mockPut).toHaveBeenCalledTimes(1);
      const storedData = mockPut.mock.calls[0][1];

      expect(storedData.fileName).toBe('test.txt');
      expect(storedData.fileType).toBe('txt');
      expect(storedData.fileSize).toBe(5);
      expect(storedData.storageMode).toBe('local');
      expect(storedData.userId).toBe('user-1');
      expect(storedData.tags).toEqual([]);
      expect(storedData.isFavorite).toBe(false);
      expect(storedData.createdAt).toBeInstanceOf(Date);
      expect(storedData.data).toBeDefined(); // base64 data

      // Result should not contain internal fields
      expect((result as unknown as Record<string, unknown>).userId).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).data).toBeUndefined();
      expect(result.fileName).toBe('test.txt');
    });
  });

  describe('getFiles', () => {
    it('filters files by userId', async () => {
      const files: (FileData & { data?: string; userId?: string })[] = [
        {
          id: '1',
          fileName: 'user1-file.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date('2025-01-01'),
          userId: 'user-1',
        },
        {
          id: '2',
          fileName: 'user2-file.txt',
          fileType: 'txt',
          fileSize: 200,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date('2025-01-02'),
          userId: 'user-2',
        },
      ];
      mockGetAll.mockResolvedValue(files);

      const result = await adapter.getFiles('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].fileName).toBe('user1-file.txt');
      // Internal fields should be stripped
      expect((result[0] as unknown as Record<string, unknown>).userId).toBeUndefined();
      expect((result[0] as unknown as Record<string, unknown>).data).toBeUndefined();
    });

    it('returns empty array when no files for user', async () => {
      mockGetAll.mockResolvedValue([
        {
          id: '1',
          fileName: 'other.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-2',
        },
      ]);

      const result = await adapter.getFiles('user-1');
      expect(result).toHaveLength(0);
    });

    it('sorts files by createdAt descending', async () => {
      const files = [
        {
          id: '1',
          fileName: 'old.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date('2025-01-01'),
          userId: 'user-1',
        },
        {
          id: '2',
          fileName: 'new.txt',
          fileType: 'txt',
          fileSize: 200,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date('2025-01-10'),
          userId: 'user-1',
        },
      ];
      mockGetAll.mockResolvedValue(files);

      const result = await adapter.getFiles('user-1');
      expect(result[0].id).toBe('2'); // newer first
      expect(result[1].id).toBe('1');
    });
  });

  describe('deleteFile', () => {
    it('calls db.delete with correct fileId', async () => {
      await adapter.deleteFile('file-1', 'user-1');
      expect(mockDelete).toHaveBeenCalledWith('files', 'file-1');
    });
  });

  describe('searchFiles', () => {
    it('filters by fileName', async () => {
      const files = [
        {
          id: '1',
          fileName: 'report.pdf',
          fileType: 'pdf',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
          textContent: 'some content',
        },
        {
          id: '2',
          fileName: 'notes.txt',
          fileType: 'txt',
          fileSize: 200,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
          textContent: 'report notes',
        },
      ];
      mockGetAll.mockResolvedValue(files);

      const results = await adapter.searchFiles('report', 'user-1');
      // Should match by fileName 'report.pdf' or textContent 'report notes'
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by textContent', async () => {
      const files = [
        {
          id: '1',
          fileName: 'doc1.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
          textContent: 'meeting minutes from today',
        },
        {
          id: '2',
          fileName: 'doc2.txt',
          fileType: 'txt',
          fileSize: 200,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
          textContent: 'shopping list',
        },
      ];
      mockGetAll.mockResolvedValue(files);

      const results = await adapter.searchFiles('meeting', 'user-1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('filters by tags', async () => {
      const files = [
        {
          id: '1',
          fileName: 'doc1.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: ['important', 'work'],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
        },
        {
          id: '2',
          fileName: 'doc2.txt',
          fileType: 'txt',
          fileSize: 200,
          storageMode: 'local',
          tags: ['personal'],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
        },
      ];
      mockGetAll.mockResolvedValue(files);

      const results = await adapter.searchFiles('work', 'user-1');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('returns empty when no match', async () => {
      mockGetAll.mockResolvedValue([
        {
          id: '1',
          fileName: 'doc1.txt',
          fileType: 'txt',
          fileSize: 100,
          storageMode: 'local',
          tags: [],
          isFavorite: false,
          createdAt: new Date(),
          userId: 'user-1',
        },
      ]);

      const results = await adapter.searchFiles('nonexistentxyz', 'user-1');
      expect(results).toHaveLength(0);
    });
  });
});
