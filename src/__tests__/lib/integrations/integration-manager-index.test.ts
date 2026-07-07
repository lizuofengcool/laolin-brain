import { describe, it, expect, vi } from 'vitest';

// integrations/index.ts：导出与 ./integration-manager.ts 同名但接口不同的 IntegrationManager 类。
// 本文件覆盖 index 版（providers 按 provider.type 键存、integrations 按 config.id 键存）：
//   · registerProvider/getProvider/getAvailableTypes —— provider 注册表（Map<IntegrationType, Provider>）
//   · addIntegration/getIntegration/getIntegrationsByTenant/getEnabledIntegrations —— 集成配置存储（Map<id, IntegrationConfig>）
//   · testIntegration(type, config) —— initialize + testConnection，吞错返回 false
//   · sendMessageToAll(tenantId, message) —— 向启用且 message 能力为真的集成广播，聚合 success/failed/errors
// 纯内存逻辑，通过注入 fake IntegrationProvider 覆盖全路径。每个用例 new 全新实例避免私有 Map 状态污染。
import {
  IntegrationManager,
  integrationManager,
} from '@/lib/integrations/index';
import type {
  IntegrationProvider,
  IntegrationConfig,
  IntegrationType,
  IntegrationCapabilities,
} from '@/lib/integrations/index';

// 构造 fake provider：所有方法均为 vi.fn 以便断言调用参数与返回值。
// 默认 capabilities 四能力位全 true，可经 overrides 覆盖。
function makeProvider(
  overrides: Partial<IntegrationProvider> & { type?: IntegrationType } = {}
): IntegrationProvider {
  const type = overrides.type ?? 'feishu';
  const capabilities: IntegrationCapabilities = {
    auth: true,
    message: true,
    sync: true,
    webhook: true,
    ...overrides.capabilities,
  };
  return {
    type,
    name: overrides.name ?? `Provider-${type}`,
    description: overrides.description ?? `fake ${type}`,
    capabilities,
    icon: overrides.icon,
    initialize: overrides.initialize ?? vi.fn(async () => {}),
    testConnection: overrides.testConnection ?? vi.fn(async () => true),
    sendMessage: overrides.sendMessage,
    getAuthUrl: overrides.getAuthUrl,
    handleAuthCallback: overrides.handleAuthCallback,
    syncData: overrides.syncData,
    handleWebhook: overrides.handleWebhook,
  };
}

// 构造 IntegrationConfig。默认 enabled=true + status=active，便于 getEnabledIntegrations 命中。
function makeConfig(
  overrides: Partial<IntegrationConfig> & { id: string; tenantId: string; type: IntegrationType }
): IntegrationConfig {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: overrides.id,
    type: overrides.type,
    name: overrides.name ?? `Integration-${overrides.id}`,
    description: overrides.description,
    status: overrides.status ?? 'active',
    enabled: overrides.enabled ?? true,
    config: overrides.config ?? {},
    tenantId: overrides.tenantId,
    userId: overrides.userId,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    lastUsedAt: overrides.lastUsedAt,
    errorMessage: overrides.errorMessage,
  };
}

// ============================ provider 注册表 ============================
describe('IntegrationManager (index.ts) — provider 注册表', () => {
  it('registerProvider 后 getProvider 可按 type 取回同一实例', () => {
    const mgr = new IntegrationManager();
    const provider = makeProvider({ type: 'feishu' });
    mgr.registerProvider(provider);

    expect(mgr.getProvider('feishu')).toBe(provider);
  });

  it('registerProvider 同 type 重复注册会覆盖（后注册胜出）', () => {
    const mgr = new IntegrationManager();
    const first = makeProvider({ type: 'feishu', name: 'first' });
    const second = makeProvider({ type: 'feishu', name: 'second' });
    mgr.registerProvider(first);
    mgr.registerProvider(second);

    expect(mgr.getProvider('feishu')).toBe(second);
    expect(mgr.getProvider('feishu')?.name).toBe('second');
  });

  it('getProvider 未注册的 type 返回 undefined', () => {
    const mgr = new IntegrationManager();
    expect(mgr.getProvider('slack')).toBeUndefined();
  });

  it('getAvailableTypes 返回 {type,name,description,capabilities} 子集（不含 icon）', () => {
    const mgr = new IntegrationManager();
    mgr.registerProvider(
      makeProvider({
        type: 'feishu',
        name: '飞书',
        description: 'feishu desc',
        icon: 'feishu-icon',
        capabilities: { auth: true, message: true, sync: false, webhook: false },
      })
    );

    const types = mgr.getAvailableTypes();
    expect(types).toHaveLength(1);
    expect(types[0]).toEqual({
      type: 'feishu',
      name: '飞书',
      description: 'feishu desc',
      capabilities: { auth: true, message: true, sync: false, webhook: false },
    });
    // icon 不在投影范围内
    expect(types[0]).not.toHaveProperty('icon');
  });

  it('getAvailableTypes 保留注册顺序', () => {
    const mgr = new IntegrationManager();
    mgr.registerProvider(makeProvider({ type: 'feishu' }));
    mgr.registerProvider(makeProvider({ type: 'github' }));
    mgr.registerProvider(makeProvider({ type: 'wecom' }));

    const types = mgr.getAvailableTypes().map((t) => t.type);
    expect(types).toEqual(['feishu', 'github', 'wecom']);
  });

  it('getAvailableTypes 无 provider 时返回空数组', () => {
    const mgr = new IntegrationManager();
    expect(mgr.getAvailableTypes()).toEqual([]);
  });
});

// ============================ 集成配置存储 ============================
describe('IntegrationManager (index.ts) — 集成配置存储', () => {
  it('addIntegration 后 getIntegration 可按 id 取回同一对象', () => {
    const mgr = new IntegrationManager();
    const cfg = makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' });
    mgr.addIntegration(cfg);

    expect(mgr.getIntegration('i1')).toBe(cfg);
  });

  it('addIntegration 同 id 重复添加会覆盖', () => {
    const mgr = new IntegrationManager();
    const first = makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', name: 'first' });
    const second = makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', name: 'second' });
    mgr.addIntegration(first);
    mgr.addIntegration(second);

    expect(mgr.getIntegration('i1')?.name).toBe('second');
  });

  it('getIntegration 未知 id 返回 undefined', () => {
    const mgr = new IntegrationManager();
    expect(mgr.getIntegration('nope')).toBeUndefined();
  });

  it('getIntegrationsByTenant 仅返回匹配 tenantId 的集成（跨租户隔离）', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));
    mgr.addIntegration(makeConfig({ id: 'i2', tenantId: 't2', type: 'feishu' }));
    mgr.addIntegration(makeConfig({ id: 'i3', tenantId: 't1', type: 'github' }));

    const t1 = mgr.getIntegrationsByTenant('t1').map((i) => i.id);
    const t2 = mgr.getIntegrationsByTenant('t2').map((i) => i.id);
    expect(t1).toEqual(['i1', 'i3']);
    expect(t2).toEqual(['i2']);
  });

  it('getIntegrationsByTenant 无匹配时返回空数组', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));
    expect(mgr.getIntegrationsByTenant('other')).toEqual([]);
  });
});

// ============================ getEnabledIntegrations ============================
describe('getEnabledIntegrations', () => {
  it('enabled=true + status=active 时包含', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: true, status: 'active' })
    );
    expect(mgr.getEnabledIntegrations('t1').map((i) => i.id)).toEqual(['i1']);
  });

  it('enabled=false 时排除（即使 status=active）', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: false, status: 'active' })
    );
    expect(mgr.getEnabledIntegrations('t1')).toEqual([]);
  });

  it('status=inactive 时排除（即使 enabled=true）', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: true, status: 'inactive' })
    );
    expect(mgr.getEnabledIntegrations('t1')).toEqual([]);
  });

  it('status=error 时排除', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: true, status: 'error' })
    );
    expect(mgr.getEnabledIntegrations('t1')).toEqual([]);
  });

  it('其他租户的 enabled+active 集成排除', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: true, status: 'active' })
    );
    expect(mgr.getEnabledIntegrations('t2')).toEqual([]);
  });

  it('混合场景：仅返回 enabled+active+同租户 的子集', () => {
    const mgr = new IntegrationManager();
    mgr.addIntegration(makeConfig({ id: 'ok1', tenantId: 't1', type: 'feishu', enabled: true, status: 'active' }));
    mgr.addIntegration(makeConfig({ id: 'off', tenantId: 't1', type: 'feishu', enabled: false, status: 'active' }));
    mgr.addIntegration(makeConfig({ id: 'err', tenantId: 't1', type: 'feishu', enabled: true, status: 'error' }));
    mgr.addIntegration(makeConfig({ id: 'other', tenantId: 't2', type: 'feishu', enabled: true, status: 'active' }));
    mgr.addIntegration(makeConfig({ id: 'ok2', tenantId: 't1', type: 'github', enabled: true, status: 'active' }));

    expect(mgr.getEnabledIntegrations('t1').map((i) => i.id).sort()).toEqual(['ok1', 'ok2']);
  });
});

// ============================ testIntegration ============================
describe('testIntegration', () => {
  it('未注册的 type 抛出 "Integration provider not found: {type}"', async () => {
    const mgr = new IntegrationManager();
    await expect(mgr.testIntegration('slack', {})).rejects.toThrow(
      'Integration provider not found: slack'
    );
  });

  it('initialize 与 testConnection 均成功时返回 true', async () => {
    const mgr = new IntegrationManager();
    const initialize = vi.fn(async () => {});
    const testConnection = vi.fn(async () => true);
    mgr.registerProvider(makeProvider({ type: 'feishu', initialize, testConnection }));

    const result = await mgr.testIntegration('feishu', { appId: 'a' });

    expect(result).toBe(true);
    expect(initialize).toHaveBeenCalledWith({ appId: 'a' });
    expect(testConnection).toHaveBeenCalledWith();
  });

  it('initialize 抛错时吞错返回 false（不向上抛出）', async () => {
    const mgr = new IntegrationManager();
    const initialize = vi.fn(async () => {
      throw new Error('init boom');
    });
    const testConnection = vi.fn(async () => true);
    mgr.registerProvider(makeProvider({ type: 'feishu', initialize, testConnection }));

    const result = await mgr.testIntegration('feishu', {});
    expect(result).toBe(false);
    // initialize 失败后不应继续调用 testConnection
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('testConnection 抛错时返回 false', async () => {
    const mgr = new IntegrationManager();
    const testConnection = vi.fn(async () => {
      throw new Error('connect boom');
    });
    mgr.registerProvider(makeProvider({ type: 'feishu', testConnection }));

    const result = await mgr.testIntegration('feishu', {});
    expect(result).toBe(false);
  });

  it('testConnection 返回 false 时返回 false', async () => {
    const mgr = new IntegrationManager();
    const testConnection = vi.fn(async () => false);
    mgr.registerProvider(makeProvider({ type: 'feishu', testConnection }));

    const result = await mgr.testIntegration('feishu', {});
    expect(result).toBe(false);
  });
});

// ============================ sendMessageToAll ============================
describe('sendMessageToAll', () => {
  it('向启用且 message 能力为真的集成发送，success +1', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {});
    const initialize = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', initialize, sendMessage }));
    mgr.addIntegration(
      makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: true, status: 'active', config: { token: 'x' } })
    );

    const result = await mgr.sendMessageToAll('t1', { to: 'user-1', text: 'hi' });

    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
    expect(initialize).toHaveBeenCalledWith({ token: 'x' });
    expect(sendMessage).toHaveBeenCalledWith('user-1', { to: 'user-1', text: 'hi' });
  });

  it('多个 message 能力为真的启用集成均收到消息', async () => {
    const mgr = new IntegrationManager();
    const sendFeishu = vi.fn(async () => {});
    const sendWecom = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage: sendFeishu }));
    mgr.registerProvider(makeProvider({ type: 'wecom', sendMessage: sendWecom }));
    mgr.addIntegration(makeConfig({ id: 'f1', tenantId: 't1', type: 'feishu' }));
    mgr.addIntegration(makeConfig({ id: 'w1', tenantId: 't1', type: 'wecom' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(2);
    expect(sendFeishu).toHaveBeenCalledTimes(1);
    expect(sendWecom).toHaveBeenCalledTimes(1);
  });

  it('跳过 message 能力为 false 的启用集成', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {});
    // github 在 providers.test 中即 message:false；此处显式构造
    mgr.registerProvider(
      makeProvider({ type: 'github', capabilities: { auth: true, message: false, sync: true, webhook: true } })
    );
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'g1', tenantId: 't1', type: 'github' }));
    mgr.addIntegration(makeConfig({ id: 'f1', tenantId: 't1', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('跳过未启用的集成（enabled=false）', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', enabled: false }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result).toEqual({ success: 0, failed: 0, errors: [] });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('跳过 status 非 active 的集成', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu', status: 'inactive' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('跳过其他租户的集成', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't2', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sendMessage 抛错时 failed +1 且 errors 记录 type 与 error.message', async () => {
    const mgr = new IntegrationManager();
    const sendMessage = vi.fn(async () => {
      throw new Error('send failed');
    });
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ type: 'feishu', error: 'send failed' }]);
  });

  it('initialize 抛错时 failed +1 且 errors 记录', async () => {
    const mgr = new IntegrationManager();
    const initialize = vi.fn(async () => {
      throw new Error('init failed');
    });
    const sendMessage = vi.fn(async () => {});
    mgr.registerProvider(makeProvider({ type: 'feishu', initialize, sendMessage }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ type: 'feishu', error: 'init failed' }]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('provider 无 sendMessage 方法时跳过（即使 message 能力为 true）', async () => {
    const mgr = new IntegrationManager();
    // message 能力为 true 但未提供 sendMessage 方法
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage: undefined }));
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result).toEqual({ success: 0, failed: 0, errors: [] });
  });

  it('集成的 type 无对应已注册 provider 时静默跳过', async () => {
    const mgr = new IntegrationManager();
    // 未注册任何 provider，但有一条 integration 配置
    mgr.addIntegration(makeConfig({ id: 'i1', tenantId: 't1', type: 'feishu' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result).toEqual({ success: 0, failed: 0, errors: [] });
  });

  it('混合成功/失败场景聚合正确', async () => {
    const mgr = new IntegrationManager();
    const sendOk = vi.fn(async () => {});
    const sendFail = vi.fn(async () => {
      throw new Error('boom');
    });
    mgr.registerProvider(makeProvider({ type: 'feishu', sendMessage: sendOk }));
    mgr.registerProvider(makeProvider({ type: 'wecom', sendMessage: sendFail }));
    mgr.addIntegration(makeConfig({ id: 'f1', tenantId: 't1', type: 'feishu' }));
    mgr.addIntegration(makeConfig({ id: 'w1', tenantId: 't1', type: 'wecom' }));

    const result = await mgr.sendMessageToAll('t1', { to: 'r' });
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ type: 'wecom', error: 'boom' }]);
  });
});

// ============================ 单例 ============================
describe('integrationManager 单例', () => {
  it('是 IntegrationManager 实例', () => {
    expect(integrationManager).toBeInstanceOf(IntegrationManager);
  });
});
