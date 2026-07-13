/**
 * 邮件服务
 * 支持SMTP发送、模板渲染、队列管理
 */

import nodemailer from "nodemailer";

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

  constructor() {
    // 加载默认模板
    DEFAULT_TEMPLATES.forEach((template) => {
      this.templates.set(template.id, template);
    });
  }

  // 初始化邮件服务
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

  // 检查是否已配置
  isConfigured(): boolean {
    return this.config !== null && this.transporter !== null;
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
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      html = html.replace(regex, () => value);
      subject = subject.replace(regex, () => value);
    });

    // 生成纯文本版本（简单去除HTML标签）
    const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

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
    if (!this.isConfigured()) {
      console.warn("Email service not configured, skipping queue");
      this.sendQueue = [];
      return;
    }

    this.isProcessing = true;

    while (this.sendQueue.length > 0) {
      const email = this.sendQueue.shift()!;
      try {
        await this.doSendEmail(email.to, email.templateId, email.variables);
        console.log(`Email sent to ${email.to}`);
      } catch (error) {
        console.error(`Failed to send email to ${email.to}:`, error);
        // 可以添加重试逻辑
      }
    }

    this.isProcessing = false;
  }

  // 实际发送邮件
  private async doSendEmail(
    to: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<void> {
    if (!this.transporter || !this.config) {
      throw new Error("Email service not initialized");
    }

    const rendered = this.renderTemplate(templateId, variables);
    if (!rendered) {
      throw new Error(`Template not found: ${templateId}`);
    }

    await this.transporter.sendMail({
      from: `"${this.config.fromName}" <${this.config.from}>`,
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
      });
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
