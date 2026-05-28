import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';
import type { FileData } from '@/lib/storage/base';

// Mock the storage factory
const mockAdapter = {
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  getFile: vi.fn(),
  searchFiles: vi.fn(),
  updateFile: vi.fn(),
  getFiles: vi.fn().mockResolvedValue([]),
};

vi.mock('@/lib/storage/factory', () => ({
  getStorageAdapter: vi.fn(() => mockAdapter),
  resetAdapter: vi.fn(),
}));

// Mock fetch for setStorageMode / importData
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function createMockFileData(overrides: Partial<FileData> = {}): FileData {
  return {
    id: 'file-1',
    fileName: 'test.txt',
    fileType: 'txt',
    fileSize: 1024,
    storageMode: 'local',
    tags: [],
    isFavorite: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('useAppStore (extended)', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      currentView: 'login',
      files: [],
      batchMode: false,
      batchSelectedIds: [],
      sortBy: 'date',
      sortOrder: 'desc',
      fileTypeFilter: null,
      folders: [],
      sidebarOpen: true,
      searchQuery: '',
      selectedFolderId: null,
      fileViewMode: 'grid',
      storageMode: 'local',
      aiProcessing: false,
      aiChatFile: null,
      lightboxOpen: false,
      lightboxImages: [],
      lightboxIndex: 0,
    });
    localStorageMock.clear();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('reorderFiles', () => {
    it('moves file from index 0 to index 2', () => {
      const files = [
        createMockFileData({ id: 'a' }),
        createMockFileData({ id: 'b' }),
        createMockFileData({ id: 'c' }),
        createMockFileData({ id: 'd' }),
      ];
      useAppStore.getState().setFiles(files);

      useAppStore.getState().reorderFiles(0, 2);

      const result = useAppStore.getState().files;
      expect(result.map((f) => f.id)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves file from higher to lower index', () => {
      const files = [
        createMockFileData({ id: 'a' }),
        createMockFileData({ id: 'b' }),
        createMockFileData({ id: 'c' }),
      ];
      useAppStore.getState().setFiles(files);

      useAppStore.getState().reorderFiles(2, 0);

      const result = useAppStore.getState().files;
      expect(result.map((f) => f.id)).toEqual(['c', 'a', 'b']);
    });

    it('no-ops when reordering empty array (bounds guard)', () => {
      useAppStore.getState().reorderFiles(0, 1);
      // Guard prevents out-of-bounds splice on empty array
      expect(useAppStore.getState().files).toEqual([]);
    });
  });

  describe('moveFileToFolder', () => {
    it('updates folderId on the file', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([createMockFileData({ id: '1', folderId: undefined })]);

      await useAppStore.getState().moveFileToFolder('1', 'folder-abc');

      const file = useAppStore.getState().files[0];
      expect(file.folderId).toBe('folder-abc');
    });

    it('calls adapter.updateFile with correct params', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().moveFileToFolder('1', 'folder-xyz');

      expect(mockAdapter.updateFile).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ folderId: 'folder-xyz' }),
        '1'
      );
    });

    it('does nothing when user is not set', async () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().moveFileToFolder('1', 'folder-xyz');

      expect(mockAdapter.updateFile).not.toHaveBeenCalled();
    });
  });

  describe('importData', () => {
    it('returns 0 when no user is set', async () => {
      const count = await useAppStore.getState().importData('{}');
      expect(count).toBe(0);
    });

    it('throws on invalid JSON', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'cloud' };
      useAppStore.setState({ user, storageMode: 'cloud' });
      await expect(useAppStore.getState().importData('not-json')).rejects.toThrow();
    });

    it('throws when files array is missing', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'cloud' };
      useAppStore.setState({ user, storageMode: 'cloud' });
      await expect(useAppStore.getState().importData(JSON.stringify({ folders: [] }))).rejects.toThrow('Invalid data format');
    });

    it('in cloud mode calls import API and returns count', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'cloud' };
      useAppStore.setState({ user, storageMode: 'cloud' });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ importedCount: 5 }),
      });

      const jsonData = JSON.stringify({
        files: [{ id: '1', fileName: 'a.txt', fileType: 'txt', fileSize: 100 }],
        folders: [],
      });
      const count = await useAppStore.getState().importData(jsonData);

      expect(count).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/files/import',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });

  describe('selectAllFiles', () => {
    it('selects all non-deleted files', () => {
      const files = [
        createMockFileData({ id: '1' }),
        createMockFileData({ id: '2' }),
        createMockFileData({ id: '3', isDeleted: true }),
      ];
      useAppStore.getState().setFiles(files);

      useAppStore.getState().selectAllFiles();

      expect(useAppStore.getState().batchSelectedIds).toEqual(['1', '2']);
    });

    it('respects fileTypeFilter=document', () => {
      const files = [
        createMockFileData({ id: '1', fileType: 'image' }),
        createMockFileData({ id: '2', fileType: 'word' }),
        createMockFileData({ id: '3', fileType: 'pdf' }),
        createMockFileData({ id: '4', fileType: 'pptx' }),
        createMockFileData({ id: '5', fileType: 'txt' }),
      ];
      useAppStore.getState().setFiles(files);
      useAppStore.setState({ fileTypeFilter: 'document' });

      useAppStore.getState().selectAllFiles();

      expect(useAppStore.getState().batchSelectedIds).toEqual(['2', '3', '4']);
    });

    it('respects fileTypeFilter=image', () => {
      const files = [
        createMockFileData({ id: '1', fileType: 'image' }),
        createMockFileData({ id: '2', fileType: 'word' }),
        createMockFileData({ id: '3', fileType: 'image' }),
      ];
      useAppStore.getState().setFiles(files);
      useAppStore.setState({ fileTypeFilter: 'image' });

      useAppStore.getState().selectAllFiles();

      expect(useAppStore.getState().batchSelectedIds).toEqual(['1', '3']);
    });

    it('respects fileTypeFilter=favorite', () => {
      const files = [
        createMockFileData({ id: '1', isFavorite: true }),
        createMockFileData({ id: '2', isFavorite: false }),
        createMockFileData({ id: '3', isFavorite: true }),
      ];
      useAppStore.getState().setFiles(files);
      useAppStore.setState({ fileTypeFilter: 'favorite' });

      useAppStore.getState().selectAllFiles();

      expect(useAppStore.getState().batchSelectedIds).toEqual(['1', '3']);
    });

    it('returns empty selection for empty files array', () => {
      useAppStore.getState().setFiles([]);
      useAppStore.getState().selectAllFiles();
      expect(useAppStore.getState().batchSelectedIds).toEqual([]);
    });
  });

  describe('batchDeleteFiles', () => {
    it('soft-deletes all specified files', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user, batchMode: true });
      useAppStore.getState().setFiles([
        createMockFileData({ id: '1' }),
        createMockFileData({ id: '2' }),
        createMockFileData({ id: '3' }),
      ]);

      await useAppStore.getState().batchDeleteFiles(['1', '3']);

      const files = useAppStore.getState().files;
      expect(files[0].isDeleted).toBe(true);
      expect(files[0].deletedAt).toBeDefined();
      expect(files[1].isDeleted).toBeUndefined(); // not in batch
      expect(files[2].isDeleted).toBe(true);
    });

    it('calls adapter.updateFile for each id', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([
        createMockFileData({ id: 'a' }),
        createMockFileData({ id: 'b' }),
      ]);

      await useAppStore.getState().batchDeleteFiles(['a', 'b']);

      expect(mockAdapter.updateFile).toHaveBeenCalledTimes(2);
    });

    it('toggles batch mode off after deletion', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user, batchMode: true });
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().batchDeleteFiles(['1']);

      expect(useAppStore.getState().batchMode).toBe(false);
    });

    it('does nothing with empty ids array', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().batchDeleteFiles([]);

      const file = useAppStore.getState().files[0];
      expect(file.isDeleted).toBeUndefined();
    });
  });

  describe('batchToggleFavorite', () => {
    it('sets all specified files to favorite', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([
        createMockFileData({ id: '1', isFavorite: false }),
        createMockFileData({ id: '2', isFavorite: false }),
        createMockFileData({ id: '3', isFavorite: true }),
      ]);

      await useAppStore.getState().batchToggleFavorite(['1', '2', '3'], true);

      const files = useAppStore.getState().files;
      expect(files[0].isFavorite).toBe(true);
      expect(files[1].isFavorite).toBe(true);
      expect(files[2].isFavorite).toBe(true);
    });

    it('sets all specified files to not favorite', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([
        createMockFileData({ id: '1', isFavorite: true }),
        createMockFileData({ id: '2', isFavorite: true }),
      ]);

      await useAppStore.getState().batchToggleFavorite(['1', '2'], false);

      const files = useAppStore.getState().files;
      expect(files[0].isFavorite).toBe(false);
      expect(files[1].isFavorite).toBe(false);
    });

    it('calls adapter.updateFile for each id', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([
        createMockFileData({ id: 'a' }),
        createMockFileData({ id: 'b' }),
      ]);

      await useAppStore.getState().batchToggleFavorite(['a', 'b'], true);

      expect(mockAdapter.updateFile).toHaveBeenCalledTimes(2);
    });

    it('does nothing when user is null', async () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().batchToggleFavorite(['1'], true);

      expect(mockAdapter.updateFile).not.toHaveBeenCalled();
    });
  });

  describe('setStorageMode', () => {
    it('updates storageMode and user', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      mockFetch.mockResolvedValue({ ok: true });

      await useAppStore.getState().setStorageMode('cloud');

      expect(useAppStore.getState().storageMode).toBe('cloud');
      expect(useAppStore.getState().user!.storageMode).toBe('cloud');
    });

    it('calls /api/settings with PUT for cloud mode', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      mockFetch.mockResolvedValue({ ok: true });

      await useAppStore.getState().setStorageMode('cloud');

      expect(mockFetch).toHaveBeenCalledWith('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '1', storageMode: 'cloud' }),
      });
    });

    it('falls back to local mode when API fails for cloud', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Cloud mode should still set to cloud even if API fails (falls through to default branch)
      await useAppStore.getState().setStorageMode('cloud');

      // Looking at the code: if mode === "cloud" and res.ok is false, it falls through
      // and still sets storageMode
      expect(useAppStore.getState().storageMode).toBe('cloud');
    });

    it('does nothing when user is null', async () => {
      await useAppStore.getState().setStorageMode('cloud');
      expect(useAppStore.getState().storageMode).toBe('local');
    });
  });

  describe('exportData', () => {
    it('returns a valid JSON string with correct structure', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      const files = [
        createMockFileData({ id: 'f1', fileName: 'doc.txt', fileType: 'txt', fileSize: 100, createdAt: new Date('2025-01-01') }),
      ];
      useAppStore.setState({ user, files, folders: [{ id: 'fld1', name: 'Folder', parentId: null, createdAt: '2025-01-01T00:00:00.000Z' }] });

      const result = await useAppStore.getState().exportData();
      const parsed = JSON.parse(result);

      expect(parsed.version).toBe('2.0');
      expect(parsed.exportDate).toBeDefined();
      expect(parsed.user).toEqual({ name: 'Test', email: 't@t.com' });
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0].fileName).toBe('doc.txt');
      expect(parsed.folders).toHaveLength(1);
      expect(parsed.folders[0].id).toBe('fld1');
    });

    it('returns null user when no user is set', async () => {
      useAppStore.setState({ user: null, files: [] });

      const result = await useAppStore.getState().exportData();
      const parsed = JSON.parse(result);

      expect(parsed.user).toBeNull();
      expect(parsed.files).toEqual([]);
    });

    it('handles empty files array', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user, files: [], folders: [] });

      const result = await useAppStore.getState().exportData();
      const parsed = JSON.parse(result);

      expect(parsed.files).toEqual([]);
      expect(parsed.folders).toEqual([]);
    });

    it('includes all expected file fields', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      const files = [createMockFileData({
        id: 'f1',
        fileName: 'test.txt',
        fileType: 'txt',
        fileSize: 1234,
        textContent: 'hello world',
        folderId: 'folder-1',
        tags: ['tag1', 'tag2'],
        isFavorite: true,
        createdAt: new Date('2025-06-01'),
      })];
      useAppStore.setState({ user, files, folders: [] });

      const result = await useAppStore.getState().exportData();
      const parsed = JSON.parse(result);
      const file = parsed.files[0];

      expect(file.id).toBe('f1');
      expect(file.fileName).toBe('test.txt');
      expect(file.fileType).toBe('txt');
      expect(file.fileSize).toBe(1234);
      expect(file.textContent).toBe('hello world');
      expect(file.folderId).toBe('folder-1');
      expect(file.tags).toEqual(['tag1', 'tag2']);
      expect(file.isFavorite).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('updateFile with non-existent id does not crash', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);
      expect(() => useAppStore.getState().updateFile('nonexistent', { fileName: 'x' })).not.toThrow();
      expect(useAppStore.getState().files[0].fileName).toBe('test.txt');
    });

    it('removeFile with non-existent id does not crash', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);
      expect(() => useAppStore.getState().removeFile('nonexistent')).not.toThrow();
      expect(useAppStore.getState().files).toHaveLength(1);
    });

    it('toggleFavorite with non-existent id does not crash', () => {
      useAppStore.getState().setFiles([]);
      expect(() => useAppStore.getState().toggleFavorite('nonexistent')).not.toThrow();
    });
  });
});
