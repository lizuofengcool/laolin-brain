/**
 * mobile/types 纯工具函数单测
 *
 * 覆盖目标：src/lib/mobile/types.ts。该文件导出移动端类型定义（编译期擦除，不可单测）、
 * 默认配置常量（DEFAULT_BREAKPOINTS / DEFAULT_GESTURE_CONFIG / DEFAULT_OFFLINE_CACHE_CONFIG /
 * DEFAULT_LAZY_LOAD_CONFIG / DEFAULT_VIRTUAL_SCROLL_CONFIG / DEFAULT_MOBILE_SETTINGS）与
 * 9 个纯/半纯工具函数（isMobile / isTablet / isTouchDevice / getDeviceType / getOS /
 * getCurrentBreakpoint / getSafeAreaInsets / formatFileSizeMobile / formatTimeMobile）。
 *
 * 函数依赖：
 * - isMobile/isTablet/isTouchDevice/getDeviceType/getOS 读 navigator.userAgent /
 *   navigator.maxTouchPoints / 'ontouchstart' in window，且首行带 `typeof window === 'undefined'`
 *   / `typeof navigator === 'undefined'` SSR 守卫。jsdom 环境下 window/navigator 均存在，
 *   故 SSR 守卫分支无法直接触发（与 mobile-manager.test.ts 同型限制）；但「无匹配 → 返回 false/
 *   unknown」的浏览器在场分支与 SSR 守卫返回值同构，已充分覆盖。
 * - getSafeAreaInsets 读 getComputedStyle(document.documentElement) 的 CSS 自定义属性；
 *   默认 jsdom 返回 '' → 全 0；通过 vi.spyOn(window,'getComputedStyle') 控制返回值以覆盖解析/回退。
 * - getCurrentBreakpoint 为纯函数（width + breakpoints），直接边界断言。
 * - formatFileSizeMobile 为纯函数（bytes + locale，但 locale 实际未被使用——补断言确认）。
 * - formatTimeMobile 内部 `new Date()` 取当前时间，故用 vi.useFakeTimers({ now }) 固定 now
 *   以使 diff 分支可确定断言；>= week 分支以 date.toLocaleDateString(locale, ...) 复算期望值。
 *
 * 计时策略：仅 formatTimeMobile describe 启用 fake timers（afterEach 还原），其余用真实定时器。
 * navigator/window 属性以 Object.defineProperty 临时挂桩（configurable 便于 afterEach 还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_BREAKPOINTS,
  DEFAULT_GESTURE_CONFIG,
  DEFAULT_OFFLINE_CACHE_CONFIG,
  DEFAULT_LAZY_LOAD_CONFIG,
  DEFAULT_VIRTUAL_SCROLL_CONFIG,
  DEFAULT_MOBILE_SETTINGS,
  isMobile,
  isTablet,
  isTouchDevice,
  getDeviceType,
  getOS,
  getCurrentBreakpoint,
  getSafeAreaInsets,
  formatFileSizeMobile,
  formatTimeMobile,
} from '@/lib/mobile/types';

// ============================================================================
// navigator 属性挂桩工具（userAgent / maxTouchPoints 在所需分支需定制；
// defineProperty configurable 便于 afterEach 还原）
// ============================================================================
const navStubs: Array<{ key: string; original: unknown; had: boolean }> = [];

function stubNav(key: string, value: unknown): void {
  const had = key in navigator;
  const original = had ? (navigator as Record<string, unknown>)[key] : undefined;
  navStubs.push({ key, original, had });
  Object.defineProperty(navigator, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function restoreNav(): void {
  for (const s of navStubs) {
    if (s.had) {
      Object.defineProperty(navigator, s.key, {
        value: s.original,
        configurable: true,
        writable: true,
      });
    } else {
      delete (navigator as Record<string, unknown>)[s.key];
    }
  }
  navStubs.length = 0;
}

afterEach(() => {
  restoreNav();
  vi.restoreAllMocks();
});

// ============================================================================
// 默认配置常量
// ============================================================================
describe('mobile/types - 默认配置常量', () => {
  it('DEFAULT_BREAKPOINTS：xs=0 起递增阈值', () => {
    expect(DEFAULT_BREAKPOINTS).toEqual({
      xs: 0,
      sm: 576,
      md: 768,
      lg: 992,
      xl: 1200,
      xxl: 1400,
    });
    // 单调不减
    const vals = Object.values(DEFAULT_BREAKPOINTS);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
    }
  });

  it('DEFAULT_GESTURE_CONFIG：默认开启 + 各阈值', () => {
    expect(DEFAULT_GESTURE_CONFIG).toEqual({
      enabled: true,
      tapThreshold: 10,
      doubleTapDelay: 300,
      longPressDelay: 500,
      swipeThreshold: 50,
      swipeVelocityThreshold: 0.3,
      pinchEnabled: true,
      rotateEnabled: true,
      panEnabled: true,
      dragEnabled: true,
    });
  });

  it('DEFAULT_OFFLINE_CACHE_CONFIG：500MB / 7天 / 5分钟同步', () => {
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.enabled).toBe(false);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.maxSize).toBe(500 * 1024 * 1024);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.autoSync).toBe(true);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.syncOnWifiOnly).toBe(false);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.syncInterval).toBe(5 * 60 * 1000);
    expect(DEFAULT_OFFLINE_CACHE_CONFIG.cacheTypes).toEqual([
      'image',
      'document',
      'audio',
      'video',
    ]);
  });

  it('DEFAULT_LAZY_LOAD_CONFIG：默认值', () => {
    expect(DEFAULT_LAZY_LOAD_CONFIG).toEqual({
      enabled: true,
      rootMargin: '200px',
      threshold: 0.1,
      placeholder: '',
      errorImage: '',
    });
  });

  it('DEFAULT_VIRTUAL_SCROLL_CONFIG：默认值', () => {
    expect(DEFAULT_VIRTUAL_SCROLL_CONFIG).toEqual({
      enabled: true,
      itemHeight: 60,
      overscan: 5,
      threshold: 100,
    });
  });

  it('DEFAULT_MOBILE_SETTINGS：标量默认值 + 嵌套引用复用同对象', () => {
    expect(DEFAULT_MOBILE_SETTINGS.theme).toBe('system');
    expect(DEFAULT_MOBILE_SETTINGS.fontSize).toBe('medium');
    expect(DEFAULT_MOBILE_SETTINGS.showBottomNav).toBe(true);
    expect(DEFAULT_MOBILE_SETTINGS.hapticFeedback).toBe(true);
    expect(DEFAULT_MOBILE_SETTINGS.imageQuality).toBe('medium');
    expect(DEFAULT_MOBILE_SETTINGS.pushNotifications).toBe(true);
    expect(DEFAULT_MOBILE_SETTINGS.allowCamera).toBe(true);
    expect(DEFAULT_MOBILE_SETTINGS.allowMicrophone).toBe(false);
    expect(DEFAULT_MOBILE_SETTINGS.allowLocation).toBe(false);
    // 嵌套配置直接复用对应常量（引用相等，非深拷贝）
    expect(DEFAULT_MOBILE_SETTINGS.offlineCache).toBe(DEFAULT_OFFLINE_CACHE_CONFIG);
    expect(DEFAULT_MOBILE_SETTINGS.lazyLoad).toBe(DEFAULT_LAZY_LOAD_CONFIG);
    expect(DEFAULT_MOBILE_SETTINGS.virtualScroll).toBe(DEFAULT_VIRTUAL_SCROLL_CONFIG);
  });
});

// ============================================================================
// 设备判定纯函数
// ============================================================================
describe('mobile/types - 设备判定纯函数', () => {
  it('isMobile：iPhone/Android Mobile UA → true，桌面/无匹配 → false', () => {
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(isMobile()).toBe(true);

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    expect(isMobile()).toBe(true);

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    expect(isMobile()).toBe(false);

    stubNav('userAgent', 'CustomBrowser/1.0');
    expect(isMobile()).toBe(false);
  });

  it('isTablet：iPad / Android(无 Mobile) → true，手机/桌面 → false', () => {
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(isTablet()).toBe(true);

    // Android 平板：含 Android 但不含 Mobile（负向先行断言通过）
    stubNav('userAgent', 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    expect(isTablet()).toBe(true);

    // Android 手机：含 Android 且含 Mobile → 负向先行断言失败 → false
    stubNav(
      'userAgent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    expect(isTablet()).toBe(false);

    // iPhone：不含 iPad / Android → false
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(isTablet()).toBe(false);

    stubNav('userAgent', 'CustomBrowser/1.0');
    expect(isTablet()).toBe(false);
  });

  it('isTouchDevice：ontouchstart in window 或 maxTouchPoints>0 → true，否则 false', () => {
    // jsdom 默认 window.ontouchstart = null（'ontouchstart' in window === true）→ true
    expect(isTouchDevice()).toBe(true);

    // 删除 ontouchstart → 仅剩 maxTouchPoints 判定；默认 undefined（undefined > 0 = false）→ false
    delete (window as unknown as Record<string, unknown>).ontouchstart;
    expect('ontouchstart' in window).toBe(false);
    expect(isTouchDevice()).toBe(false);

    // ontouchstart 不在，但 maxTouchPoints>0 → true
    stubNav('maxTouchPoints', 1);
    expect(isTouchDevice()).toBe(true);
    restoreNav();

    // 恢复 ontouchstart（还原 jsdom 默认状态，避免污染后续用例）→ true
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    expect(isTouchDevice()).toBe(true);
  });

  it('getDeviceType：tablet 优先于 mobile，无匹配 → desktop', () => {
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(getDeviceType()).toBe('tablet');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(getDeviceType()).toBe('mobile');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    expect(getDeviceType()).toBe('mobile');

    // Android 平板（无 Mobile）→ tablet
    stubNav('userAgent', 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    expect(getDeviceType()).toBe('tablet');

    stubNav('userAgent', 'CustomBrowser/1.0');
    expect(getDeviceType()).toBe('desktop');
  });

  it('getOS：按 userAgent 优先级判定（ios > android > windows > macos > linux > unknown）', () => {
    // iPad UA 含 "Mac OS X"，但 iPhone|iPad|iPod 先判定 → ios（验证优先级）
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(getOS()).toBe('ios');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    );
    expect(getOS()).toBe('ios');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    expect(getOS()).toBe('android');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );
    expect(getOS()).toBe('windows');

    stubNav(
      'userAgent',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
    );
    expect(getOS()).toBe('macos');

    // 仅含 Linux（非 Android）→ linux
    stubNav('userAgent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    expect(getOS()).toBe('linux');

    stubNav('userAgent', 'CustomBrowser/1.0');
    expect(getOS()).toBe('unknown');
  });
});

// ============================================================================
// getCurrentBreakpoint
// ============================================================================
describe('mobile/types - getCurrentBreakpoint', () => {
  it('默认断点边界：各阈值恰好等于该断点（>= 判定）', () => {
    // xs: 0..575
    expect(getCurrentBreakpoint(0)).toBe('xs');
    expect(getCurrentBreakpoint(575)).toBe('xs');
    // sm: 576..767
    expect(getCurrentBreakpoint(576)).toBe('sm');
    expect(getCurrentBreakpoint(767)).toBe('sm');
    // md: 768..991
    expect(getCurrentBreakpoint(768)).toBe('md');
    expect(getCurrentBreakpoint(991)).toBe('md');
    // lg: 992..1199
    expect(getCurrentBreakpoint(992)).toBe('lg');
    expect(getCurrentBreakpoint(1199)).toBe('lg');
    // xl: 1200..1399
    expect(getCurrentBreakpoint(1200)).toBe('xl');
    expect(getCurrentBreakpoint(1399)).toBe('xl');
    // xxl: >= 1400
    expect(getCurrentBreakpoint(1400)).toBe('xxl');
    expect(getCurrentBreakpoint(3000)).toBe('xxl');
  });

  it('自定义断点覆盖默认值', () => {
    const custom = { xs: 0, sm: 400, md: 800, lg: 1200, xl: 1600, xxl: 2000 };
    expect(getCurrentBreakpoint(399, custom)).toBe('xs');
    expect(getCurrentBreakpoint(400, custom)).toBe('sm');
    expect(getCurrentBreakpoint(799, custom)).toBe('sm');
    expect(getCurrentBreakpoint(800, custom)).toBe('md');
    expect(getCurrentBreakpoint(1599, custom)).toBe('lg');
    expect(getCurrentBreakpoint(1600, custom)).toBe('xl');
    expect(getCurrentBreakpoint(2000, custom)).toBe('xxl');
  });

  it('未传 breakpoints 参数时使用 DEFAULT_BREAKPOINTS', () => {
    expect(getCurrentBreakpoint(768)).toBe('md');
    expect(getCurrentBreakpoint(1199)).toBe('lg');
  });
});

// ============================================================================
// getSafeAreaInsets
// ============================================================================
describe('mobile/types - getSafeAreaInsets', () => {
  it('默认无 CSS 变量 → 全 0', () => {
    const insets = getSafeAreaInsets();
    expect(insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('CSS 变量已设置 → 解析为数值', () => {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => {
        const map: Record<string, string> = {
          '--safe-area-top': '44px',
          '--safe-area-right': '0px',
          '--safe-area-bottom': '34px',
          '--safe-area-left': '0px',
        };
        return map[name] ?? '';
      },
    } as CSSStyleDeclaration);
    const insets = getSafeAreaInsets();
    expect(insets).toEqual({ top: 44, right: 0, bottom: 34, left: 0 });
    spy.mockRestore();
  });

  it('非数字值 → 回退 0（parseInt NaN || 0）', () => {
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => {
        const map: Record<string, string> = {
          '--safe-area-top': 'abc',
          '--safe-area-right': '',
          '--safe-area-bottom': '34.9px', // parseInt 截断为 34
          '--safe-area-left': 'px',
        };
        return map[name] ?? '';
      },
    } as CSSStyleDeclaration);
    const insets = getSafeAreaInsets();
    expect(insets).toEqual({ top: 0, right: 0, bottom: 34, left: 0 });
    spy.mockRestore();
  });
});

// ============================================================================
// formatFileSizeMobile
// ============================================================================
describe('mobile/types - formatFileSizeMobile', () => {
  it('0 字节 → "0 B"（短路返回）', () => {
    expect(formatFileSizeMobile(0)).toBe('0 B');
  });

  it('B 级：小于 10 取 1 位小数，否则取整', () => {
    expect(formatFileSizeMobile(1)).toBe('1.0 B');
    expect(formatFileSizeMobile(9)).toBe('9.0 B');
    expect(formatFileSizeMobile(500)).toBe('500 B');
    expect(formatFileSizeMobile(1023)).toBe('1023 B');
  });

  it('KB 级：1024 = 1.0 KB，1536 = 1.5 KB，10240 = 10 KB', () => {
    expect(formatFileSizeMobile(1024)).toBe('1.0 KB');
    expect(formatFileSizeMobile(1536)).toBe('1.5 KB');
    expect(formatFileSizeMobile(10240)).toBe('10 KB');
  });

  it('MB/GB/TB 级进位', () => {
    expect(formatFileSizeMobile(1048576)).toBe('1.0 MB'); // 1MB
    expect(formatFileSizeMobile(1572864)).toBe('1.5 MB'); // 1.5MB
    expect(formatFileSizeMobile(1073741824)).toBe('1.0 GB'); // 1GB
    expect(formatFileSizeMobile(1099511627776)).toBe('1.0 TB'); // 1TB
  });

  it('locale 参数实际未被使用（保持默认行为）', () => {
    // formatFileSizeMobile 形参 locale 未在函数体内引用——同一 bytes 不同 locale 结果一致
    expect(formatFileSizeMobile(1024, 'en-US')).toBe(formatFileSizeMobile(1024));
    expect(formatFileSizeMobile(1024, 'en-US')).toBe('1.0 KB');
    expect(formatFileSizeMobile(1048576, 'en-US')).toBe('1.0 MB');
  });
});

// ============================================================================
// formatTimeMobile
// ============================================================================
describe('mobile/types - formatTimeMobile', () => {
  let now: Date;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00.000Z') });
    now = new Date();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('diff < 1 分钟 → "刚刚"（now 与 now-30s）', () => {
    expect(formatTimeMobile(new Date(now.getTime()))).toBe('刚刚');
    expect(formatTimeMobile(new Date(now.getTime() - 30 * 1000))).toBe('刚刚');
  });

  it('1 分钟 <= diff < 1 小时 → "X分钟前"', () => {
    expect(formatTimeMobile(new Date(now.getTime() - 2 * 60 * 1000))).toBe('2分钟前');
    expect(formatTimeMobile(new Date(now.getTime() - 59 * 60 * 1000))).toBe('59分钟前');
  });

  it('1 小时 <= diff < 1 天 → "X小时前"', () => {
    expect(formatTimeMobile(new Date(now.getTime() - 2 * 60 * 60 * 1000))).toBe('2小时前');
    expect(formatTimeMobile(new Date(now.getTime() - 23 * 60 * 60 * 1000))).toBe('23小时前');
  });

  it('1 天 <= diff < 1 周 → "X天前"', () => {
    expect(formatTimeMobile(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000))).toBe('2天前');
    expect(formatTimeMobile(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000))).toBe('6天前');
  });

  it('diff >= 1 周 → toLocaleDateString（zh-CN 短月+日）', () => {
    const date = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const expected = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    expect(formatTimeMobile(date)).toBe(expected);
    // 确认走的是日期分支而非相对时间分支
    expect(formatTimeMobile(date)).not.toMatch(/刚刚|分钟前|小时前|天前$/);
  });

  it('locale 参数控制 >= 1 周分支的日期格式（en-US 与 zh-CN 不同）', () => {
    const date = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const zh = formatTimeMobile(date, 'zh-CN');
    const en = formatTimeMobile(date, 'en-US');
    expect(zh).toBe(date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }));
    expect(en).toBe(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    expect(zh).not.toBe(en);
  });

  it('未来时间（diff 为负）→ "刚刚"（负数 < minute）', () => {
    expect(formatTimeMobile(new Date(now.getTime() + 5 * 1000))).toBe('刚刚');
  });
});
