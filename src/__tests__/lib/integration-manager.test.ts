import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// integrations/integration-manager.ts：纯内存模块，导出 IntegrationManager 类（可直接 new 隔离）、
// 单例 integrationManager、BUILTIN_INTEGRATIONS 常量表。依赖仅 Map / Date.now / Math.random。
// 通过注入 fake IntegrationProvider 覆盖 connect/disconnect/checkStatus/sync/handleWebhook/testConnection 全路径。
// executeSyncTask 为 private 且在 createSyncTask 内 fire-and-forget（不 await）：
//   · provider 无 sync → 同步跑完 pending→running→completed（createSyncTask 返回时已完成）
//   · provider 有 sync → 同步置 running 后 await provider.sync 挂起，需 flush 微任务才推进到 completed/failed
import {
  IntegrationManager,
  integrationManager,
  BUILTIN_INTEGRATIONS,
} from '@/lib/integrations/integration-manager';
import type {
  IntegrationProvider,
  IntegrationConfig,
  IntegrationMeta,
  ConnectedIntegration,
} from '@/lib/integrations/integration-manager';

// 默认 provider meta
function makeMeta(overrides: Partial<IntegrationMeta> = {}): IntegrationMeta {
  return {
    id: 'fake-integration',
    name: 'Fake Integration',
    description: 'A fake integration for tests',
    type: 'custom',
    category: 'other',
    authType: 'api-key',
    features: ['test'],
    isOfficial: false,
    ...overrides,
  };
}

// 构造 fake provider，每个方法均可被 spy/override
function makeProvider(overrides: Partial<IntegrationProvider> = {}): IntegrationProvider {
  const meta = makeMeta(overrides.meta);
  return {
    meta,
    async connect(config: IntegrationConfig): Promise<ConnectedIntegration> {
      return {
        id: `t-${meta.id}`,
        integrationId: meta.id,
        tenantId: 't',
        userId: 'u',
        name: meta.name,
        status: 'connected',
        config,
        connectedAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async disconnect() {},
    async checkStatus() {
      return 'connected' as const;
    },
    ...overrides,
  };
}

// flush 微任务队列（让 fire-and-forget 的 executeSyncTask 推进到 completed/failed）
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// 可控的 deferred promise，用于观测 executeSyncTask 的 running 中间态
// （sync promise 未 resolve 前，executeSyncTask 挂起在 await，task 停留 running）
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('integrations/integration-manager IntegrationManager', () => {
  let manager: IntegrationManager;

  beforeEach(() => {
    manager = new IntegrationManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================== registerProvider / getAvailableIntegrations / getProvider ====================

  describe('registerProvider / getAvailableIntegrations / getProvider', () => {
    it('registerProvider 按 meta.id 注册，getProvider 返回同一实例', () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      expect(manager.getProvider('fake-integration')).toBe(provider);
    });

    it('getProvider 未注册返回 undefined', () => {
      expect(manager.getProvider('not-exist')).toBeUndefined();
    });

    it('getAvailableIntegrations 返回所有 provider 的 meta 数组', () => {
      const p1 = makeProvider({ meta: makeMeta({ id: 'a', name: 'A' }) });
      const p2 = makeProvider({ meta: makeMeta({ id: 'b', name: 'B' }) });
      manager.registerProvider(p1);
      manager.registerProvider(p2);
      const list = manager.getAvailableIntegrations();
      expect(list).toHaveLength(2);
      expect(list.map((m) => m.id).sort()).toEqual(['a', 'b']);
    });

    it('getAvailableIntegrations 无 provider 返回空数组', () => {
      expect(manager.getAvailableIntegrations()).toEqual([]);
    });

    it('重复注册同 id 覆盖原 provider（Map.set 覆盖语义）', () => {
      const p1 = makeProvider({ meta: makeMeta({ id: 'dup', name: 'First' }) });
      const p2 = makeProvider({ meta: makeMeta({ id: 'dup', name: 'Second' }) });
      manager.registerProvider(p1);
      manager.registerProvider(p2);
      expect(manager.getProvider('dup')).toBe(p2);
      expect(manager.getAvailableIntegrations()).toHaveLength(1);
      expect(manager.getProvider('dup')?.meta.name).toBe('Second');
    });
  });

  // ==================== connectIntegration ====================

  describe('connectIntegration', () => {
    it('provider 不存在抛 Integration ${id} not found', async () => {
      await expect(
        manager.connectIntegration('nope', 't', 'u', {})
      ).rejects.toThrow('Integration nope not found');
    });

    it('调用 provider.connect 并以返回值构建 ConnectedIntegration', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const connectSpy = vi.spyOn(provider, 'connect');
      const integration = await manager.connectIntegration(
        'fake-integration',
        'tenant-1',
        'user-1',
        { token: 'abc' }
      );
      expect(connectSpy).toHaveBeenCalledWith({ token: 'abc' });
      expect(integration.integrationId).toBe('fake-integration');
      expect(integration.tenantId).toBe('tenant-1');
      expect(integration.userId).toBe('user-1');
      expect(integration.name).toBe('Fake Integration');
      expect(integration.status).toBe('connected');
      expect(integration.config).toEqual({ token: 'abc' });
      expect(integration.connectedAt).toBeInstanceOf(Date);
      expect(integration.updatedAt).toBeInstanceOf(Date);
    });

    it('id 与存储 key 均为 ${tenantId}-${integrationId}', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const integration = await manager.connectIntegration(
        'fake-integration',
        'tenant-1',
        'user-1',
        {}
      );
      expect(integration.id).toBe('tenant-1-fake-integration');
      // 通过 getConnectedIntegration 复核存储 key
      expect(manager.getConnectedIntegration('fake-integration', 'tenant-1')).toBe(
        integration
      );
    });

    it('同 tenant 不同 integration 可同时连接，互不覆盖', async () => {
      const p1 = makeProvider({ meta: makeMeta({ id: 'a' }) });
      const p2 = makeProvider({ meta: makeMeta({ id: 'b' }) });
      manager.registerProvider(p1);
      manager.registerProvider(p2);
      const i1 = await manager.connectIntegration('a', 'tenant-1', 'u', {});
      const i2 = await manager.connectIntegration('b', 'tenant-1', 'u', {});
      expect(manager.getConnectedIntegration('a', 'tenant-1')).toBe(i1);
      expect(manager.getConnectedIntegration('b', 'tenant-1')).toBe(i2);
      expect(manager.getConnectedIntegrations('tenant-1')).toHaveLength(2);
    });

    it('不同 tenant 连接同 integration 各自独立', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const i1 = await manager.connectIntegration('fake-integration', 't1', 'u1', {});
      const i2 = await manager.connectIntegration('fake-integration', 't2', 'u2', {});
      expect(i1.id).toBe('t1-fake-integration');
      expect(i2.id).toBe('t2-fake-integration');
      expect(manager.getConnectedIntegrations('t1')).toEqual([i1]);
      expect(manager.getConnectedIntegrations('t2')).toEqual([i2]);
    });

    it('provider.connect 抛错则 connectIntegration 抛错且不入库', async () => {
      const provider = makeProvider({
        async connect() {
          throw new Error('connect failed');
        },
      });
      manager.registerProvider(provider);
      await expect(
        manager.connectIntegration('fake-integration', 't', 'u', {})
      ).rejects.toThrow('connect failed');
      expect(manager.getConnectedIntegrations('t')).toHaveLength(0);
    });
  });

  // ==================== disconnectIntegration ====================

  describe('disconnectIntegration', () => {
    it('未连接抛 Integration ${id} not connected', async () => {
      await expect(manager.disconnectIntegration('x', 't')).rejects.toThrow(
        'Integration x not connected'
      );
    });

    it('调用 provider.disconnect(integration.id) 并删除记录', async () => {
      const provider = makeProvider();
      const disconnectSpy = vi.spyOn(provider, 'disconnect');
      manager.registerProvider(provider);
      const integration = await manager.connectIntegration(
        'fake-integration',
        't',
        'u',
        {}
      );
      await manager.disconnectIntegration('fake-integration', 't');
      expect(disconnectSpy).toHaveBeenCalledWith(integration.id);
      expect(manager.getConnectedIntegration('fake-integration', 't')).toBeUndefined();
    });

    it('断开后同 tenant 其它 integration 保留', async () => {
      const p1 = makeProvider({ meta: makeMeta({ id: 'a' }) });
      const p2 = makeProvider({ meta: makeMeta({ id: 'b' }) });
      manager.registerProvider(p1);
      manager.registerProvider(p2);
      await manager.connectIntegration('a', 't', 'u', {});
      await manager.connectIntegration('b', 't', 'u', {});
      await manager.disconnectIntegration('a', 't');
      expect(manager.getConnectedIntegrations('t')).toHaveLength(1);
      expect(manager.getConnectedIntegration('b', 't')).toBeDefined();
    });
  });

  // ==================== getConnectedIntegrations / getConnectedIntegration ====================

  describe('getConnectedIntegrations / getConnectedIntegration', () => {
    it('getConnectedIntegrations 按 tenantId 过滤', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't1', 'u', {});
      await manager.connectIntegration('fake-integration', 't2', 'u', {});
      expect(manager.getConnectedIntegrations('t1')).toHaveLength(1);
      expect(manager.getConnectedIntegrations('t2')).toHaveLength(1);
      expect(manager.getConnectedIntegrations('t3')).toEqual([]);
    });

    it('getConnectedIntegration 未连接返回 undefined', () => {
      expect(manager.getConnectedIntegration('x', 't')).toBeUndefined();
    });
  });

  // ==================== checkIntegrationStatus ====================

  describe('checkIntegrationStatus', () => {
    it('未连接返回 "disconnected"', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      expect(await manager.checkIntegrationStatus('fake-integration', 't')).toBe(
        'disconnected'
      );
    });

    it('provider 存在时委托 provider.checkStatus(integration.id)', async () => {
      const provider = makeProvider({
        async checkStatus() {
          return 'expired' as const;
        },
      });
      const checkSpy = vi.spyOn(provider, 'checkStatus');
      manager.registerProvider(provider);
      const integration = await manager.connectIntegration(
        'fake-integration',
        't',
        'u',
        {}
      );
      const status = await manager.checkIntegrationStatus('fake-integration', 't');
      expect(checkSpy).toHaveBeenCalledWith(integration.id);
      expect(status).toBe('expired');
    });

    it('provider.checkStatus 返回不同状态值均透传', async () => {
      for (const s of ['connected', 'error', 'expired'] as const) {
        const m = new IntegrationManager();
        const provider = makeProvider({
          async checkStatus() {
            return s;
          },
        });
        m.registerProvider(provider);
        await m.connectIntegration('fake-integration', 't', 'u', {});
        expect(await m.checkIntegrationStatus('fake-integration', 't')).toBe(s);
      }
    });
  });

  // ==================== updateIntegrationConfig ====================

  describe('updateIntegrationConfig', () => {
    it('未连接抛 Integration ${id} not connected', () => {
      expect(() => manager.updateIntegrationConfig('x', 't', {})).toThrow(
        'Integration x not connected'
      );
    });

    it('浅合并 config 并更新 updatedAt，返回同一引用', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const integration = await manager.connectIntegration(
        'fake-integration',
        't',
        'u',
        { token: 'a', keep: 'b' }
      );
      const oldUpdatedAt = integration.updatedAt;
      // 推进时间确保 updatedAt 变化
      vi.useFakeTimers();
      vi.advanceTimersByTime(10);
      const returned = manager.updateIntegrationConfig('fake-integration', 't', {
        token: 'c',
      });
      vi.useRealTimers();
      expect(returned).toBe(integration);
      expect(integration.config).toEqual({ token: 'c', keep: 'b' });
      expect(integration.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
    });
  });

  // ==================== testConnection ====================

  describe('testConnection', () => {
    it('provider 不存在抛 Integration ${id} not found', async () => {
      await expect(manager.testConnection('nope', {})).rejects.toThrow(
        'Integration nope not found'
      );
    });

    it('provider 有 testConnection 时委托调用', async () => {
      const provider = makeProvider({
        async testConnection() {
          return { success: true, message: 'ok' };
        },
      });
      const spy = vi.spyOn(provider, 'testConnection');
      manager.registerProvider(provider);
      const result = await manager.testConnection('fake-integration', { k: 'v' });
      expect(spy).toHaveBeenCalledWith({ k: 'v' });
      expect(result).toEqual({ success: true, message: 'ok' });
    });

    it('provider 无 testConnection 时回退检查 config 是否非空', async () => {
      const provider = makeProvider(); // 无 testConnection
      manager.registerProvider(provider);
      expect(await manager.testConnection('fake-integration', { a: 1 })).toEqual({
        success: true,
      });
      expect(await manager.testConnection('fake-integration', {})).toEqual({
        success: false,
      });
    });
  });

  // ==================== createSyncTask / executeSyncTask / getSyncTask / getSyncTasks ====================

  describe('createSyncTask / executeSyncTask', () => {
    it('未连接抛 Integration ${id} not connected', async () => {
      await expect(manager.createSyncTask('x', 't')).rejects.toThrow(
        'Integration x not connected'
      );
    });

    it('返回任务，id 形如 sync-${ts}-${rand}，默认 type=full', async () => {
      // 用 deferred sync 挂起 executeSyncTask 于 running，便于断言初始字段
      const d = deferred();
      const provider = makeProvider({ sync: () => d.promise } as any);
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      const task = await manager.createSyncTask('fake-integration', 't');
      expect(task.id).toMatch(/^sync-\d+-[a-z0-9]+$/);
      expect(task.integrationId).toBe('fake-integration');
      expect(task.tenantId).toBe('t');
      expect(task.type).toBe('full');
      expect(task.createdAt).toBeInstanceOf(Date);
      // running 中间态可观测
      expect(task.status).toBe('running');
      expect(task.progress).toBe(0);
      expect(task.startedAt).toBeInstanceOf(Date);
      d.resolve();
      await flushMicrotasks();
      expect(manager.getSyncTask(task.id)?.status).toBe('completed');
    });

    it('provider 无 sync → 同步跑完 pending→running→completed，progress=100', async () => {
      const provider = makeProvider(); // 无 sync
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      const task = await manager.createSyncTask('fake-integration', 't');
      // executeSyncTask 无 await 内部同步完成
      expect(task.status).toBe('completed');
      expect(task.progress).toBe(100);
      expect(task.startedAt).toBeInstanceOf(Date);
      expect(task.completedAt).toBeInstanceOf(Date);
    });

    it('provider 无 sync 时 lastSyncAt 已更新', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      await manager.createSyncTask('fake-integration', 't');
      const integration = manager.getConnectedIntegration('fake-integration', 't');
      expect(integration?.lastSyncAt).toBeInstanceOf(Date);
    });

    it('provider.sync 存在 → running 可观测，resolve 后 completed 且 sync 收到 { taskId }', async () => {
      const d = deferred();
      const syncSpy = vi.fn(() => d.promise);
      const provider = makeProvider({ sync: syncSpy } as any);
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      const task = await manager.createSyncTask('fake-integration', 't');
      expect(task.status).toBe('running');
      expect(task.startedAt).toBeInstanceOf(Date);
      // sync 以 (integrationId, { taskId }) 调用
      expect(syncSpy).toHaveBeenCalledWith('fake-integration', { taskId: task.id });
      d.resolve();
      await flushMicrotasks();
      const finalTask = manager.getSyncTask(task.id);
      expect(finalTask?.status).toBe('completed');
      expect(finalTask?.progress).toBe(100);
      expect(finalTask?.completedAt).toBeInstanceOf(Date);
    });

    it('provider.sync reject → running 可观测，reject 后 status=failed + errorMessage + failedAt', async () => {
      const d = deferred();
      const provider = makeProvider({ sync: () => d.promise } as any);
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      const task = await manager.createSyncTask('fake-integration', 't');
      expect(task.status).toBe('running');
      d.reject(new Error('sync boom'));
      await flushMicrotasks();
      const finalTask = manager.getSyncTask(task.id);
      expect(finalTask?.status).toBe('failed');
      expect(finalTask?.errorMessage).toBe('sync boom');
      expect(finalTask?.failedAt).toBeInstanceOf(Date);
      // 失败也更新 lastSyncAt
      const integration = manager.getConnectedIntegration('fake-integration', 't');
      expect(integration?.lastSyncAt).toBeInstanceOf(Date);
    });

    it('自定义 type 透传', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't', 'u', {});
      const task = await manager.createSyncTask('fake-integration', 't', 'incremental');
      expect(task.type).toBe('incremental');
    });

    it('getSyncTask 未存在返回 undefined', () => {
      expect(manager.getSyncTask('nope')).toBeUndefined();
    });

    it('getSyncTasks 按 integrationId + tenantId 双重过滤', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      await manager.connectIntegration('fake-integration', 't1', 'u', {});
      await manager.connectIntegration('fake-integration', 't2', 'u', {});
      const task1 = await manager.createSyncTask('fake-integration', 't1');
      const task2 = await manager.createSyncTask('fake-integration', 't2');
      expect(manager.getSyncTasks('fake-integration', 't1')).toEqual([task1]);
      expect(manager.getSyncTasks('fake-integration', 't2')).toEqual([task2]);
      expect(manager.getSyncTasks('fake-integration', 't3')).toEqual([]);
    });
  });

  // ==================== handleWebhook / getWebhookEvent ====================

  describe('handleWebhook / getWebhookEvent', () => {
    it('provider 无 handleWebhook → 直接置 processed + processedAt', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const event = await manager.handleWebhook(
        'fake-integration',
        't',
        'push',
        { ref: 'main' }
      );
      expect(event.id).toMatch(/^webhook-\d+-[a-z0-9]+$/);
      expect(event.integrationId).toBe('fake-integration');
      expect(event.tenantId).toBe('t');
      expect(event.eventType).toBe('push');
      expect(event.payload).toEqual({ ref: 'main' });
      expect(event.receivedAt).toBeInstanceOf(Date);
      expect(event.status).toBe('processed');
      expect(event.processedAt).toBeInstanceOf(Date);
    });

    it('provider 有 handleWebhook 且成功 → processed', async () => {
      const hookSpy = vi.fn(async () => undefined);
      const provider = makeProvider({ handleWebhook: hookSpy } as any);
      manager.registerProvider(provider);
      const event = await manager.handleWebhook('fake-integration', 't', 'push', {
        x: 1,
      });
      expect(hookSpy).toHaveBeenCalledWith(event);
      expect(event.status).toBe('processed');
      expect(event.processedAt).toBeInstanceOf(Date);
    });

    it('provider.handleWebhook 抛错 → failed + errorMessage', async () => {
      const provider = makeProvider({
        handleWebhook: async () => {
          throw new Error('hook fail');
        },
      } as any);
      manager.registerProvider(provider);
      const event = await manager.handleWebhook('fake-integration', 't', 'push', {});
      expect(event.status).toBe('failed');
      expect(event.errorMessage).toBe('hook fail');
      expect(event.processedAt).toBeUndefined();
    });

    it('getWebhookEvent 返回已存储事件，未存在返回 undefined', async () => {
      const provider = makeProvider();
      manager.registerProvider(provider);
      const event = await manager.handleWebhook('fake-integration', 't', 'push', {});
      expect(manager.getWebhookEvent(event.id)).toBe(event);
      expect(manager.getWebhookEvent('nope')).toBeUndefined();
    });
  });

  // ==================== 单例 integrationManager ====================

  describe('单例 integrationManager', () => {
    it('integrationManager 是 IntegrationManager 实例', () => {
      expect(integrationManager).toBeInstanceOf(IntegrationManager);
    });

    it('多次 import 返回同一单例引用', async () => {
      const mod = await import('@/lib/integrations/integration-manager');
      expect(mod.integrationManager).toBe(integrationManager);
    });
  });

  // ==================== BUILTIN_INTEGRATIONS ====================

  describe('BUILTIN_INTEGRATIONS', () => {
    it('包含 8 个内置集成', () => {
      expect(BUILTIN_INTEGRATIONS).toHaveLength(8);
    });

    it('id 集合符合预期', () => {
      const ids = BUILTIN_INTEGRATIONS.map((m) => m.id);
      expect(ids).toEqual([
        'wechat-work',
        'dingtalk',
        'feishu',
        'wechat-official',
        'github',
        'gitlab',
        'aliyun-storage',
        'tencent-storage',
      ]);
    });

    it('每项 meta 字段完整且 isOfficial=true', () => {
      for (const meta of BUILTIN_INTEGRATIONS) {
        expect(typeof meta.id).toBe('string');
        expect(typeof meta.name).toBe('string');
        expect(typeof meta.description).toBe('string');
        expect(typeof meta.type).toBe('string');
        expect(meta.category).toMatch(/communication|development|storage|productivity|other/);
        expect(meta.authType).toMatch(/oauth2|api-key|webhook|basic/);
        expect(Array.isArray(meta.features)).toBe(true);
        expect(meta.isOfficial).toBe(true);
        expect(typeof meta.documentationUrl).toBe('string');
      }
    });

    it('communication 类含企业微信/钉钉/飞书/公众号', () => {
      const comm = BUILTIN_INTEGRATIONS.filter((m) => m.category === 'communication');
      expect(comm.map((m) => m.id).sort()).toEqual([
        'dingtalk',
        'feishu',
        'wechat-official',
        'wechat-work',
      ]);
    });

    it('development 类含 github/gitlab', () => {
      const dev = BUILTIN_INTEGRATIONS.filter((m) => m.category === 'development');
      expect(dev.map((m) => m.id).sort()).toEqual(['github', 'gitlab']);
    });

    it('storage 类含 aliyun/tencent', () => {
      const storage = BUILTIN_INTEGRATIONS.filter((m) => m.category === 'storage');
      expect(storage.map((m) => m.id).sort()).toEqual([
        'aliyun-storage',
        'tencent-storage',
      ]);
    });
  });
});
