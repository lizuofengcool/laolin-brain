import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// plugins/registry.ts：PluginRegistry 类未导出，仅导出单例 pluginRegistry。
// 用 vi.resetModules() + 动态 import 取全新模块（全新单例 + 全新 builtinHooks Map）隔离。
// createPluginAPI 内部依赖 localStorage（jsdom 提供）与 global.fetch（用 vi.stubGlobal mock）。
// apiFactory 签名 (api: PluginAPI) => any，通过闭包捕获 pluginApi 后断言其行为。
// typeof import(...) 为类型级构造，运行期擦除，与 resetModules 兼容。
import type { PluginManifest, PluginPermission } from '@/lib/plugins/types';
type RegistryModule = typeof import('@/lib/plugins/registry');

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'tester',
    type: 'feature',
    permissions: [],
    ...overrides,
  };
}

describe('plugins/registry PluginRegistry', () => {
  let mod: RegistryModule;
  let pluginRegistry: RegistryModule['pluginRegistry'];

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    mod = await import('@/lib/plugins/registry');
    pluginRegistry = mod.pluginRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // 辅助：注册插件并捕获其 PluginAPI
  function registerWithApi(
    manifest: PluginManifest,
    factoryImpl: (api: any) => any = () => ({}),
  ): any {
    let captured: any = null;
    const ok = pluginRegistry.registerPlugin(manifest, (api) => {
      captured = api;
      return factoryImpl(api);
    });
    return { ok, api: captured };
  }

  // ==================== registerPlugin ====================

  describe('registerPlugin', () => {
    it('注册成功返回 true，状态置 installed，调用 apiFactory', () => {
      const factory = vi.fn(() => ({}));
      const ok = pluginRegistry.registerPlugin(makeManifest(), factory);

      expect(ok).toBe(true);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('installed');
    });

    it('重复注册同一 id 返回 false 并 warn，不覆盖原实例', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      pluginRegistry.registerPlugin(makeManifest(), () => ({}));

      const ok = pluginRegistry.registerPlugin(
        makeManifest({ name: 'Different Name' }),
        () => ({}),
      );

      expect(ok).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith('Plugin test-plugin already registered');
      // 原实例未被覆盖
      expect(pluginRegistry.getPluginInfo('test-plugin')?.manifest.name).toBe('Test Plugin');
    });

    it('apiFactory 抛错时状态置 error 并返回 false', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ok = pluginRegistry.registerPlugin(makeManifest(), () => {
        throw new Error('boom');
      });

      expect(ok).toBe(false);
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('error');
      expect(errSpy).toHaveBeenCalledWith(
        'Plugin test-plugin initialization failed:',
        expect.any(Error),
      );
    });

    it('从 manifest.settings 初始化默认设置（含 undefined default）', () => {
      const manifest = makeManifest({
        permissions: ['settings:read'],
        settings: [
          { key: 'theme', label: '主题', type: 'string', default: 'dark' },
          { key: 'limit', label: '上限', type: 'number', default: 10 },
          { key: 'noDefault', label: '无默认', type: 'string' },
        ],
      });
      const { api } = registerWithApi(manifest);

      expect(api.getSettings()).toEqual({
        theme: 'dark',
        limit: 10,
        noDefault: undefined,
      });
    });

    it('无 settings 字段时默认设置为空对象', () => {
      const { api } = registerWithApi(makeManifest({ permissions: ['settings:read'] }));
      expect(api.getSettings()).toEqual({});
    });
  });

  // ==================== validateManifest ====================

  describe('validateManifest（经 registerPlugin）', () => {
    // id 字段单独由「id 为空字符串」用例覆盖（删除 id 会使 manifest.id 为 undefined，
    // 进而使错误日志变为 'Plugin undefined ...'，此处 forEach 保留其余 5 个 string 字段）
    const requiredFields: Array<[keyof PluginManifest, string]> = [
      ['name', 'bad-name'],
      ['version', 'bad-version'],
      ['description', 'bad-desc'],
      ['author', 'bad-author'],
      ['type', 'bad-type'],
    ];

    requiredFields.forEach(([field, badId]) => {
      it(`${field} 缺失或非 string → 校验失败返回 false`, () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const manifest = makeManifest({ id: badId });
        delete (manifest as any)[field];
        const ok = pluginRegistry.registerPlugin(manifest, () => ({}));

        expect(ok).toBe(false);
        expect(errSpy).toHaveBeenCalledWith(`Plugin ${badId} manifest validation failed`);
        expect(pluginRegistry.isInstalled(badId)).toBe(false);
      });
    });

    it('permissions 非数组 → 校验失败', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ok = pluginRegistry.registerPlugin(
        makeManifest({ permissions: 'not-an-array' as any }),
        () => ({}),
      );

      expect(ok).toBe(false);
      expect(errSpy).toHaveBeenCalledWith(
        'Plugin test-plugin manifest validation failed',
      );
    });

    it('id 为空字符串 → 校验失败（!manifest.id）', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(pluginRegistry.registerPlugin(makeManifest({ id: '' }), () => ({}))).toBe(false);
    });

    it('manifest 完整且 permissions=[] → 校验通过', () => {
      expect(pluginRegistry.registerPlugin(makeManifest(), () => ({}))).toBe(true);
    });
  });

  // ==================== createPluginAPI 权限网关 ====================

  describe('createPluginAPI 权限网关', () => {
    function registerWithoutPerm() {
      // permissions=[] 无任何权限
      return registerWithApi(makeManifest({ permissions: [] }));
    }

    it('getSettings 无 settings:read → 抛错', () => {
      const { api } = registerWithoutPerm();
      expect(() => api.getSettings()).toThrow(
        'Plugin test-plugin does not have permission: settings:read',
      );
    });

    it('setSettings 无 settings:write → 抛错', () => {
      const { api } = registerWithoutPerm();
      expect(() => api.setSettings({ a: 1 })).toThrow(
        'Plugin test-plugin does not have permission: settings:write',
      );
    });

    it('getFiles 无 files:read → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.getFiles()).rejects.toThrow(
        'Plugin test-plugin does not have permission: files:read',
      );
    });

    it('getFile 无 files:read → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.getFile('f1')).rejects.toThrow(
        'Plugin test-plugin does not have permission: files:read',
      );
    });

    it('createFile 无 files:write → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.createFile({})).rejects.toThrow(
        'Plugin test-plugin does not have permission: files:write',
      );
    });

    it('updateFile 无 files:write → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.updateFile('f1', {})).rejects.toThrow(
        'Plugin test-plugin does not have permission: files:write',
      );
    });

    it('deleteFile 无 files:delete → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.deleteFile('f1')).rejects.toThrow(
        'Plugin test-plugin does not have permission: files:delete',
      );
    });

    it('search 无 search:read → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.search('q')).rejects.toThrow(
        'Plugin test-plugin does not have permission: search:read',
      );
    });

    it('registerMenuItem 无 ui:inject → 抛错', () => {
      const { api } = registerWithoutPerm();
      expect(() => api.registerMenuItem({ id: 'm' })).toThrow(
        'Plugin test-plugin does not have permission: ui:inject',
      );
    });

    it('registerSidebarPanel 无 ui:inject → 抛错', () => {
      const { api } = registerWithoutPerm();
      expect(() => api.registerSidebarPanel({ id: 's' })).toThrow(
        'Plugin test-plugin does not have permission: ui:inject',
      );
    });

    it('registerFileAction 无 ui:inject → 抛错', () => {
      const { api } = registerWithoutPerm();
      expect(() => api.registerFileAction({ id: 'a' })).toThrow(
        'Plugin test-plugin does not have permission: ui:inject',
      );
    });

    it('getStorage 无 storage:local → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.getStorage('k')).rejects.toThrow(
        'Plugin test-plugin does not have permission: storage:local',
      );
    });

    it('setStorage 无 storage:local → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.setStorage('k', 1)).rejects.toThrow(
        'Plugin test-plugin does not have permission: storage:local',
      );
    });

    it('removeStorage 无 storage:local → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.removeStorage('k')).rejects.toThrow(
        'Plugin test-plugin does not have permission: storage:local',
      );
    });

    it('fetch 无 network:request → 抛错', async () => {
      const { api } = registerWithoutPerm();
      await expect(api.fetch('https://x')).rejects.toThrow(
        'Plugin test-plugin does not have permission: network:request',
      );
    });

    it('具备对应权限时不抛错（getSettings）', () => {
      const { api } = registerWithApi(makeManifest({ permissions: ['settings:read'] }));
      expect(() => api.getSettings()).not.toThrow();
    });
  });

  // ==================== createPluginAPI settings ====================

  describe('createPluginAPI settings', () => {
    it('getSettings 返回副本，mutate 不影响内部', () => {
      const { api } = registerWithApi(
        makeManifest({
          permissions: ['settings:read', 'settings:write'],
          settings: [{ key: 'k', label: 'k', type: 'string', default: 'v' }],
        }),
      );
      const s = api.getSettings();
      s.k = 'mutated';
      expect(api.getSettings().k).toBe('v');
    });

    it('setSettings 合并到既有设置（浅合并）', () => {
      const { api } = registerWithApi(
        makeManifest({
          permissions: ['settings:read', 'settings:write'],
          settings: [
            { key: 'a', label: 'a', type: 'string', default: '1' },
            { key: 'b', label: 'b', type: 'string', default: '2' },
          ],
        }),
      );
      api.setSettings({ b: 'updated' });
      expect(api.getSettings()).toEqual({ a: '1', b: 'updated' });
    });

    it('setSettings 触发 settings:changed 事件，含 pluginId 与 settings', () => {
      const { api } = registerWithApi(
        makeManifest({ permissions: ['settings:write'] }),
      );
      const listener = vi.fn();
      pluginRegistry.on('settings:changed', listener);

      api.setSettings({ x: 9 });

      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin', settings: { x: 9 } });
    });

    it('onSettingsChange 仅对当前 pluginId 的 settings:changed 触发', () => {
      const { api: apiA } = registerWithApi(
        makeManifest({ id: 'pa', permissions: ['settings:read', 'settings:write'] }),
      );
      const { api: apiB } = registerWithApi(
        makeManifest({ id: 'pb', permissions: ['settings:read', 'settings:write'] }),
      );
      const cbA = vi.fn();
      apiA.onSettingsChange(cbA);

      apiB.setSettings({ k: 'b' });
      expect(cbA).not.toHaveBeenCalled();

      apiA.setSettings({ k: 'a' });
      expect(cbA).toHaveBeenCalledWith({ k: 'a' });
    });
  });

  // ==================== createPluginAPI 文件/搜索桩 ====================

  describe('createPluginAPI 文件/搜索桩返回值', () => {
    function registerWithFilePerms() {
      return registerWithApi(
        makeManifest({
          permissions: ['files:read', 'files:write', 'files:delete', 'search:read'],
        }),
      );
    }

    it('getFiles 返回 []', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.getFiles()).toEqual([]);
    });

    it('getFile 返回 null', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.getFile('f1')).toBeNull();
    });

    it('createFile 返回 null', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.createFile({ name: 'n' })).toBeNull();
    });

    it('updateFile 返回 null', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.updateFile('f1', { name: 'n' })).toBeNull();
    });

    it('deleteFile 返回 undefined', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.deleteFile('f1')).toBeUndefined();
    });

    it('search 返回 []', async () => {
      const { api } = registerWithFilePerms();
      expect(await api.search('query')).toEqual([]);
    });
  });

  // ==================== createPluginAPI UI 注入桩 ====================

  describe('createPluginAPI UI 注入桩', () => {
    it('registerMenuItem 具权限时为 no-op（undefined 返回，不抛错）', () => {
      const { api } = registerWithApi(makeManifest({ permissions: ['ui:inject'] }));
      expect(() => api.registerMenuItem({ id: 'm', label: 'M' })).not.toThrow();
      expect(api.registerMenuItem({ id: 'm', label: 'M' })).toBeUndefined();
    });

    it('registerSidebarPanel 具权限时为 no-op', () => {
      const { api } = registerWithApi(makeManifest({ permissions: ['ui:inject'] }));
      expect(api.registerSidebarPanel({ id: 's', title: 'S', component: null })).toBeUndefined();
    });

    it('registerFileAction 具权限时为 no-op', () => {
      const { api } = registerWithApi(makeManifest({ permissions: ['ui:inject'] }));
      expect(
        api.registerFileAction({ id: 'a', label: 'A', onClick: () => ({}) }),
      ).toBeUndefined();
    });
  });

  // ==================== createPluginAPI storage（localStorage） ====================

  describe('createPluginAPI storage', () => {
    function registerWithStorage() {
      return registerWithApi(makeManifest({ permissions: ['storage:local'] }));
    }

    it('setStorage/getStorage 往返 JSON，key 格式 plugin:id:key', async () => {
      const { api } = registerWithStorage();
      await api.setStorage('k1', { a: 1 });
      expect(localStorage.getItem('plugin:test-plugin:k1')).toBe(JSON.stringify({ a: 1 }));
      expect(await api.getStorage('k1')).toEqual({ a: 1 });
    });

    it('getStorage 未知 key 返回 null', async () => {
      const { api } = registerWithStorage();
      expect(await api.getStorage('missing')).toBeNull();
    });

    it('getStorage 遇非法 JSON 返回 null（catch）', async () => {
      localStorage.setItem('plugin:test-plugin:bad', '{not-json');
      const { api } = registerWithStorage();
      expect(await api.getStorage('bad')).toBeNull();
    });

    it('removeStorage 删除指定 key', async () => {
      const { api } = registerWithStorage();
      await api.setStorage('k2', 'v');
      expect(localStorage.getItem('plugin:test-plugin:k2')).not.toBeNull();
      await api.removeStorage('k2');
      expect(localStorage.getItem('plugin:test-plugin:k2')).toBeNull();
    });

    it('getStorage 原始字符串值经 JSON.parse 还原', async () => {
      const { api } = registerWithStorage();
      await api.setStorage('num', 42);
      expect(await api.getStorage('num')).toBe(42);
      await api.setStorage('str', 'hello');
      expect(await api.getStorage('str')).toBe('hello');
    });
  });

  // ==================== createPluginAPI 网络 ====================

  describe('createPluginAPI fetch', () => {
    it('具备 network:request 时调用 global.fetch 并透传 url/options', async () => {
      const fakeFetch = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fakeFetch);
      const { api } = registerWithApi(makeManifest({ permissions: ['network:request'] }));

      const res = await api.fetch('https://example.com', { method: 'POST' });

      expect(fakeFetch).toHaveBeenCalledWith('https://example.com', { method: 'POST' });
      expect(res).toBeInstanceOf(Response);
    });
  });

  // ==================== createPluginAPI 事件 ====================

  describe('createPluginAPI 事件', () => {
    it('plugin api.on 注册的监听被 plugin api.emit 触发', () => {
      const { api } = registerWithApi(makeManifest());
      const listener = vi.fn();
      api.on('custom', listener);

      api.emit('custom', { x: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('plugin api.emit 在 data 上附加 pluginId', () => {
      const { api } = registerWithApi(makeManifest());
      const listener = vi.fn();
      // 通过 registry.on 监听同一事件验证附加的 pluginId
      pluginRegistry.on('ev1', listener);

      api.emit('ev1', { x: 2 });

      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin', x: 2 });
    });

    it('plugin api.emit 无 data 时仅附加 pluginId', () => {
      const { api } = registerWithApi(makeManifest());
      const listener = vi.fn();
      pluginRegistry.on('ev2', listener);

      api.emit('ev2');

      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin' });
    });

    it('plugin api.off 移除监听后不再触发', () => {
      const { api } = registerWithApi(makeManifest());
      const listener = vi.fn();
      api.on('ev3', listener);
      api.off('ev3', listener);

      api.emit('ev3');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ==================== createPluginAPI log / showNotification / getPluginInfo ====================

  describe('createPluginAPI log / showNotification / getPluginInfo', () => {
    it('log 调用对应 console 方法，前缀 [timestamp] [Plugin id] message', () => {
      // level='info' 走 console.info（jsdom 中 console.info !== console.log）
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { api } = registerWithApi(makeManifest());

      api.log('info', 'hello', { k: 1 });

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const [prefix, data] = infoSpy.mock.calls[0];
      expect(prefix).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*Z\] \[Plugin test-plugin\] hello$/);
      expect(data).toEqual({ k: 1 });
    });

    it('log 无 data 时追加空字符串', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { api } = registerWithApi(makeManifest());

      api.log('info', 'no-data');

      const [, data] = infoSpy.mock.calls[0];
      expect(data).toBe('');
    });

    it('log level=warn/error 路由到 console.warn/error', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { api } = registerWithApi(makeManifest());

      api.log('warn', 'w');
      api.log('error', 'e');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledTimes(1);
    });

    it('showNotification 输出 [Plugin id] Notification: 与通知对象', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { api } = registerWithApi(makeManifest());
      const notif = { title: 'T', message: 'M' };

      api.showNotification(notif);

      expect(logSpy).toHaveBeenCalledWith('[Plugin test-plugin] Notification:', notif);
    });

    it('getPluginInfo 返回 manifest 引用', () => {
      const manifest = makeManifest();
      const { api } = registerWithApi(manifest);

      expect(api.getPluginInfo()).toBe(manifest);
    });
  });

  // ==================== enablePlugin / disablePlugin ====================

  describe('enablePlugin / disablePlugin', () => {
    it('enablePlugin 未知 id 返回 false 并 error', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(pluginRegistry.enablePlugin('nope')).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('Plugin nope not found');
    });

    it('enablePlugin 置 enabled=true / status=enabled / 触发 plugin:enabled / 返回 true', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const listener = vi.fn();
      pluginRegistry.on('plugin:enabled', listener);
      registerWithApi(makeManifest());

      const ok = pluginRegistry.enablePlugin('test-plugin');

      expect(ok).toBe(true);
      expect(pluginRegistry.isEnabled('test-plugin')).toBe(true);
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('enabled');
      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin' });
      expect(logSpy).toHaveBeenCalledWith('Plugin test-plugin enabled');
    });

    it('enablePlugin 已启用时返回 true 但不重复触发事件', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      // 清除首次 enable 的日志记录，仅观测第二次 enable
      logSpy.mockClear();

      const listener = vi.fn();
      pluginRegistry.on('plugin:enabled', listener);
      const ok = pluginRegistry.enablePlugin('test-plugin');

      expect(ok).toBe(true);
      expect(listener).not.toHaveBeenCalled();
      // 第二次 enable 不打印 "enabled" 日志
      expect(logSpy).not.toHaveBeenCalledWith('Plugin test-plugin enabled');
    });

    it('disablePlugin 未知 id 返回 false 并 error', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(pluginRegistry.disablePlugin('nope')).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('Plugin nope not found');
    });

    it('disablePlugin 置 enabled=false / status=disabled / 触发 plugin:disabled', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');

      const listener = vi.fn();
      pluginRegistry.on('plugin:disabled', listener);
      const ok = pluginRegistry.disablePlugin('test-plugin');

      expect(ok).toBe(true);
      expect(pluginRegistry.isEnabled('test-plugin')).toBe(false);
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('disabled');
      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin' });
    });

    it('disablePlugin 已禁用时返回 true 但不重复触发事件', () => {
      registerWithApi(makeManifest());
      // 未 enable，状态为 installed（enabled=false）

      const listener = vi.fn();
      pluginRegistry.on('plugin:disabled', listener);
      const ok = pluginRegistry.disablePlugin('test-plugin');

      expect(ok).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ==================== uninstallPlugin ====================

  describe('uninstallPlugin', () => {
    it('未知 id 返回 false 并 error', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(pluginRegistry.uninstallPlugin('nope')).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('Plugin nope not found');
    });

    it('卸载先 disable，清理 localStorage，移除三张 Map，触发 plugin:uninstalled', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const { api } = registerWithApi(
        makeManifest({ permissions: ['storage:local'] }),
      );
      await api.setStorage('k', 'v');
      await api.setStorage('k2', 'v2');
      // 制造一个无关 key，验证不被误删
      localStorage.setItem('plugin:other:x', 'keep');
      pluginRegistry.enablePlugin('test-plugin');

      const listener = vi.fn();
      pluginRegistry.on('plugin:uninstalled', listener);

      const ok = pluginRegistry.uninstallPlugin('test-plugin');

      expect(ok).toBe(true);
      expect(pluginRegistry.isInstalled('test-plugin')).toBe(false);
      expect(pluginRegistry.getPluginInfo('test-plugin')).toBeNull();
      expect(localStorage.getItem('plugin:test-plugin:k')).toBeNull();
      expect(localStorage.getItem('plugin:test-plugin:k2')).toBeNull();
      // 无关 key 保留
      expect(localStorage.getItem('plugin:other:x')).toBe('keep');
      expect(listener).toHaveBeenCalledWith({ pluginId: 'test-plugin' });
    });

    it('卸载已禁用插件时 disablePlugin 先执行但不重复触发 plugin:disabled', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      registerWithApi(makeManifest());
      // 未 enable，disablePlugin 会因已禁用直接 return true 不触发事件

      const disabledListener = vi.fn();
      pluginRegistry.on('plugin:disabled', disabledListener);
      pluginRegistry.uninstallPlugin('test-plugin');

      // 已禁用，disablePlugin 不触发 plugin:disabled
      expect(disabledListener).not.toHaveBeenCalled();
    });
  });

  // ==================== registerHook ====================

  describe('registerHook', () => {
    it('插件未启用时 warn 且不注册', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      registerWithApi(makeManifest());
      const cb = vi.fn();

      pluginRegistry.registerHook('test-plugin', 'file:uploaded', cb);

      expect(warnSpy).toHaveBeenCalledWith(
        'Cannot register hook: plugin test-plugin not enabled',
      );
    });

    it('插件已启用时注册回调到 globalHooks', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const cb = vi.fn(() => 'hooked');

      pluginRegistry.registerHook('test-plugin', 'file:uploaded', cb);

      const results = await pluginRegistry.triggerHook('file:uploaded', { f: 1 });
      expect(cb).toHaveBeenCalledWith({ f: 1 });
      expect(results).toEqual([{ pluginId: 'test-plugin', result: 'hooked' }]);
    });

    it('未知 hookName 时自动创建 Map', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const cb = vi.fn(() => 'r');

      pluginRegistry.registerHook('test-plugin', 'custom:hook', cb);

      const results = await pluginRegistry.triggerHook('custom:hook');
      expect(cb).toHaveBeenCalled();
      expect(results).toEqual([{ pluginId: 'test-plugin', result: 'r' }]);
    });

    it('同一插件同一 hook 多次注册追加到数组', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const cb1 = vi.fn(() => 1);
      const cb2 = vi.fn(() => 2);

      pluginRegistry.registerHook('test-plugin', 'file:uploaded', cb1);
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', cb2);

      const results = await pluginRegistry.triggerHook('file:uploaded');
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(results).toEqual([
        { pluginId: 'test-plugin', result: 1 },
        { pluginId: 'test-plugin', result: 2 },
      ]);
    });
  });

  // ==================== triggerHook ====================

  describe('triggerHook', () => {
    it('未知 hook 返回 []', async () => {
      expect(await pluginRegistry.triggerHook('nonexistent:hook')).toEqual([]);
    });

    it('已注册但插件被禁用 → 跳过，返回 []', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const cb = vi.fn();
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', cb);
      pluginRegistry.disablePlugin('test-plugin');

      const results = await pluginRegistry.triggerHook('file:uploaded');
      expect(cb).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('回调返回 undefined → 不入 results', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', () => undefined);

      const results = await pluginRegistry.triggerHook('file:uploaded');
      expect(results).toEqual([]);
    });

    it('回调返回 null → 入 results（null !== undefined）', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', () => null);

      const results = await pluginRegistry.triggerHook('file:uploaded');
      expect(results).toEqual([{ pluginId: 'test-plugin', result: null }]);
    });

    it('回调抛错被捕获，error 日志，继续执行后续回调', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const boom = () => {
        throw new Error('hook-boom');
      };
      const ok = vi.fn(() => 'after');

      pluginRegistry.registerHook('test-plugin', 'file:uploaded', boom);
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', ok);

      const results = await pluginRegistry.triggerHook('file:uploaded', { d: 1 });

      expect(errSpy).toHaveBeenCalledWith(
        'Hook file:uploaded failed in plugin test-plugin:',
        expect.any(Error),
      );
      expect(ok).toHaveBeenCalledWith({ d: 1 });
      expect(results).toEqual([{ pluginId: 'test-plugin', result: 'after' }]);
    });

    it('多插件同 hook 全部收集', async () => {
      registerWithApi(makeManifest({ id: 'pa' }));
      registerWithApi(makeManifest({ id: 'pb' }));
      pluginRegistry.enablePlugin('pa');
      pluginRegistry.enablePlugin('pb');
      pluginRegistry.registerHook('pa', 'file:uploaded', () => 'A');
      pluginRegistry.registerHook('pb', 'file:uploaded', () => 'B');

      const results = await pluginRegistry.triggerHook('file:uploaded');

      expect(results).toContainEqual({ pluginId: 'pa', result: 'A' });
      expect(results).toContainEqual({ pluginId: 'pb', result: 'B' });
      expect(results).toHaveLength(2);
    });

    it('async 回调被 await', async () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      pluginRegistry.registerHook('test-plugin', 'file:uploaded', async () => {
        return 'async-result';
      });

      const results = await pluginRegistry.triggerHook('file:uploaded');
      expect(results).toEqual([{ pluginId: 'test-plugin', result: 'async-result' }]);
    });
  });

  // ==================== 事件系统 on/off/emit ====================

  describe('事件系统 on/off/emit', () => {
    it('on + emit：监听器收到 data', () => {
      const listener = vi.fn();
      pluginRegistry.on('e1', listener);

      pluginRegistry.emit('e1', { v: 1 });

      expect(listener).toHaveBeenCalledWith({ v: 1 });
    });

    it('off 移除指定监听，其它监听保留', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      pluginRegistry.on('e2', l1);
      pluginRegistry.on('e2', l2);
      pluginRegistry.off('e2', l1);

      pluginRegistry.emit('e2');

      expect(l1).not.toHaveBeenCalled();
      expect(l2).toHaveBeenCalledOnce();
    });

    it('emit 无监听器时不抛错', () => {
      expect(() => pluginRegistry.emit('no-listeners')).not.toThrow();
    });

    it('off 未注册事件不抛错', () => {
      expect(() => pluginRegistry.off('unregistered', () => ({}))).not.toThrow();
    });

    it('监听器抛错被捕获，error 日志，其它监听继续', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const boom = () => {
        throw new Error('listener-boom');
      };
      const after = vi.fn();

      pluginRegistry.on('e3', boom);
      pluginRegistry.on('e3', after);

      pluginRegistry.emit('e3', { x: 1 });

      expect(errSpy).toHaveBeenCalledWith('Event e3 listener error:', expect.any(Error));
      expect(after).toHaveBeenCalledWith({ x: 1 });
    });

    it('同一事件多次 on 均被触发', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      pluginRegistry.on('e4', l1);
      pluginRegistry.on('e4', l2);

      pluginRegistry.emit('e4');

      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });

  // ==================== 查询方法 ====================

  describe('查询方法', () => {
    it('getAllPlugins 返回数组，含 manifest/status/installedAt=""/settings', () => {
      const manifest = makeManifest({
        permissions: ['settings:read'],
        settings: [{ key: 'k', label: 'k', type: 'string', default: 'v' }],
      });
      registerWithApi(manifest);

      const all = pluginRegistry.getAllPlugins();

      expect(all).toHaveLength(1);
      expect(all[0]).toEqual({
        manifest,
        status: 'installed',
        installedAt: '',
        settings: { k: 'v' },
      });
    });

    it('getAllPlugins 多插件全返回', () => {
      registerWithApi(makeManifest({ id: 'a' }));
      registerWithApi(makeManifest({ id: 'b' }));

      expect(pluginRegistry.getAllPlugins()).toHaveLength(2);
    });

    it('getEnabledPlugins 仅返回 status==="enabled"', () => {
      registerWithApi(makeManifest({ id: 'a' }));
      registerWithApi(makeManifest({ id: 'b' }));
      pluginRegistry.enablePlugin('a');
      // b 保持 installed

      const enabled = pluginRegistry.getEnabledPlugins();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].manifest.id).toBe('a');
      expect(enabled[0].status).toBe('enabled');
    });

    it('getPluginInfo 未知 id 返回 null', () => {
      expect(pluginRegistry.getPluginInfo('nope')).toBeNull();
    });

    it('getPluginInfo 已知 id 返回 PluginInfo，installedAt=""', () => {
      registerWithApi(makeManifest());
      const info = pluginRegistry.getPluginInfo('test-plugin');
      expect(info).not.toBeNull();
      expect(info?.installedAt).toBe('');
      expect(info?.status).toBe('installed');
    });

    it('getPluginInfo 反映 enable 后的状态变更', () => {
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('enabled');
      pluginRegistry.disablePlugin('test-plugin');
      expect(pluginRegistry.getPluginInfo('test-plugin')?.status).toBe('disabled');
    });

    it('isInstalled true/false', () => {
      expect(pluginRegistry.isInstalled('x')).toBe(false);
      registerWithApi(makeManifest());
      expect(pluginRegistry.isInstalled('test-plugin')).toBe(true);
    });

    it('isEnabled 未知 id 返回 false', () => {
      expect(pluginRegistry.isEnabled('nope')).toBe(false);
    });

    it('isEnabled 反映 enable/disable', () => {
      registerWithApi(makeManifest());
      expect(pluginRegistry.isEnabled('test-plugin')).toBe(false);
      pluginRegistry.enablePlugin('test-plugin');
      expect(pluginRegistry.isEnabled('test-plugin')).toBe(true);
      pluginRegistry.disablePlugin('test-plugin');
      expect(pluginRegistry.isEnabled('test-plugin')).toBe(false);
    });
  });

  // ==================== 内置钩子预注册（构造函数） ====================

  describe('内置钩子预注册', () => {
    it('构造函数预注册 10 个内置 hook（triggerHook 不返 undefined hookMap）', async () => {
      // builtin hooks 已在 Map 中（空 Map），triggerHook 返回 []（无回调），
      // 与未知 hook 返回 [] 不可区分；此处通过 registerHook 后 triggerHook
      // 验证 builtin hook 名可正常使用，间接确认预注册不影响功能。
      registerWithApi(makeManifest());
      pluginRegistry.enablePlugin('test-plugin');
      const cb = vi.fn(() => 'r');
      const builtinNames = [
        'file:uploaded',
        'file:deleted',
        'file:updated',
        'folder:created',
        'folder:deleted',
        'user:login',
        'user:logout',
        'search:query',
        'ui:render',
        'settings:changed',
      ];

      for (const name of builtinNames) {
        pluginRegistry.registerHook('test-plugin', name, cb);
      }

      const results = await pluginRegistry.triggerHook('file:uploaded');
      // 10 个 hook 各注册 1 回调，但 triggerHook 只触发 file:uploaded 这一个
      expect(results).toEqual([{ pluginId: 'test-plugin', result: 'r' }]);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== 单例导出 ====================

  describe('单例导出', () => {
    it('默认导出与命名导出指向同一实例', async () => {
      // 当前已 import 的 mod
      expect(mod.default).toBe(mod.pluginRegistry);
    });

    it('resetModules 后获得全新单例（状态隔离）', async () => {
      registerWithApi(makeManifest({ id: 'persist' }));
      expect(pluginRegistry.isInstalled('persist')).toBe(true);

      vi.resetModules();
      const fresh = await import('@/lib/plugins/registry');

      expect(fresh.pluginRegistry.isInstalled('persist')).toBe(false);
    });
  });
});
