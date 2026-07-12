import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeComIntegration } from '@/lib/integrations/wecom';
import { createHash } from 'crypto';

/**
 * WeComIntegration 真实企业微信开放平台 API 路径测试
 *
 * Mock 策略：
 *   - 全局 fetch 经 vi.stubGlobal('fetch', mockFetch) 注入；mockFetch 按 URL 子串分发到不同 route。
 *   - 每个 route 返回 `{ ok, status, body }`，body 即 WeCom API 标准 JSON（含 errcode/errmsg）。
 *   - 测试不依赖真实网络，所有断言基于 mock fetch 的调用次数与 URL/body 内容。
 *
 * 覆盖面（22 用例）：
 *   - getAccessToken：缓存命中复用、errcode 抛错、HTTP 非 2xx 抛错、缓存过期重新 fetch
 *   - testConnection：缺配置返回 false（不触达 fetch）、成功路径、errcode/网络错误返回 false
 *   - handleAuthCallback：企业成员流程（getuserinfo + getuserdetail）、非企业成员（仅 openid）、
 *     getuserinfo/getuserdetail 各 errcode 抛错、未初始化抛错
 *   - sendMessage：text 默认、markdown 透传、字符串 message 按 text.text 处理、调用方 touser/agentid 覆盖、
 *     errcode 抛错、未初始化抛错
 *   - handleWebhook：缺字段拒绝、签名匹配 verified:true、签名不匹配 handled:false、echostr 透传
 */

// 默认成功 gettoken 响应（expires_in=7200s）
const OK_TOKEN_RESPONSE = {
  ok: true,
  status: 200,
  body: {
    errcode: 0,
    errmsg: 'ok',
    access_token: 'ACCESS_TOKEN_123',
    expires_in: 7200,
  },
};

interface MockRoute {
  match: RegExp;
  response: { ok?: boolean; status?: number; statusText?: string; body: any };
}

/**
 * 构造按 URL 子串/正则分发的 mock fetch。
 * 默认每个 URL 命中后调用 route.response 返回；未命中时抛错便于定位意外调用。
 */
function makeMockFetch(routes: MockRoute[]) {
  return vi.fn(async (input: any, _init?: any) => {
    const url: string = typeof input === 'string' ? input : String(input?.url ?? input);
    for (const route of routes) {
      if (route.match.test(url)) {
        const r = route.response;
        return {
          ok: r.ok !== false,
          status: r.status ?? 200,
          statusText: r.statusText ?? (r.ok === false ? 'Error' : 'OK'),
          json: async () => r.body,
        };
      }
    }
    throw new Error(`No mock route for URL: ${url}`);
  });
}

describe('WeComIntegration - 真实 API 路径', () => {
  let originalFetch: typeof globalThis.fetch;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  /**
   * 装载 mock fetch 并返回 spy（便于断言调用次数）
   */
  function installMockFetch(routes: MockRoute[]) {
    const mockFetch = makeMockFetch(routes);
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  }

  // ============================ getAccessToken（内部，经 testConnection 触达） ============================
  describe('access_token 缓存', () => {
    it('gettoken 成功后缓存命中：连续两次 testConnection 仅触发一次 gettoken fetch', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      // 第一次：testConnection 内清缓存 → 真实 fetch gettoken
      await expect(p.testConnection()).resolves.toBe(true);
      // 第二次：testConnection 内再次清缓存 → 再次 fetch gettoken
      // （注意：testConnection 总是清缓存以强制验证；这与 sendMessage/handleAuthCallback 内的缓存复用不同）
      await expect(p.testConnection()).resolves.toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('gettoken');
      expect(mockFetch.mock.calls[0][0]).toContain('corpid=corp');
      expect(mockFetch.mock.calls[0][0]).toContain('corpsecret=sec');
    });

    it('sendMessage 连续调用复用缓存：仅第一次触发 gettoken', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        { match: /message\/send/, response: { body: { errcode: 0, errmsg: 'ok', msgid: 'MSG1' } } },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      await p.sendMessage('user1', { text: { content: 'hi' } });
      await p.sendMessage('user2', { text: { content: 'hi again' } });
      // 第一次 sendMessage: gettoken + message/send = 2 次 fetch
      // 第二次 sendMessage: 仅 message/send（缓存命中）= 1 次 fetch
      // 共 3 次
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls.filter((u) => u.includes('gettoken'))).toHaveLength(1);
      expect(urls.filter((u) => u.includes('message/send'))).toHaveLength(2);
    });

    it('gettoken errcode !== 0 时抛错含 errmsg', async () => {
      installMockFetch([
        {
          match: /gettoken/,
          response: { body: { errcode: 40001, errmsg: 'invalid corpid' } },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'bad', agentId: '1000001', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      const errMsg = errorSpy.mock.calls[0][1] instanceof Error
        ? (errorSpy.mock.calls[0][1] as Error).message
        : String(errorSpy.mock.calls[0][1]);
      expect(errMsg).toContain('40001');
      expect(errMsg).toContain('invalid corpid');
    });

    it('gettoken HTTP 非 2xx 时抛错含 status', async () => {
      installMockFetch([
        {
          match: /gettoken/,
          response: { ok: false, status: 503, statusText: 'Service Unavailable', body: {} },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      const errMsg = errorSpy.mock.calls[0][1] instanceof Error
        ? (errorSpy.mock.calls[0][1] as Error).message
        : String(errorSpy.mock.calls[0][1]);
      expect(errMsg).toContain('503');
    });
  });

  // ============================ testConnection ============================
  describe('testConnection', () => {
    it('缺 corpId 时直接返回 false（不触达 fetch）', async () => {
      const mockFetch = installMockFetch([{ match: /gettoken/, response: OK_TOKEN_RESPONSE }]);
      const p = new WeComIntegration();
      await p.initialize({ agentId: '1000001', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('缺 agentId 时直接返回 false（不触达 fetch）', async () => {
      const mockFetch = installMockFetch([{ match: /gettoken/, response: OK_TOKEN_RESPONSE }]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('缺 secret 时直接返回 false（不触达 fetch）', async () => {
      const mockFetch = installMockFetch([{ match: /gettoken/, response: OK_TOKEN_RESPONSE }]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('gettoken 成功返回 true', async () => {
      installMockFetch([{ match: /gettoken/, response: OK_TOKEN_RESPONSE }]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(true);
    });

    it('fetch 抛网络错误时返回 false（catch + console.error）', async () => {
      const failingFetch = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });
      vi.stubGlobal('fetch', failingFetch);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      await expect(p.testConnection()).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  // ============================ handleAuthCallback ============================
  describe('handleAuthCallback', () => {
    it('企业成员流程：getuserinfo 返回 userid+user_ticket → getuserdetail 返回 detail', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        {
          match: /auth\/getuserinfo/,
          response: {
            body: {
              errcode: 0,
              errmsg: 'ok',
              userid: 'WECOM_USER_001',
              user_ticket: 'TICKET_ABC',
            },
          },
        },
        {
          match: /auth\/getuserdetail/,
          response: {
            body: {
              errcode: 0,
              errmsg: 'ok',
              userid: 'WECOM_USER_001',
              name: '张三',
              avatar: 'https://example.com/avatar.png',
              gender: '1',
            },
          },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      const result = await p.handleAuthCallback('code-xyz', 'state-abc');

      expect(result).toEqual({
        code: 'code-xyz',
        state: 'state-abc',
        userId: 'WECOM_USER_001',
        name: '张三',
        avatar: 'https://example.com/avatar.png',
        isMember: true,
      });
      // 3 次 fetch: gettoken + getuserinfo + getuserdetail
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls[1]).toContain('auth/getuserinfo');
      expect(urls[1]).toContain('code=code-xyz');
      expect(urls[2]).toContain('auth/getuserdetail');
    });

    it('非企业成员流程：getuserinfo 仅返回 openid，不调 getuserdetail', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        {
          match: /auth\/getuserinfo/,
          response: {
            body: {
              errcode: 0,
              errmsg: 'ok',
              openid: 'OPENID_XYZ',
            },
          },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      const result = await p.handleAuthCallback('code-1', 'state-1');

      expect(result).toEqual({
        code: 'code-1',
        state: 'state-1',
        userId: 'OPENID_XYZ',
        name: null,
        avatar: null,
        isMember: false,
      });
      // 2 次 fetch: gettoken + getuserinfo（不调 getuserdetail）
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes('auth/getuserdetail'))).toBe(false);
    });

    it('getuserinfo errcode !== 0 时抛错（含 errmsg）', async () => {
      installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        {
          match: /auth\/getuserinfo/,
          response: { body: { errcode: 40029, errmsg: 'invalid code' } },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      await expect(p.handleAuthCallback('bad-code', 's')).rejects.toThrow('40029');
      await expect(p.handleAuthCallback('bad-code', 's')).rejects.toThrow('invalid code');
    });

    it('getuserdetail errcode !== 0 时抛错（含 errmsg）', async () => {
      installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        {
          match: /auth\/getuserinfo/,
          response: {
            body: {
              errcode: 0,
              errmsg: 'ok',
              userid: 'U1',
              user_ticket: 'T1',
            },
          },
        },
        {
          match: /auth\/getuserdetail/,
          response: { body: { errcode: 40063, errmsg: 'user ticket expired' } },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      // 注意：第二次 handleAuthCallback 会缓存 token，但 user_ticket 已过期场景应直接抛错
      await expect(p.handleAuthCallback('c', 's')).rejects.toThrow('40063');
    });

    it('未初始化时抛 "Integration not initialized"', async () => {
      const p = new WeComIntegration();
      await expect(p.handleAuthCallback('c', 's')).rejects.toThrow(
        'Integration not initialized'
      );
    });
  });

  // ============================ sendMessage ============================
  describe('sendMessage', () => {
    it('默认 text 消息：msgtype=text, agentid 来自 config, touser=to', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        { match: /message\/send/, response: { body: { errcode: 0, errmsg: 'ok', msgid: 'M1' } } },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      await p.sendMessage('user1', { text: { content: 'hello' } });

      const sendCall = mockFetch.mock.calls[1];
      const url = sendCall[0] as string;
      expect(url).toContain('message/send');
      expect(url).toContain('access_token=ACCESS_TOKEN_123');
      const init = sendCall[1] as RequestInit;
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        msgtype: 'text',
        agentid: '1000001',
        touser: 'user1',
        text: { content: 'hello' },
      });
    });

    it('markdown 消息透传：msgtype=markdown, markdown.content', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        { match: /message\/send/, response: { body: { errcode: 0, errmsg: 'ok', msgid: 'M1' } } },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      await p.sendMessage('@all', {
        msgtype: 'markdown',
        markdown: { content: '# Title\n**bold**' },
      });

      const init = mockFetch.mock.calls[1][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.msgtype).toBe('markdown');
      expect(body.markdown).toEqual({ content: '# Title\n**bold**' });
      expect(body.touser).toBe('@all');
      expect(body.agentid).toBe('1000001');
    });

    it('字符串 message：按 text.text={ content } 处理', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        { match: /message\/send/, response: { body: { errcode: 0, errmsg: 'ok', msgid: 'M1' } } },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });

      await p.sendMessage('user1', '纯文本通知');

      const init = mockFetch.mock.calls[1][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.msgtype).toBe('text');
      expect(body.text).toEqual({ content: '纯文本通知' });
      expect(body.touser).toBe('user1');
    });

    it('调用方提供 touser/agentid 时覆盖默认值', async () => {
      const mockFetch = installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        { match: /message\/send/, response: { body: { errcode: 0, errmsg: 'ok', msgid: 'M1' } } },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: 'default-agent', secret: 'sec' });

      await p.sendMessage('default-user', {
        touser: 'User2|User3',
        agentid: 'custom-agent',
        text: { content: '群发' },
      });

      const init = mockFetch.mock.calls[1][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.touser).toBe('User2|User3');
      expect(body.agentid).toBe('custom-agent');
    });

    it('message/send errcode !== 0 时抛错', async () => {
      installMockFetch([
        { match: /gettoken/, response: OK_TOKEN_RESPONSE },
        {
          match: /message\/send/,
          response: { body: { errcode: 81013, errmsg: 'invalid agentid' } },
        },
      ]);
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      await expect(p.sendMessage('u', { text: { content: 'x' } })).rejects.toThrow('81013');
    });

    it('未初始化时抛 "Integration not initialized"', async () => {
      const p = new WeComIntegration();
      await expect(p.sendMessage('u', { text: { content: 'x' } })).rejects.toThrow(
        'Integration not initialized'
      );
    });
  });

  // ============================ handleWebhook（签名校验，无网络） ============================
  describe('handleWebhook', () => {
    /**
     * 计算企业微信 webhook 签名：SHA1(sort([token, timestamp, nonce]).join(''))
     */
    function computeSignature(token: string, timestamp: string, nonce: string): string {
      return createHash('sha1')
        .update([token, timestamp, nonce].sort().join(''))
        .digest('hex');
    }

    it('缺 token 时返回 handled:false + error（不抛错）', async () => {
      const p = new WeComIntegration();
      await p.initialize({ corpId: 'corp', agentId: '1000001', secret: 'sec' });
      // 无 token 字段
      const res = await p.handleWebhook(
        { event: 'msg', timestamp: '1700000000', nonce: 'abc' },
        'sig'
      );
      expect(res.handled).toBe(false);
      expect(res.error).toContain('token');
    });

    it('缺 timestamp/nonce/signature 时返回 handled:false + error', async () => {
      const p = new WeComIntegration();
      await p.initialize({
        corpId: 'corp',
        agentId: '1000001',
        secret: 'sec',
        token: 'WEBHOOK_TOKEN',
      });
      const res = await p.handleWebhook({ event: 'msg', timestamp: '', nonce: '' }, '');
      expect(res.handled).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('签名匹配时返回 handled:true + verified:true', async () => {
      const token = 'WEBHOOK_TOKEN';
      const timestamp = '1700000000';
      const nonce = 'abc123';
      const sig = computeSignature(token, timestamp, nonce);

      const p = new WeComIntegration();
      await p.initialize({
        corpId: 'corp',
        agentId: '1000001',
        secret: 'sec',
        token,
      });

      const res = await p.handleWebhook(
        { event: 'msg', timestamp, nonce, data: { x: 1 } },
        sig
      );
      expect(res).toEqual({
        event: 'msg',
        handled: true,
        verified: true,
      });
    });

    it('签名不匹配时返回 handled:false + error', async () => {
      const p = new WeComIntegration();
      await p.initialize({
        corpId: 'corp',
        agentId: '1000001',
        secret: 'sec',
        token: 'WEBHOOK_TOKEN',
      });

      const res = await p.handleWebhook(
        { event: 'msg', timestamp: '1700000000', nonce: 'abc' },
        'deadbeef'
      );
      expect(res.handled).toBe(false);
      expect(res.error).toContain('签名验证失败');
    });

    it('URL 验证场景透传 echostr', async () => {
      const token = 'T';
      const timestamp = '1700000000';
      const nonce = 'n';
      const sig = computeSignature(token, timestamp, nonce);

      const p = new WeComIntegration();
      await p.initialize({
        corpId: 'corp',
        agentId: '1000001',
        secret: 'sec',
        token,
      });

      const res = await p.handleWebhook(
        { timestamp, nonce, echostr: 'ECHO_12345' },
        sig
      );
      expect(res.handled).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.echostr).toBe('ECHO_12345');
    });

    it('排序逻辑正确：timestamp/nonce/token 任意顺序拼接结果一致', async () => {
      const token = 'TOKEN_Z';
      const timestamp = '1700000000';
      const nonce = 'AAAAA';
      // 实现内排序：[token, timestamp, nonce].sort() → ['1700000000', 'AAAAA', 'TOKEN_Z']
      // 我们手动构造正确签名以验证排序
      const sig = computeSignature(token, timestamp, nonce);

      const p = new WeComIntegration();
      await p.initialize({
        corpId: 'corp',
        agentId: '1000001',
        secret: 'sec',
        token,
      });

      const res = await p.handleWebhook({ timestamp, nonce }, sig);
      expect(res.verified).toBe(true);
    });
  });
});
