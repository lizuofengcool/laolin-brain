/**
 * offline-queue 离线操作队列（IndexedDB 持久化 + fetch 回放）单测
 *
 * 覆盖目标：src/lib/offline-queue.ts。该模块以全局 indexedDB（request-based 原生 API，
 * 非 idb 库）持久化离线操作，processOfflineQueue 通过全局 fetch + localStorage(kb_token)
 * 回放。jsdom 不提供 indexedDB，故本文件内置一个行为等价的 FakeIDB（内存 Map + 微任务
 * 异步派发 onupgradeneeded/onsuccess/oncomplete/onerror 事件），并 stubGlobal 覆盖
 * indexedDB / fetch / localStorage，使模块在无浏览器环境下可全路径执行。
 *
 * 关键控制流：
 * - getDB：indexedDB.open(name,3) → 新库（或版本变更）触发 onupgradeneeded 创建
 *   offline_queue objectStore（keyPath='id'）→ onsuccess resolve(db)。FakeIDB 按名缓存
 *   库实例，二次 open 命中缓存且 store 已存在则跳过 upgrade
 * - addToOfflineQueue：生成 id=`op_${ts}_${rand7}` + createdAt=ISO，readwrite 事务 put
 *   entry，tx.oncomplete resolve（void）
 * - getOfflineQueue：readonly 事务 getAll，request.onsuccess resolve(request.result)
 * - removeFromOfflineQueue：readwrite 事务 delete(id)，tx.oncomplete resolve
 * - clearOfflineQueue：readwrite 事务 clear，tx.oncomplete resolve
 * - getOfflineQueueCount：getOfflineQueue().length
 * - processOfflineQueue：空队列直接 {0,0}；否则逐条——
 *   · token = window 存在时 localStorage.getItem('kb_token')，有则附 Authorization: Bearer
 *   · headers 固定 Content-Type: application/json
 *   · method = type==='delete' ? 'DELETE' : 'PATCH'；非 delete 附 body=JSON.stringify(payload)
 *   · url = `/api/files/${fileId}`
 *   · response.ok → processed++ 且 removeFromOfflineQueue；否则 failed++ 保留
 *   · fetch 抛错 → catch failed++ 保留
 *   · 返回 {processed, failed}
 *
 * FakeIDB 事件时序：open()/transaction()/store-op 均通过 queueMicrotask 延后派发事件，
 * 以保证调用方在 await 前完成 handler 挂载（与原生 IDB 异步语义一致）；put/delete/clear
 * 同步修改内存 Map 后再延后派发 request.onsuccess/tx.oncomplete，故事务完成时数据已落 Map。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addToOfflineQueue,
  getOfflineQueue,
  removeFromOfflineQueue,
  clearOfflineQueue,
  processOfflineQueue,
  getOfflineQueueCount,
} from '@/lib/offline-queue';
import type { OfflineOperation } from '@/lib/offline-queue';

// ============================================================================
// FakeIDB —— request-based 原生 IndexedDB API 的内存等价实现
// ============================================================================

type IDBEventCb = ((evt: { target: unknown }) => void) | null;

class FakeRequest<T = unknown> {
  result: T;
  error: unknown = null;
  onsuccess: IDBEventCb = null;
  onerror: IDBEventCb = null;
  constructor(result?: T) {
    this.result = result as T;
  }
  fireSuccess() {
    if (this.onsuccess) this.onsuccess({ target: this });
  }
  fireError(err: unknown) {
    this.error = err;
    if (this.onerror) this.onerror({ target: this });
  }
}

class FakeStore {
  data = new Map<string, unknown>();
  put(value: unknown & { id: string }): FakeRequest {
    this.data.set(value.id, value);
    const req = new FakeRequest();
    queueMicrotask(() => req.fireSuccess());
    return req;
  }
  delete(key: string): FakeRequest {
    this.data.delete(key);
    const req = new FakeRequest();
    queueMicrotask(() => req.fireSuccess());
    return req;
  }
  getAll(): FakeRequest<unknown[]> {
    const req = new FakeRequest<unknown[]>(Array.from(this.data.values()));
    queueMicrotask(() => req.fireSuccess());
    return req;
  }
  clear(): FakeRequest {
    this.data.clear();
    const req = new FakeRequest();
    queueMicrotask(() => req.fireSuccess());
    return req;
  }
}

class FakeTransaction {
  private stores: Record<string, FakeStore>;
  oncomplete: IDBEventCb = null;
  onerror: IDBEventCb = null;
  error: unknown = null;
  private fired = false;
  constructor(stores: Record<string, FakeStore>) {
    this.stores = stores;
  }
  objectStore(name: string): FakeStore {
    return this.stores[name];
  }
  fireComplete() {
    if (this.fired) return;
    this.fired = true;
    if (this.oncomplete) this.oncomplete({ target: this });
  }
}

class FakeDB {
  name: string;
  version: number;
  stores: Record<string, FakeStore> = {};
  readonly objectStoreNames = {
    contains: (n: string) => Boolean(this.stores[n]),
  };
  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }
  createObjectStore(name: string): FakeStore {
    const s = new FakeStore();
    this.stores[name] = s;
    return s;
  }
  transaction(storeName: string, _mode: string): FakeTransaction {
    const tx = new FakeTransaction({ [storeName]: this.stores[storeName] });
    queueMicrotask(() => tx.fireComplete());
    return tx;
  }
}

class FakeIDBFactory {
  private dbs = new Map<string, FakeDB>();
  open(name: string, version: number): FakeRequest<FakeDB> {
    const req = new FakeRequest<FakeDB>();
    const existing = this.dbs.get(name);
    const isNew = !existing;
    const db = existing ?? new FakeDB(name, version);
    if (isNew) this.dbs.set(name, db);
    const needUpgrade = isNew || db.version !== version;
    if (needUpgrade) db.version = version;
    queueMicrotask(() => {
      req.result = db;
      if (needUpgrade && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req });
      }
      req.fireSuccess();
    });
    return req;
  }
  reset() {
    this.dbs.clear();
  }
}

// ============================================================================
// localStorage + fetch mock
// ============================================================================

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    get length() {
      return store.size;
    },
    key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
  };
}

function createResponseMock(ok: boolean, status: number) {
  return { ok, status } as unknown as Response;
}

// ============================================================================
// 测试
// ============================================================================

describe('offline-queue', () => {
  let fakeIDB: FakeIDBFactory;
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeIDB = new FakeIDBFactory();
    localStorageMock = createLocalStorageMock();
    fetchMock = vi.fn();
    vi.stubGlobal('indexedDB', fakeIDB);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // addToOfflineQueue
  // ---------------------------------------------------------------------------

  describe('addToOfflineQueue', () => {
    it('生成 op_ 前缀 id 与 ISO createdAt，并持久化 entry', async () => {
      await addToOfflineQueue({
        type: 'rename',
        fileId: 'file-1',
        userId: 'user-1',
        payload: { name: 'new-name.txt' },
      });

      const all = await getOfflineQueue();
      expect(all).toHaveLength(1);
      const entry = all[0] as OfflineOperation;
      expect(entry.id).toMatch(/^op_\d+_[a-z0-9]{7}$/);
      expect(entry.createdAt).toBe(new Date(entry.createdAt).toISOString());
      expect(entry.type).toBe('rename');
      expect(entry.fileId).toBe('file-1');
      expect(entry.userId).toBe('user-1');
      expect(entry.payload).toEqual({ name: 'new-name.txt' });
    });

    it('可连续添加多条操作，各自 id 唯一', async () => {
      await addToOfflineQueue({ type: 'favorite', fileId: 'f1', userId: 'u1', payload: {} });
      await addToOfflineQueue({ type: 'delete', fileId: 'f2', userId: 'u1', payload: {} });
      await addToOfflineQueue({ type: 'updateTags', fileId: 'f3', userId: 'u2', payload: { tags: ['a'] } });

      const all = await getOfflineQueue();
      expect(all).toHaveLength(3);
      const ids = all.map((o) => o.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('保留全部 type 取值与 payload 结构', async () => {
      const types: OfflineOperation['type'][] = ['rename', 'delete', 'favorite', 'updateTags', 'moveToFolder'];
      for (const type of types) {
        await addToOfflineQueue({ type, fileId: `f-${type}`, userId: 'u', payload: { kind: type, n: 1 } });
      }
      const all = await getOfflineQueue();
      expect(all.map((o) => o.type).sort()).toEqual([...types].sort());
      expect(all.every((o) => o.payload.kind === o.type && o.payload.n === 1)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getOfflineQueue / getOfflineQueueCount
  // ---------------------------------------------------------------------------

  describe('getOfflineQueue / getOfflineQueueCount', () => {
    it('空队列返回空数组', async () => {
      expect(await getOfflineQueue()).toEqual([]);
      expect(await getOfflineQueueCount()).toBe(0);
    });

    it('返回全部已存储条目，count 同步增长', async () => {
      await addToOfflineQueue({ type: 'rename', fileId: 'f1', userId: 'u', payload: {} });
      expect(await getOfflineQueueCount()).toBe(1);
      await addToOfflineQueue({ type: 'delete', fileId: 'f2', userId: 'u', payload: {} });
      expect(await getOfflineQueueCount()).toBe(2);

      const all = await getOfflineQueue();
      expect(all).toHaveLength(2);
      expect(all.map((o) => o.fileId).sort()).toEqual(['f1', 'f2']);
    });
  });

  // ---------------------------------------------------------------------------
  // removeFromOfflineQueue
  // ---------------------------------------------------------------------------

  describe('removeFromOfflineQueue', () => {
    it('按 id 删除指定条目，保留其余', async () => {
      await addToOfflineQueue({ type: 'rename', fileId: 'f1', userId: 'u', payload: {} });
      await addToOfflineQueue({ type: 'delete', fileId: 'f2', userId: 'u', payload: {} });
      const before = await getOfflineQueue();
      const target = before.find((o) => o.fileId === 'f1') as OfflineOperation;

      await removeFromOfflineQueue(target.id);

      const after = await getOfflineQueue();
      expect(after).toHaveLength(1);
      expect(after[0].fileId).toBe('f2');
    });

    it('删除不存在的 id 不抛错且不影响其他条目', async () => {
      await addToOfflineQueue({ type: 'rename', fileId: 'f1', userId: 'u', payload: {} });
      await expect(removeFromOfflineQueue('op_nonexistent')).resolves.toBeUndefined();
      expect(await getOfflineQueue()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // clearOfflineQueue
  // ---------------------------------------------------------------------------

  describe('clearOfflineQueue', () => {
    it('清空全部条目', async () => {
      await addToOfflineQueue({ type: 'rename', fileId: 'f1', userId: 'u', payload: {} });
      await addToOfflineQueue({ type: 'delete', fileId: 'f2', userId: 'u', payload: {} });
      expect(await getOfflineQueueCount()).toBe(2);

      await clearOfflineQueue();

      expect(await getOfflineQueue()).toEqual([]);
      expect(await getOfflineQueueCount()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // processOfflineQueue
  // ---------------------------------------------------------------------------

  describe('processOfflineQueue', () => {
    it('空队列返回 {processed:0, failed:0} 且不调用 fetch', async () => {
      const result = await processOfflineQueue();
      expect(result).toEqual({ processed: 0, failed: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('非 delete 类型用 PATCH + JSON body 请求 /api/files/:fileId，成功后从队列移除', async () => {
      fetchMock.mockResolvedValueOnce(createResponseMock(true, 200));
      await addToOfflineQueue({ type: 'rename', fileId: 'file-x', userId: 'u', payload: { name: 'renamed' } });

      const result = await processOfflineQueue();

      expect(result).toEqual({ processed: 1, failed: 0 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/files/file-x');
      expect(init).toMatchObject({ method: 'PATCH' });
      expect(JSON.parse(init.body as string)).toEqual({ name: 'renamed' });
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(await getOfflineQueueCount()).toBe(0);
    });

    it('delete 类型用 DELETE 方法且不带 body', async () => {
      fetchMock.mockResolvedValueOnce(createResponseMock(true, 204));
      await addToOfflineQueue({ type: 'delete', fileId: 'file-del', userId: 'u', payload: {} });

      const result = await processOfflineQueue();

      expect(result).toEqual({ processed: 1, failed: 0 });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });

    it('response.ok 为 false 时计入 failed 且保留条目', async () => {
      fetchMock.mockResolvedValueOnce(createResponseMock(false, 500));
      await addToOfflineQueue({ type: 'rename', fileId: 'f', userId: 'u', payload: { a: 1 } });

      const result = await processOfflineQueue();

      expect(result).toEqual({ processed: 0, failed: 1 });
      expect(await getOfflineQueueCount()).toBe(1);
    });

    it('fetch 抛错时 catch 计入 failed 且保留条目', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await addToOfflineQueue({ type: 'favorite', fileId: 'f', userId: 'u', payload: {} });

      const result = await processOfflineQueue();

      expect(result).toEqual({ processed: 0, failed: 1 });
      expect(await getOfflineQueueCount()).toBe(1);
    });

    it('localStorage 有 kb_token 时附 Authorization: Bearer 头', async () => {
      localStorageMock.setItem('kb_token', 'token-abc');
      fetchMock.mockResolvedValueOnce(createResponseMock(true, 200));
      await addToOfflineQueue({ type: 'rename', fileId: 'f', userId: 'u', payload: {} });

      await processOfflineQueue();

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['Authorization']).toBe('Bearer token-abc');
    });

    it('localStorage 无 kb_token 时不附 Authorization 头', async () => {
      fetchMock.mockResolvedValueOnce(createResponseMock(true, 200));
      await addToOfflineQueue({ type: 'rename', fileId: 'f', userId: 'u', payload: {} });

      await processOfflineQueue();

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['Authorization']).toBeUndefined();
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('混合成功/失败：仅成功的条目被移除，failed 保留', async () => {
      fetchMock
        .mockResolvedValueOnce(createResponseMock(true, 200))
        .mockResolvedValueOnce(createResponseMock(false, 403))
        .mockResolvedValueOnce(createResponseMock(true, 200));
      await addToOfflineQueue({ type: 'rename', fileId: 'ok1', userId: 'u', payload: { i: 1 } });
      await addToOfflineQueue({ type: 'delete', fileId: 'fail', userId: 'u', payload: {} });
      await addToOfflineQueue({ type: 'favorite', fileId: 'ok2', userId: 'u', payload: {} });

      const result = await processOfflineQueue();

      expect(result).toEqual({ processed: 2, failed: 1 });
      const remaining = await getOfflineQueue();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].fileId).toBe('fail');
    });

    it('URL 对每个操作按其 fileId 拼装', async () => {
      fetchMock.mockResolvedValue(createResponseMock(true, 200));
      await addToOfflineQueue({ type: 'rename', fileId: 'aaa', userId: 'u', payload: {} });
      await addToOfflineQueue({ type: 'rename', fileId: 'bbb', userId: 'u', payload: {} });

      await processOfflineQueue();

      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toContain('/api/files/aaa');
      expect(urls).toContain('/api/files/bbb');
    });
  });

  // ---------------------------------------------------------------------------
  // getDB onupgradeneeded（间接验证：首次 open 创建 store）
  // ---------------------------------------------------------------------------

  describe('getDB 初始化', () => {
    it('首次调用自动创建 offline_queue store，后续调用复用同库', async () => {
      // 首次 add 触发 open -> onupgradeneeded -> createObjectStore
      await addToOfflineQueue({ type: 'rename', fileId: 'f', userId: 'u', payload: {} });
      // 第二次 add 复用既有库（不再 upgrade），数据应累加
      await addToOfflineQueue({ type: 'delete', fileId: 'f2', userId: 'u', payload: {} });
      expect(await getOfflineQueueCount()).toBe(2);
    });
  });
});
