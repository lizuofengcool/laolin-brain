/**
 * mobile-manager 移动端管理器单测
 *
 * 覆盖目标：src/lib/mobile/mobile-manager.ts。该模块为前端单例 manager，负责设备信息、
 * 断点响应、手势识别（tap/doubleTap/swipe/pan/longPress）、离线队列与设置持久化。
 * 模块依赖 window/navigator/localStorage/Date.now/setTimeout，jsdom 提供前三者；
 * navigator 的 vibrate/connection/share/maxTouchPoints/userAgent 在所需分支不存在或
 * 需定制，故通过 Object.defineProperty 临时挂桩并在 afterEach 还原。手势分支依赖
 * TouchEvent，jsdom 不内置，故构造 `new Event('touchstart'|'touchmove'|'touchend')`
 * 并 defineProperty 注入 touches 数组（含 clientX/clientY/identifier）后 dispatchEvent
 * 触发已注册的 addEventListener 回调。
 *
 * 关键控制流：
 * - init：updateDeviceInfo（getDeviceType/getOS/getBrowser + window 尺寸 + isTouchDevice
 *   + getSafeAreaInsets + getCurrentBreakpoint）→ 注册 resize/orientationchange/online/
 *   offline 监听 → navigator.onLine 设初值 → loadSettings
 * - 设备 getter：deviceInfo 未初始化时 getDeviceType/getOrientation/getOS 返回 null，
 *   isMobile/isTablet/isDesktop/isTouchDevice 返回 false
 * - 断点：setBreakpoints 调 updateDeviceInfo 重算 currentBreakpoint，变化时触发
 *   breakpointListeners
 * - 离线状态：handleOnline（online 事件）置 'online' 且 autoSync 时调 processOfflineQueue；
 *   handleOffline（offline 事件）置 'offline'；onOfflineStatusChange 订阅/退订
 * - 离线队列：addToOfflineQueue 生成 id=`offline_${ts}_${rand9}` + status 'pending' +
 *   retryCount 0 + createdAt；isOnline 时立即触发 processOfflineQueue（async，不 await）。
 *   processOfflineQueue：!isOnline 或 syncing 时直接 return；否则置 'syncing' → 按优先级
 *   desc 排序 pending/failed 项 → 逐项置 'processing' → `await setTimeout(100)` 模拟处理
 *   → 置 'success'（模拟处理恒不抛错，故 catch/retry/failed 分支为 latent 死代码，本文件
 *   不覆盖该死分支，仅覆盖可达的 pending→success 路径与 pending/failed 过滤）→ finally
 *   置 'online'。getOfflineQueue 返回浅拷贝；clearOfflineQueue 清空
 * - 设置：getSettings 返回浅拷贝；updateSettings 浅合并 + saveSettings（localStorage
 *   'mobile_settings' JSON，try/catch 吞错 console.error）；loadSettings 以
 *   DEFAULT_MOBILE_SETTINGS 为底合并已存 JSON
 * - 工具：hapticFeedback（settings.hapticFeedback 关闭或无 navigator.vibrate 时 no-op，
 *   否则按 light/medium/heavy 调 vibrate([10]/[20]/[30])）；isWifiNetwork（无 connection
 *   默认 true；effectiveType '4g'/'wifi' 为 true，其余 false）；canShare（navigator.share
 *   为 function 时 true）；share（canShare false 直接 false；否则 await navigator.share，
 *   resolve 返 true，reject catch 返 false）
 * - 手势 bindGesture：touchstart 记 startX/Y + startTime + 挂 longPress setTimeout；
 *   touchmove 超 tapThreshold 取消 longPress，panEnabled 且超阈值时触发 'pan'；
 *   touchend 依 distance/elapsed/velocity 判定 tap（distance<threshold && elapsed<300）/
 *   doubleTap（上次 tap 在 doubleTapDelay 内）/swipe（distance>swipeThreshold &&
 *   velocity>swipeVelocityThreshold，方向取 |deltaX|/|deltaY| 大者符号）；longPress 由
 *   setTimeout(longPressDelay) 触发。返回 unbind 移除三个监听
 *
 * 计时策略：非手势用例使用真实定时器（processOfflineQueue 内 setTimeout(100) 自然推进）；
 * 手势 describe 内 beforeEach 启用 `vi.useFakeTimers({ now: 1_000_000 })`（固定大值，保证
 * 首次 tap 的 lastTapTime(0) 与 now 差值 > doubleTapDelay 从而判定为 tap 而非 doubleTap），
 * afterEach 还原真实定时器。每个用例 new MobileManager() 独立实例，避免单例状态串扰。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MobileManager } from '@/lib/mobile/mobile-manager';
import {
  DEFAULT_BREAKPOINTS,
  DEFAULT_MOBILE_SETTINGS,
} from '@/lib/mobile/types';

// ============================================================================
// navigator 属性挂桩工具（vibrate/connection/share/maxTouchPoints/userAgent 在所需
// 分支不存在或需定制；defineProperty configurable 便于 afterEach 还原）
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

// ============================================================================
// TouchEvent 构造辅助（jsdom 不内置 TouchEvent；以普通 Event + touches 注入触发监听）
// ============================================================================
interface TouchPoint {
  x: number;
  y: number;
  id?: number;
}

function dispatchTouch(
  el: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend',
  points: TouchPoint[] = []
): void {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p, i) => ({
    clientX: p.x,
    clientY: p.y,
    identifier: p.id ?? i,
  }));
  Object.defineProperty(evt, 'touches', { value: touches, configurable: true });
  el.dispatchEvent(evt);
}

// ============================================================================
// 公共 beforeEach/afterEach
// ============================================================================
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  restoreNav();
  vi.restoreAllMocks();
});

// ============================================================================
// 设备信息
// ============================================================================
describe('MobileManager - 设备信息', () => {
  it('init 前设备信息为空：getDeviceInfo 返回 null，类型/方向/OS getter 返回 null，布尔判定 false', () => {
    const mm = new MobileManager();
    expect(mm.getDeviceInfo()).toBeNull();
    expect(mm.getDeviceType()).toBeNull();
    expect(mm.getOrientation()).toBeNull();
    expect(mm.getOS()).toBeNull();
    expect(mm.isMobile()).toBe(false);
    expect(mm.isTablet()).toBe(false);
    expect(mm.isDesktop()).toBe(false);
    expect(mm.isTouchDevice()).toBe(false);
  });

  it('init 后据 userAgent 填充设备信息（Chrome/Android Mobile → mobile/android/chrome，触屏）', () => {
    stubNav(
      'userAgent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    );
    stubNav('maxTouchPoints', 1);
    const mm = new MobileManager();
    mm.init();

    const info = mm.getDeviceInfo();
    expect(info).not.toBeNull();
    expect(mm.getDeviceType()).toBe('mobile');
    expect(mm.getOS()).toBe('android');
    expect(info!.browser).toBe('chrome');
    expect(mm.isMobile()).toBe(true);
    expect(mm.isTablet()).toBe(false);
    expect(mm.isDesktop()).toBe(false);
    expect(mm.isTouchDevice()).toBe(true);
  });

  it('init 后据 userAgent 填充设备信息（iPad → tablet/ios）', () => {
    stubNav(
      'userAgent',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    );
    const mm = new MobileManager();
    mm.init();

    expect(mm.getDeviceType()).toBe('tablet');
    expect(mm.getOS()).toBe('ios');
    expect(mm.isTablet()).toBe(true);
    expect(mm.isMobile()).toBe(false);
  });
});

// ============================================================================
// 断点
// ============================================================================
describe('MobileManager - 断点', () => {
  it('getBreakpoints 返回默认断点拷贝；setBreakpoints 重算当前断点并触发 onBreakpointChange', () => {
    const mm = new MobileManager();
    mm.init();
    // jsdom 默认 innerWidth 1024 >= lg(992) → 'lg'
    expect(mm.getCurrentBreakpoint()).toBe('lg');
    expect(mm.getBreakpoints()).toEqual(DEFAULT_BREAKPOINTS);

    const seen: string[] = [];
    const off = mm.onBreakpointChange(bp => seen.push(bp));

    // 抬高 lg 阈值使 1024 落入 md 区间
    mm.setBreakpoints({ ...DEFAULT_BREAKPOINTS, lg: 2000, xl: 3000, xxl: 4000 });
    expect(mm.getCurrentBreakpoint()).toBe('md');
    expect(seen).toEqual(['md']);
    expect(mm.getBreakpoints().lg).toBe(2000);

    off();
    mm.setBreakpoints({ ...DEFAULT_BREAKPOINTS });
    expect(seen).toEqual(['md']); // 退订后不再触发
  });
});

// ============================================================================
// 离线状态
// ============================================================================
describe('MobileManager - 离线状态', () => {
  it('init 后默认在线：getOfflineStatus "online"，isOnline true', () => {
    const mm = new MobileManager();
    mm.init();
    expect(mm.getOfflineStatus()).toBe('online');
    expect(mm.isOnline()).toBe(true);
  });

  it('offline/online 事件切换状态并通知 onOfflineStatusChange 监听器', () => {
    const mm = new MobileManager();
    mm.init();
    const seen: string[] = [];
    mm.onOfflineStatusChange(s => seen.push(s));

    window.dispatchEvent(new Event('offline'));
    expect(mm.getOfflineStatus()).toBe('offline');
    expect(mm.isOnline()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(mm.getOfflineStatus()).toBe('online');
    expect(mm.isOnline()).toBe(true);

    // offline 触发 'offline'；online 触发 'online'（autoSync 默认 true 会再触发 syncing→online）
    expect(seen[0]).toBe('offline');
    expect(seen).toContain('online');
  });

  it('onOfflineStatusChange 返回的退订函数移除监听器', () => {
    const mm = new MobileManager();
    mm.init();
    let count = 0;
    const off = mm.onOfflineStatusChange(() => count++);
    window.dispatchEvent(new Event('offline'));
    off();
    window.dispatchEvent(new Event('online'));
    expect(count).toBe(1);
  });
});

// ============================================================================
// 离线队列
// ============================================================================
describe('MobileManager - 离线队列', () => {
  it('addToOfflineQueue（离线态）生成 id 前缀 offline_、status pending、retryCount 0、createdAt 为 Date，并保留传入字段', () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline')); // 离线，避免 add 自动触发 process

    const item = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'f1',
      targetType: 'file',
      data: { name: 'a.txt' },
      priority: 3,
      maxRetries: 5,
    });

    expect(item.id.startsWith('offline_')).toBe(true);
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
    expect(item.createdAt).toBeInstanceOf(Date);
    expect(item.type).toBe('upload');
    expect(item.targetId).toBe('f1');
    expect(item.priority).toBe(3);
    expect(item.maxRetries).toBe(5);

    const q = mm.getOfflineQueue();
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe(item.id);
  });

  it('getOfflineQueue 返回浅拷贝：外部改动不影响内部队列', () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    mm.addToOfflineQueue({
      type: 'create',
      targetId: 't1',
      targetType: 'note',
      data: {},
      priority: 1,
      maxRetries: 3,
    });

    const q = mm.getOfflineQueue();
    q.pop();
    expect(mm.getOfflineQueue()).toHaveLength(1);
  });

  it('clearOfflineQueue 清空全部', () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    mm.addToOfflineQueue({
      type: 'update',
      targetId: 'a',
      targetType: 't',
      data: {},
      priority: 1,
      maxRetries: 1,
    });
    mm.addToOfflineQueue({
      type: 'delete',
      targetId: 'b',
      targetType: 't',
      data: {},
      priority: 1,
      maxRetries: 1,
    });
    expect(mm.getOfflineQueue()).toHaveLength(2);
    mm.clearOfflineQueue();
    expect(mm.getOfflineQueue()).toHaveLength(0);
  });

  it('processOfflineQueue 离线态直接 return，项保持 pending', async () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    const item = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'f',
      targetType: 'file',
      data: {},
      priority: 1,
      maxRetries: 3,
    });
    await mm.processOfflineQueue();
    expect(item.status).toBe('pending');
    expect(mm.getOfflineStatus()).toBe('offline');
  });

  it('processOfflineQueue 在线态处理全部 pending→success，状态历经 syncing→online', async () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    const a = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'a',
      targetType: 'file',
      data: {},
      priority: 1,
      maxRetries: 3,
    });
    const b = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'b',
      targetType: 'file',
      data: {},
      priority: 5,
      maxRetries: 3,
    });

    const seen: string[] = [];
    mm.onOfflineStatusChange(s => seen.push(s));

    // 关闭 autoSync，避免 online 事件自动触发 process，便于手动控制
    mm.updateSettings({
      offlineCache: { ...mm.getSettings().offlineCache, autoSync: false },
    });
    window.dispatchEvent(new Event('online'));
    await mm.processOfflineQueue();

    expect(a.status).toBe('success');
    expect(b.status).toBe('success');
    expect(mm.getOfflineStatus()).toBe('online');
    expect(seen).toContain('syncing');
    expect(seen[seen.length - 1]).toBe('online');
  });

  it('processOfflineQueue 过滤跳过已 success 项：二次处理无变化', async () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    const a = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'a',
      targetType: 'file',
      data: {},
      priority: 1,
      maxRetries: 3,
    });
    mm.updateSettings({
      offlineCache: { ...mm.getSettings().offlineCache, autoSync: false },
    });
    window.dispatchEvent(new Event('online'));
    await mm.processOfflineQueue();
    expect(a.status).toBe('success');
    const retryBefore = a.retryCount;

    await mm.processOfflineQueue(); // success 项被过滤
    expect(a.status).toBe('success');
    expect(a.retryCount).toBe(retryBefore);
  });

  it('addToOfflineQueue 在线态自动触发 processOfflineQueue，项最终 success', async () => {
    const mm = new MobileManager();
    mm.init();
    const item = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'a',
      targetType: 'file',
      data: {},
      priority: 1,
      maxRetries: 3,
    });
    // 模拟处理内含 setTimeout(100)，等待其完成
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(item.status).toBe('success');
  });

  it('handleOnline（autoSync 默认 true）online 事件自动同步离线队列', async () => {
    const mm = new MobileManager();
    mm.init();
    window.dispatchEvent(new Event('offline'));
    const item = mm.addToOfflineQueue({
      type: 'upload',
      targetId: 'a',
      targetType: 'file',
      data: {},
      priority: 1,
      maxRetries: 3,
    });
    expect(item.status).toBe('pending');

    window.dispatchEvent(new Event('online')); // autoSync → 自动 process
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(item.status).toBe('success');
  });
});

// ============================================================================
// 设置
// ============================================================================
describe('MobileManager - 设置', () => {
  it('getSettings 返回浅拷贝：外部改动不影响内部', () => {
    const mm = new MobileManager();
    mm.init();
    const s = mm.getSettings();
    s.theme = 'dark';
    s.fontSize = 'large';
    expect(mm.getSettings().theme).toBe(DEFAULT_MOBILE_SETTINGS.theme);
    expect(mm.getSettings().fontSize).toBe(DEFAULT_MOBILE_SETTINGS.fontSize);
  });

  it('updateSettings 浅合并并持久化到 localStorage(mobile_settings)', () => {
    const mm = new MobileManager();
    mm.init();
    mm.updateSettings({ theme: 'dark', fontSize: 'large' });

    expect(mm.getSettings().theme).toBe('dark');
    expect(mm.getSettings().fontSize).toBe('large');
    expect(mm.getSettings().showBottomNav).toBe(
      DEFAULT_MOBILE_SETTINGS.showBottomNav
    ); // 未传字段保留默认

    const saved = JSON.parse(localStorage.getItem('mobile_settings')!);
    expect(saved.theme).toBe('dark');
    expect(saved.fontSize).toBe('large');
  });

  it('loadSettings 以 DEFAULT_MOBILE_SETTINGS 为底合并已存 JSON（部分字段覆盖，其余保留默认）', () => {
    localStorage.setItem(
      'mobile_settings',
      JSON.stringify({ theme: 'dark', fontSize: 'large' })
    );
    const mm = new MobileManager();
    mm.init();

    const s = mm.getSettings();
    expect(s.theme).toBe('dark');
    expect(s.fontSize).toBe('large');
    expect(s.showBottomNav).toBe(DEFAULT_MOBILE_SETTINGS.showBottomNav);
    expect(s.offlineCache.autoSync).toBe(
      DEFAULT_MOBILE_SETTINGS.offlineCache.autoSync
    );
  });

  it('saveSettings 吞掉 localStorage.setItem 抛错（console.error，不外抛）', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const mm = new MobileManager();
    mm.init();

    expect(() => mm.updateSettings({ theme: 'dark' })).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    // 内部 settings 仍应更新（updateSettings 先合并再 save）
    expect(mm.getSettings().theme).toBe('dark');
  });
});

// ============================================================================
// 工具方法（触感反馈 / WiFi 判定 / 分享）
// ============================================================================
describe('MobileManager - 工具方法', () => {
  it('hapticFeedback 按类型调用 navigator.vibrate([10]/[20]/[30])；settings 关闭时不触发', () => {
    const vibrate = vi.fn();
    stubNav('vibrate', vibrate);

    const mm = new MobileManager();
    mm.init();
    // 默认 hapticFeedback=true
    mm.hapticFeedback('light');
    mm.hapticFeedback('medium');
    mm.hapticFeedback('heavy');
    // 源码以 navigator.vibrate(patterns[type]) 调用，patterns[type] 为数组 [10]/[20]/[30]
    expect(vibrate).toHaveBeenNthCalledWith(1, [10]);
    expect(vibrate).toHaveBeenNthCalledWith(2, [20]);
    expect(vibrate).toHaveBeenNthCalledWith(3, [30]);

    mm.updateSettings({ hapticFeedback: false });
    vibrate.mockClear();
    mm.hapticFeedback('medium');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('hapticFeedback 无 navigator.vibrate 时 no-op（不抛错）', () => {
    const mm = new MobileManager();
    mm.init();
    expect(() => mm.hapticFeedback('light')).not.toThrow();
  });

  it('isWifiNetwork：无 connection 默认 true；effectiveType 4g/wifi 为 true，其余 false', () => {
    const mm = new MobileManager();
    mm.init();
    // jsdom 默认无 navigator.connection
    expect(mm.isWifiNetwork()).toBe(true);

    stubNav('connection', { effectiveType: '4g' });
    expect(mm.isWifiNetwork()).toBe(true);

    stubNav('connection', { effectiveType: 'wifi' });
    expect(mm.isWifiNetwork()).toBe(true);

    stubNav('connection', { effectiveType: '3g' });
    expect(mm.isWifiNetwork()).toBe(false);
  });

  it('canShare：navigator.share 非函数时 false，为函数时 true', () => {
    const mm = new MobileManager();
    mm.init();
    expect(mm.canShare()).toBe(false);

    stubNav('share', vi.fn());
    expect(mm.canShare()).toBe(true);
  });

  it('share：canShare false 直接返 false；resolve 返 true；reject catch 返 false', async () => {
    const mm = new MobileManager();
    mm.init();
    expect(await mm.share({ title: 't' })).toBe(false);

    // share 成功
    stubNav('share', vi.fn().mockResolvedValue(undefined));
    expect(await mm.share({ title: 't' })).toBe(true);

    // share 抛错（用户取消等）
    stubNav('share', vi.fn().mockRejectedValue(new Error('AbortError')));
    expect(await mm.share({ title: 't' })).toBe(false);
  });
});

// ============================================================================
// 手势（fake timers）
// ============================================================================
describe('MobileManager - 手势 bindGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tap：start+end 同点且 elapsed<300 触发 tap', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    mm.bindGesture(el, e => events.push(e));

    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchend', []);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('tap');
    expect(events[0].x).toBe(100);
    expect(events[0].y).toBe(100);
  });

  it('doubleTap：连续两次 tap 第二次触发 doubleTap', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    mm.bindGesture(el, e => events.push(e));

    dispatchTouch(el, 'touchstart', [{ x: 50, y: 50 }]);
    dispatchTouch(el, 'touchend', []);
    dispatchTouch(el, 'touchstart', [{ x: 50, y: 50 }]);
    dispatchTouch(el, 'touchend', []);

    expect(events.map(e => e.type)).toEqual(['tap', 'doubleTap']);
  });

  it('swipe 四方向：touchmove 更新末点后 touchend 判定方向', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    // 关闭 pan，避免 touchmove 触发 pan 干扰
    mm.bindGesture(el, e => events.push(e), { panEnabled: false });

    // right
    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchmove', [{ x: 260, y: 100 }]);
    dispatchTouch(el, 'touchend', []);
    // left
    dispatchTouch(el, 'touchstart', [{ x: 200, y: 100 }]);
    dispatchTouch(el, 'touchmove', [{ x: 50, y: 100 }]);
    dispatchTouch(el, 'touchend', []);
    // up
    dispatchTouch(el, 'touchstart', [{ x: 100, y: 200 }]);
    dispatchTouch(el, 'touchmove', [{ x: 100, y: 20 }]);
    dispatchTouch(el, 'touchend', []);
    // down
    dispatchTouch(el, 'touchstart', [{ x: 100, y: 20 }]);
    dispatchTouch(el, 'touchmove', [{ x: 100, y: 220 }]);
    dispatchTouch(el, 'touchend', []);

    expect(events.map(e => e.type)).toEqual([
      'swipe',
      'swipe',
      'swipe',
      'swipe',
    ]);
    expect(events.map(e => e.direction)).toEqual([
      'right',
      'left',
      'up',
      'down',
    ]);
  });

  it('pan：touchmove 位移超 tapThreshold 触发 pan', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    mm.bindGesture(el, e => events.push(e));

    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchmove', [{ x: 160, y: 100 }]); // totalDeltaX=60 > 10

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pan');
    expect(events[0].deltaX).toBe(60);
  });

  it('longPress：touchstart 后推进 longPressDelay 触发 longPress', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    mm.bindGesture(el, e => events.push(e), { longPressDelay: 500 });

    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    expect(events).toHaveLength(0);
    vi.advanceTimersByTime(500);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('longPress');
  });

  it('unbind 返回的函数移除监听：解绑后再 dispatch 不触发手势', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    const unbind = mm.bindGesture(el, e => events.push(e));

    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchend', []);
    expect(events).toHaveLength(1);

    unbind();
    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchend', []);
    expect(events).toHaveLength(1); // 未增加
  });

  it('gestureConfig.enabled=false 时不触发任何手势', () => {
    const mm = new MobileManager();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const events: any[] = [];
    mm.bindGesture(el, e => events.push(e), { enabled: false });

    dispatchTouch(el, 'touchstart', [{ x: 100, y: 100 }]);
    dispatchTouch(el, 'touchend', []);
    vi.advanceTimersByTime(500); // longPress 也不应触发
    expect(events).toHaveLength(0);
  });
});
