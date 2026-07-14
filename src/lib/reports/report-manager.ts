/**
 * 报表管理器
 * 负责报表的创建、查询、更新、删除等操作
 */

import type {
  Report,
  ReportTemplate,
  ReportQueryParams,
  ReportExportOptions,
  ReportSubscription,
  ReportWidget,
  TableConfig,
} from './types';
import { BUILTIN_REPORT_TEMPLATES } from './types';
import { exportUtils } from '../visualization';

export class ReportManager {
  private static instance: ReportManager;
  private reports: Map<string, Report> = new Map();
  private subscriptions: Map<string, ReportSubscription> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ReportManager {
    if (!ReportManager.instance) {
      ReportManager.instance = new ReportManager();
    }
    return ReportManager.instance;
  }

  // ==================== 报表管理 ====================

  /**
   * 创建报表
   */
  public createReport(data: Partial<Report>, userId: string, tenantId: string): Report {
    const now = new Date();
    const report: Report = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name || '未命名报表',
      description: data.description || '',
      type: data.type || 'data',
      status: data.status || 'draft',
      permission: data.permission || 'private',
      category: data.category || 'custom',
      tags: data.tags || [],
      layout: data.layout || { type: 'grid', columns: 24, gap: 16, widgets: [] },
      parameters: data.parameters || [],
      dataConfig: data.dataConfig,
      coverImage: data.coverImage,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      tenantId,
      isFavorite: false,
      viewCount: 0,
      lastViewedAt: undefined,
    };

    this.reports.set(report.id, report);
    return report;
  }

  /**
   * 从模板创建报表
   */
  public createFromTemplate(
    templateId: string,
    userId: string,
    tenantId: string,
    customData?: Partial<Report>
  ): Report | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    return this.createReport(
      {
        name: `${template.name} (副本)`,
        description: template.description,
        type: template.type,
        category: template.category,
        layout: template.layout,
        parameters: template.parameters,
        ...customData,
      },
      userId,
      tenantId
    );
  }

  /**
   * 获取报表
   */
  public getReport(id: string, tenantId: string): Report | null {
    const report = this.reports.get(id);
    if (!report || report.tenantId !== tenantId) return null;

    // 更新浏览次数
    report.viewCount = (report.viewCount || 0) + 1;
    report.lastViewedAt = new Date();

    return report;
  }

  /**
   * 更新报表
   */
  public updateReport(
    id: string,
    data: Partial<Report>,
    userId: string,
    tenantId: string
  ): Report | null {
    const report = this.reports.get(id);
    if (!report || report.tenantId !== tenantId) return null;

    const updated: Report = {
      ...report,
      ...data,
      id: report.id,
      tenantId: report.tenantId,
      version: report.version + 1,
      updatedAt: new Date(),
      updatedBy: userId,
    };

    this.reports.set(id, updated);
    return updated;
  }

  /**
   * 删除报表
   */
  public deleteReport(id: string, tenantId: string): boolean {
    const report = this.reports.get(id);
    if (!report || report.tenantId !== tenantId) return false;

    return this.reports.delete(id);
  }

  /**
   * 查询报表列表
   */
  public queryReports(params: ReportQueryParams, tenantId: string): {
    data: Report[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const {
      page = 1,
      pageSize = 20,
      search,
      type,
      category,
      status,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      isFavorite,
    } = params;

    let reports = Array.from(this.reports.values()).filter(
      r => r.tenantId === tenantId
    );

    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      reports = reports.filter(
        r =>
          r.name.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower) ||
          r.tags?.some(t => t.toLowerCase().includes(searchLower))
      );
    }

    // 类型过滤
    if (type) {
      reports = reports.filter(r => r.type === type);
    }

    // 分类过滤
    if (category) {
      reports = reports.filter(r => r.category === category);
    }

    // 状态过滤
    if (status) {
      reports = reports.filter(r => r.status === status);
    }

    // 收藏过滤
    if (isFavorite !== undefined) {
      reports = reports.filter(r => r.isFavorite === isFavorite);
    }

    // 排序
    reports.sort((a, b) => {
      let aVal: any = a[sortBy as keyof Report];
      let bVal: any = b[sortBy as keyof Report];

      if (sortBy === 'name') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    const total = reports.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const data = reports.slice(start, start + pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 切换收藏状态
   */
  public toggleFavorite(id: string, tenantId: string): boolean {
    const report = this.reports.get(id);
    if (!report || report.tenantId !== tenantId) return false;

    report.isFavorite = !report.isFavorite;
    report.updatedAt = new Date();

    return report.isFavorite;
  }

  // ==================== 报表模板 ====================

  /**
   * 获取所有模板
   */
  public getTemplates(category?: string): ReportTemplate[] {
    let templates = [...BUILTIN_REPORT_TEMPLATES];

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    // 按推荐和排序号排序
    templates.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    return templates;
  }

  /**
   * 获取单个模板
   */
  public getTemplate(id: string): ReportTemplate | null {
    return BUILTIN_REPORT_TEMPLATES.find(t => t.id === id) || null;
  }

  // ==================== 报表导出 ====================

  /**
   * 导出报表
   */
  public exportReport(
    report: Report,
    options: ReportExportOptions
  ): { success: boolean; url?: string; error?: string } {
    try {
      const { format, filename = report.name } = options;

      // 根据格式导出
      switch (format) {
        case 'json': {
          const data = {
            report: {
              id: report.id,
              name: report.name,
              description: report.description,
              type: report.type,
              exportedAt: new Date().toISOString(),
            },
            layout: report.layout,
          };
          exportUtils.downloadFile(
            JSON.stringify(data, null, 2),
            `${filename}.json`,
            'application/json'
          );
          break;
        }
        case 'csv': {
          // 导出表格数据：按表格组件列定义生成 RFC 4180 合规 CSV
          // （含 BOM 以兼容 Excel UTF-8；单元格含 ", \n \r 时加引号转义）
          const tableWidgets = report.layout.widgets.filter(w => w.type === 'table');
          if (tableWidgets.length > 0) {
            exportUtils.downloadFile(
              this.buildTableCsv(tableWidgets),
              `${filename}.csv`,
              'text/csv'
            );
          }
          break;
        }
        default:
          console.log(`Export format ${format} not fully implemented yet`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ==================== 报表订阅 ====================

  /**
   * 创建订阅
   */
  public createSubscription(
    reportId: string,
    data: Partial<ReportSubscription>,
    userId: string,
    tenantId: string
  ): ReportSubscription | null {
    const report = this.reports.get(reportId);
    if (!report || report.tenantId !== tenantId) return null;

    const subscription: ReportSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      reportId,
      userId,
      tenantId,
      frequency: data.frequency || 'weekly',
      format: data.format || 'pdf',
      channels: data.channels || ['email'],
      recipients: data.recipients,
      isEnabled: data.isEnabled ?? true,
      lastSentAt: undefined,
      nextSendAt: this.calculateNextSend(data.frequency || 'weekly'),
      createdAt: new Date(),
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  /**
   * 获取用户的订阅列表
   */
  public getSubscriptions(userId: string, tenantId: string): ReportSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      s => s.userId === userId && s.tenantId === tenantId
    );
  }

  /**
   * 更新订阅
   */
  public updateSubscription(
    id: string,
    data: Partial<ReportSubscription>,
    userId: string,
    tenantId: string
  ): ReportSubscription | null {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.userId !== userId || subscription.tenantId !== tenantId) {
      return null;
    }

    const updated: ReportSubscription = {
      ...subscription,
      ...data,
    };

    // 如果频率改变，重新计算下次发送时间
    if (data.frequency) {
      updated.nextSendAt = this.calculateNextSend(data.frequency);
    }

    this.subscriptions.set(id, updated);
    return updated;
  }

  /**
   * 删除订阅
   */
  public deleteSubscription(id: string, userId: string, tenantId: string): boolean {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.userId !== userId || subscription.tenantId !== tenantId) {
      return false;
    }

    return this.subscriptions.delete(id);
  }

  /**
   * 计算下次发送时间
   */
  private calculateNextSend(frequency: 'daily' | 'weekly' | 'monthly'): Date {
    const next = new Date();

    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
        break;
      case 'weekly':
        next.setDate(next.getDate() + (7 - next.getDay()));
        next.setHours(9, 0, 0, 0);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        next.setHours(9, 0, 0, 0);
        break;
    }

    return next;
  }

  // ==================== 报表数据处理 ====================

  /**
   * 处理报表数据
   */
  public processReportData(report: Report, data: any[]): Report {
    // 这里可以添加数据处理逻辑
    // 比如过滤、聚合、计算等
    return report;
  }

  /**
   * 生成报表预览数据
   */
  public generatePreviewData(report: Report): Report {
    // 生成模拟数据用于预览
    return report;
  }

  // ==================== 内部工具 ====================

  /**
   * 将单元格值按 RFC 4180 转义：含 " , \n \r 时用双引号包裹并将内部 " 双写
   */
  private escapeCsvCell(value: unknown): string {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * 由表格组件列定义生成 CSV 字符串
   * - 行分隔符使用 \r\n（RFC 4180）
   * - 前置 BOM（\uFEFF）以兼容 Excel UTF-8 自动识别
   * - 多个表格组件以空行分隔；组件含 title 时在表头前以 # 注释行标注
   * - 列定义来自 TableConfig.columns 的 title；无列定义的表格组件跳过
   *   （但仍会调用 downloadFile，只要存在 table 类型组件）
   */
  private buildTableCsv(widgets: ReportWidget[]): string {
    const BOM = '\uFEFF';
    const blocks: string[] = [];

    for (const widget of widgets) {
      const columns = (widget.config as TableConfig | undefined)?.columns ?? [];
      if (columns.length === 0) continue;

      const lines: string[] = [];
      if (widget.title) {
        lines.push(`# ${widget.title}`);
      }
      lines.push(columns.map(col => this.escapeCsvCell(col.title)).join(','));
      blocks.push(lines.join('\r\n'));
    }

    // 即使所有表格组件均无列定义，也输出 BOM 以保留“有 table 组件即下载”契约
    return BOM + blocks.join('\r\n\r\n');
  }
}

// 导出单例实例
export const reportManager = ReportManager.getInstance();
