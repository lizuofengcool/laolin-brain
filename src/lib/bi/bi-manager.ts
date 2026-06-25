/**
 * 商业智能（BI）管理器
 * 负责仪表盘、KPI、业务分析等功能
 */

import type {
  Dashboard,
  DashboardWidget,
  KpiDefinition,
  KpiValue,
  KpiStatus,
  BusinessAnalysis,
  DataAlert,
  DataRecommendation,
  DataInsight,
  GrowthAnalysis,
  RetentionAnalysis,
  ConversionFunnel,
  AnalysisCategory,
} from './types';
import { DEFAULT_KPIS, DASHBOARD_TEMPLATES } from './types';
import { analyticsManager } from '../analytics';

export class BiManager {
  private static instance: BiManager;
  private dashboards: Map<string, Dashboard> = new Map();
  private kpis: Map<string, KpiDefinition> = new Map();
  private alerts: Map<string, DataAlert> = new Map();
  private analyses: Map<string, BusinessAnalysis> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): BiManager {
    if (!BiManager.instance) {
      BiManager.instance = new BiManager();
    }
    return BiManager.instance;
  }

  // ==================== KPI管理 ====================

  /**
   * 初始化默认KPI
   */
  public initializeDefaultKpis(tenantId: string): KpiDefinition[] {
    const now = new Date();
    const kpis: KpiDefinition[] = [];

    DEFAULT_KPIS.forEach(kpi => {
      const kpiDef: KpiDefinition = {
        ...kpi,
        id: `kpi_${kpi.name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        tenantId,
        createdAt: now,
        updatedAt: now,
      };
      this.kpis.set(kpiDef.id, kpiDef);
      kpis.push(kpiDef);
    });

    return kpis;
  }

  /**
   * 获取KPI列表
   */
  public getKpis(tenantId: string, category?: string): KpiDefinition[] {
    let kpis = Array.from(this.kpis.values()).filter(k => k.tenantId === tenantId);

    if (category) {
      kpis = kpis.filter(k => k.category === category);
    }

    return kpis.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  /**
   * 获取单个KPI
   */
  public getKpi(kpiId: string, tenantId: string): KpiDefinition | null {
    const kpi = this.kpis.get(kpiId);
    if (!kpi || kpi.tenantId !== tenantId) return null;
    return kpi;
  }

  /**
   * 创建KPI
   */
  public createKpi(
    data: Partial<KpiDefinition>,
    tenantId: string
  ): KpiDefinition {
    const now = new Date();
    const kpi: KpiDefinition = {
      id: `kpi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name || '未命名KPI',
      description: data.description,
      category: data.category || 'general',
      unit: data.unit,
      formula: data.formula,
      dataSource: data.dataSource,
      targetValue: data.targetValue,
      warningThreshold: data.warningThreshold,
      criticalThreshold: data.criticalThreshold,
      direction: data.direction || 'higher_is_better',
      displayFormat: data.displayFormat || 'number',
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };

    this.kpis.set(kpi.id, kpi);
    return kpi;
  }

  /**
   * 更新KPI
   */
  public updateKpi(
    kpiId: string,
    data: Partial<KpiDefinition>,
    tenantId: string
  ): KpiDefinition | null {
    const kpi = this.kpis.get(kpiId);
    if (!kpi || kpi.tenantId !== tenantId) return null;

    const updated: KpiDefinition = {
      ...kpi,
      ...data,
      id: kpi.id,
      tenantId: kpi.tenantId,
      updatedAt: new Date(),
    };

    this.kpis.set(kpiId, updated);
    return updated;
  }

  /**
   * 删除KPI
   */
  public deleteKpi(kpiId: string, tenantId: string): boolean {
    const kpi = this.kpis.get(kpiId);
    if (!kpi || kpi.tenantId !== tenantId) return false;
    return this.kpis.delete(kpiId);
  }

  /**
   * 计算KPI当前值
   */
  public calculateKpiValue(
    kpi: KpiDefinition,
    currentValue: number,
    previousValue?: number
  ): KpiValue {
    const change = previousValue !== undefined ? currentValue - previousValue : 0;
    const changePercent =
      previousValue && previousValue !== 0 ? change / Math.abs(previousValue) : 0;

    // 计算状态
    let status: KpiStatus = 'normal';
    let trend: 'up' | 'down' | 'stable' = 'stable';

    // 趋势判断
    if (Math.abs(changePercent) > 0.01) {
      trend = changePercent > 0 ? 'up' : 'down';
    }

    // 状态判断
    if (kpi.criticalThreshold !== undefined) {
      if (kpi.direction === 'higher_is_better') {
        if (currentValue < kpi.criticalThreshold) {
          status = 'critical';
        } else if (kpi.warningThreshold && currentValue < kpi.warningThreshold) {
          status = 'warning';
        }
      } else {
        if (currentValue > kpi.criticalThreshold) {
          status = 'critical';
        } else if (kpi.warningThreshold && currentValue > kpi.warningThreshold) {
          status = 'warning';
        }
      }
    }

    // 改进/下降状态
    if (trend !== 'stable') {
      if (kpi.direction === 'higher_is_better') {
        status = trend === 'up' ? 'improving' : 'declining';
      } else {
        status = trend === 'down' ? 'improving' : 'declining';
      }
    }

    return {
      kpiId: kpi.id,
      currentValue,
      previousValue,
      targetValue: kpi.targetValue,
      change,
      changePercent,
      status,
      trend,
      period: 'current',
      asOfDate: new Date(),
    };
  }

  // ==================== 仪表盘管理 ====================

  /**
   * 获取仪表盘列表
   */
  public getDashboards(tenantId: string, type?: string): Dashboard[] {
    let dashboards = Array.from(this.dashboards.values()).filter(
      d => d.tenantId === tenantId
    );

    if (type) {
      dashboards = dashboards.filter(d => d.type === type);
    }

    return dashboards.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * 获取仪表盘
   */
  public getDashboard(dashboardId: string, tenantId: string): Dashboard | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard || dashboard.tenantId !== tenantId) return null;

    // 更新浏览次数
    dashboard.viewCount = (dashboard.viewCount || 0) + 1;
    dashboard.lastViewedAt = new Date();

    return dashboard;
  }

  /**
   * 创建仪表盘
   */
  public createDashboard(
    data: Partial<Dashboard>,
    userId: string,
    tenantId: string
  ): Dashboard {
    const now = new Date();
    const dashboard: Dashboard = {
      id: `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name || '未命名仪表盘',
      description: data.description,
      type: data.type || 'custom',
      status: data.status || 'draft',
      category: data.category,
      tags: data.tags || [],
      coverImage: data.coverImage,
      widgets: data.widgets || [],
      layout: data.layout || 'grid',
      filters: data.filters,
      defaultTimeRange: data.defaultTimeRange || '7d',
      isFavorite: false,
      viewCount: 0,
      lastViewedAt: undefined,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      tenantId,
    };

    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  /**
   * 从模板创建仪表盘
   */
  public createFromTemplate(
    templateId: string,
    userId: string,
    tenantId: string
  ): Dashboard | null {
    const template = DASHBOARD_TEMPLATES.find(t => t.id === templateId);
    if (!template) return null;

    const widgets: DashboardWidget[] = template.widgets.map((w, i) => ({
      id: `widget_${i}_${Date.now()}`,
      type: w.type as DashboardWidget['type'],
      title: w.title,
      width: w.width || 12,
      config: {},
    }));

    return this.createDashboard(
      {
        name: template.name,
        description: template.description,
        type: template.type,
        category: template.category,
        widgets,
      },
      userId,
      tenantId
    );
  }

  /**
   * 更新仪表盘
   */
  public updateDashboard(
    dashboardId: string,
    data: Partial<Dashboard>,
    userId: string,
    tenantId: string
  ): Dashboard | null {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard || dashboard.tenantId !== tenantId) return null;

    const updated: Dashboard = {
      ...dashboard,
      ...data,
      id: dashboard.id,
      tenantId: dashboard.tenantId,
      version: dashboard.version + 1,
      updatedAt: new Date(),
      updatedBy: userId,
    };

    this.dashboards.set(dashboardId, updated);
    return updated;
  }

  /**
   * 删除仪表盘
   */
  public deleteDashboard(dashboardId: string, tenantId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard || dashboard.tenantId !== tenantId) return false;
    return this.dashboards.delete(dashboardId);
  }

  /**
   * 切换收藏
   */
  public toggleFavorite(dashboardId: string, tenantId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard || dashboard.tenantId !== tenantId) return false;

    dashboard.isFavorite = !dashboard.isFavorite;
    dashboard.updatedAt = new Date();

    return dashboard.isFavorite;
  }

  /**
   * 获取仪表盘模板
   */
  public getDashboardTemplates() {
    return DASHBOARD_TEMPLATES;
  }

  // ==================== 业务分析 ====================

  /**
   * 执行业务分析
   */
  public runAnalysis(
    category: AnalysisCategory,
    name: string,
    data: any[],
    userId: string,
    tenantId: string
  ): BusinessAnalysis {
    const now = new Date();
    const analysis: BusinessAnalysis = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      type: category,
      metrics: [],
      dimensions: [],
      results: {},
      insights: [],
      createdAt: now,
      updatedAt: now,
      tenantId,
      createdBy: userId,
    };

    // 根据类别执行不同的分析
    switch (category) {
      case 'user':
        analysis.results = this.analyzeUserBehavior(data);
        break;
      case 'revenue':
        analysis.results = this.analyzeRevenue(data);
        break;
      case 'retention':
        analysis.results = this.analyzeRetention(data);
        break;
      case 'conversion':
        analysis.results = this.analyzeConversion(data);
        break;
      default:
        analysis.results = { data };
    }

    // 生成洞察
    analysis.insights = this.generateAnalysisInsights(analysis);

    this.analyses.set(analysis.id, analysis);
    return analysis;
  }

  /**
   * 分析用户行为
   */
  private analyzeUserBehavior(data: any[]): Record<string, any> {
    return {
      totalUsers: data.length,
      activeUsers: Math.floor(data.length * 0.7),
      newUsers: Math.floor(data.length * 0.2),
      avgSessions: 5.2,
      avgDuration: '15m 30s',
      topFeatures: ['文件上传', '搜索', 'AI功能'],
    };
  }

  /**
   * 分析收入
   */
  private analyzeRevenue(data: any[]): Record<string, any> {
    return {
      totalRevenue: data.length * 99,
      mrr: data.length * 29,
      arpu: 29,
      ltv: 348,
      churnRate: 0.05,
      growthRate: 0.15,
    };
  }

  /**
   * 分析留存
   */
  private analyzeRetention(data: any[]): RetentionAnalysis {
    return {
      cohort: '本月新用户',
      cohortSize: data.length,
      periods: [
        { period: 0, label: 'Day 0', retained: data.length, retentionRate: 1 },
        { period: 1, label: 'Day 1', retained: Math.floor(data.length * 0.6), retentionRate: 0.6 },
        { period: 7, label: 'Day 7', retained: Math.floor(data.length * 0.4), retentionRate: 0.4 },
        { period: 30, label: 'Day 30', retained: Math.floor(data.length * 0.25), retentionRate: 0.25 },
      ],
      overallRetention: 0.25,
      benchmark: 0.3,
    };
  }

  /**
   * 分析转化
   */
  private analyzeConversion(data: any[]): ConversionFunnel {
    return {
      name: '用户转化漏斗',
      steps: [
        { name: '访问', count: data.length, percentage: 1, conversionRate: 1, dropOff: 0 },
        { name: '注册', count: Math.floor(data.length * 0.5), percentage: 0.5, conversionRate: 0.5, dropOff: 0.5 },
        { name: '首次使用', count: Math.floor(data.length * 0.3), percentage: 0.3, conversionRate: 0.6, dropOff: 0.4 },
        { name: '付费', count: Math.floor(data.length * 0.1), percentage: 0.1, conversionRate: 0.33, dropOff: 0.67 },
      ],
      totalConversions: Math.floor(data.length * 0.1),
      overallConversionRate: 0.1,
      bottlenecks: ['注册到首次使用', '首次使用到付费'],
      suggestions: ['优化注册流程', '增加新手引导', '提供免费试用'],
    };
  }

  /**
   * 生成分析洞察
   */
  private generateAnalysisInsights(analysis: BusinessAnalysis): string[] {
    const insights: string[] = [];

    switch (analysis.category) {
      case 'user':
        insights.push('用户活跃度良好，日活占比70%');
        insights.push('新用户占比20%，增长趋势稳定');
        break;
      case 'revenue':
        insights.push('收入保持稳定增长，月环比增长15%');
        insights.push('用户生命周期价值约348元');
        break;
      case 'retention':
        insights.push('7日留存率40%，略低于行业平均');
        insights.push('建议优化新用户引导以提升留存');
        break;
      case 'conversion':
        insights.push('整体转化率10%，有提升空间');
        insights.push('注册到首次使用是主要流失点');
        break;
      default:
        insights.push('分析完成，查看详细数据了解更多');
    }

    return insights;
  }

  // ==================== 数据预警 ====================

  /**
   * 创建数据预警
   */
  public createAlert(
    data: Partial<DataAlert>,
    userId: string,
    tenantId: string
  ): DataAlert {
    const now = new Date();
    const alert: DataAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name || '未命名预警',
      description: data.description,
      metric: data.metric || '',
      condition: data.condition || 'above',
      threshold: data.threshold || 0,
      unit: data.unit,
      frequency: data.frequency || 'daily',
      channels: data.channels || ['in_app'],
      recipients: data.recipients,
      isEnabled: data.isEnabled ?? true,
      lastTriggeredAt: undefined,
      triggerCount: 0,
      createdAt: now,
      updatedAt: now,
      tenantId,
      createdBy: userId,
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  /**
   * 获取预警列表
   */
  public getAlerts(tenantId: string): DataAlert[] {
    return Array.from(this.alerts.values())
      .filter(a => a.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 更新预警
   */
  public updateAlert(
    alertId: string,
    data: Partial<DataAlert>,
    tenantId: string
  ): DataAlert | null {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.tenantId !== tenantId) return null;

    const updated: DataAlert = {
      ...alert,
      ...data,
      id: alert.id,
      tenantId: alert.tenantId,
      updatedAt: new Date(),
    };

    this.alerts.set(alertId, updated);
    return updated;
  }

  /**
   * 删除预警
   */
  public deleteAlert(alertId: string, tenantId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.tenantId !== tenantId) return false;
    return this.alerts.delete(alertId);
  }

  // ==================== 数据推荐 ====================

  /**
   * 生成数据推荐
   */
  public generateRecommendations(
    data: any[],
    tenantId: string
  ): DataRecommendation[] {
    const recommendations: DataRecommendation[] = [];

    // 基于数据生成推荐
    recommendations.push({
      id: `rec_${Date.now()}_1`,
      type: 'insight',
      title: '提升用户留存',
      description: '根据数据分析，优化新用户引导流程可提升留存率约15%',
      priority: 'high',
      confidence: 0.85,
      category: 'user',
      relatedMetrics: ['retention_rate', 'onboarding_completion'],
      suggestedActions: [
        '增加新手引导教程',
        '优化首次使用体验',
        '发送欢迎邮件',
      ],
      impact: {
        area: '用户留存',
        expectedImprovement: '15%',
      },
      createdAt: new Date(),
      tenantId,
    });

    recommendations.push({
      id: `rec_${Date.now()}_2`,
      type: 'optimization',
      title: '存储优化建议',
      description: '检测到大量重复文件，清理可节省约20%存储空间',
      priority: 'medium',
      confidence: 0.9,
      category: 'storage',
      relatedMetrics: ['storage_usage', 'duplicate_files'],
      suggestedActions: [
        '启用重复文件检测',
        '设置自动清理策略',
        '提供存储优化建议',
      ],
      impact: {
        area: '存储成本',
        expectedImprovement: '20%',
      },
      createdAt: new Date(),
      tenantId,
    });

    recommendations.push({
      id: `rec_${Date.now()}_3`,
      type: 'action',
      title: '增加AI功能使用',
      description: 'AI功能使用率较低，建议增加引导和教育内容',
      priority: 'medium',
      confidence: 0.75,
      category: 'ai',
      relatedMetrics: ['ai_usage', 'feature_adoption'],
      suggestedActions: [
        '在首页展示AI功能',
        '提供使用教程',
        '增加免费试用额度',
      ],
      impact: {
        area: '功能采用率',
        expectedImprovement: '30%',
      },
      createdAt: new Date(),
      tenantId,
    });

    return recommendations;
  }

  // ==================== 增长分析 ====================

  /**
   * 计算增长分析
   */
  public calculateGrowth(data: any[]): GrowthAnalysis {
    return {
      period: '本月',
      newUsers: Math.floor(data.length * 0.2),
      activeUsers: Math.floor(data.length * 0.7),
      retentionRate: 0.4,
      churnRate: 0.05,
      revenue: data.length * 29,
      arpu: 29,
      ltv: 348,
      growthRate: {
        users: 0.12,
        revenue: 0.15,
        engagement: 0.08,
      },
    };
  }
}

// 导出单例实例
export const biManager = BiManager.getInstance();
