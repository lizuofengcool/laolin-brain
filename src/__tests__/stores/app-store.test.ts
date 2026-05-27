import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';
import type { FileData } from '@/lib/storage/base';

// Mock the storage factory
vi.mock('@/lib/storage/factory', () => ({
  getStorageAdapter: vi.fn(() => ({
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
    getFile: vi.fn(),
    searchFiles: vi.fn(),
    updateFile: vi.fn(),
    getFiles: vi.fn().mockResolvedValue([]),
  })),
  resetAdapter: vi.fn(),
}));

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

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset the store between tests
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
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useAppStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.currentView).toBe('login');
      expect(state.files).toEqual([]);
      expect(state.batchMode).toBe(false);
      expect(state.batchSelectedIds).toEqual([]);
      expect(state.sortBy).toBe('date');
      expect(state.sortOrder).toBe('desc');
      expect(state.fileTypeFilter).toBeNull();
    });
  });

  describe('login', () => {
    it('sets user, token, and isAuthenticated', () => {
      const user = { id: '1', name: 'Test User', email: 'test@example.com', storageMode: 'local' };
      useAppStore.getState().login(user, 'token-123');

      const state = useAppStore.getState();
      expect(state.user).toEqual(user);
      expect(state.token).toBe('token-123');
      expect(state.isAuthenticated).toBe(true);
      expect(state.currentView).toBe('dashboard');
    });

    it('saves to localStorage', () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.getState().login(user, 'tok');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('kb_token', 'tok');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('kb_user', JSON.stringify(user));
    });
  });

  describe('logout', () => {
    it('clears user, token, isAuthenticated, and files', () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user, token: 'tok', isAuthenticated: true, files: [createMockFileData()] });
      useAppStore.getState().logout();

      const state = useAppStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.currentView).toBe('login');
      expect(state.files).toEqual([]);
    });

    it('removes from localStorage', () => {
      useAppStore.getState().logout();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('kb_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('kb_user');
    });
  });

  describe('setFiles, addFile, removeFile, updateFile', () => {
    it('setFiles replaces all files', () => {
      const files = [createMockFileData({ id: '1' }), createMockFileData({ id: '2' })];
      useAppStore.getState().setFiles(files);
      expect(useAppStore.getState().files).toHaveLength(2);
      expect(useAppStore.getState().files[0].id).toBe('1');
    });

    it('addFile prepends a file', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);
      useAppStore.getState().addFile(createMockFileData({ id: '2' }));
      const state = useAppStore.getState();
      expect(state.files).toHaveLength(2);
      expect(state.files[0].id).toBe('2'); // prepended
    });

    it('removeFile removes a file by id', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' }), createMockFileData({ id: '2' })]);
      useAppStore.getState().removeFile('1');
      expect(useAppStore.getState().files).toHaveLength(1);
      expect(useAppStore.getState().files[0].id).toBe('2');
    });

    it('updateFile merges partial data', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1', fileName: 'old.txt' })]);
      useAppStore.getState().updateFile('1', { fileName: 'new.txt', isFavorite: true });
      const file = useAppStore.getState().files[0];
      expect(file.fileName).toBe('new.txt');
      expect(file.isFavorite).toBe(true);
    });
  });

  describe('toggleFavorite', () => {
    it('toggles isFavorite from false to true', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1', isFavorite: false })]);
      useAppStore.getState().toggleFavorite('1');
      expect(useAppStore.getState().files[0].isFavorite).toBe(true);
    });

    it('toggles isFavorite from true to false', () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1', isFavorite: true })]);
      useAppStore.getState().toggleFavorite('1');
      expect(useAppStore.getState().files[0].isFavorite).toBe(false);
    });

    it('does nothing if file not found', () => {
      useAppStore.getState().setFiles([]);
      expect(() => useAppStore.getState().toggleFavorite('nonexistent')).not.toThrow();
    });
  });

  describe('toggleBatchMode', () => {
    it('toggles batch mode on and off', () => {
      expect(useAppStore.getState().batchMode).toBe(false);
      useAppStore.getState().toggleBatchMode();
      expect(useAppStore.getState().batchMode).toBe(true);
      expect(useAppStore.getState().batchSelectedIds).toEqual([]);
      useAppStore.getState().toggleBatchMode();
      expect(useAppStore.getState().batchMode).toBe(false);
    });
  });

  describe('toggleBatchSelect', () => {
    it('adds id when not selected', () => {
      useAppStore.getState().toggleBatchSelect('1');
      expect(useAppStore.getState().batchSelectedIds).toEqual(['1']);
    });

    it('removes id when already selected', () => {
      useAppStore.getState().toggleBatchSelect('1');
      useAppStore.getState().toggleBatchSelect('1');
      expect(useAppStore.getState().batchSelectedIds).toEqual([]);
    });
  });

  describe('setCurrentView', () => {
    it('changes currentView', () => {
      useAppStore.getState().setCurrentView('files');
      expect(useAppStore.getState().currentView).toBe('files');
      useAppStore.getState().setCurrentView('settings');
      expect(useAppStore.getState().currentView).toBe('settings');
    });
  });

  describe('setSort', () => {
    it('sets sortBy and sortOrder', () => {
      useAppStore.getState().setSort('name', 'asc');
      const state = useAppStore.getState();
      expect(state.sortBy).toBe('name');
      expect(state.sortOrder).toBe('asc');
    });
  });

  describe('softDeleteFile', () => {
    it('sets isDeleted and deletedAt on the file', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);

      await useAppStore.getState().softDeleteFile('1');

      const file = useAppStore.getState().files[0];
      expect(file.isDeleted).toBe(true);
      expect(file.deletedAt).toBeDefined();
      expect(typeof file.deletedAt).toBe('string');
    });

    it('does nothing if no user', async () => {
      useAppStore.getState().setFiles([createMockFileData({ id: '1' })]);
      await useAppStore.getState().softDeleteFile('1');
      // The updateFile is still called in the store (before user check), 
      // but the adapter call won't happen. Let's check the store logic...
      // Looking at the source: it does `const { user } = get(); if (!user) return;` first
      const file = useAppStore.getState().files[0];
      expect(file.isDeleted).toBeUndefined();
    });
  });

  describe('restoreFile', () => {
    it('clears isDeleted and deletedAt', async () => {
      const user = { id: '1', name: 'Test', email: 't@t.com', storageMode: 'local' };
      useAppStore.setState({ user });
      useAppStore.getState().setFiles([createMockFileData({ id: '1', isDeleted: true, deletedAt: '2025-01-01' })]);

      await useAppStore.getState().restoreFile('1');

      const file = useAppStore.getState().files[0];
      expect(file.isDeleted).toBe(false);
      expect(file.deletedAt).toBeUndefined();
    });
  });
});
