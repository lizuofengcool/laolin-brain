import { describe, it, expect } from 'vitest';
import { viewToPath, pathToView, getViewFromPath } from '@/lib/view-routes';
import type { ViewType } from '@/stores/app-store';

/**
 * view-routes 直接单测。
 *
 * 模块定位：将 ViewType（14 个枚举值）与路由路径双向映射，并把任意 pathname
 * 解析回 ViewType。模块仅 `import type { ViewType }`（类型导入，运行时擦除），
 * 不触发 app-store / zustand 运行时加载，纯字符串/控制流，可直接单测。
 *
 * 重点锁定：
 * - viewToPath 14 个映射全部存在且为以 "/" 开头的字符串；
 *   其中 login→"/"、recycleBin→"/trash"、faceGroups→"/faces"、knowledgeGraph→"/graph"
 *   属"非直觉"映射（不是简单的 `/${view}`），需显式锁定防止回归。
 * - pathToView 为 viewToPath 的精确反向映射（round-trip 不变量）。
 * - getViewFromPath 三级解析：精确命中 → 去掉单个前导 "/" 再命中 → 回退 "dashboard"。
 */

// ViewType 全集（与 stores/slices/types.ts 保持一致，14 个成员）
const ALL_VIEWS: ViewType[] = [
  'login',
  'dashboard',
  'files',
  'search',
  'settings',
  'profile',
  'timeline',
  'favorites',
  'recycleBin',
  'albums',
  'faceGroups',
  'tags',
  'analytics',
  'knowledgeGraph',
];

// ─── viewToPath ───────────────────────────────────────────────────

describe('viewToPath', () => {
  it('为全部 14 个 ViewType 成员都提供路径（无遗漏）', () => {
    for (const view of ALL_VIEWS) {
      expect(viewToPath).toHaveProperty(view);
      expect(typeof viewToPath[view]).toBe('string');
    }
    expect(Object.keys(viewToPath).length).toBe(ALL_VIEWS.length);
  });

  it('所有路径均以 "/" 开头', () => {
    for (const view of ALL_VIEWS) {
      expect(viewToPath[view].startsWith('/')).toBe(true);
    }
  });

  it('锁定关键非直觉映射（防止回归）', () => {
    // login 映射到根路径，而非 /login
    expect(viewToPath.login).toBe('/');
    // recycleBin → /trash（不是 /recycleBin）
    expect(viewToPath.recycleBin).toBe('/trash');
    // faceGroups → /faces（不是 /faceGroups）
    expect(viewToPath.faceGroups).toBe('/faces');
    // knowledgeGraph → /graph（不是 /knowledgeGraph）
    expect(viewToPath.knowledgeGraph).toBe('/graph');
  });

  it('锁定"直觉"映射（view === 路径段）', () => {
    expect(viewToPath.dashboard).toBe('/dashboard');
    expect(viewToPath.files).toBe('/files');
    expect(viewToPath.search).toBe('/search');
    expect(viewToPath.settings).toBe('/settings');
    expect(viewToPath.profile).toBe('/profile');
    expect(viewToPath.timeline).toBe('/timeline');
    expect(viewToPath.favorites).toBe('/favorites');
    expect(viewToPath.albums).toBe('/albums');
    expect(viewToPath.tags).toBe('/tags');
    expect(viewToPath.analytics).toBe('/analytics');
  });

  it('所有路径值唯一（一对一映射，无两个 view 共享同一路径）', () => {
    const paths = ALL_VIEWS.map((v) => viewToPath[v]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

// ─── pathToView ───────────────────────────────────────────────────

describe('pathToView', () => {
  it('是 viewToPath 的精确反向映射（round-trip 不变量）', () => {
    for (const view of ALL_VIEWS) {
      const path = viewToPath[view];
      expect(pathToView[path]).toBe(view);
    }
  });

  it('锁定关键反向映射', () => {
    expect(pathToView['/']).toBe('login');
    expect(pathToView['/trash']).toBe('recycleBin');
    expect(pathToView['/faces']).toBe('faceGroups');
    expect(pathToView['/graph']).toBe('knowledgeGraph');
    expect(pathToView['/dashboard']).toBe('dashboard');
  });

  it('键数量与 viewToPath 一致（14 条）', () => {
    expect(Object.keys(pathToView).length).toBe(ALL_VIEWS.length);
  });
});

// ─── getViewFromPath ──────────────────────────────────────────────

describe('getViewFromPath', () => {
  describe('第一级：精确命中 pathToView 键', () => {
    it('全部 14 条已注册路径精确解析为对应 ViewType', () => {
      for (const view of ALL_VIEWS) {
        const path = viewToPath[view];
        expect(getViewFromPath(path)).toBe(view);
      }
    });

    it('根路径 "/" 解析为 login', () => {
      expect(getViewFromPath('/')).toBe('login');
    });

    it('非直觉路径精确解析', () => {
      expect(getViewFromPath('/trash')).toBe('recycleBin');
      expect(getViewFromPath('/faces')).toBe('faceGroups');
      expect(getViewFromPath('/graph')).toBe('knowledgeGraph');
    });
  });

  describe('第二级：去掉单个前导 "/" 后命中', () => {
    // pathToView 的键均形如 "/xxx"，因此去掉一个前导 "/" 后能命中的唯一现实场景
    // 是输入本身多了一个前导斜杠（如 "//dashboard" → 去掉一个 "/" → "/dashboard" 命中）。
    it('双斜杠输入 "//dashboard" 经去单斜杠后解析为 dashboard', () => {
      expect(getViewFromPath('//dashboard')).toBe('dashboard');
    });

    it('双斜杠输入 "//trash" 经去单斜杠后解析为 recycleBin', () => {
      expect(getViewFromPath('//trash')).toBe('recycleBin');
    });

    it('双斜杠根路径 "//" 经去单斜杠后命中 "/" → login', () => {
      expect(getViewFromPath('//')).toBe('login');
    });
  });

  describe('第三级：回退默认 "dashboard"', () => {
    it('未注册的顶层路径回退 dashboard', () => {
      expect(getViewFromPath('/unknown')).toBe('dashboard');
      expect(getViewFromPath('/nonexistent')).toBe('dashboard');
    });

    it('已注册路径的子路径回退 dashboard（精确匹配不前缀匹配）', () => {
      expect(getViewFromPath('/files/123')).toBe('dashboard');
      expect(getViewFromPath('/dashboard/extra')).toBe('dashboard');
      expect(getViewFromPath('/settings/profile')).toBe('dashboard');
    });

    it('无前导斜杠的裸段回退 dashboard（pathToView 键均带 "/"）', () => {
      // "dashboard" 去掉前导 "/" 后仍是 "dashboard"，不是 pathToView 的键
      expect(getViewFromPath('dashboard')).toBe('dashboard');
      expect(getViewFromPath('files')).toBe('dashboard');
      expect(getViewFromPath('trash')).toBe('dashboard');
    });

    it('任意无关节符串回退 dashboard', () => {
      expect(getViewFromPath('abc')).toBe('dashboard');
      expect(getViewFromPath('some/random/path')).toBe('dashboard');
    });

    it('空字符串回退 dashboard', () => {
      expect(getViewFromPath('')).toBe('dashboard');
    });

    it('大小写敏感："/Dashboard" 不命中 → 回退 dashboard', () => {
      expect(getViewFromPath('/Dashboard')).toBe('dashboard');
      expect(getViewFromPath('/FILES')).toBe('dashboard');
    });

    it('带尾斜杠的已注册路径不命中（精确匹配）→ 回退 dashboard', () => {
      expect(getViewFromPath('/dashboard/')).toBe('dashboard');
      expect(getViewFromPath('/files/')).toBe('dashboard');
    });
  });
});
