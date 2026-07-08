/**
 * shares/share-manager ShareManager 内存态分享管理器直接单测
 *
 * 覆盖目标：src/lib/shares/share-manager.ts。该模块为纯内存态分享管理器（shares /
 * tokenToShare / customUrlToShare / accessLogs / settings / userShares 六个 Map），唯一运行时
 * 依赖同级 ./types（纯常量 + 纯函数 generateShareToken/isShareExpired/hasSharePermission +
 * SHARE_TEMPLATES/DEFAULT_SHARE_SETTINGS），零 db/crypto/fetch，无需 vi.mock。
 *
 * 隔离策略：ShareManager 构造器 public，每个用例 `new ShareManager()` 取全新实例（fresh Maps），
 * 完全避免单例共享状态污染。涉及过期/时间算术的用例用 vi.useFakeTimers + vi.setSystemTime
 * 固定时刻，断言本地时间分量避免时区敏感。
 *
 * 关键控制流：
 * - createShare：设置门禁（enabled/allowPublicShares/allowCustomUrls/requirePassword，违反 → null）；
 *   生成 token + id；过期时间（params.expiresAt 优先 → defaultExpiryDays 兜底 → maxExpiryDays 截断）；
 *   字段回退（permissions 用 || 兜底 defaultPermissions；allowComment/allowDownload/allowEdit/
 *   watermark 用 ?? 兜底 settings 默认；notifyOnAccess/notifyOnDownload ?? false；previewMode || 'full'）；
 *   注册 token/customUrl/userShares 映射
 * - createShareFromTemplate：未知模板 → null；password_protected → shareMethod='password'（模板
 *   password 为 boolean 标记，不注入实际密码）；expiring_link → expiresAt = now + 24h；其余模板
 *   shareMethod='link'
 * - 查询：getShare（命中/未命中/跨租户）、getShareByToken、getShareByCustomUrl
 * - queryShares：tenantId 隔离；targetId/targetType/status(单值+数组)/shareMethod(单值+数组)/createdBy/
 *   search(title/description/targetId 大小写不敏感)/dateFrom/dateTo 过滤；sortBy(createdAt/accessCount/
 *   downloadCount/expiresAt) + sortOrder(asc/desc)；分页 page默认1/pageSize默认20/totalPages 向上取整/hasMore
 * - updateShare：未命中/跨租户/非创建者 → null；逐字段更新（undefined 跳过）；updatedAt 刷新
 * - revokeShare/restoreShare：经 updateShare 设 status；命中返回 true，未命中/跨租户/非创建者 → false
 * - verifyShareAccess：token 未命中 → '分享不存在'；status !== 'active' → '分享已失效'；isShareExpired
 *   → '分享已过期' 且自动置 status='expired'；需密码未提供 → requiresPassword；密码不符 → '密码错误'；通过 → valid
 * - recordAccess：未命中 no-op；accessCount++ + lastAccessedAt；download 额外 downloadCount++；
 *   达 maxAccessCount → status='expired'；日志 unshift 且上限 1000 条；updatedAt 刷新
 * - getStats：totalShares/activeShares/expiredShares/revokedShares/totalAccesses/totalDownloads/byType/
 *   byMethod/topShares(按 accessCount 取前 5)/recentAccesses(每 share 取前 2 日志合并按 accessedAt desc 取前 10)
 * - getAccessLogs：未命中/跨租户 → 空；action 过滤；分页
 * - getShareSettings/updateShareSettings：未设置返回 DEFAULT_SHARE_SETTINGS 副本；update 浅合并
 * - getTemplates/getTemplate：返回全部内置模板 / 命中 / 未命中
 * - batchRevokeShares/batchDeleteShares：success/failed/failedIds 统计；batchDelete 移除 token/customUrl/
 *   accessLogs/userShares/shares 全部映射；跨租户/非创建者 → failed
 * - canEditShare：创建者 → true；非创建者/未命中/跨租户 → false
 * - isCustomUrlAvailable：未被占用 → true；已占用 → false
 * - getUserShares：按 userId 取列表并按 tenantId 过滤
 * - cleanExpiredShares：仅清理 status='active' 且 isShareExpired 的分享，置 status='expired'，返回清理数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShareManager } from '@/lib/shares/share-manager';
import {
  DEFAULT_SHARE_SETTINGS,
  SHARE_TEMPLATES,
  type CreateShareParams,
  type ShareSettings,
} from '@/lib/shares/types';

// 基准时刻：2026-07-15 10:00:00 UTC。选月中以避免任何时区下日期算术跨月边界。
const NOW = new Date('2026-07-15T10:00:00Z');

let manager: ShareManager;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  manager = new ShareManager();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 默认创建参数（link 分享，file 目标）。 */
function makeCreateParams(overrides: Partial<CreateShareParams> = {}): CreateShareParams {
  return {
    targetId: 'file-1',
    targetType: 'file',
    shareMethod: 'link',
    ...overrides,
  };
}

/** 用默认设置创建一个分享，返回创建结果（默认设置 enabled，便于多数用例直接用）。 */
function createDefault(overrides: Partial<CreateShareParams> = {}) {
  return manager.createShare('tenant-1', 'user-1', 'Alice', makeCreateParams(overrides));
}

describe('shares/share-manager ShareManager', () => {
  // ─── 构造与导出 ───────────────────────────────────────────

  describe('构造与导出', () => {
    it('new ShareManager() 每次返回独立实例（Maps 互不污染）', () => {
      const a = new ShareManager();
      const b = new ShareManager();
      a.createShare('t', 'u', 'n', makeCreateParams());
      expect(a.getStats('t').totalShares).toBe(1);
      expect(b.getStats('t').totalShares).toBe(0);
    });

    it('默认设置下 createShare 成功返回 share 对象', () => {
      const share = createDefault();
      expect(share).not.toBeNull();
      expect(share!.id).toMatch(/^share_\d+_[a-z0-9]+$/);
      expect(share!.token).toHaveLength(32);
      expect(share!.tenantId).toBe('tenant-1');
      expect(share!.createdBy).toBe('user-1');
      expect(share!.createdByName).toBe('Alice');
      expect(share!.status).toBe('active');
      expect(share!.accessCount).toBe(0);
      expect(share!.downloadCount).toBe(0);
    });
  });

  // ─── createShare 设置门禁 ────────────────────────────────

  describe('createShare 设置门禁', () => {
    it('enabled=false → null', () => {
      manager.updateShareSettings('tenant-1', { enabled: false });
      expect(createDefault()).toBeNull();
    });

    it('public 分享 + allowPublicShares=false → null', () => {
      manager.updateShareSettings('tenant-1', { allowPublicShares: false });
      expect(createDefault({ shareMethod: 'public' })).toBeNull();
    });

    it('customUrl + allowCustomUrls=false → null', () => {
      expect(createDefault({ customUrl: 'my-link' })).toBeNull();
    });

    it('customUrl + allowCustomUrls=true → 成功', () => {
      manager.updateShareSettings('tenant-1', { allowCustomUrls: true });
      const share = createDefault({ customUrl: 'my-link' });
      expect(share).not.toBeNull();
      expect(share!.customUrl).toBe('my-link');
    });

    it('requirePassword=true 且未提供 password → null', () => {
      manager.updateShareSettings('tenant-1', { requirePassword: true });
      expect(createDefault()).toBeNull();
    });

    it('requirePassword=true 且提供 password → 成功', () => {
      manager.updateShareSettings('tenant-1', { requirePassword: true });
      const share = createDefault({ password: 'secret' });
      expect(share).not.toBeNull();
      expect(share!.password).toBe('secret');
    });
  });

  // ─── createShare 字段回退与过期算术 ─────────────────────

  describe('createShare 字段回退与过期算术', () => {
    it('permissions 未提供 → 回退 settings.defaultPermissions', () => {
      manager.updateShareSettings('tenant-1', { defaultPermissions: ['view', 'edit'] });
      const share = createDefault();
      expect(share!.permissions).toEqual(['view', 'edit']);
    });

    it('permissions 显式提供 → 使用提供的值', () => {
      const share = createDefault({ permissions: ['full'] });
      expect(share!.permissions).toEqual(['full']);
    });

    it('allowComment/allowDownload/allowEdit 未提供 → 回退 settings 默认', () => {
      manager.updateShareSettings('tenant-1', {
        defaultAllowComment: true,
        defaultAllowDownload: false,
        defaultAllowEdit: true,
      });
      const share = createDefault();
      expect(share!.allowComment).toBe(true);
      expect(share!.allowDownload).toBe(false);
      expect(share!.allowEdit).toBe(true);
    });

    it('allowComment 显式 false → 使用 false（?? 不被默认覆盖）', () => {
      manager.updateShareSettings('tenant-1', { defaultAllowComment: true });
      const share = createDefault({ allowComment: false });
      expect(share!.allowComment).toBe(false);
    });

    it('watermark 未提供 → 回退 settings.watermarkEnabled', () => {
      manager.updateShareSettings('tenant-1', { watermarkEnabled: true });
      const share = createDefault();
      expect(share!.watermark).toBe(true);
    });

    it('notifyOnAccess/notifyOnDownload 未提供 → false', () => {
      const share = createDefault();
      expect(share!.notifyOnAccess).toBe(false);
      expect(share!.notifyOnDownload).toBe(false);
    });

    it('notifyOnAccess 显式 true → true', () => {
      const share = createDefault({ notifyOnAccess: true, notifyOnDownload: true });
      expect(share!.notifyOnAccess).toBe(true);
      expect(share!.notifyOnDownload).toBe(true);
    });

    it('previewMode 未提供 → 默认 full', () => {
      const share = createDefault();
      expect(share!.previewMode).toBe('full');
    });

    it('previewMode 显式提供 → 使用提供的值', () => {
      const share = createDefault({ previewMode: 'watermark' });
      expect(share!.previewMode).toBe('watermark');
    });

    it('expiresAt 未提供 + defaultExpiryDays=30 → now + 30 天', () => {
      const share = createDefault();
      const expected = new Date('2026-08-14T10:00:00Z'); // 7/15 + 30 天
      expect(share!.expiresAt).toEqual(expected);
    });

    it('expiresAt 未提供 + defaultExpiryDays 未设置 → 无过期', () => {
      manager.updateShareSettings('tenant-1', { defaultExpiryDays: undefined });
      const share = createDefault();
      expect(share!.expiresAt).toBeUndefined();
    });

    it('expiresAt 显式提供 → 使用提供的值', () => {
      const custom = new Date('2026-12-31T00:00:00Z');
      const share = createDefault({ expiresAt: custom });
      expect(share!.expiresAt).toEqual(custom);
    });

    it('expiresAt 超过 maxExpiryDays → 截断为 maxExpiryDays', () => {
      manager.updateShareSettings('tenant-1', { maxExpiryDays: 10 });
      const far = new Date('2027-01-01T00:00:00Z');
      const share = createDefault({ expiresAt: far });
      const expected = new Date('2026-07-25T10:00:00Z'); // 7/15 + 10 天
      expect(share!.expiresAt).toEqual(expected);
    });

    it('maxAccessCount 透传', () => {
      const share = createDefault({ maxAccessCount: 5 });
      expect(share!.maxAccessCount).toBe(5);
    });

    it('title/description 透传', () => {
      const share = createDefault({ title: '我的分享', description: '描述文本' });
      expect(share!.title).toBe('我的分享');
      expect(share!.description).toBe('描述文本');
    });

    it('createdAt/updatedAt 为当前时刻', () => {
      const share = createDefault();
      expect(share!.createdAt).toEqual(NOW);
      expect(share!.updatedAt).toEqual(NOW);
    });
  });

  // ─── createShare 映射注册 ────────────────────────────────

  describe('createShare 映射注册', () => {
    it('token 映射注册 → getShareByToken 可查', () => {
      const share = createDefault();
      expect(manager.getShareByToken(share!.token)?.id).toBe(share!.id);
    });

    it('customUrl 映射注册 → getShareByCustomUrl 可查', () => {
      manager.updateShareSettings('tenant-1', { allowCustomUrls: true });
      const share = createDefault({ customUrl: 'short' });
      expect(manager.getShareByCustomUrl('short')?.id).toBe(share!.id);
    });

    it('userShares 列表 unshift 新分享（最新在前）', () => {
      const s1 = createDefault();
      const s2 = createDefault({ targetId: 'file-2' });
      const list = manager.getUserShares('user-1', 'tenant-1');
      expect(list.map(s => s.id)).toEqual([s2!.id, s1!.id]);
    });
  });

  // ─── createShareFromTemplate ─────────────────────────────

  describe('createShareFromTemplate', () => {
    it('未知模板 id → null', () => {
      expect(
        manager.createShareFromTemplate('tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'no-such')
      ).toBeNull();
    });

    it('public_view 模板 → shareMethod=link，permissions=[view,download]', () => {
      const share = manager.createShareFromTemplate(
        'tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'public_view'
      );
      expect(share).not.toBeNull();
      expect(share!.shareMethod).toBe('link');
      expect(share!.permissions).toEqual(['view', 'download']);
      expect(share!.allowDownload).toBe(true);
      expect(share!.watermark).toBe(false);
      expect(share!.previewMode).toBe('full');
    });

    it('password_protected 模板 → shareMethod=password（模板 password 为 boolean 标记，不注入实际密码）', () => {
      const share = manager.createShareFromTemplate(
        'tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'password_protected'
      );
      expect(share).not.toBeNull();
      expect(share!.shareMethod).toBe('password');
      // 模板 password: true 为标记位，未注入实际密码字符串
      expect(share!.password).toBeUndefined();
    });

    it('view_only 模板 → allowDownload=false，watermark=true，previewMode=watermark', () => {
      const share = manager.createShareFromTemplate(
        'tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'view_only'
      );
      expect(share).not.toBeNull();
      expect(share!.allowDownload).toBe(false);
      expect(share!.watermark).toBe(true);
      expect(share!.previewMode).toBe('watermark');
    });

    it('collaboration 模板 → permissions 含 edit/comment，allowEdit=true', () => {
      const share = manager.createShareFromTemplate(
        'tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'collaboration'
      );
      expect(share).not.toBeNull();
      expect(share!.permissions).toEqual(['view', 'download', 'edit', 'comment']);
      expect(share!.allowEdit).toBe(true);
      expect(share!.allowComment).toBe(true);
    });

    it('expiring_link 模板 → expiresAt = now + 24 小时', () => {
      const share = manager.createShareFromTemplate(
        'tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'expiring_link'
      );
      expect(share).not.toBeNull();
      const expected = new Date('2026-07-16T10:00:00Z'); // +24h
      expect(share!.expiresAt).toEqual(expected);
    });

    it('模板创建的分享仍受设置门禁约束（enabled=false → null）', () => {
      manager.updateShareSettings('tenant-1', { enabled: false });
      expect(
        manager.createShareFromTemplate('tenant-1', 'user-1', 'Alice', 'file-1', 'file', 'public_view')
      ).toBeNull();
    });
  });

  // ─── 单条查询 ────────────────────────────────────────────

  describe('单条查询 getShare/getShareByToken/getShareByCustomUrl', () => {
    it('getShare 命中', () => {
      const share = createDefault();
      expect(manager.getShare(share!.id, 'tenant-1')?.id).toBe(share!.id);
    });

    it('getShare 未命中 → null', () => {
      expect(manager.getShare('no-id', 'tenant-1')).toBeNull();
    });

    it('getShare 跨租户 → null', () => {
      const share = createDefault();
      expect(manager.getShare(share!.id, 'other-tenant')).toBeNull();
    });

    it('getShareByToken 命中', () => {
      const share = createDefault();
      expect(manager.getShareByToken(share!.token)?.id).toBe(share!.id);
    });

    it('getShareByToken 未命中 → null', () => {
      expect(manager.getShareByToken('no-token')).toBeNull();
    });

    it('getShareByCustomUrl 命中', () => {
      manager.updateShareSettings('tenant-1', { allowCustomUrls: true });
      const share = createDefault({ customUrl: 'abc' });
      expect(manager.getShareByCustomUrl('abc')?.id).toBe(share!.id);
    });

    it('getShareByCustomUrl 未命中 → null', () => {
      expect(manager.getShareByCustomUrl('no-url')).toBeNull();
    });
  });

  // ─── queryShares 过滤 ────────────────────────────────────

  describe('queryShares 过滤', () => {
    beforeEach(() => {
      // 种入 3 个租户 1 的分享 + 1 个租户 2 的分享
      manager.createShare('tenant-1', 'user-1', 'Alice', makeCreateParams({ targetId: 'f1', targetType: 'file', title: 'Alpha' }));
      manager.createShare('tenant-1', 'user-1', 'Alice', makeCreateParams({ targetId: 'f2', targetType: 'folder', title: 'Beta', shareMethod: 'public' }));
      manager.createShare('tenant-1', 'user-2', 'Bob', makeCreateParams({ targetId: 'f3', targetType: 'file', title: 'Gamma' }));
      manager.createShare('tenant-2', 'user-3', 'Carol', makeCreateParams({ targetId: 'f9', targetType: 'file', title: 'OtherTenant' }));
    });

    it('tenantId 隔离：只返回本租户分享', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1' });
      expect(r.total).toBe(3);
      expect(r.shares.every(s => s.tenantId === 'tenant-1')).toBe(true);
    });

    it('targetId 过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', targetId: 'f2' });
      expect(r.total).toBe(1);
      expect(r.shares[0].targetId).toBe('f2');
    });

    it('targetType 过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', targetType: 'folder' });
      expect(r.total).toBe(1);
      expect(r.shares[0].targetType).toBe('folder');
    });

    it('status 单值过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', status: 'active' });
      expect(r.total).toBe(3);
    });

    it('status 数组过滤', () => {
      // 撤销一个，按 [active, revoked] 查应仍返回 3
      const all = manager.queryShares({ tenantId: 'tenant-1' });
      manager.revokeShare(all.shares[0].id, 'tenant-1', all.shares[0].createdBy);
      const r = manager.queryShares({ tenantId: 'tenant-1', status: ['active', 'revoked'] });
      expect(r.total).toBe(3);
      const onlyActive = manager.queryShares({ tenantId: 'tenant-1', status: ['active'] });
      expect(onlyActive.total).toBe(2);
    });

    it('shareMethod 单值过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', shareMethod: 'public' });
      expect(r.total).toBe(1);
      expect(r.shares[0].shareMethod).toBe('public');
    });

    it('shareMethod 数组过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', shareMethod: ['link', 'public'] });
      expect(r.total).toBe(3);
    });

    it('createdBy 过滤', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', createdBy: 'user-2' });
      expect(r.total).toBe(1);
      expect(r.shares[0].createdBy).toBe('user-2');
    });

    it('search 匹配 title（大小写不敏感）', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', search: 'ALPHA' });
      expect(r.total).toBe(1);
      expect(r.shares[0].title).toBe('Alpha');
    });

    it('search 匹配 description', () => {
      manager.createShare('tenant-1', 'user-1', 'Alice', makeCreateParams({ targetId: 'fx', description: 'special report' }));
      const r = manager.queryShares({ tenantId: 'tenant-1', search: 'special' });
      expect(r.total).toBe(1);
    });

    it('search 匹配 targetId', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', search: 'f3' });
      expect(r.total).toBe(1);
      expect(r.shares[0].targetId).toBe('f3');
    });
  });

  // ─── queryShares 日期过滤 ────────────────────────────────

  describe('queryShares 日期过滤', () => {
    it('dateFrom 过滤', () => {
      const t0 = new Date('2026-07-10T00:00:00Z');
      vi.setSystemTime(t0);
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f1' }));
      vi.setSystemTime(NOW);
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f2' }));

      const r = manager.queryShares({ tenantId: 'tenant-1', dateFrom: new Date('2026-07-12T00:00:00Z') });
      expect(r.total).toBe(1);
      expect(r.shares[0].targetId).toBe('f2');
    });

    it('dateTo 过滤', () => {
      const t0 = new Date('2026-07-10T00:00:00Z');
      vi.setSystemTime(t0);
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f1' }));
      vi.setSystemTime(NOW);
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f2' }));

      const r = manager.queryShares({ tenantId: 'tenant-1', dateTo: new Date('2026-07-12T00:00:00Z') });
      expect(r.total).toBe(1);
      expect(r.shares[0].targetId).toBe('f1');
    });
  });

  // ─── queryShares 排序与分页 ──────────────────────────────

  describe('queryShares 排序与分页', () => {
    beforeEach(() => {
      // 依次创建 3 个分享，createdAt 递增（NOW / NOW+1s / NOW+2s）
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f1' }));
      vi.setSystemTime(new Date(NOW.getTime() + 1000));
      manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f2' }));
      vi.setSystemTime(new Date(NOW.getTime() + 2000));
      const s3 = manager.createShare('tenant-1', 'user-1', 'A', makeCreateParams({ targetId: 'f3' }))!;
      vi.setSystemTime(NOW);
      // 给 s3 制造访问/下载计数用于排序
      manager.recordAccess(s3.id, 'view');
      manager.recordAccess(s3.id, 'download');
    });

    it('sortBy=createdAt + desc（默认）：最新在前', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1' });
      expect(r.shares.map(s => s.targetId)).toEqual(['f3', 'f2', 'f1']);
    });

    it('sortBy=createdAt + asc：最旧在前', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', sortBy: 'createdAt', sortOrder: 'asc' });
      expect(r.shares.map(s => s.targetId)).toEqual(['f1', 'f2', 'f3']);
    });

    it('sortBy=accessCount + desc', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', sortBy: 'accessCount', sortOrder: 'desc' });
      expect(r.shares[0].targetId).toBe('f3');
    });

    it('sortBy=downloadCount + desc', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', sortBy: 'downloadCount', sortOrder: 'desc' });
      expect(r.shares[0].targetId).toBe('f3');
    });

    it('sortBy=expiresAt + asc（无 expiresAt 视为 0 排前）', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', sortBy: 'expiresAt', sortOrder: 'asc' });
      expect(r.total).toBe(3);
    });

    it('分页：page 默认 1，pageSize 默认 20', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1' });
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
      expect(r.totalPages).toBe(1);
      expect(r.hasMore).toBe(false);
    });

    it('分页：pageSize=2 → 第 1 页 2 条，hasMore=true，totalPages=2', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', pageSize: 2 });
      expect(r.shares).toHaveLength(2);
      expect(r.total).toBe(3);
      expect(r.totalPages).toBe(2);
      expect(r.hasMore).toBe(true);
    });

    it('分页：pageSize=2 page=2 → 1 条，hasMore=false', () => {
      const r = manager.queryShares({ tenantId: 'tenant-1', pageSize: 2, page: 2 });
      expect(r.shares).toHaveLength(1);
      expect(r.hasMore).toBe(false);
    });
  });

  // ─── updateShare ─────────────────────────────────────────

  describe('updateShare', () => {
    it('未命中 → null', () => {
      expect(manager.updateShare('no-id', 'tenant-1', 'user-1', { title: 'x' })).toBeNull();
    });

    it('跨租户 → null', () => {
      const share = createDefault();
      expect(manager.updateShare(share!.id, 'other-tenant', 'user-1', { title: 'x' })).toBeNull();
    });

    it('非创建者 → null', () => {
      const share = createDefault();
      expect(manager.updateShare(share!.id, 'tenant-1', 'user-2', { title: 'x' })).toBeNull();
    });

    it('逐字段更新（title/description/permissions/password/status 等）', () => {
      const share = createDefault();
      const updated = manager.updateShare(share!.id, 'tenant-1', 'user-1', {
        title: '新标题',
        description: '新描述',
        permissions: ['full'],
        password: 'newpass',
        maxAccessCount: 10,
        allowComment: true,
        allowDownload: false,
        allowEdit: true,
        notifyOnAccess: true,
        notifyOnDownload: true,
        status: 'disabled',
        watermark: true,
        previewMode: 'limited',
      });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('新标题');
      expect(updated!.description).toBe('新描述');
      expect(updated!.permissions).toEqual(['full']);
      expect(updated!.password).toBe('newpass');
      expect(updated!.maxAccessCount).toBe(10);
      expect(updated!.allowComment).toBe(true);
      expect(updated!.allowDownload).toBe(false);
      expect(updated!.allowEdit).toBe(true);
      expect(updated!.notifyOnAccess).toBe(true);
      expect(updated!.notifyOnDownload).toBe(true);
      expect(updated!.status).toBe('disabled');
      expect(updated!.watermark).toBe(true);
      expect(updated!.previewMode).toBe('limited');
    });

    it('undefined 字段不覆盖原值', () => {
      const share = createDefault({ title: '原标题' });
      const updated = manager.updateShare(share!.id, 'tenant-1', 'user-1', { description: '描述' });
      expect(updated!.title).toBe('原标题');
      expect(updated!.description).toBe('描述');
    });

    it('updatedAt 被刷新', () => {
      const share = createDefault();
      // createShare 返回的是 Map 内同一引用，updateShare 会就地 mutate，
      // 故在此刻先快照原始 updatedAt 时间戳，避免后续被覆盖后无法比较。
      const tsBefore = share!.updatedAt.getTime();
      vi.setSystemTime(new Date(NOW.getTime() + 60000));
      const updated = manager.updateShare(share!.id, 'tenant-1', 'user-1', { title: 'x' });
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(tsBefore);
    });
  });

  // ─── revokeShare / restoreShare ──────────────────────────

  describe('revokeShare / restoreShare', () => {
    it('revokeShare → status=revoked，返回 true', () => {
      const share = createDefault();
      expect(manager.revokeShare(share!.id, 'tenant-1', 'user-1')).toBe(true);
      expect(manager.getShare(share!.id, 'tenant-1')?.status).toBe('revoked');
    });

    it('restoreShare → status=active，返回 true', () => {
      const share = createDefault();
      manager.revokeShare(share!.id, 'tenant-1', 'user-1');
      expect(manager.restoreShare(share!.id, 'tenant-1', 'user-1')).toBe(true);
      expect(manager.getShare(share!.id, 'tenant-1')?.status).toBe('active');
    });

    it('revokeShare 未命中 → false', () => {
      expect(manager.revokeShare('no-id', 'tenant-1', 'user-1')).toBe(false);
    });

    it('revokeShare 非创建者 → false', () => {
      const share = createDefault();
      expect(manager.revokeShare(share!.id, 'tenant-1', 'user-2')).toBe(false);
    });
  });

  // ─── verifyShareAccess ───────────────────────────────────

  describe('verifyShareAccess', () => {
    it('token 未命中 → invalid "分享不存在"', () => {
      const r = manager.verifyShareAccess({ token: 'no-token' });
      expect(r.valid).toBe(false);
      expect(r.error).toBe('分享不存在');
    });

    it('status !== active → invalid "分享已失效"', () => {
      const share = createDefault();
      manager.revokeShare(share!.id, 'tenant-1', 'user-1');
      const r = manager.verifyShareAccess({ token: share!.token });
      expect(r.valid).toBe(false);
      expect(r.error).toBe('分享已失效');
    });

    it('已过期（expiresAt 早于 now）→ invalid "分享已过期" 且自动置 status=expired', () => {
      const past = new Date('2026-07-01T00:00:00Z');
      const share = createDefault({ expiresAt: past });
      const r = manager.verifyShareAccess({ token: share!.token });
      expect(r.valid).toBe(false);
      expect(r.error).toBe('分享已过期');
      expect(manager.getShare(share!.id, 'tenant-1')?.status).toBe('expired');
    });

    it('需密码未提供 → requiresPassword=true', () => {
      const share = createDefault({ password: 'secret' });
      const r = manager.verifyShareAccess({ token: share!.token });
      expect(r.valid).toBe(false);
      expect(r.requiresPassword).toBe(true);
    });

    it('密码不符 → invalid "密码错误"', () => {
      const share = createDefault({ password: 'secret' });
      const r = manager.verifyShareAccess({ token: share!.token, password: 'wrong' });
      expect(r.valid).toBe(false);
      expect(r.error).toBe('密码错误');
    });

    it('密码正确 → valid', () => {
      const share = createDefault({ password: 'secret' });
      const r = manager.verifyShareAccess({ token: share!.token, password: 'secret' });
      expect(r.valid).toBe(true);
      expect(r.share?.id).toBe(share!.id);
    });

    it('无密码分享 → valid', () => {
      const share = createDefault();
      const r = manager.verifyShareAccess({ token: share!.token });
      expect(r.valid).toBe(true);
    });
  });

  // ─── recordAccess ────────────────────────────────────────

  describe('recordAccess', () => {
    it('未命中 → no-op（不抛错）', () => {
      expect(() => manager.recordAccess('no-id', 'view')).not.toThrow();
    });

    it('view → accessCount++ + lastAccessedAt 设置', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'view');
      const after = manager.getShare(share!.id, 'tenant-1')!;
      expect(after.accessCount).toBe(1);
      expect(after.downloadCount).toBe(0);
      expect(after.lastAccessedAt).toEqual(NOW);
    });

    it('download → accessCount++ 且 downloadCount++', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'download');
      const after = manager.getShare(share!.id, 'tenant-1')!;
      expect(after.accessCount).toBe(1);
      expect(after.downloadCount).toBe(1);
    });

    it('comment/edit → accessCount++ 但 downloadCount 不变', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'comment');
      manager.recordAccess(share!.id, 'edit');
      const after = manager.getShare(share!.id, 'tenant-1')!;
      expect(after.accessCount).toBe(2);
      expect(after.downloadCount).toBe(0);
    });

    it('达 maxAccessCount → status 置 expired', () => {
      const share = createDefault({ maxAccessCount: 2 });
      manager.recordAccess(share!.id, 'view'); // accessCount=1, 1>=2 false
      expect(manager.getShare(share!.id, 'tenant-1')?.status).toBe('active');
      manager.recordAccess(share!.id, 'view'); // accessCount=2, 2>=2 true
      expect(manager.getShare(share!.id, 'tenant-1')?.status).toBe('expired');
    });

    it('访问日志记录且 unshift（最新在前）', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'view', { userId: 'u1' });
      vi.setSystemTime(new Date(NOW.getTime() + 1000));
      manager.recordAccess(share!.id, 'download', { userId: 'u2' });
      const logs = manager.getAccessLogs(share!.id, 'tenant-1').logs;
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe('download'); // 最新在前
      expect(logs[1].action).toBe('view');
    });

    it('访问日志上限 1000 条（超出截断）', () => {
      const share = createDefault();
      for (let i = 0; i < 1005; i++) {
        manager.recordAccess(share!.id, 'view');
      }
      // getAccessLogs 默认 pageSize=20，需显式放大以观测截断后的全量日志
      const r = manager.getAccessLogs(share!.id, 'tenant-1', { pageSize: 2000 });
      expect(r.total).toBe(1000);
      expect(r.logs).toHaveLength(1000);
    });

    it('日志带 visitorId/ipAddress/userAgent 透传', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'view', {
        visitorId: 'v1', ipAddress: '1.2.3.4', userAgent: 'ua',
      });
      const log = manager.getAccessLogs(share!.id, 'tenant-1').logs[0];
      expect(log.visitorId).toBe('v1');
      expect(log.ipAddress).toBe('1.2.3.4');
      expect(log.userAgent).toBe('ua');
      expect(log.tenantId).toBe('tenant-1');
      expect(log.shareId).toBe(share!.id);
    });

    it('recordAccess 刷新 updatedAt', () => {
      const share = createDefault();
      // createShare 返回的是 Map 内同一引用，recordAccess 会就地 mutate，
      // 故在此刻先快照原始 updatedAt 时间戳，避免后续被覆盖后无法比较。
      const tsBefore = share!.updatedAt.getTime();
      vi.setSystemTime(new Date(NOW.getTime() + 60000));
      manager.recordAccess(share!.id, 'view');
      expect(manager.getShare(share!.id, 'tenant-1')!.updatedAt.getTime()).toBeGreaterThan(tsBefore);
    });
  });

  // ─── getStats ────────────────────────────────────────────

  describe('getStats', () => {
    it('空租户 → 全零统计', () => {
      const s = manager.getStats('tenant-1');
      expect(s.totalShares).toBe(0);
      expect(s.activeShares).toBe(0);
      expect(s.expiredShares).toBe(0);
      expect(s.revokedShares).toBe(0);
      expect(s.totalAccesses).toBe(0);
      expect(s.totalDownloads).toBe(0);
      expect(s.topShares).toEqual([]);
      expect(s.recentAccesses).toEqual([]);
    });

    it('统计 totalShares/active/expired/revoked + accesses/downloads', () => {
      const s1 = createDefault({ targetId: 'f1', targetType: 'file' })!;
      const s2 = createDefault({ targetId: 'f2', targetType: 'folder' })!;
      manager.recordAccess(s1.id, 'view');
      manager.recordAccess(s1.id, 'download');
      manager.recordAccess(s2.id, 'view');
      manager.revokeShare(s2.id, 'tenant-1', 'user-1');

      const s = manager.getStats('tenant-1');
      expect(s.totalShares).toBe(2);
      expect(s.activeShares).toBe(1);
      expect(s.revokedShares).toBe(1);
      expect(s.expiredShares).toBe(0);
      expect(s.totalAccesses).toBe(3);
      expect(s.totalDownloads).toBe(1);
      expect(s.byType.file).toBe(1);
      expect(s.byType.folder).toBe(1);
      expect(s.byMethod.link).toBe(2);
    });

    it('topShares 按 accessCount 降序取前 5', () => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const sh = createDefault({ targetId: `f${i}` })!;
        ids.push(sh.id);
        // i=0 → 0 次访问，i=5 → 5 次访问；accessCount 集合为 0,1,2,3,4,5
        for (let j = 0; j < i; j++) manager.recordAccess(sh.id, 'view');
      }
      const s = manager.getStats('tenant-1');
      expect(s.topShares).toHaveLength(5);
      // accessCount 0..5，topShares 应是 accessCount 5,4,3,2,1（0 被挤出）
      expect(s.topShares.map(x => x.accessCount)).toEqual([5, 4, 3, 2, 1]);
    });

    it('recentAccesses 取每 share 前 2 条合并后按 accessedAt desc 取前 10', () => {
      const s1 = createDefault({ targetId: 'f1' })!;
      const s2 = createDefault({ targetId: 'f2' })!;
      // s1 三条日志（取前 2），s2 两条日志
      manager.recordAccess(s1.id, 'view');
      vi.setSystemTime(new Date(NOW.getTime() + 1000));
      manager.recordAccess(s1.id, 'view');
      vi.setSystemTime(new Date(NOW.getTime() + 2000));
      manager.recordAccess(s1.id, 'view');
      vi.setSystemTime(new Date(NOW.getTime() + 3000));
      manager.recordAccess(s2.id, 'view');
      vi.setSystemTime(new Date(NOW.getTime() + 4000));
      manager.recordAccess(s2.id, 'view');

      const s = manager.getStats('tenant-1');
      // s1 贡献 2 条，s2 贡献 2 条 = 4 条
      expect(s.recentAccesses).toHaveLength(4);
      // 最新在前（accessedAt desc）
      expect(s.recentAccesses[0].accessedAt.getTime()).toBeGreaterThan(
        s.recentAccesses[s.recentAccesses.length - 1].accessedAt.getTime()
      );
    });

    it('跨租户不计入统计', () => {
      createDefault(); // tenant-1
      manager.createShare('tenant-2', 'user-1', 'A', makeCreateParams());
      expect(manager.getStats('tenant-1').totalShares).toBe(1);
    });
  });

  // ─── getAccessLogs ───────────────────────────────────────

  describe('getAccessLogs', () => {
    it('未命中 → 空结果，默认 page/pageSize', () => {
      const r = manager.getAccessLogs('no-id', 'tenant-1');
      expect(r.logs).toEqual([]);
      expect(r.total).toBe(0);
      expect(r.page).toBe(1);
      expect(r.pageSize).toBe(20);
    });

    it('跨租户 → 空', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'view');
      expect(manager.getAccessLogs(share!.id, 'other-tenant').logs).toEqual([]);
    });

    it('action 过滤', () => {
      const share = createDefault();
      manager.recordAccess(share!.id, 'view');
      manager.recordAccess(share!.id, 'download');
      manager.recordAccess(share!.id, 'view');
      const r = manager.getAccessLogs(share!.id, 'tenant-1', { action: 'download' });
      expect(r.total).toBe(1);
      expect(r.logs[0].action).toBe('download');
    });

    it('分页', () => {
      const share = createDefault();
      for (let i = 0; i < 5; i++) manager.recordAccess(share!.id, 'view');
      const r = manager.getAccessLogs(share!.id, 'tenant-1', { page: 2, pageSize: 2 });
      expect(r.total).toBe(5);
      expect(r.logs).toHaveLength(2);
      expect(r.page).toBe(2);
      expect(r.pageSize).toBe(2);
    });
  });

  // ─── 分享设置 ────────────────────────────────────────────

  describe('getShareSettings / updateShareSettings', () => {
    it('未设置 → 返回 DEFAULT_SHARE_SETTINGS 副本', () => {
      const s = manager.getShareSettings('tenant-1');
      expect(s).toEqual(DEFAULT_SHARE_SETTINGS);
    });

    it('返回的是副本，修改不影响内部状态', () => {
      const s = manager.getShareSettings('tenant-1');
      s.enabled = false;
      expect(manager.getShareSettings('tenant-1').enabled).toBe(true);
    });

    it('updateShareSettings 浅合并', () => {
      const updated = manager.updateShareSettings('tenant-1', { enabled: false, requirePassword: true });
      expect(updated.enabled).toBe(false);
      expect(updated.requirePassword).toBe(true);
      // 未覆盖的字段保留
      expect(updated.allowPublicShares).toBe(DEFAULT_SHARE_SETTINGS.allowPublicShares);
    });
  });

  // ─── 模板 ────────────────────────────────────────────────

  describe('getTemplates / getTemplate', () => {
    it('getTemplates 返回全部内置模板', () => {
      expect(manager.getTemplates()).toEqual(SHARE_TEMPLATES);
      expect(manager.getTemplates().length).toBeGreaterThanOrEqual(5);
    });

    it('getTemplate 命中', () => {
      expect(manager.getTemplate('public_view')?.id).toBe('public_view');
    });

    it('getTemplate 未命中 → null', () => {
      expect(manager.getTemplate('no-such')).toBeNull();
    });

    it('getTemplates 返回的是同一引用（内置常量）', () => {
      expect(manager.getTemplates()).toBe(SHARE_TEMPLATES);
    });
  });

  // ─── batchRevokeShares ───────────────────────────────────

  describe('batchRevokeShares', () => {
    it('部分成功：success + failed + failedIds', () => {
      const s1 = createDefault({ targetId: 'f1' })!;
      const s2 = createDefault({ targetId: 'f2' })!;
      const r = manager.batchRevokeShares([s1.id, s2.id, 'no-id'], 'tenant-1', 'user-1');
      expect(r.success).toBe(2);
      expect(r.failed).toBe(1);
      expect(r.failedIds).toEqual(['no-id']);
      expect(manager.getShare(s1.id, 'tenant-1')?.status).toBe('revoked');
    });

    it('跨租户 id 计入 failed', () => {
      const s1 = manager.createShare('tenant-2', 'user-1', 'A', makeCreateParams())!;
      const r = manager.batchRevokeShares([s1.id], 'tenant-1', 'user-1');
      expect(r.success).toBe(0);
      expect(r.failedIds).toEqual([s1.id]);
    });
  });

  // ─── batchDeleteShares ───────────────────────────────────

  describe('batchDeleteShares', () => {
    it('删除成功：移除 share + token/customUrl/accessLogs/userShares 映射', () => {
      manager.updateShareSettings('tenant-1', { allowCustomUrls: true });
      const s1 = createDefault({ targetId: 'f1', customUrl: 'cu1' })!;
      manager.recordAccess(s1.id, 'view');
      const r = manager.batchDeleteShares([s1.id], 'tenant-1', 'user-1');
      expect(r.success).toBe(1);
      expect(r.failed).toBe(0);
      expect(manager.getShare(s1.id, 'tenant-1')).toBeNull();
      expect(manager.getShareByToken(s1.token)).toBeNull();
      expect(manager.getShareByCustomUrl('cu1')).toBeNull();
      expect(manager.getAccessLogs(s1.id, 'tenant-1').logs).toEqual([]);
      expect(manager.getUserShares('user-1', 'tenant-1')).toEqual([]);
    });

    it('跨租户 → failed', () => {
      const s1 = manager.createShare('tenant-2', 'user-1', 'A', makeCreateParams())!;
      const r = manager.batchDeleteShares([s1.id], 'tenant-1', 'user-1');
      expect(r.success).toBe(0);
      expect(r.failedIds).toEqual([s1.id]);
    });

    it('非创建者 → failed', () => {
      const s1 = createDefault()!;
      const r = manager.batchDeleteShares([s1.id], 'tenant-1', 'user-2');
      expect(r.success).toBe(0);
      expect(r.failedIds).toEqual([s1.id]);
      // 原分享仍在
      expect(manager.getShare(s1.id, 'tenant-1')).not.toBeNull();
    });

    it('未命中 id → failed', () => {
      const r = manager.batchDeleteShares(['no-id'], 'tenant-1', 'user-1');
      expect(r.success).toBe(0);
      expect(r.failedIds).toEqual(['no-id']);
    });
  });

  // ─── canEditShare ────────────────────────────────────────

  describe('canEditShare', () => {
    it('创建者 → true', () => {
      const share = createDefault();
      expect(manager.canEditShare(share!.id, 'user-1', 'tenant-1')).toBe(true);
    });

    it('非创建者 → false', () => {
      const share = createDefault();
      expect(manager.canEditShare(share!.id, 'user-2', 'tenant-1')).toBe(false);
    });

    it('未命中 → false', () => {
      expect(manager.canEditShare('no-id', 'user-1', 'tenant-1')).toBe(false);
    });

    it('跨租户 → false', () => {
      const share = createDefault();
      expect(manager.canEditShare(share!.id, 'user-1', 'other-tenant')).toBe(false);
    });
  });

  // ─── isCustomUrlAvailable ────────────────────────────────

  describe('isCustomUrlAvailable', () => {
    it('未被占用 → true', () => {
      expect(manager.isCustomUrlAvailable('free-url')).toBe(true);
    });

    it('已被占用 → false', () => {
      manager.updateShareSettings('tenant-1', { allowCustomUrls: true });
      createDefault({ customUrl: 'taken' });
      expect(manager.isCustomUrlAvailable('taken')).toBe(false);
    });
  });

  // ─── getUserShares ───────────────────────────────────────

  describe('getUserShares', () => {
    it('返回该用户在本租户的分享', () => {
      createDefault({ targetId: 'f1' });
      createDefault({ targetId: 'f2' });
      manager.createShare('tenant-1', 'user-2', 'Bob', makeCreateParams({ targetId: 'f3' }));
      const list = manager.getUserShares('user-1', 'tenant-1');
      expect(list).toHaveLength(2);
      expect(list.every(s => s.createdBy === 'user-1')).toBe(true);
    });

    it('跨租户不计入', () => {
      createDefault({ targetId: 'f1' });
      manager.createShare('tenant-2', 'user-1', 'Alice', makeCreateParams({ targetId: 'f2' }));
      expect(manager.getUserShares('user-1', 'tenant-1')).toHaveLength(1);
    });

    it('用户无分享 → 空数组', () => {
      expect(manager.getUserShares('nobody', 'tenant-1')).toEqual([]);
    });
  });

  // ─── cleanExpiredShares ──────────────────────────────────

  describe('cleanExpiredShares', () => {
    it('清理 active 且 isShareExpired 的分享，置 status=expired，返回清理数', () => {
      const past = new Date('2026-07-01T00:00:00Z');
      const expired = createDefault({ targetId: 'f1', expiresAt: past })!;
      const active = createDefault({ targetId: 'f2' })!; // 默认 30 天后过期，仍 active
      const cleaned = manager.cleanExpiredShares('tenant-1');
      expect(cleaned).toBe(1);
      expect(manager.getShare(expired.id, 'tenant-1')?.status).toBe('expired');
      expect(manager.getShare(active.id, 'tenant-1')?.status).toBe('active');
    });

    it('已 revoked 的过期分享不被重复清理', () => {
      const past = new Date('2026-07-01T00:00:00Z');
      const s = createDefault({ targetId: 'f1', expiresAt: past })!;
      manager.revokeShare(s.id, 'tenant-1', 'user-1'); // status=revoked
      const cleaned = manager.cleanExpiredShares('tenant-1');
      expect(cleaned).toBe(0); // status !== active，跳过
      expect(manager.getShare(s.id, 'tenant-1')?.status).toBe('revoked');
    });

    it('跨租户不清理', () => {
      const past = new Date('2026-07-01T00:00:00Z');
      manager.createShare('tenant-2', 'user-1', 'A', makeCreateParams({ expiresAt: past }));
      expect(manager.cleanExpiredShares('tenant-1')).toBe(0);
    });

    it('无过期分享 → 返回 0', () => {
      createDefault(); // 30 天后过期
      expect(manager.cleanExpiredShares('tenant-1')).toBe(0);
    });
  });

  // ─── DEFAULT_SHARE_SETTINGS 完整性 ───────────────────────

  describe('DEFAULT_SHARE_SETTINGS 完整性', () => {
    it('默认 enabled=true 且允许公开分享', () => {
      const settings: ShareSettings = manager.getShareSettings('fresh-tenant');
      expect(settings.enabled).toBe(true);
      expect(settings.allowPublicShares).toBe(true);
      expect(settings.defaultPermissions).toEqual(['view', 'download']);
    });
  });
});
