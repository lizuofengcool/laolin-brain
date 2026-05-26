import { describe, it, expect } from 'vitest';
import type { FileData, StorageAdapter } from '@/lib/storage/base';

describe('FileData interface', () => {
  it('accepts an object with all required fields', () => {
    const fileData: FileData = {
      id: '1',
      fileName: 'test.txt',
      fileType: 'txt',
      fileSize: 1024,
      storageMode: 'local',
      tags: [],
      isFavorite: false,
      createdAt: new Date(),
    };

    expect(fileData.id).toBe('1');
    expect(fileData.fileName).toBe('test.txt');
    expect(fileData.fileType).toBe('txt');
    expect(fileData.fileSize).toBe(1024);
    expect(fileData.storageMode).toBe('local');
    expect(fileData.tags).toEqual([]);
    expect(fileData.isFavorite).toBe(false);
    expect(fileData.createdAt).toBeInstanceOf(Date);
  });

  it('allows all optional fields', () => {
    const fileData: FileData = {
      id: '2',
      fileName: 'doc.pdf',
      fileType: 'pdf',
      fileSize: 2048,
      filePath: '/uploads/doc.pdf',
      textContent: 'Hello world',
      thumbnailUrl: '/thumb/doc.jpg',
      previewUrl: '/preview/doc.pdf',
      storageMode: 'cloud',
      folderId: 'folder-1',
      tags: ['tag1', 'tag2'],
      isFavorite: true,
      isDeleted: true,
      deletedAt: '2025-01-15T00:00:00Z',
      createdAt: new Date(),
      fileHash: 'abc123',
    };

    expect(fileData.filePath).toBe('/uploads/doc.pdf');
    expect(fileData.textContent).toBe('Hello world');
    expect(fileData.thumbnailUrl).toBe('/thumb/doc.jpg');
    expect(fileData.previewUrl).toBe('/preview/doc.pdf');
    expect(fileData.folderId).toBe('folder-1');
    expect(fileData.tags).toEqual(['tag1', 'tag2']);
    expect(fileData.isFavorite).toBe(true);
    expect(fileData.isDeleted).toBe(true);
    expect(fileData.deletedAt).toBe('2025-01-15T00:00:00Z');
    expect(fileData.fileHash).toBe('abc123');
  });

  it('optional fields default to undefined when not provided', () => {
    const fileData: FileData = {
      id: '3',
      fileName: 'minimal.txt',
      fileType: 'txt',
      fileSize: 100,
      storageMode: 'local',
      tags: [],
      isFavorite: false,
      createdAt: new Date(),
    };

    expect(fileData.filePath).toBeUndefined();
    expect(fileData.textContent).toBeUndefined();
    expect(fileData.thumbnailUrl).toBeUndefined();
    expect(fileData.previewUrl).toBeUndefined();
    expect(fileData.folderId).toBeUndefined();
    expect(fileData.isDeleted).toBeUndefined();
    expect(fileData.deletedAt).toBeUndefined();
    expect(fileData.fileHash).toBeUndefined();
  });
});

describe('StorageAdapter interface', () => {
  it('can be implemented with all required methods', () => {
    const adapter: StorageAdapter = {
      uploadFile: async () => ({
        id: '1',
        fileName: 'test.txt',
        fileType: 'txt',
        fileSize: 100,
      }),
      deleteFile: async () => {},
      getFile: async () => null,
      searchFiles: async () => [],
      updateFile: async () => {},
      getFiles: async () => [],
    };

    expect(typeof adapter.uploadFile).toBe('function');
    expect(typeof adapter.deleteFile).toBe('function');
    expect(typeof adapter.getFile).toBe('function');
    expect(typeof adapter.searchFiles).toBe('function');
    expect(typeof adapter.updateFile).toBe('function');
    expect(typeof adapter.getFiles).toBe('function');
  });
});
