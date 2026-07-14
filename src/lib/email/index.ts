/**
 * 邮件服务
 * 支持SMTP发送、模板渲染、队列管理
 */

import nodemailer from "nodemailer";
import { escapeHtml } from "@/lib/sanitize";

// 邮件配置类型
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

// 邮件模板类型
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text?: string;
  variables: string[];
}

// 邮件发送状态
export type EmailStatus = "pending" | "sending" | "sent" | "failed";

// 邮件记录
export interface EmailLog {
  id: string;
  tenantId: string;
  userId: string;
  to: string;
  subject: string;
  template: string;
  status: EmailStatus;
  error?: string;
  sentAt?: Date;
  createdAt: Date;
}

// 默认邮件模板
const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome",
    name: "欢迎邮件",
    subject: "欢迎使用个人私有第二大脑",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">欢迎使用</h1>
          <h2 style="margin: 10px 0 0 0; font-size: 24px; opacity: 0.9;">个人私有第二大脑</h2>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            感谢你注册个人私有第二大脑！现在你可以开始上传文件、使用AI功能、管理你的知识库了。
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #111827; margin-top: 0;">快速开始</h3>
            <ul style="color: #6b7280; line-height: 2;">
              <li>📁 上传你的第一个文件</li>
              <li>🤖 体验AI智能摘要功能</li>
              <li>🔍 使用语义搜索发现相关文档</li>
              <li>📊 查看知识图谱</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 30px;">
            如有任何问题，欢迎随时联系我们。
          </p>
        </div>
      </div>
    `,
    variables: ["userName", "appUrl"],
  },
  {
    id: "password-reset",
    name: "密码重置邮件",
    subject: "重置你的密码",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">重置密码</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            我们收到了你的密码重置请求。请点击下面的按钮重置密码：
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{resetUrl}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              重置密码
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280;">
            如果按钮无法点击，请复制下面的链接到浏览器：
          </p>
          <p style="font-size: 12px; color: #9ca3af; word-break: break-all; background: white; padding: 10px; border-radius: 4px;">
            {{resetUrl}}
          </p>
          <p style="font-size: 14px; color: #ef4444; margin-top: 20px;">
            ⚠️ 此链接将在24小时后过期。如果你没有请求重置密码，请忽略此邮件。
          </p>
        </div>
      </div>
    `,
    variables: ["userName", "resetUrl"],
  },
  {
    id: "payment-success",
    name: "支付成功通知",
    subject: "支付成功 - 感谢你的支持",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">✅</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">支付成功</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            感谢你的支持！你的订阅已成功激活。
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #111827; margin-top: 0;">订单详情</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">套餐</td>
                <td style="padding: 8px 0; color: #111827; text-align: right; font-weight: bold;">{{planName}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">周期</td>
                <td style="padding: 8px 0; color: #111827; text-align: right;">{{interval}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">金额</td>
                <td style="padding: 8px 0; color: #111827; text-align: right; font-weight: bold;">¥{{amount}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">到期时间</td>
                <td style="padding: 8px 0; color: #111827; text-align: right;">{{expiresAt}}</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 30px;">
            享受你的会员特权吧！如有问题请联系客服。
          </p>
        </div>
      </div>
    `,
    variables: ["userName", "planName", "interval", "amount", "expiresAt"],
  },
  {
    id: "storage-warning",
    name: "存储配额预警",
    subject: "存储空间即将用完",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">⚠️</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">存储空间预警</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你的存储空间使用率已达到 <strong>{{usagePercent}}%</strong>，即将用完。
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="color: #6b7280;">已使用</span>
              <span style="color: #111827; font-weight: bold;">{{used}} / {{total}}</span>
            </div>
            <div style="background: #e5e7eb; height: 10px; border-radius: 5px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #f59e0b, #ef4444); height: 100%; width: {{usagePercent}}%; border-radius: 5px;"></div>
            </div>
          </div>
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              💡 建议：删除不需要的文件或升级套餐获得更多存储空间。
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{upgradeUrl}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              升级套餐
            </a>
          </div>
        </div>
      </div>
    `,
    variables: ["userName", "used", "total", "usagePercent", "upgradeUrl"],
  },
  {
    id: "share-notification",
    name: "分享通知",
    subject: "有人分享了文件给你",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">📤</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">文件分享</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            <strong>{{senderName}}</strong> 分享了一个文件给你：
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="font-size: 40px;">📄</div>
              <div>
                <div style="font-weight: bold; color: #111827;">{{fileName}}</div>
                <div style="font-size: 14px; color: #6b7280;">{{fileSize}}</div>
              </div>
            </div>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{shareUrl}}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              查看分享
            </a>
          </div>
        </div>
      </div>
    `,
    variables: ["userName", "senderName", "fileName", "fileSize", "shareUrl"],
  },
  {
    id: "comment-notification",
    name: "评论通知",
    subject: "有人评论了你的文件",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">💬</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">新评论</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            <strong>{{commenterName}}</strong> 评论了你的文件 <strong>{{fileName}}</strong>：
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6;">
            <p style="color: #374151; margin: 0; line-height: 1.6;">"{{commentContent}}"</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{fileUrl}}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              查看评论
            </a>
          </div>
        </div>
      </div>
    `,
    variables: ["userName", "commenterName", "fileName", "commentContent", "fileUrl"],
  },
  {
    id: "system-announcement",
    name: "系统公告",
    subject: "{{title}}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">📢</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">系统公告</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好，{{userName}}！
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #111827; margin-top: 0;">{{title}}</h2>
            <div style="color: #374151; line-height: 1.8;">
              {{content}}
            </div>
          </div>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 30px;">
            感谢你的支持与理解。
          </p>
        </div>
      </div>
    `,
    variables: ["userName", "title", "content"],
  },
  {
    id: "alert-notification",
    name: "监控告警通知",
    subject: "[告警] {{alertName}} {{statusText}}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">🚨</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">监控告警</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444;">
            <h2 style="color: #111827; margin-top: 0; margin-bottom: 10px;">{{alertName}}</h2>
            <p style="color: #6b7280; margin: 0; font-size: 14px;">
              级别：<strong style="color: #ef4444; text-transform: uppercase;">{{level}}</strong> · 状态：<strong>{{statusText}}</strong>
            </p>
          </div>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #111827; margin-top: 0;">告警详情</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 100px;">消息</td>
                <td style="padding: 8px 0; color: #111827;">{{message}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">当前值</td>
                <td style="padding: 8px 0; color: #ef4444; font-weight: bold;">{{value}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">阈值</td>
                <td style="padding: 8px 0; color: #111827;">{{threshold}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">规则ID</td>
                <td style="padding: 8px 0; color: #6b7280; font-family: monospace; font-size: 13px;">{{ruleId}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">触发时间</td>
                <td style="padding: 8px 0; color: #6b7280; font-family: monospace; font-size: 13px;">{{timestamp}}</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin-top: 30px;">
            此邮件由监控系统自动发送，请及时处理。
          </p>
        </div>
      </div>
    `,
    variables: ["alertName", "level", "statusText", "message", "value", "threshold", "ruleId", "timestamp"],
  },
  {
    id: "invitation",
    name: "团队邀请",
    subject: "邀请你加入{{tenantName}}",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <div style="font-size: 48px;">✉️</div>
          <h1 style="margin: 10px 0 0 0; font-size: 28px;">团队邀请</h1>
        </div>
        <div style="background: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            你好！
          </p>
          <p style="font-size: 16px; color: #374151; line-height: 1.6;">
            <strong>{{tenantName}}</strong> 邀请你以 <strong>{{role}}</strong> 身份加入他们的团队，共同使用个人私有第二大脑管理知识库。
          </p>
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 100px;">邮箱</td>
                <td style="padding: 8px 0; color: #111827;">{{email}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">角色</td>
                <td style="padding: 8px 0; color: #111827; font-weight: bold;">{{role}}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">有效期至</td>
                <td style="padding: 8px 0; color: #6b7280; font-family: monospace; font-size: 13px;">{{expiresAt}}</td>
              </tr>
            </table>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{inviteUrl}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
              接受邀请
            </a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; word-break: break-all; background: white; padding: 10px; border-radius: 4px;">
            如果按钮无法点击，请复制下面的链接到浏览器：{{inviteUrl}}
          </p>
          <p style="font-size: 14px; color: #ef4444; margin-top: 20px;">
            ⚠️ 此邀请链接将在到期后失效。如果你不认识邀请方，请忽略此邮件。
          </p>
        </div>
      </div>
    `,
    variables: ["email", "tenantName", "role", "inviteUrl", "expiresAt"],
  },
];

// 邮件服务类
export class EmailService {
  private transporter: any = null;
  private config: EmailConfig | null = null;
  private templates: Map<string, EmailTemplate> = new Map();
  private sendQueue: Array<{
    to: string;
    templateId: string;
    variables: Record<string, string>;
    tenantId: string;
    userId: string;
  }> = [];
  private isProcessing = false;
  // 租户级 transporter 缓存：tenantId → { config, transporter }。
  // 历史实现只有一个全局 transporter，租户 A 配置 SMTP 会覆盖租户 B 的投递（单例污染）。
  // 现按 tenantId 各自缓存独立 transporter，配置变更时由 POST /api/email/settings 调
  // invalidateTenant 清缓存，下次投递从 DB 重新加载并重建 transporter。
  private tenantTransporters: Map<string, { config: EmailConfig; transporter: any }> = new Map();

  constructor() {
    // 加载默认模板
    DEFAULT_TEMPLATES.forEach((template) => {
      this.templates.set(template.id, template);
    });
  }

  // 初始化邮件服务（平台级 / env 配置；仅用于 tenantId 为空的平台投递，如监控告警）
  init(config: EmailConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  // 检查平台级单例是否已配置（env 初始化后为 true）
  isConfigured(): boolean {
    return this.config !== null && this.transporter !== null;
  }

  /**
   * 清除指定租户的 transporter 缓存。配置更新后由路由调用，使下次投递重建 transporter。
   * 不清空单例（平台级配置不受租户配置变更影响）。
   */
  invalidateTenant(tenantId: string): void {
    if (tenantId) this.tenantTransporters.delete(tenantId);
  }

  // 获取模板列表
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  // 获取单个模板
  getTemplate(id: string): EmailTemplate | undefined {
    return this.templates.get(id);
  }

  // 渲染模板
  renderTemplate(templateId: string, variables: Record<string, string>): {
    subject: string;
    html: string;
    text: string;
  } | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    let html = template.html;
    let subject = template.subject;

    // 替换变量
    // 使用替换函数 () => value 而非直接传 value：String.replace 会把 value 中的
    // $& / $$ / $` / $' / $n 当作反向引用解释（如 value="$&" 会插入匹配文本 "{{key}}"
    // 而非字面 "$&"）。变量值多为用户名/URL/金额，含 $ 时会引发渲染异常，故按字面量替换。
    //
    // HTML 正文中的变量值统一经 escapeHtml 转义后再替换，防止 tenantName / fileName /
    // commentContent / message 等用户可控字段注入 <script>/<a>/<img> 等标签（存储型 XSS）。
    // URL 变量（resetUrl/shareUrl/inviteUrl 等）插入到 href="..." 属性上下文，escapeHtml
    // 将 & 转为 &amp;（属性值的正确编码，浏览器跟随链接时还原为 &）、将 " 转为 &quot;
    // （防止闭合属性），故对 href 同样安全。
    // subject 为纯文本（RFC 5322），邮件客户端不在标题中渲染 HTML，且 HTML 实体会以
    // 字面量显示（如 "AT&T" 会变成 "AT&amp;T"），故 subject 不做转义；标题的 CRLF 注入
    // 由 nodemailer 折叠处理。
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      const safeValue = escapeHtml(value);
      html = html.replace(regex, () => safeValue);
      subject = subject.replace(regex, () => value);
    });

    // 生成纯文本版本：去除 HTML 标签后反转义 HTML 实体，使纯文本显示原始字符
    // （如转义后的 "&amp;" 还原为 "&"），再折叠空白。&amp; 必须最后反转义，避免
    // "&amp;lt;" 被错误地双重还原为 "<"。
    const text = html
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    return { subject, html, text };
  }

  // 发送邮件（异步，加入队列）
  async sendEmail(
    to: string,
    templateId: string,
    variables: Record<string, string>,
    tenantId: string = "",
    userId: string = ""
  ): Promise<boolean> {
    // 加入队列
    this.sendQueue.push({ to, templateId, variables, tenantId, userId });

    // 触发队列处理
    this.processQueue();

    return true;
  }

  // 处理邮件队列
  private async processQueue() {
    if (this.isProcessing || this.sendQueue.length === 0) return;

    this.isProcessing = true;

    while (this.sendQueue.length > 0) {
      const email = this.sendQueue.shift()!;
      try {
        await this.doSendEmail(email.to, email.templateId, email.variables, email.tenantId);
        console.log(`Email sent to ${email.to}`);
      } catch (error) {
        console.error(`Failed to send email to ${email.to}:`, error);
        // 可以添加重试逻辑
      }
    }

    this.isProcessing = false;
  }

  /**
   * 解析投递所需 transporter：
   * - tenantId 非空 → 从 DB 读取该租户 SMTP 配置（命中缓存则复用），租户隔离；
   *   延迟 import settings-store 避免 email 模块静态依赖 db（保持模板渲染等纯逻辑可独立测试）。
   * - tenantId 空（平台级，如监控告警）→ 回退平台单例（env 初始化）。
   * 解析失败（未配置 / 解密失败 / DB 故障）返回 null，调用方按"跳过"处理，不跨租户回退。
   */
  private async resolveTransporter(
    tenantId: string
  ): Promise<{ transporter: any; config: EmailConfig } | null> {
    if (tenantId) {
      const cached = this.tenantTransporters.get(tenantId);
      if (cached) return cached;
      try {
        const { getEmailConfig } = await import("./settings-store");
        const config = await getEmailConfig(tenantId);
        if (!config) return null;
        const transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.user, pass: config.pass },
        });
        const entry = { config, transporter };
        this.tenantTransporters.set(tenantId, entry);
        return entry;
      } catch (error) {
        console.error(`Failed to resolve email transporter for tenant ${tenantId}:`, error);
        return null;
      }
    }
    // 平台级：单例 transporter（env 初始化）
    if (this.transporter && this.config) {
      return { transporter: this.transporter, config: this.config };
    }
    return null;
  }

  // 实际发送邮件
  private async doSendEmail(
    to: string,
    templateId: string,
    variables: Record<string, string>,
    tenantId: string
  ): Promise<void> {
    const resolved = await this.resolveTransporter(tenantId);
    if (!resolved) {
      console.warn("Email service not configured, skipping queue");
      return;
    }
    const { transporter, config } = resolved;

    const rendered = this.renderTemplate(templateId, variables);
    if (!rendered) {
      throw new Error(`Template not found: ${templateId}`);
    }

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.from}>`,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  // 发送测试邮件
  async sendTestEmail(to: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error("Email service not configured");
    }

    try {
      await this.doSendEmail(to, "welcome", {
        userName: "测试用户",
        appUrl: "https://example.com",
      }, "");
      return true;
    } catch (error) {
      console.error("Failed to send test email:", error);
      return false;
    }
  }
}

// 全局邮件服务实例
export const emailService = new EmailService();

// 从环境变量初始化邮件服务
export function initEmailServiceFromEnv() {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    fromName: process.env.SMTP_FROM_NAME || "个人私有第二大脑",
  };

  if (config.host && config.user && config.pass) {
    emailService.init(config);
    console.log("Email service initialized");
  } else {
    console.log("Email service not configured (SMTP settings missing)");
  }
}
