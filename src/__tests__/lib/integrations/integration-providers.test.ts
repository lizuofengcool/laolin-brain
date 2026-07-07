import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// integrations/feishu.ts & github.ts & wecom.ts：三个内置 IntegrationProvider 实现（实现 ./index 的接口，
// 非 ./integration-manager 的 meta 版）。均为同步/纯内存逻辑：
//   · initialize(config) 写入私有 config + 置 initialized=true
//   · testConnection() 未初始化抛错；缺关键字段返回 false；齐备返回 true
//   · getAuthUrl(redirectUri, state) 纯字符串拼装（redirect_uri 经 encodeURIComponent）
//   · handleAuthCallback(code, state) 返回固定结构（含回显 code/state + 桩 userId/name）
//   · sendMessage(to, msg)（feishu/wecom）未初始化抛错；已初始化仅 console.log
//   · syncData() 返回 {users|repositories, departments?, syncedAt: Date}
//   · handleWebhook(payload, signature) 返回 {event, ...handled:true}
// 无任何网络/OAuth 调用，可全量边界单测。GitHub capabilities.message=false 且无 sendMessage 方法。
import { FeishuIntegration } from '@/lib/integrations/feishu';
import { GitHubIntegration } from '@/lib/integrations/github';
import { WeComIntegration } from '@/lib/integrations/wecom';

// 抑制 sendMessage 内的 console.log 噪声并允许断言
let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
});

// ============================ FeishuIntegration ============================
describe('FeishuIntegration', () => {
  function make() {
    return new FeishuIntegration();
  }

  it('暴露静态元数据与全部为真的能力位', () => {
    const p = make();
    expect(p.type).toBe('feishu');
    expect(p.name).toBe('飞书');
    expect(p.description).toBe('飞书集成，支持登录认证和消息推送');
    expect(p.capabilities).toEqual({ auth: true, message: true, sync: true, webhook: true });
  });

  it('未初始化时 testConnection 抛 "Integration not initialized"', async () => {
    await expect(make().testConnection()).rejects.toThrow('Integration not initialized');
  });

  it('initialize 后写入 config 并标记为已初始化', async () => {
    const p = make();
    await p.initialize({ appId: 'cli_test', appSecret: 'secret_test' });
    // 通过 testConnection 不再抛错间接验证 initialized=true
    await expect(p.testConnection()).resolves.toBe(true);
  });

  it('testConnection 缺 appId 返回 false', async () => {
    const p = make();
    await p.initialize({ appSecret: 'secret_test' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection 缺 appSecret 返回 false', async () => {
    const p = make();
    await p.initialize({ appId: 'cli_test' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection 空配置返回 false', async () => {
    const p = make();
    await p.initialize({});
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection appId/appSecret 均齐备返回 true', async () => {
    const p = make();
    await p.initialize({ appId: 'cli_test', appSecret: 'secret_test' });
    await expect(p.testConnection()).resolves.toBe(true);
  });

  it('getAuthUrl 拼装飞书授权地址（含 app_id / redirect_uri 编码 / state）', () => {
    const p = make();
    p.initialize({ appId: 'cli_test', appSecret: 'secret_test' });
    const redirectUri = 'https://example.com/cb?next=/x&y=1';
    const url = p.getAuthUrl(redirectUri, 'state-abc');
    expect(url.startsWith('https://open.feishu.cn/open-apis/authen/v1/index?')).toBe(true);
    expect(url).toContain('app_id=cli_test');
    expect(url).toContain('redirect_uri=' + encodeURIComponent(redirectUri));
    expect(url).toContain('state=state-abc');
  });

  it('getAuthUrl 未初始化时 appId 为 undefined（URL 仍生成，app_id=undefined）', () => {
    const p = make();
    const url = p.getAuthUrl('https://example.com/cb', 's');
    expect(url).toContain('app_id=undefined');
    expect(url).toContain('state=s');
  });

  it('handleAuthCallback 回显 code/state 并返回桩用户结构', async () => {
    const p = make();
    const res = await p.handleAuthCallback('code-1', 'state-1');
    expect(res).toEqual({
      code: 'code-1',
      state: 'state-1',
      userId: 'feishu_user_id',
      name: '飞书用户',
      avatar: '',
    });
  });

  it('sendMessage 未初始化抛 "Integration not initialized"', async () => {
    await expect(make().sendMessage('user1', { text: 'hi' })).rejects.toThrow(
      'Integration not initialized'
    );
  });

  it('sendMessage 已初始化解析并以 [Feishu] 前缀打印日志', async () => {
    const p = make();
    await p.initialize({ appId: 'cli_test', appSecret: 'secret_test' });
    await p.sendMessage('user1', { text: 'hi' });
    expect(logSpy).toHaveBeenCalledWith('[Feishu] Sending message to', 'user1', { text: 'hi' });
  });

  it('syncData 返回空 users/departments + syncedAt Date', async () => {
    const p = make();
    const res = await p.syncData();
    expect(res.users).toEqual([]);
    expect(res.departments).toEqual([]);
    expect(res.syncedAt).toBeInstanceOf(Date);
  });

  it('handleWebhook 回显 payload.event 并标记 handled:true', async () => {
    const p = make();
    const res = await p.handleWebhook({ event: 'message.created', data: 1 }, 'sig');
    expect(res).toEqual({ event: 'message.created', handled: true });
  });
});

// ============================ GitHubIntegration ============================
describe('GitHubIntegration', () => {
  function make() {
    return new GitHubIntegration();
  }

  it('暴露静态元数据与 message:false 的能力位', () => {
    const p = make();
    expect(p.type).toBe('github');
    expect(p.name).toBe('GitHub');
    expect(p.description).toBe('GitHub集成，支持登录认证和仓库同步');
    expect(p.capabilities).toEqual({ auth: true, message: false, sync: true, webhook: true });
  });

  it('未初始化时 testConnection 抛错', async () => {
    await expect(make().testConnection()).rejects.toThrow('Integration not initialized');
  });

  it('testConnection 缺 clientId 返回 false', async () => {
    const p = make();
    await p.initialize({ clientSecret: 'cs' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection 缺 clientSecret 返回 false', async () => {
    const p = make();
    await p.initialize({ clientId: 'ci' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection clientId/clientSecret 齐备返回 true', async () => {
    const p = make();
    await p.initialize({ clientId: 'ci', clientSecret: 'cs' });
    await expect(p.testConnection()).resolves.toBe(true);
  });

  it('getAuthUrl 拼装 GitHub OAuth 地址（client_id / redirect_uri 编码 / state / scope 编码）', () => {
    const p = make();
    p.initialize({ clientId: 'ci', clientSecret: 'cs' });
    const redirectUri = 'https://example.com/cb?next=/repo';
    const url = p.getAuthUrl(redirectUri, 'st');
    expect(url.startsWith('https://github.com/login/oauth/authorize?')).toBe(true);
    expect(url).toContain('client_id=ci');
    expect(url).toContain('redirect_uri=' + encodeURIComponent(redirectUri));
    expect(url).toContain('state=st');
    expect(url).toContain('scope=' + encodeURIComponent('read:user user:email repo'));
  });

  it('getAuthUrl 未初始化时 client_id 为 undefined', () => {
    const p = make();
    const url = p.getAuthUrl('https://example.com/cb', 'st');
    expect(url).toContain('client_id=undefined');
  });

  it('handleAuthCallback 回显 code/state 并返回含 login 的桩用户结构', async () => {
    const p = make();
    const res = await p.handleAuthCallback('c', 's');
    expect(res).toEqual({
      code: 'c',
      state: 's',
      userId: 'github_user_id',
      name: 'GitHub User',
      avatar: '',
      login: 'github-user',
    });
  });

  it('syncData 返回空 repositories + syncedAt Date', async () => {
    const p = make();
    const res = await p.syncData();
    expect(res.repositories).toEqual([]);
    expect(res.syncedAt).toBeInstanceOf(Date);
  });

  it('handleWebhook 回显 event 与 action 并标记 handled:true', async () => {
    const p = make();
    const res = await p.handleWebhook({ event: 'push', action: 'opened' }, 'sig');
    expect(res).toEqual({ event: 'push', action: 'opened', handled: true });
  });

  it('无 sendMessage 方法（与 capabilities.message:false 一致）', () => {
    const p = make();
    expect((p as unknown as { sendMessage?: unknown }).sendMessage).toBeUndefined();
  });
});

// ============================ WeComIntegration ============================
describe('WeComIntegration', () => {
  function make() {
    return new WeComIntegration();
  }

  it('暴露静态元数据与全部为真的能力位', () => {
    const p = make();
    expect(p.type).toBe('wecom');
    expect(p.name).toBe('企业微信');
    expect(p.description).toBe('企业微信集成，支持登录认证和消息推送');
    expect(p.capabilities).toEqual({ auth: true, message: true, sync: true, webhook: true });
  });

  it('未初始化时 testConnection 抛错', async () => {
    await expect(make().testConnection()).rejects.toThrow('Integration not initialized');
  });

  it('testConnection 缺 corpId 返回 false', async () => {
    const p = make();
    await p.initialize({ agentId: '1000001', secret: 'sec' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection 缺 agentId 返回 false', async () => {
    const p = make();
    await p.initialize({ corpId: 'corp', secret: 'sec' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection 缺 secret 返回 false', async () => {
    const p = make();
    await p.initialize({ corpId: 'corp', agentId: '1000001' });
    await expect(p.testConnection()).resolves.toBe(false);
  });

  it('testConnection corpId/agentId/secret 三者齐备返回 true', async () => {
    const p = make();
    await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
    await expect(p.testConnection()).resolves.toBe(true);
  });

  it('getAuthUrl 拼装企业微信扫码授权地址（appid=corpId / agentid / redirect_uri 编码 / state）', () => {
    const p = make();
    p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
    const redirectUri = 'https://example.com/cb?a=1&b=2';
    const url = p.getAuthUrl(redirectUri, 'qy-state');
    expect(url.startsWith('https://open.work.weixin.qq.com/wwopen/sso/qrConnect?')).toBe(true);
    expect(url).toContain('appid=corp');
    expect(url).toContain('agentid=1000001');
    expect(url).toContain('redirect_uri=' + encodeURIComponent(redirectUri));
    expect(url).toContain('state=qy-state');
  });

  it('getAuthUrl 未初始化时 appid/agentid 均为 undefined', () => {
    const p = make();
    const url = p.getAuthUrl('https://example.com/cb', 's');
    expect(url).toContain('appid=undefined');
    expect(url).toContain('agentid=undefined');
  });

  it('handleAuthCallback 回显 code/state 并返回桩用户结构', async () => {
    const p = make();
    const res = await p.handleAuthCallback('c2', 's2');
    expect(res).toEqual({
      code: 'c2',
      state: 's2',
      userId: 'wecom_user_id',
      name: '企业微信用户',
      avatar: '',
    });
  });

  it('sendMessage 未初始化抛 "Integration not initialized"', async () => {
    await expect(make().sendMessage('u', { text: 'x' })).rejects.toThrow(
      'Integration not initialized'
    );
  });

  it('sendMessage 已初始化解析并以 [WeCom] 前缀打印日志', async () => {
    const p = make();
    await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
    await p.sendMessage('u', { text: 'x' });
    expect(logSpy).toHaveBeenCalledWith('[WeCom] Sending message to', 'u', { text: 'x' });
  });

  it('syncData 返回空 users/departments + syncedAt Date', async () => {
    const p = make();
    const res = await p.syncData();
    expect(res.users).toEqual([]);
    expect(res.departments).toEqual([]);
    expect(res.syncedAt).toBeInstanceOf(Date);
  });

  it('handleWebhook 回显 payload.event 并标记 handled:true', async () => {
    const p = make();
    const res = await p.handleWebhook({ event: 'msg' }, 'sig');
    expect(res).toEqual({ event: 'msg', handled: true });
  });
});

// ============================ 跨实现契约一致性 ============================
describe('三个 Provider 契约一致性', () => {
  it('均实现 IntegrationProvider 必需字段（type/name/description/capabilities）', () => {
    for (const p of [new FeishuIntegration(), new GitHubIntegration(), new WeComIntegration()]) {
      expect(typeof p.type).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(p.capabilities).toEqual(
        expect.objectContaining({
          auth: expect.any(Boolean),
          message: expect.any(Boolean),
          sync: expect.any(Boolean),
          webhook: expect.any(Boolean),
        })
      );
    }
  });

  it('type 取值互不相同（feishu / github / wecom）', () => {
    const types = [new FeishuIntegration(), new GitHubIntegration(), new WeComIntegration()].map(
      (p) => p.type
    );
    expect(new Set(types).size).toBe(3);
    expect(types).toEqual(expect.arrayContaining(['feishu', 'github', 'wecom']));
  });

  it('getAuthUrl / handleAuthCallback / syncData / handleWebhook 在所有实现上存在且为函数', () => {
    for (const p of [new FeishuIntegration(), new GitHubIntegration(), new WeComIntegration()]) {
      expect(typeof p.getAuthUrl).toBe('function');
      expect(typeof p.handleAuthCallback).toBe('function');
      expect(typeof p.syncData).toBe('function');
      expect(typeof p.handleWebhook).toBe('function');
    }
  });
});
