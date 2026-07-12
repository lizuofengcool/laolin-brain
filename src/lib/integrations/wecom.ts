/**
 * 企业微信集成
 *
 * 真实实现：调用企业微信开放平台 API（gettoken / auth/getuserinfo / auth/getuserdetail /
 * message/send 等）。access_token 内存缓存，按 expires_in 失效。HTTP 边界为全局 fetch，
 * 测试时经 vi.stubGlobal('fetch', ...) 注入 mock。
 *
 * 与 ./index 的 IntegrationProvider 接口保持兼容：
 *   - initialize 写入 config（corpId / agentId / secret / 可选 token 用于 webhook 验签）
 *   - testConnection 调用 gettoken 验证 corpId+secret 是否有效
 *   - getAuthUrl 纯字符串拼装（与历史行为一致）
 *   - handleAuthCallback(code, state) 调用 auth/getuserinfo + auth/getuserdetail 获取真实用户信息
 *   - sendMessage(to, message) 调用 message/send（text/markdown/textcard/news 等 msgtype 透传）
 *   - syncData 仍返回空骨架（组织架构同步涉及分页与差异合并，超出本集成范围）
 *   - handleWebhook(payload, signature) 用 SHA1(sort([token, timestamp, nonce])) 校验签名
 *
 * 所有 WeCom API 响应为 JSON，含 errcode 与 errmsg 字段；errcode !== 0 时抛错。
 */
import { createHash } from 'crypto';
import type { IntegrationProvider, IntegrationCapabilities } from './index';

const WECOM_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

interface WeComConfig {
  corpId?: string;
  agentId?: string | number;
  secret?: string;
  token?: string; // 用于 webhook 验签（与 corpId/secret 不同，企业微信后台「接收事件」配置）
  encodingAESKey?: string; // 消息加解密密钥（仅 echostr/encrypt 解密用，本实现不处理 AES）
}

interface WeComTokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

interface WeComApiResponse {
  errcode: number;
  errmsg: string;
  [key: string]: unknown;
}

export class WeComIntegration implements IntegrationProvider {
  type = 'wecom' as const;
  name = '企业微信';
  description = '企业微信集成，支持登录认证和消息推送';

  capabilities: IntegrationCapabilities = {
    auth: true,
    message: true,
    sync: true,
    webhook: true,
  };

  private config: WeComConfig = {};
  private initialized = false;
  private tokenCache: WeComTokenCache | null = null;

  /**
   * 初始化企业微信集成
   * 重置 token 缓存：新 initialize 后旧 token 不再适用
   */
  async initialize(config: Record<string, any>): Promise<void> {
    this.config = {
      corpId: config.corpId ?? config.corpid,
      agentId: config.agentId ?? config.agentid,
      secret: config.secret,
      token: config.token,
      encodingAESKey: config.encodingAESKey,
    };
    this.initialized = true;
    this.tokenCache = null;
  }

  /**
   * 获取 access_token（带缓存，按 expires_in 提前 60s 失效防止边界竞态）
   */
  private async getAccessToken(): Promise<string> {
    if (!this.initialized) {
      throw new Error('Integration not initialized');
    }
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.token;
    }

    const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(
      this.config.corpId ?? ''
    )}&corpsecret=${encodeURIComponent(this.config.secret ?? '')}`;
    const res = await this.callWeComApi<{ access_token: string; expires_in: number }>(
      url,
      'GET'
    );

    // 提前 60s 过期以避免边界竞态
    this.tokenCache = {
      token: res.access_token,
      expiresAt: now + Math.max(0, (res.expires_in - 60)) * 1000,
    };
    return res.access_token;
  }

  /**
   * 调用企业微信 API 并解析响应
   * - HTTP 非 2xx 抛错（含 status）
   * - errcode !== 0 抛错（含 errmsg）
   *
   * 返回类型为 `T & WeComApiResponse`，调用方传入的 T 描述业务字段，
   * 框架自动附加 errcode/errmsg 校验，T 仅声明业务字段即可。
   */
  private async callWeComApi<T extends Record<string, unknown> = Record<string, unknown>>(
    url: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<T & WeComApiResponse> {
    const init: RequestInit = { method };
    if (method === 'POST' && body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const resp = await fetch(url, init);
    if (!resp.ok) {
      throw new Error(`WeCom API HTTP ${resp.status}: ${resp.statusText}`);
    }
    const data = (await resp.json()) as T & WeComApiResponse;
    if (data.errcode !== 0) {
      throw new Error(`WeCom API error ${data.errcode}: ${data.errmsg}`);
    }
    return data;
  }

  /**
   * 测试连接：调用 gettoken 验证 corpId + secret 是否有效
   * 缺少必要配置时直接返回 false（不发起网络请求）
   */
  async testConnection(): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Integration not initialized');
    }
    const { corpId, agentId, secret } = this.config;
    if (!corpId || !agentId || !secret) {
      return false;
    }
    try {
      // 清缓存以强制真实调用（否则命中缓存而无法验证 secret 是否仍然有效）
      this.tokenCache = null;
      await this.getAccessToken();
      return true;
    } catch (error) {
      console.error('[WeCom] testConnection failed:', error);
      return false;
    }
  }

  /**
   * 获取授权 URL（拼装企业微信扫码授权地址）
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const { corpId, agentId } = this.config;
    return `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=${corpId}&agentid=${agentId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}`;
  }

  /**
   * 处理授权回调：用 code 换取企业成员信息
   *
   * 流程：
   *   1. GET /auth/getuserinfo?access_token=...&code=... → userid + user_ticket
   *   2. POST /auth/getuserdetail?access_token=... body={user_ticket} → name/avatar
   *
   * 第 2 步仅在用户对企业可见时返回 user_ticket；非企业成员仅返回 openid，
   * 此时跳过第 2 步直接返回，isMember=false。
   */
  async handleAuthCallback(code: string, state: string): Promise<any> {
    if (!this.initialized) {
      throw new Error('Integration not initialized');
    }
    const accessToken = await this.getAccessToken();

    // 第 1 步：getuserinfo
    const url1 = `${WECOM_API_BASE}/auth/getuserinfo?access_token=${encodeURIComponent(
      accessToken
    )}&code=${encodeURIComponent(code)}`;
    const info = await this.callWeComApi<{
      userid?: string;
      user_ticket?: string;
      openid?: string;
    }>(url1, 'GET');

    if (!info.userid || !info.user_ticket) {
      // 非企业成员（仅 openid）
      return {
        code,
        state,
        userId: info.userid ?? info.openid ?? null,
        name: null,
        avatar: null,
        isMember: !!info.userid,
      };
    }

    // 第 2 步：getuserdetail
    const url2 = `${WECOM_API_BASE}/auth/getuserdetail?access_token=${encodeURIComponent(
      accessToken
    )}`;
    const detail = await this.callWeComApi<{
      userid: string;
      name?: string;
      avatar?: string;
      gender?: string;
    }>(url2, 'POST', { user_ticket: info.user_ticket });

    return {
      code,
      state,
      userId: detail.userid,
      name: detail.name ?? null,
      avatar: detail.avatar ?? '',
      isMember: true,
    };
  }

  /**
   * 发送消息
   *
   * 调用 /message/send，body 结构与企业微信一致：
   *   { touser, msgtype, agentid, text|markdown|textcard|news|image|file|mpnews|... }
   *
   * 调用方约定：
   *   - message 为对象：按字段透传到 body，缺省字段补默认值
   *   - message 为字符串：按 text.text={ content } 处理（便于简单通知场景）
   *   - to 作为默认 touser，message.touser 优先
   */
  async sendMessage(to: string, message: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('Integration not initialized');
    }
    const accessToken = await this.getAccessToken();
    const url = `${WECOM_API_BASE}/message/send?access_token=${encodeURIComponent(
      accessToken
    )}`;

    const body: Record<string, any> = {
      msgtype: 'text',
      agentid: this.config.agentId,
      touser: to,
      // 调用方字段透传，覆盖默认值
      ...(typeof message === 'string' ? { text: { content: message } } : message ?? {}),
    };

    await this.callWeComApi<{ msgid: string }>(url, 'POST', body);
  }

  /**
   * 同步数据
   *
   * 组织架构同步涉及大量分页与差异合并，本集成暂只返回骨架结构。
   * 调用方不应依赖此方法获取真实数据；需完整同步的企业应另行实现。
   */
  async syncData(_options?: any): Promise<any> {
    return {
      users: [],
      departments: [],
      syncedAt: new Date(),
    };
  }

  /**
   * 处理 Webhook：签名校验（企业微信回调验签规则）
   *
   * 企业微信启用明文模式时仅做 signature 校验：
   *   signature = SHA1(sort([token, timestamp, nonce]).join(''))
   *
   * 校验通过返回 handled:true，否则返回 handled:false + error。
   * 加解密（EncodingAESKey + AES-256-CBC 解密 encrypt/echostr）不在本方法范围内；
   * 企业微信「明文模式」可仅靠 signature 校验保证请求来源。
   *
   * payload 期望含字段：timestamp / nonce / event（可选）/ echostr（URL 验证场景）。
   * signature 即企业微信请求中的 msg_signature。
   */
  async handleWebhook(payload: any, signature: string): Promise<any> {
    const token = this.config?.token;
    const timestamp = payload?.timestamp;
    const nonce = payload?.nonce;

    if (!token || !timestamp || !nonce || !signature) {
      return {
        event: payload?.event,
        handled: false,
        error: '缺少 token/timestamp/nonce/signature，无法验签',
      };
    }

    const expected = createHash('sha1')
      .update([token, String(timestamp), String(nonce)].sort().join(''))
      .digest('hex');

    if (expected !== signature) {
      return {
        event: payload?.event,
        handled: false,
        error: '签名验证失败',
      };
    }

    // URL 验证场景透传 echostr（企业微信要求原样回显明文）
    return {
      event: payload?.event,
      handled: true,
      verified: true,
      ...(payload?.echostr ? { echostr: payload.echostr } : {}),
    };
  }
}
