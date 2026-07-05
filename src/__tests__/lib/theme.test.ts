import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_THEME,
  getThemeMode,
  setThemeMode,
  applyTheme,
  prefersDarkMode,
  getResolvedTheme,
  onThemeChange,
  onSystemThemeChange,
  initTheme,
  toggleTheme,
  getThemeModeName,
} from '@/lib/theme';

/**
 * theme.ts 单元测试
 *
 * 模块依赖 window/localStorage/document/matchMedia（jsdom 默认未实现 matchMedia），
 * 故测试内自行 polyfill matchMedia。SSR 分支（typeof window === 'undefined"）
 * 经 withWindowUndefined 辅助函数用 Object.defineProperty 临时置空 window 并 try/finally 恢复，
 * 不依赖 vi.unstubAllGlobals（在 jsdom 下对 window 这种内置 global 不可靠）。
 */

/**
 * 临时将 globalThis.window 置为 undefined 以模拟 SSR，执行 fn 后恢复原 descriptor。
 * 用 Object.defineProperty 而非直接赋值，确保 typeof window === 'undefined' 成立且可恢复。
 */
function withWindowUndefined<T>(fn: () => T): T {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    return fn();
  } finally {
    if (saved) {
      Object.defineProperty(globalThis, 'window', saved);
    }
  }
}

type MatchMediaListener = (e: MediaQueryListEvent | Event) => void;

interface MockMediaQuery {
  matches: boolean;
  addEventListener: (type: string, l: MatchMediaListener) => void;
  removeEventListener: (type: string, l: MatchMediaListener) => void;
  addListener: (l: MatchMediaListener) => void;
  removeListener: (l: MatchMediaListener) => void;
  __emit: (matches: boolean) => void;
}

/**
 * 创建 mock MediaQueryList（含 __emit 触发 change 事件）。
 * window.matchMedia 是函数：(query: string) => MediaQueryList，故需配合 makeMatchMediaFn 使用。
 */
function makeMql(initialMatches: boolean): MockMediaQuery {
  const listeners = new Set<MatchMediaListener>();
  let matches = initialMatches;
  return {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, l: MatchMediaListener) => {
      listeners.add(l);
    },
    removeEventListener: (_type: string, l: MatchMediaListener) => {
      listeners.delete(l);
    },
    addListener: (l: MatchMediaListener) => {
      listeners.add(l);
    },
    removeListener: (l: MatchMediaListener) => {
      listeners.delete(l);
    },
    __emit: (next: boolean) => {
      matches = next;
      const evt = { matches: next } as MediaQueryListEvent;
      listeners.forEach((l) => l(evt));
    },
  };
}

/**
 * 创建可安装到 window.matchMedia 的函数：返回固定的 MQL 实例。
 * 返回元组 [matchMediaFn, mql]，mql 供测试改 matches 与 __emit 用。
 */
function makeMatchMediaFn(initialMatches: boolean): { fn: (q: string) => MockMediaQuery; mql: MockMediaQuery } {
  const mql = makeMql(initialMatches);
  const fn = (_q: string) => mql;
  return { fn, mql };
}

/**
 * 安装一个返回固定 matches 的 matchMedia 函数到 window.matchMedia，
 * 返回 mql 供测试 __emit 改 matches 用。
 */
function installMatchMedia(matches: boolean): MockMediaQuery {
  const { fn, mql } = makeMatchMediaFn(matches);
  window.matchMedia = fn as unknown as MediaQueryList;
  return mql;
}

describe('theme.ts', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    // jsdom 不实现 matchMedia，需 polyfill（默认 prefers-color-scheme: light）
    originalMatchMedia = window.matchMedia;
    const { fn } = makeMatchMediaFn(false);
    window.matchMedia = fn as unknown as MediaQueryList;
    // 清空 localStorage / root class，避免跨测试污染
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    // 恢复 matchMedia（SSR 测试已用 withWindowUndefined 恢复 window，安全赋值）
    if (originalMatchMedia !== undefined) {
      window.matchMedia = originalMatchMedia;
    }
    vi.clearAllMocks();
  });

  // ==================== DEFAULT_THEME 常量 ====================

  describe('DEFAULT_THEME', () => {
    it('默认主题为 "system"（跟随系统）', () => {
      expect(DEFAULT_THEME).toBe('system');
    });
  });

  // ==================== getThemeMode ====================

  describe('getThemeMode', () => {
    it('localStorage 无值时返回 DEFAULT_THEME', () => {
      expect(getThemeMode()).toBe(DEFAULT_THEME);
      expect(getThemeMode()).toBe('system');
    });

    it('保存为 "light" 时返回 "light"', () => {
      localStorage.setItem('theme', 'light');
      expect(getThemeMode()).toBe('light');
    });

    it('保存为 "dark" 时返回 "dark"', () => {
      localStorage.setItem('theme', 'dark');
      expect(getThemeMode()).toBe('dark');
    });

    it('保存为 "system" 时返回 "system"', () => {
      localStorage.setItem('theme', 'system');
      expect(getThemeMode()).toBe('system');
    });

    it('保存为非法值（如 "purple"）时回退 DEFAULT_THEME，不抛错', () => {
      localStorage.setItem('theme', 'purple');
      expect(getThemeMode()).toBe(DEFAULT_THEME);
    });

    it('保存为空字符串时回退 DEFAULT_THEME', () => {
      localStorage.setItem('theme', '');
      expect(getThemeMode()).toBe(DEFAULT_THEME);
    });

    it('SSR（typeof window === "undefined"）返回 DEFAULT_THEME', () => {
      withWindowUndefined(() => {
        expect(getThemeMode()).toBe(DEFAULT_THEME);
      });
    });
  });

  // ==================== setThemeMode ====================

  describe('setThemeMode', () => {
    it('合法 mode 写入 localStorage 并应用主题（dark）', () => {
      setThemeMode('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('合法 mode "light" 移除 dark class 并设 colorScheme=light', () => {
      document.documentElement.classList.add('dark');
      setThemeMode('light');
      expect(localStorage.getItem('theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('合法 mode 派发 "themechange" 自定义事件（detail.mode）', () => {
      const handler = vi.fn();
      window.addEventListener('themechange', handler);
      setThemeMode('dark');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
      expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: 'dark' });
      window.removeEventListener('themechange', handler);
    });

    it('非法 mode（"purple"）不写 localStorage、不派发事件、console.warn 提示', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handler = vi.fn();
      window.addEventListener('themechange', handler);
      setThemeMode('purple' as never);
      expect(localStorage.getItem('theme')).toBeNull();
      expect(handler).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Unsupported theme mode');
      expect(warnSpy.mock.calls[0][0]).toContain('purple');
      window.removeEventListener('themechange', handler);
      warnSpy.mockRestore();
    });

    it('SSR 无操作（不抛错、不写 localStorage）', () => {
      withWindowUndefined(() => {
        expect(() => setThemeMode('dark')).not.toThrow();
      });
    });
  });

  // ==================== applyTheme ====================

  describe('applyTheme', () => {
    it('mode="dark" 添加 dark class、colorScheme=dark', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('mode="light" 移除 dark class、colorScheme=light', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('mode="system" + 系统偏好 dark → 应用 dark', () => {
      installMatchMedia(true);
      applyTheme('system');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('mode="system" + 系统偏好 light → 应用 light', () => {
      installMatchMedia(false);
      applyTheme('system');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('SSR 无操作', () => {
      withWindowUndefined(() => {
        expect(() => applyTheme('dark')).not.toThrow();
      });
    });
  });

  // ==================== prefersDarkMode ====================

  describe('prefersDarkMode', () => {
    it('系统偏好 dark 时返回 true', () => {
      installMatchMedia(true);
      expect(prefersDarkMode()).toBe(true);
    });

    it('系统偏好 light 时返回 false', () => {
      installMatchMedia(false);
      expect(prefersDarkMode()).toBe(false);
    });

    it('SSR 返回 false', () => {
      withWindowUndefined(() => {
        expect(prefersDarkMode()).toBe(false);
      });
    });
  });

  // ==================== getResolvedTheme ====================

  describe('getResolvedTheme', () => {
    it('mode=light → "light"（忽略系统）', () => {
      localStorage.setItem('theme', 'light');
      installMatchMedia(true);
      expect(getResolvedTheme()).toBe('light');
    });

    it('mode=dark → "dark"（忽略系统）', () => {
      localStorage.setItem('theme', 'dark');
      installMatchMedia(false);
      expect(getResolvedTheme()).toBe('dark');
    });

    it('mode=system + 系统偏好 dark → "dark"', () => {
      localStorage.setItem('theme', 'system');
      installMatchMedia(true);
      expect(getResolvedTheme()).toBe('dark');
    });

    it('mode=system + 系统偏好 light → "light"', () => {
      localStorage.setItem('theme', 'system');
      installMatchMedia(false);
      expect(getResolvedTheme()).toBe('light');
    });

    it('mode=system（DEFAULT_THEME）+ 系统偏好 dark → "dark"', () => {
      // 不显式 setItem，走 DEFAULT_THEME=system 分支
      installMatchMedia(true);
      expect(getResolvedTheme()).toBe('dark');
    });
  });

  // ==================== onThemeChange ====================

  describe('onThemeChange', () => {
    it('回调在 themechange 事件触发时收到 mode', () => {
      let received: string | undefined;
      const unsub = onThemeChange((mode) => {
        received = mode;
      });
      // 模拟 setThemeMode 派发的事件
      window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: 'dark' } }));
      expect(received).toBe('dark');
      unsub();
    });

    it('返回的取消函数移除监听后不再回调', () => {
      const cb = vi.fn();
      const unsub = onThemeChange(cb);
      unsub();
      window.dispatchEvent(new CustomEvent('themechange', { detail: { mode: 'light' } }));
      expect(cb).not.toHaveBeenCalled();
    });

    it('SSR 返回无操作函数（不抛错）', () => {
      withWindowUndefined(() => {
        const unsub = onThemeChange(() => {});
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });
    });
  });

  // ==================== onSystemThemeChange ====================

  describe('onSystemThemeChange', () => {
    it('现代浏览器路径：经 addEventListener 注册，change 事件回调收到 matches', () => {
      const { fn, mql } = makeMatchMediaFn(false);
      window.matchMedia = fn as unknown as MediaQueryList;
      const cb = vi.fn();
      const unsub = onSystemThemeChange(cb);
      mql.__emit(true);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(true);
      unsub();
    });

    it('取消函数经 removeEventListener 移除后不再回调', () => {
      const { fn, mql } = makeMatchMediaFn(false);
      window.matchMedia = fn as unknown as MediaQueryList;
      const cb = vi.fn();
      const unsub = onSystemThemeChange(cb);
      unsub();
      mql.__emit(true);
      expect(cb).not.toHaveBeenCalled();
    });

    it('旧浏览器路径：mediaQuery.addEventListener 不存在时回退 addListener', () => {
      const { fn, mql } = makeMatchMediaFn(false);
      // 删除 addEventListener/removeEventListener 模拟旧浏览器
      delete (mql as Partial<MockMediaQuery>).addEventListener;
      delete (mql as Partial<MockMediaQuery>).removeEventListener;
      window.matchMedia = fn as unknown as MediaQueryList;
      const cb = vi.fn();
      const unsub = onSystemThemeChange(cb);
      mql.__emit(true);
      expect(cb).toHaveBeenCalledWith(true);
      unsub();
      // 取消后不再回调
      mql.__emit(false);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('SSR 返回无操作函数', () => {
      withWindowUndefined(() => {
        const unsub = onSystemThemeChange(() => {});
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
      });
    });
  });

  // ==================== initTheme ====================

  describe('initTheme', () => {
    it('读取 localStorage 并应用（dark）', () => {
      localStorage.setItem('theme', 'dark');
      initTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('无保存值时应用 DEFAULT_THEME=system + 系统偏好 light', () => {
      installMatchMedia(false);
      initTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('无保存值时应用 DEFAULT_THEME=system + 系统偏好 dark', () => {
      installMatchMedia(true);
      initTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('SSR 无操作', () => {
      withWindowUndefined(() => {
        expect(() => initTheme()).not.toThrow();
      });
    });
  });

  // ==================== toggleTheme ====================

  describe('toggleTheme', () => {
    it('当前 resolved=light 时切换到 dark', () => {
      localStorage.setItem('theme', 'light');
      installMatchMedia(true);
      toggleTheme();
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('当前 resolved=dark 时切换到 light', () => {
      localStorage.setItem('theme', 'dark');
      installMatchMedia(true);
      toggleTheme();
      expect(localStorage.getItem('theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('mode=system + 系统偏好 dark（resolved=dark）→ 切到 light', () => {
      // 不显式 set theme，DEFAULT_THEME=system；系统偏好 dark → resolved=dark
      installMatchMedia(true);
      toggleTheme();
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('mode=system + 系统偏好 light（resolved=light）→ 切到 dark', () => {
      installMatchMedia(false);
      toggleTheme();
      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  // ==================== getThemeModeName ====================

  describe('getThemeModeName', () => {
    it('light → "浅色模式"', () => {
      expect(getThemeModeName('light')).toBe('浅色模式');
    });

    it('dark → "深色模式"', () => {
      expect(getThemeModeName('dark')).toBe('深色模式');
    });

    it('system → "跟随系统"', () => {
      expect(getThemeModeName('system')).toBe('跟随系统');
    });

    it('三个 mode 名称互不相同（无重复映射）', () => {
      const names = new Set(['浅色模式', '深色模式', '跟随系统']);
      expect(names.has(getThemeModeName('light'))).toBe(true);
      expect(names.has(getThemeModeName('dark'))).toBe(true);
      expect(names.has(getThemeModeName('system'))).toBe(true);
    });
  });
});
