import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock classes using vi.fn with class syntax
vi.mock('@/lib/storage/indexeddb', () => ({
  IndexedDBAdapter: vi.fn().mockImplementation(function (this: { type: string }) {
    this.type = 'indexeddb';
  }),
}));

vi.mock('@/lib/storage/server', () => ({
  ServerStorageAdapter: vi.fn().mockImplementation(function (this: { type: string }) {
    this.type = 'server';
  }),
}));

describe('storage factory', () => {
  let resetAdapter: () => void;
  let getStorageAdapter: (mode: string) => { type: string };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module to reset the singleton
    vi.resetModules();
    const mod = await import('@/lib/storage/factory');
    getStorageAdapter = mod.getStorageAdapter;
    resetAdapter = mod.resetAdapter;
  });

  it('getStorageAdapter("local") returns IndexedDBAdapter instance', () => {
    const adapter = getStorageAdapter('local');
    expect(adapter.type).toBe('indexeddb');
  });

  it('getStorageAdapter("cloud") returns ServerStorageAdapter instance', () => {
    const adapter = getStorageAdapter('cloud');
    expect(adapter.type).toBe('server');
  });

  it('getStorageAdapter("invalid") returns IndexedDBAdapter (default)', () => {
    const adapter = getStorageAdapter('invalid');
    expect(adapter.type).toBe('indexeddb');
  });

  it('returns the same instance (singleton behavior)', () => {
    const adapter1 = getStorageAdapter('local');
    const adapter2 = getStorageAdapter('local');
    expect(adapter1).toBe(adapter2);
  });

  it('resetAdapter() clears singleton and allows new instantiation', () => {
    const adapter1 = getStorageAdapter('local');
    resetAdapter();
    const adapter2 = getStorageAdapter('local');
    // They should be different instances after reset
    expect(adapter1).not.toBe(adapter2);
  });

  it('getStorageAdapter("local") constructs only once due to singleton', async () => {
    const { IndexedDBAdapter } = await import('@/lib/storage/indexeddb');
    getStorageAdapter('local');
    getStorageAdapter('local');
    // IndexedDBAdapter constructor should only be called once
    expect(IndexedDBAdapter).toHaveBeenCalledTimes(1);
  });

  it('after reset, constructor is called again', async () => {
    const { IndexedDBAdapter } = await import('@/lib/storage/indexeddb');
    getStorageAdapter('local');
    resetAdapter();
    getStorageAdapter('local');
    expect(IndexedDBAdapter).toHaveBeenCalledTimes(2);
  });
});
