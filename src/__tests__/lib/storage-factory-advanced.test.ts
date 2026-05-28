import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track whether Tauri mock is enabled per test
let mockIsTauri = false;

vi.mock('@/lib/storage/tauri', () => ({
  isTauriEnvironment: () => mockIsTauri,
  TauriStorageAdapter: vi.fn().mockImplementation(function (this: { type: string }) {
    this.type = 'tauri';
  }),
}));

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

type SimpleAdapter = { type: string };

describe('storage factory - advanced', () => {
  let resetAdapter: () => void;
  let getStorageAdapter: (mode: string) => SimpleAdapter;
  let getStorageAdapterAsync: (mode: string) => Promise<SimpleAdapter>;

  beforeEach(async () => {
    mockIsTauri = false;
    vi.clearAllMocks();
    vi.resetModules();

    const mod = await import('@/lib/storage/factory');
    getStorageAdapter = mod.getStorageAdapter as unknown as (mode: string) => SimpleAdapter;
    getStorageAdapterAsync = mod.getStorageAdapterAsync as unknown as (mode: string) => Promise<SimpleAdapter>;
    resetAdapter = mod.resetAdapter;
  });

  // ─── Synchronous version ──────────────────────────────────

  describe('getStorageAdapter (sync)', () => {
    it('returns IndexedDBAdapter for "local" mode', () => {
      const adapter = getStorageAdapter('local');
      expect(adapter.type).toBe('indexeddb');
    });

    it('returns ServerStorageAdapter for "cloud" mode', () => {
      const adapter = getStorageAdapter('cloud');
      expect(adapter.type).toBe('server');
    });

    it('returns IndexedDBAdapter as default for unknown mode', () => {
      const adapter = getStorageAdapter('invalid');
      expect(adapter.type).toBe('indexeddb');
    });

    it('returns same instance (singleton)', () => {
      const a1 = getStorageAdapter('local');
      const a2 = getStorageAdapter('cloud');
      expect(a1).toBe(a2);
    });

    it('resetAdapter() allows creating new adapter', () => {
      const a1 = getStorageAdapter('local');
      resetAdapter();
      const a2 = getStorageAdapter('local');
      expect(a1).not.toBe(a2);
    });

    it('warns when called in Tauri environment (sync)', async () => {
      mockIsTauri = true;
      vi.resetModules();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mod = await import('@/lib/storage/factory');
      getStorageAdapter = mod.getStorageAdapter as unknown as (mode: string) => SimpleAdapter;
      resetAdapter = mod.resetAdapter;

      const adapter = getStorageAdapter('local');
      expect(adapter.type).toBe('indexeddb');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('同步 getStorageAdapter() 在 Tauri 环境中无法使用 Tauri 适配器')
      );

      warnSpy.mockRestore();
    });

    it('after reset in Tauri env, warns again', async () => {
      mockIsTauri = true;
      vi.resetModules();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mod = await import('@/lib/storage/factory');
      getStorageAdapter = mod.getStorageAdapter as unknown as (mode: string) => SimpleAdapter;
      resetAdapter = mod.resetAdapter;

      getStorageAdapter('local');
      resetAdapter();
      getStorageAdapter('local');

      expect(warnSpy).toHaveBeenCalledTimes(2);

      warnSpy.mockRestore();
    });
  });

  // ─── Asynchronous version ─────────────────────────────────

  describe('getStorageAdapterAsync', () => {
    it('returns IndexedDBAdapter for "local" in browser', async () => {
      mockIsTauri = false;
      const adapter = await getStorageAdapterAsync('local');
      expect(adapter.type).toBe('indexeddb');
    });

    it('returns ServerStorageAdapter for "cloud"', async () => {
      const adapter = await getStorageAdapterAsync('cloud');
      expect(adapter.type).toBe('server');
    });

    it('returns IndexedDBAdapter as default', async () => {
      const adapter = await getStorageAdapterAsync('unknown');
      expect(adapter.type).toBe('indexeddb');
    });

    it('returns TauriStorageAdapter when in Tauri environment', async () => {
      mockIsTauri = true;
      vi.resetModules();

      const mod = await import('@/lib/storage/factory');
      getStorageAdapterAsync = mod.getStorageAdapterAsync as unknown as (mode: string) => Promise<SimpleAdapter>;
      resetAdapter = mod.resetAdapter;

      const adapter = await getStorageAdapterAsync('local');
      expect(adapter.type).toBe('tauri');
    });

    it('uses singleton: returns cached adapter after first creation', async () => {
      const a1 = await getStorageAdapterAsync('local');
      const a2 = await getStorageAdapterAsync('cloud');
      expect(a1).toBe(a2);
    });

    it('returns cached adapter if already initialized (even with different mode)', async () => {
      const cloud = await getStorageAdapterAsync('cloud');
      expect(cloud.type).toBe('server');

      const local = await getStorageAdapterAsync('local');
      expect(local).toBe(cloud);
    });

    it('resetAdapter allows async to create new instance', async () => {
      const a1 = await getStorageAdapterAsync('cloud');
      resetAdapter();
      const a2 = await getStorageAdapterAsync('local');
      expect(a1).not.toBe(a2);
    });

    it('after reset, async can create Tauri adapter', async () => {
      const a1 = await getStorageAdapterAsync('local');
      expect(a1.type).toBe('indexeddb');

      resetAdapter();
      mockIsTauri = true;
      vi.resetModules();

      const mod = await import('@/lib/storage/factory');
      getStorageAdapterAsync = mod.getStorageAdapterAsync as unknown as (mode: string) => Promise<SimpleAdapter>;

      const a2 = await getStorageAdapterAsync('local');
      expect(a2.type).toBe('tauri');
    });
  });

  // ─── Mode switching ───────────────────────────────────────

  describe('mode switching behavior', () => {
    it('cannot switch mode once adapter is created (sync)', () => {
      const adapter = getStorageAdapter('local');
      expect(adapter.type).toBe('indexeddb');

      const sameAdapter = getStorageAdapter('cloud');
      expect(sameAdapter).toBe(adapter);
    });

    it('cannot switch mode once adapter is created (async)', async () => {
      const adapter = await getStorageAdapterAsync('cloud');
      expect(adapter.type).toBe('server');

      const sameAdapter = await getStorageAdapterAsync('local');
      expect(sameAdapter).toBe(adapter);
    });

    it('resetAdapter then switch mode (sync)', () => {
      const local = getStorageAdapter('local');
      expect(local.type).toBe('indexeddb');

      resetAdapter();

      const cloud = getStorageAdapter('cloud');
      expect(cloud.type).toBe('server');
      expect(cloud).not.toBe(local);
    });

    it('resetAdapter clears singleton so async can initialize differently', async () => {
      const syncAdapter = getStorageAdapter('local');
      expect(syncAdapter.type).toBe('indexeddb');

      const asyncAdapter = await getStorageAdapterAsync('cloud');
      expect(asyncAdapter).toBe(syncAdapter);

      resetAdapter();
      const newAsync = await getStorageAdapterAsync('cloud');
      expect(newAsync.type).toBe('server');
      expect(newAsync).not.toBe(syncAdapter);
    });
  });
});
