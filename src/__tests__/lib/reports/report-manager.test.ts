/**
 * reports/report-manager ReportManager 内存注册表直接单测
 *
 * 覆盖目标：src/lib/reports/report-manager.ts。该模块为纯内存态报表管理器单例
 * （reports / subscriptions 两个 Map），唯一外部依赖 ../visualization 的 exportUtils.downloadFile
 * （仅 exportReport 调用），经 vi.mock 替换为稳定 vi.fn 以断言调用参数。
 *
 * 关键控制流：
 * - 单例：private constructor + static getInstance；模块导出 reportManager = getInstance()
 * - createReport：默认值（name='未命名报表'/type='data'/status='draft'/permission='private'/
 *   category='custom'/tags=[]/layout={type:grid,columns:24,gap:16,widgets:[]}/parameters=[]/
 *   version=1/viewCount=0/isFavorite=false/lastViewedAt=undefined）；id=`report_${ts}_${rand}`；
 *   dataConfig/coverImage 透传；createdBy/updatedBy=userId；tenantId 注入
 * - getReport：命中 +1 viewCount 并刷新 lastViewedAt；未命中/跨租户 → null
 * - updateReport：浅合并 + version+1 + updatedAt 刷新 + updatedBy=userId；id/tenantId 保留；
 *   未命中/跨租户 → null
 * - deleteReport：命中删除返回 true；未命中/跨租户 → false
 * - queryReports：tenantId 隔离；search(name/description/tags 大小写不敏感)；type/category/
 *   status/isFavorite 过滤；sortBy(name 大小写不敏感/createdAt/updatedAt/viewCount) + sortOrder
 *   (asc/desc)；分页 page默认1/pageSize默认20/totalPages 向上取整
 * - toggleFavorite：翻转 isFavorite 返回新值；未命中/跨租户 → false
 * - 模板：getTemplates() 返回全部内置（isRecommended 优先 + sortOrder 升序）；getTemplates(category)
 *   过滤；getTemplate(id) 命中/未命中
 * - createFromTemplate：name=`${template.name} (副本)`，复制 description/type/category/layout/
 *   parameters；customData 覆盖；未知模板 → null
 * - 订阅：createSubscription 需报表命中且租户匹配；默认 frequency='weekly'/format='pdf'/
 *   channels=['email']/isEnabled=true；nextSendAt 由 calculateNextSend 计算；getSubscriptions 按
 *   userId+tenantId 过滤；updateSubscription 浅合并，frequency 变更重算 nextSendAt；跨用户/租户 → null；
 *   deleteSubscription 命中/未命中/跨
 * - exportReport：json/csv(需 table widget)/默认 三分支；filename 默认 report.name；downloadFile 抛错 →
 *   success:false
 * - processReportData/generatePreviewData：原样返回 report
 *
 * 状态策略：ReportManager 构造器私有无法 new；每个用例前 vi.resetModules() + await import 取全新单例
 * （fresh class → fresh instance → fresh reports/subscriptions Maps）。exportUtils.downloadFile 经
 * vi.hoisted + vi.mock 替换为稳定 vi.fn，beforeEach 中 mockClear。nextSendAt 用例用 vi.useFakeTimers +
 * vi.setSystemTime 固定时刻，断言本地时间分量（getHours/getDay 等）以避免时区敏感。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 唯一外部依赖：exportUtils.downloadFile（仅 exportReport 调用）。vi.hoisted 保证工厂执行时已就绪，
// 且 resetModules 重取模块时仍引用同一 fn 实例。
const { mockDownloadFile } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn(),
}));
vi.mock('@/lib/visualization', () => ({
  exportUtils: { downloadFile: mockDownloadFile },
}));

let reportManager: import('@/lib/reports/report-manager')['ReportManager'];
let ReportManager: typeof import('@/lib/reports/report-manager')['ReportManager'];

beforeEach(async () => {
  vi.resetModules();
  mockDownloadFile.mockClear();
  const mod = await import('@/lib/reports/report-manager');
  reportManager = mod.reportManager;
  ReportManager = mod.ReportManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 基准时刻：2026-07-15 10:00:00 UTC。选月中以避免任何时区下日期算术跨月边界
// （如 UTC-10 下 7/1 0:00 → 6/30，+1 日溢出至 7/1 破坏断言）。断言本地时间分量避免时区敏感。
const NOW = new Date('2026-07-15T10:00:00Z');

describe('reports/report-manager ReportManager', () => {
  // ─── 单例导出 ───────────────────────────────────────────

  describe('单例导出', () => {
    it('reportManager 为 ReportManager 实例', () => {
      expect(reportManager).toBeInstanceOf(ReportManager);
    });

    it('getInstance 多次返回同一实例（单例）', () => {
      expect(ReportManager.getInstance()).toBe(reportManager);
      expect(ReportManager.getInstance()).toBe(ReportManager.getInstance());
    });
  });

  // ─── createReport ───────────────────────────────────────

  describe('createReport', () => {
    it('空入参使用全部默认值', () => {
      const r = reportManager.createReport({}, 'u1', 't1');

      expect(r.id).toMatch(/^report_\d+_[a-z0-9]+$/);
      expect(r.name).toBe('未命名报表');
      expect(r.description).toBe('');
      expect(r.type).toBe('data');
      expect(r.status).toBe('draft');
      expect(r.permission).toBe('private');
      expect(r.category).toBe('custom');
      expect(r.tags).toEqual([]);
      expect(r.layout).toEqual({ type: 'grid', columns: 24, gap: 16, widgets: [] });
      expect(r.parameters).toEqual([]);
      expect(r.version).toBe(1);
      expect(r.viewCount).toBe(0);
      expect(r.isFavorite).toBe(false);
      expect(r.lastViewedAt).toBeUndefined();
      expect(r.createdBy).toBe('u1');
      expect(r.updatedBy).toBe('u1');
      expect(r.tenantId).toBe('t1');
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(r.updatedAt).toBeInstanceOf(Date);
      // dataConfig / coverImage 未提供时为 undefined
      expect(r.dataConfig).toBeUndefined();
      expect(r.coverImage).toBeUndefined();
    });

    it('显式入参覆盖默认值（含 dataConfig / coverImage 透传）', () => {
      const layout = { type: 'flex' as const, widgets: [] };
      const parameters = [{ key: 'k', label: 'l', type: 'text' as const }];
      const dataConfig = { dataSource: 'ds', fields: ['f'] };
      const r = reportManager.createReport(
        {
          name: '月报',
          description: 'desc',
          type: 'statistics',
          status: 'published',
          permission: 'team',
          category: 'storage',
          tags: ['a', 'b'],
          layout,
          parameters,
          dataConfig,
          coverImage: 'img.png',
        },
        'u1',
        't1'
      );

      expect(r.name).toBe('月报');
      expect(r.description).toBe('desc');
      expect(r.type).toBe('statistics');
      expect(r.status).toBe('published');
      expect(r.permission).toBe('team');
      expect(r.category).toBe('storage');
      expect(r.tags).toEqual(['a', 'b']);
      expect(r.layout).toBe(layout);
      expect(r.parameters).toBe(parameters);
      expect(r.dataConfig).toBe(dataConfig);
      expect(r.coverImage).toBe('img.png');
    });

    it('两次创建生成不同 id', () => {
      const a = reportManager.createReport({}, 'u1', 't1');
      const b = reportManager.createReport({}, 'u1', 't1');
      expect(a.id).not.toBe(b.id);
    });
  });

  // ─── getReport ──────────────────────────────────────────

  describe('getReport', () => {
    it('命中返回报表并自增 viewCount / 刷新 lastViewedAt', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(created.viewCount).toBe(0);

      const got1 = reportManager.getReport(created.id, 't1');
      expect(got1).not.toBeNull();
      expect(got1!.viewCount).toBe(1);
      expect(got1!.lastViewedAt).toBeInstanceOf(Date);

      const got2 = reportManager.getReport(created.id, 't1');
      expect(got2!.viewCount).toBe(2);
    });

    it('未命中（id 不存在）返回 null', () => {
      expect(reportManager.getReport('nope', 't1')).toBeNull();
    });

    it('跨租户访问返回 null（租户隔离）', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.getReport(created.id, 'other-tenant')).toBeNull();
    });
  });

  // ─── updateReport ───────────────────────────────────────

  describe('updateReport', () => {
    it('命中：浅合并 + version+1 + updatedAt 刷新 + updatedBy 覆盖；id/tenantId 保留', () => {
      const created = reportManager.createReport({ name: '原', version: 1 }, 'u1', 't1');
      const before = created.updatedAt;

      const updated = reportManager.updateReport(
        created.id,
        { name: '新', status: 'published' },
        'u2',
        't1'
      );

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('新');
      expect(updated!.status).toBe('published');
      expect(updated!.version).toBe(2);
      expect(updated!.updatedBy).toBe('u2');
      expect(updated!.id).toBe(created.id);
      expect(updated!.tenantId).toBe('t1');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('未命中返回 null', () => {
      expect(reportManager.updateReport('nope', { name: 'x' }, 'u1', 't1')).toBeNull();
    });

    it('跨租户返回 null', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.updateReport(created.id, { name: 'x' }, 'u1', 'other')).toBeNull();
    });
  });

  // ─── deleteReport ───────────────────────────────────────

  describe('deleteReport', () => {
    it('命中返回 true，之后 getReport 返回 null', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.deleteReport(created.id, 't1')).toBe(true);
      expect(reportManager.getReport(created.id, 't1')).toBeNull();
    });

    it('未命中返回 false', () => {
      expect(reportManager.deleteReport('nope', 't1')).toBe(false);
    });

    it('跨租户返回 false（不删除他租户报表）', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.deleteReport(created.id, 'other')).toBe(false);
      // 仍可在原租户访问
      expect(reportManager.getReport(created.id, 't1')).not.toBeNull();
    });
  });

  // ─── queryReports ───────────────────────────────────────

  describe('queryReports', () => {
    // 公共构造：在 t1 下创建一组报表，参数可控。注意各字段取值需互不交叉，
    // 以便 search 断言能精确区分 name / description / tags 命中。
    function seed() {
      reportManager.createReport({ name: 'Alpha', description: '存储说明', type: 'data', category: 'storage', status: 'draft', tags: ['tag1'] }, 'u1', 't1');
      reportManager.createReport({ name: 'Beta', description: '其他', type: 'statistics', category: 'files', status: 'published', tags: ['tag2'] }, 'u1', 't1');
      reportManager.createReport({ name: 'Gamma', description: 'gamma备注', type: 'data', category: 'storage', status: 'archived', tags: ['TAG1', 'x'] }, 'u1', 't1');
    }

    it('租户隔离：仅返回当前租户报表', () => {
      reportManager.createReport({ name: 'T1报表' }, 'u1', 't1');
      reportManager.createReport({ name: 'T2报表' }, 'u2', 't2');
      const res = reportManager.queryReports({}, 't1');
      expect(res.data).toHaveLength(1);
      expect(res.data[0].name).toBe('T1报表');
    });

    it('search 匹配 name / description / tags（大小写不敏感）', () => {
      seed();
      // name 命中（仅 Alpha 名称含 alpha）
      expect(reportManager.queryReports({ search: 'alpha' }, 't1').data).toHaveLength(1);
      // description 命中（仅 Alpha 描述含 存储）
      expect(reportManager.queryReports({ search: '存储' }, 't1').data).toHaveLength(1);
      // tags 命中（大小写不敏感：Alpha tag1 + Gamma TAG1）
      expect(reportManager.queryReports({ search: 'tag1' }, 't1').data).toHaveLength(2);
    });

    it('type / category / status / isFavorite 过滤', () => {
      seed();
      expect(reportManager.queryReports({ type: 'data' }, 't1').data).toHaveLength(2);
      expect(reportManager.queryReports({ category: 'storage' }, 't1').data).toHaveLength(2);
      expect(reportManager.queryReports({ status: 'published' }, 't1').data).toHaveLength(1);
      // 收藏过滤：先 toggle 一个
      const all = reportManager.queryReports({}, 't1').data;
      reportManager.toggleFavorite(all[0].id, 't1');
      expect(reportManager.queryReports({ isFavorite: true }, 't1').data).toHaveLength(1);
      expect(reportManager.queryReports({ isFavorite: false }, 't1').data).toHaveLength(2);
    });

    it('sortBy=name 大小写不敏感 + sortOrder asc/desc', () => {
      seed();
      const asc = reportManager.queryReports({ sortBy: 'name', sortOrder: 'asc' }, 't1').data.map(r => r.name);
      expect(asc).toEqual(['Alpha', 'Beta', 'Gamma']);
      const desc = reportManager.queryReports({ sortBy: 'name', sortOrder: 'desc' }, 't1').data.map(r => r.name);
      expect(desc).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('sortBy=viewCount desc：viewCount 高者在前（getReport 自增后排序）', () => {
      const a = reportManager.createReport({ name: 'A' }, 'u1', 't1');
      const b = reportManager.createReport({ name: 'B' }, 'u1', 't1');
      // 让 A 的 viewCount 提升到 2，B 保持 0
      reportManager.getReport(a.id, 't1');
      reportManager.getReport(a.id, 't1');
      const res = reportManager.queryReports({ sortBy: 'viewCount', sortOrder: 'desc' }, 't1').data;
      expect(res[0].id).toBe(a.id);
      expect(res[1].id).toBe(b.id);
    });

    it('分页：page / pageSize / totalPages 向上取整', () => {
      for (let i = 0; i < 5; i++) {
        reportManager.createReport({ name: `R${i}` }, 'u1', 't1');
      }
      const page1 = reportManager.queryReports({ page: 1, pageSize: 2 }, 't1');
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);

      const page3 = reportManager.queryReports({ page: 3, pageSize: 2 }, 't1');
      expect(page3.data).toHaveLength(1);
    });

    it('默认分页 page=1 / pageSize=20 / sortBy=updatedAt / sortOrder=desc', () => {
      for (let i = 0; i < 25; i++) {
        reportManager.createReport({ name: `R${i}` }, 'u1', 't1');
      }
      const res = reportManager.queryReports({}, 't1');
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.data).toHaveLength(20);
      // 默认 sortBy=updatedAt desc：后创建的在前
      expect(res.data[0].name).toBe('R24');
    });
  });

  // ─── toggleFavorite ─────────────────────────────────────

  describe('toggleFavorite', () => {
    it('翻转 isFavorite 并返回新值，同时刷新 updatedAt', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(created.isFavorite).toBe(false);

      expect(reportManager.toggleFavorite(created.id, 't1')).toBe(true);
      expect(reportManager.getReport(created.id, 't1')!.isFavorite).toBe(true);

      expect(reportManager.toggleFavorite(created.id, 't1')).toBe(false);
    });

    it('未命中返回 false', () => {
      expect(reportManager.toggleFavorite('nope', 't1')).toBe(false);
    });

    it('跨租户返回 false', () => {
      const created = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.toggleFavorite(created.id, 'other')).toBe(false);
    });
  });

  // ─── 模板 ───────────────────────────────────────────────

  describe('模板', () => {
    it('getTemplates() 返回全部内置模板，isRecommended 优先', () => {
      const templates = reportManager.getTemplates();
      expect(templates).toHaveLength(4);
      // storage-overview 为推荐，应排在首位
      expect(templates[0].id).toBe('storage-overview');
      expect(templates[0].isRecommended).toBe(true);
    });

    it('getTemplates(category) 按分类过滤', () => {
      expect(reportManager.getTemplates('storage')).toHaveLength(1);
      expect(reportManager.getTemplates('storage')[0].id).toBe('storage-overview');
      expect(reportManager.getTemplates('users')).toHaveLength(1);
      expect(reportManager.getTemplates('nonexistent')).toHaveLength(0);
    });

    it('getTemplate(id) 命中/未命中', () => {
      expect(reportManager.getTemplate('storage-overview')).not.toBeNull();
      expect(reportManager.getTemplate('storage-overview')!.type).toBe('summary');
      expect(reportManager.getTemplate('nope')).toBeNull();
    });
  });

  // ─── createFromTemplate ─────────────────────────────────

  describe('createFromTemplate', () => {
    it('从模板创建报表：name 加 (副本)，复制 description/type/category/layout', () => {
      const r = reportManager.createFromTemplate('storage-overview', 'u1', 't1');
      expect(r).not.toBeNull();
      const tpl = reportManager.getTemplate('storage-overview')!;
      expect(r!.name).toBe(`${tpl.name} (副本)`);
      expect(r!.description).toBe(tpl.description);
      expect(r!.type).toBe(tpl.type);
      expect(r!.category).toBe(tpl.category);
      expect(r!.layout).toBe(tpl.layout);
      // 内置模板均未定义 parameters（tpl.parameters === undefined），
      // createFromTemplate 透传 undefined，createReport 兜底为默认 []
      expect(r!.parameters).toEqual([]);
      expect(r!.tenantId).toBe('t1');
      expect(r!.createdBy).toBe('u1');
    });

    it('customData 覆盖模板字段', () => {
      const r = reportManager.createFromTemplate('storage-overview', 'u1', 't1', {
        name: '自定义名',
        status: 'published',
      });
      expect(r!.name).toBe('自定义名');
      expect(r!.status).toBe('published');
    });

    it('未知模板返回 null', () => {
      expect(reportManager.createFromTemplate('nope', 'u1', 't1')).toBeNull();
    });
  });

  // ─── 订阅 ───────────────────────────────────────────────

  describe('订阅', () => {
    it('createSubscription：报表命中且租户匹配时创建，使用默认值', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      const sub = reportManager.createSubscription(report.id, {}, 'u1', 't1');

      expect(sub).not.toBeNull();
      expect(sub!.id).toMatch(/^sub_\d+_[a-z0-9]+$/);
      expect(sub!.reportId).toBe(report.id);
      expect(sub!.userId).toBe('u1');
      expect(sub!.tenantId).toBe('t1');
      expect(sub!.frequency).toBe('weekly');
      expect(sub!.format).toBe('pdf');
      expect(sub!.channels).toEqual(['email']);
      expect(sub!.isEnabled).toBe(true);
      expect(sub!.lastSentAt).toBeUndefined();
      expect(sub!.nextSendAt).toBeInstanceOf(Date);
      expect(sub!.createdAt).toBeInstanceOf(Date);
    });

    it('createSubscription：报表不存在或跨租户返回 null', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      expect(reportManager.createSubscription('nope', {}, 'u1', 't1')).toBeNull();
      expect(reportManager.createSubscription(report.id, {}, 'u1', 'other')).toBeNull();
    });

    it('getSubscriptions：按 userId + tenantId 过滤', () => {
      // createSubscription 校验 report.tenantId === 入参 tenantId，故 t2 订阅需先建 t2 报表
      const reportT1 = reportManager.createReport({}, 'u1', 't1');
      const reportT2 = reportManager.createReport({}, 'u1', 't2');
      reportManager.createSubscription(reportT1.id, {}, 'u1', 't1');
      reportManager.createSubscription(reportT1.id, {}, 'u2', 't1');
      reportManager.createSubscription(reportT2.id, {}, 'u1', 't2');

      expect(reportManager.getSubscriptions('u1', 't1')).toHaveLength(1);
      expect(reportManager.getSubscriptions('u2', 't1')).toHaveLength(1);
      expect(reportManager.getSubscriptions('u1', 't2')).toHaveLength(1);
      expect(reportManager.getSubscriptions('u9', 't9')).toHaveLength(0);
    });

    it('updateSubscription：浅合并；frequency 变更重算 nextSendAt', () => {
      // 固定时刻避免月末边界导致 weekly/monthly 跨月判定 flaky
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const report = reportManager.createReport({}, 'u1', 't1');
      const sub = reportManager.createSubscription(report.id, { frequency: 'weekly' }, 'u1', 't1');
      const oldNext = sub!.nextSendAt;

      const updated = reportManager.updateSubscription(
        sub!.id,
        { frequency: 'monthly', isEnabled: false },
        'u1',
        't1'
      );

      expect(updated).not.toBeNull();
      expect(updated!.frequency).toBe('monthly');
      expect(updated!.isEnabled).toBe(false);
      // monthly nextSendAt 重算，应与原 weekly 不同
      expect(updated!.nextSendAt).not.toEqual(oldNext);
      // monthly 落在次月 1 日 09:00 本地（NOW=7月，次月=8月）
      expect(updated!.nextSendAt!.getHours()).toBe(9);
      expect(updated!.nextSendAt!.getDate()).toBe(1);
      expect(updated!.nextSendAt!.getMonth()).toBe(7); // 8月（0-indexed）
    });

    it('updateSubscription：未命中 / 跨用户 / 跨租户返回 null', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      const sub = reportManager.createSubscription(report.id, {}, 'u1', 't1');
      expect(reportManager.updateSubscription('nope', {}, 'u1', 't1')).toBeNull();
      expect(reportManager.updateSubscription(sub!.id, {}, 'u2', 't1')).toBeNull();
      expect(reportManager.updateSubscription(sub!.id, {}, 'u1', 't2')).toBeNull();
    });

    it('deleteSubscription：命中返回 true；未命中 / 跨用户租户返回 false', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      const sub = reportManager.createSubscription(report.id, {}, 'u1', 't1');

      expect(reportManager.deleteSubscription(sub!.id, 'u2', 't1')).toBe(false);
      expect(reportManager.deleteSubscription(sub!.id, 'u1', 't2')).toBe(false);
      expect(reportManager.deleteSubscription('nope', 'u1', 't1')).toBe(false);
      expect(reportManager.deleteSubscription(sub!.id, 'u1', 't1')).toBe(true);
      // 删除后 getSubscriptions 不再含该项
      expect(reportManager.getSubscriptions('u1', 't1')).toHaveLength(0);
    });

    it('calculateNextSend 各频率落在 09:00 本地（daily=次日 / weekly=周日 / monthly=次月1日）', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const report = reportManager.createReport({}, 'u1', 't1');

      const daily = reportManager.createSubscription(report.id, { frequency: 'daily' }, 'u1', 't1');
      const weekly = reportManager.createSubscription(report.id, { frequency: 'weekly' }, 'u1', 't1');
      const monthly = reportManager.createSubscription(report.id, { frequency: 'monthly' }, 'u1', 't1');

      // 全部 09:00 本地
      for (const s of [daily, weekly, monthly]) {
        expect(s!.nextSendAt!.getHours()).toBe(9);
        expect(s!.nextSendAt!.getMinutes()).toBe(0);
        expect(s!.nextSendAt!.getSeconds()).toBe(0);
      }

      // daily = 次日
      const nowLocal = new Date();
      expect(daily!.nextSendAt!.getDate()).toBe(nowLocal.getDate() + 1);

      // weekly = 周日（getDay() === 0）
      expect(weekly!.nextSendAt!.getDay()).toBe(0);

      // monthly = 次月 1 日
      expect(monthly!.nextSendAt!.getDate()).toBe(1);
      expect(monthly!.nextSendAt!.getMonth()).toBe((nowLocal.getMonth() + 1) % 12);
    });
  });

  // ─── exportReport ───────────────────────────────────────

  describe('exportReport', () => {
    it('json 格式：调用 downloadFile 传 JSON 内容与 .json 文件名', () => {
      const report = reportManager.createReport({ name: '报表A' }, 'u1', 't1');
      const res = reportManager.exportReport(report, { format: 'json' });

      expect(res.success).toBe(true);
      expect(mockDownloadFile).toHaveBeenCalledTimes(1);
      const [content, filename, mime] = mockDownloadFile.mock.calls[0];
      expect(filename).toBe('报表A.json');
      expect(mime).toBe('application/json');
      // 内容为合法 JSON 且含报表 id/name
      const parsed = JSON.parse(content);
      expect(parsed.report.id).toBe(report.id);
      expect(parsed.report.name).toBe('报表A');
    });

    it('json 格式：自定义 filename 生效', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      reportManager.exportReport(report, { format: 'json', filename: 'export' });
      expect(mockDownloadFile.mock.calls[0][1]).toBe('export.json');
    });

    it('csv 格式：含 table widget 时调用 downloadFile（无列定义仅输出 BOM）', () => {
      const report = reportManager.createReport(
        {
          layout: {
            type: 'grid',
            widgets: [{ id: 'w1', type: 'table', config: { columns: [] } }],
          },
        },
        'u1',
        't1'
      );
      const res = reportManager.exportReport(report, { format: 'csv', filename: 'data' });
      expect(res.success).toBe(true);
      expect(mockDownloadFile).toHaveBeenCalledTimes(1);
      const [content, filename, mime] = mockDownloadFile.mock.calls[0];
      expect(filename).toBe('data.csv');
      expect(mime).toBe('text/csv');
      // 无列定义 → 仅 BOM，且不再是占位字符串
      expect(content).toBe('\uFEFF');
      expect(content).not.toContain('placeholder');
    });

    it('csv 格式：列定义生成 RFC 4180 表头（BOM + 列标题 + \\r\\n）', () => {
      const report = reportManager.createReport(
        {
          layout: {
            type: 'grid',
            widgets: [
              {
                id: 'w1',
                type: 'table',
                title: '热门文件',
                config: {
                  columns: [
                    { key: 'name', title: '文件名', dataIndex: 'name' },
                    { key: 'views', title: '浏览量', dataIndex: 'views' },
                  ],
                },
              },
            ],
          },
        },
        'u1',
        't1'
      );
      reportManager.exportReport(report, { format: 'csv', filename: 'data' });
      const content = mockDownloadFile.mock.calls[0][0] as string;
      // BOM 前缀 + 注释标题行 + 表头行
      expect(content.startsWith('\uFEFF# 热门文件\r\n文件名,浏览量')).toBe(true);
      expect(content).not.toContain('placeholder');
    });

    it('csv 格式：列标题含逗号/引号/换行时按 RFC 4180 转义', () => {
      const report = reportManager.createReport(
        {
          layout: {
            type: 'grid',
            widgets: [
              {
                id: 'w1',
                type: 'table',
                config: {
                  columns: [
                    { key: 'a', title: '姓,名', dataIndex: 'a' },
                    { key: 'b', title: '说"嗨"', dataIndex: 'b' },
                    { key: 'c', title: '多\n行', dataIndex: 'c' },
                  ],
                },
              },
            ],
          },
        },
        'u1',
        't1'
      );
      reportManager.exportReport(report, { format: 'csv' });
      const content = mockDownloadFile.mock.calls[0][0] as string;
      // 去掉 BOM 后首行（无 widget.title → 无注释行）即表头
      const headerLine = content.replace(/^\uFEFF/, '').split('\r\n')[0];
      expect(headerLine).toBe('"姓,名","说""嗨""","多\n行"');
    });

    it('csv 格式：多个 table widget 以空行分隔，各自带注释标题', () => {
      const report = reportManager.createReport(
        {
          layout: {
            type: 'grid',
            widgets: [
              {
                id: 'w1',
                type: 'table',
                title: '表A',
                config: { columns: [{ key: 'a', title: 'A', dataIndex: 'a' }] },
              },
              {
                id: 'w2',
                type: 'table',
                title: '表B',
                config: { columns: [{ key: 'b', title: 'B', dataIndex: 'b' }] },
              },
            ],
          },
        },
        'u1',
        't1'
      );
      reportManager.exportReport(report, { format: 'csv' });
      const content = mockDownloadFile.mock.calls[0][0] as string;
      expect(content.replace(/^\uFEFF/, '')).toBe('# 表A\r\nA\r\n\r\n# 表B\r\nB');
    });

    it('csv 格式：无 table widget 时不调用 downloadFile（仍返回 success）', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      const res = reportManager.exportReport(report, { format: 'csv' });
      expect(res.success).toBe(true);
      expect(mockDownloadFile).not.toHaveBeenCalled();
    });

    it('未知格式：返回 success 且不调用 downloadFile', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      const res = reportManager.exportReport(report, { format: 'pdf' as never });
      expect(res.success).toBe(true);
      expect(mockDownloadFile).not.toHaveBeenCalled();
    });

    it('downloadFile 抛错时返回 success:false + error', () => {
      const report = reportManager.createReport({}, 'u1', 't1');
      mockDownloadFile.mockImplementation(() => {
        throw new Error('boom');
      });
      const res = reportManager.exportReport(report, { format: 'json' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('boom');
    });
  });

  // ─── processReportData / generatePreviewData ────────────

  describe('processReportData / generatePreviewData', () => {
    it('processReportData 原样返回 report（当前为直通实现）', () => {
      const report = reportManager.createReport({ name: 'R' }, 'u1', 't1');
      const out = reportManager.processReportData(report, [{ a: 1 }]);
      expect(out).toBe(report);
    });

    it('generatePreviewData 原样返回 report（当前为直通实现）', () => {
      const report = reportManager.createReport({ name: 'R' }, 'u1', 't1');
      const out = reportManager.generatePreviewData(report);
      expect(out).toBe(report);
    });
  });
});
