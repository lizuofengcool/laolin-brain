/**
 * i18n/i18n-manager I18nManager 多语言管理器直接单测
 *
 * 覆盖目标：src/lib/i18n/i18n-manager.ts。该模块为前端 i18n 管理器，运行时依赖：
 * - 同级 ./types（纯常量 DEFAULT_I18N_SETTINGS/DEFAULT_LANGUAGE/SUPPORTED_LANGUAGES + 纯函数
 *   detectBrowserLanguage/formatDate/formatRelativeTime/formatNumber/formatFileSize/
 *   formatDuration/pluralize/isRTLLanguage），零 db/crypto/fetch；
 * - 同级 ./locales/zh-CN.json、./locales/en-US.json（静态 JSON import，vitest jsdom 下直读）。
 *
 * 隔离策略：I18nManager 构造器 public，每个用例 `new I18nManager()` 取全新实例（fresh
 * settings/currentLanguage/translations/missingKeys/listeners），完全避免单例共享状态污染。
 * 注意：模块级 TRANSLATIONS 常量会被 addTranslations 原地 mutate（共享全局），故 addTranslations
 * 用例统一以 'ja-JP'（已支持但无 JSON 文件 → 初值为 {}）作沙箱语言、且每个用例使用唯一 key，
 * 不污染 zh-CN/en-US 的只读断言；其余用例仅读 TRANSLATIONS 不写，跨用例隔离成立。
 * localStorage 经 saveSettings/loadSettings 读写，beforeEach 统一 clear 防跨用例泄漏；
 * document.documentElement lang/dir 与 navigator.language 在 beforeEach 还原。
 * 时间敏感用例（formatRelativeTime）用 vi.useFakeTimers + vi.setSystemTime 固定时刻。
 *
 * 关键控制流：
 * - init：window 未定义 → no-op；loadSettings 从 localStorage 恢复（损坏 JSON 容错）；
 *   autoDetect=true 时 detectBrowserLanguage 改写 currentLanguage；loadTranslations；applyLanguage
 * - 设置管理：getSettings 返回浅拷贝；updateSettings 浅合并 + language 触发 setLanguage + 触发
 *   settingsChange 监听器 + saveSettings（persist=false 或 localStorage 缺省时跳过）
 * - 语言管理：setLanguage 相同语言早返回；不同语言 → 切换 + loadTranslations + applyLanguage +
 *   saveSettings + 触发 languageChange；getSupportedLanguages/isLanguageSupported；applyLanguage 设
 *   document lang/dir（RTL→rtl，否则 ltr）
 * - 翻译 t：当前语言查找 → 回退语言查找（命中前记录 missingKey + console.warn）→ 仍无返回 key；
 *   字符串值做 {placeholder} 插值（缺失占位符保留原样）；数组值 join(', ')；其余 String(value)
 * - getNestedValue：按 '.' 拆分逐层取值，遇 null/undefined 中止
 * - addTranslations：新建/合并到模块级 TRANSLATIONS（deepMerge 嵌套对象）；lang===current 时重载
 * - has：当前或回退任一命中即 true；getTranslations 返回拷贝
 * - missingKeys：Set 去重；getMissingKeys/clearMissingKeys
 * - 格式化方法：formatDate/formatRelativeTime/formatNumber/formatFileSize/formatDuration/pluralize
 *   均委托 ./types 同名函数并传入 currentLanguage
 * - 事件：onLanguageChange/onSettingsChange 返回取消订阅函数；destroy 清空全部监听器与 missingKeys
 * - resetToDefault：恢复 DEFAULT 设置 + currentLanguage + loadTranslations + applyLanguage +
 *   saveSettings + 触发两类监听器
 * - exportSettings/importSettings：JSON 序列化/反序列化（损坏 JSON 返回 false 容错）；importSettings
 *   language 变更时触发 languageChange
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nManager, i18n, t } from '@/lib/i18n/i18n-manager';
import {
  DEFAULT_I18N_SETTINGS,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectBrowserLanguage,
  isRTLLanguage,
  type LanguageCode,
} from '@/lib/i18n/types';

// 沙箱语言：已支持但无 JSON 文件 → TRANSLATIONS['ja-JP'] 初值为 {}，用于 addTranslations 等会
// 原地 mutate 模块级 TRANSLATIONS 的用例，避免污染 zh-CN/en-US 只读断言。
const SANDBOX_LANG: LanguageCode = 'ja-JP';

// 基准时刻：2026-07-15 10:00:00 UTC。选月中以避免任何时区下日期算术跨月边界。
const NOW = new Date('2026-07-15T10:00:00Z');

// zh-CN locale 中确认存在的翻译键（locales/zh-CN.json: common.confirm = "确认"）。
const ZH_CONFIRM = '确认';
const EN_CONFIRM = 'Confirm';

beforeEach(() => {
  // 清空 localStorage，避免 saveSettings 跨用例经 loadSettings 泄漏。
  localStorage.clear();
  // 还原 document 属性（applyLanguage 会写 lang/dir）。
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
  // 还原 navigator.language 到 jsdom 默认（detectBrowserLanguage 读取）。
  Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 取一个加载了 zh-CN 翻译的全新实例（resetToDefault 会调用 loadTranslations）。
function makeManagerWithDefaults(): I18nManager {
  const m = new I18nManager();
  m.resetToDefault();
  return m;
}

describe('I18nManager — 构造与初始状态', () => {
  it('默认语言为 DEFAULT_LANGUAGE（zh-CN）', () => {
    const m = new I18nManager();
    expect(m.getLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(m.getLanguage()).toBe('zh-CN');
  });

  it('默认设置深等于 DEFAULT_I18N_SETTINGS', () => {
    const m = new I18nManager();
    expect(m.getSettings()).toEqual(DEFAULT_I18N_SETTINGS);
  });

  it('getSettings 返回浅拷贝：改顶层字段不影响内部', () => {
    const m = new I18nManager();
    const s = m.getSettings();
    s.language = 'en-US';
    expect(m.getSettings().language).toBe('zh-CN');
  });

  it('初始 missingKeys 为空', () => {
    const m = new I18nManager();
    expect(m.getMissingKeys()).toEqual([]);
  });

  it('初始未加载翻译：getTranslations 为空对象、has 任意为 false', () => {
    const m = new I18nManager();
    expect(m.getTranslations()).toEqual({});
    expect(m.has('common.confirm')).toBe(false);
  });

  it('getSupportedLanguages 返回 SUPPORTED_LANGUAGES（同一引用）', () => {
    const m = new I18nManager();
    expect(m.getSupportedLanguages()).toBe(SUPPORTED_LANGUAGES);
  });

  it('SUPPORTED_LANGUAGES 含 5 种语言（zh-CN/zh-TW/en-US/ja-JP/ko-KR）', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(codes).toEqual(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']);
  });

  it('DEFAULT_I18N_SETTINGS 字段完整性', () => {
    expect(DEFAULT_I18N_SETTINGS.language).toBe('zh-CN');
    expect(DEFAULT_I18N_SETTINGS.fallbackLanguage).toBe('en-US');
    expect(DEFAULT_I18N_SETTINGS.autoDetect).toBe(true);
    expect(DEFAULT_I18N_SETTINGS.persist).toBe(true);
    expect(DEFAULT_I18N_SETTINGS.showOriginal).toBe(false);
    expect(DEFAULT_I18N_SETTINGS.missingKeyWarning).toBe(true);
    expect(DEFAULT_I18N_SETTINGS.dateFormat.dateStyle).toBe('medium');
    expect(DEFAULT_I18N_SETTINGS.numberFormat.useGrouping).toBe(true);
  });
});

describe('I18nManager — init() 初始化', () => {
  it('autoDetect=false：保持默认语言 zh-CN 并加载翻译', () => {
    const m = new I18nManager();
    m.updateSettings({ autoDetect: false });
    m.init();
    expect(m.getLanguage()).toBe('zh-CN');
    expect(m.has('common.confirm')).toBe(true);
    expect(m.t('common.confirm')).toBe(ZH_CONFIRM);
  });

  it('autoDetect=true 且 navigator.language=en-US：检测为 en-US 并加载 en-US 翻译', () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    const m = new I18nManager();
    m.init();
    expect(m.getLanguage()).toBe('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('autoDetect=true 且 navigator.language=zh-CN：检测与默认相同，保持 zh-CN', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    const m = new I18nManager();
    m.init();
    expect(m.getLanguage()).toBe('zh-CN');
    expect(m.t('common.confirm')).toBe(ZH_CONFIRM);
  });

  it('autoDetect=true 且 navigator.language=zh（前缀）：前缀匹配到 zh-CN', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh', configurable: true });
    const m = new I18nManager();
    m.init();
    expect(m.getLanguage()).toBe('zh-CN');
  });

  it('autoDetect=true 且 navigator.language=fr-FR（未支持）：回退默认 zh-CN', () => {
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
    const m = new I18nManager();
    m.init();
    expect(m.getLanguage()).toBe('zh-CN');
  });

  it('persist=true：init 后设置写入 localStorage', () => {
    const m = new I18nManager();
    m.updateSettings({ autoDetect: false });
    m.init();
    expect(localStorage.getItem('i18n_settings')).not.toBeNull();
    const saved = JSON.parse(localStorage.getItem('i18n_settings')!);
    expect(saved.language).toBe('zh-CN');
  });

  it('loadSettings：从 localStorage 恢复已保存设置与语言', () => {
    const stored = {
      ...DEFAULT_I18N_SETTINGS,
      language: 'en-US',
      autoDetect: false,
    };
    localStorage.setItem('i18n_settings', JSON.stringify(stored));
    const m = new I18nManager();
    m.init();
    // autoDetect=false → 不改写；loadSettings 已将 currentLanguage 置为 en-US
    expect(m.getLanguage()).toBe('en-US');
    expect(m.getSettings().autoDetect).toBe(false);
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('loadSettings 容错：损坏 JSON 不抛错、保持默认设置', () => {
    // 注意：不可在 init 前调用 updateSettings——它会 saveSettings 写回合法 JSON 覆盖损坏项。
    // 改为把 navigator.language 置为 zh-CN（=== 默认 currentLanguage），使 autoDetect 不改写语言。
    localStorage.setItem('i18n_settings', '{not valid json');
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = new I18nManager();
    m.init();
    expect(m.getLanguage()).toBe('zh-CN');
    expect(m.getSettings()).toEqual(DEFAULT_I18N_SETTINGS);
    expect(err).toHaveBeenCalled();
  });

  it('saveSettings 容错：localStorage.setItem 抛错时不向上抛', () => {
    const err = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = new I18nManager();
    expect(() => m.updateSettings({ autoDetect: false })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('I18nManager — 设置管理', () => {
  it('updateSettings 浅合并：仅更新传入字段，其余保留', () => {
    const m = new I18nManager();
    m.updateSettings({ showOriginal: true });
    expect(m.getSettings().showOriginal).toBe(true);
    expect(m.getSettings().persist).toBe(DEFAULT_I18N_SETTINGS.persist);
    expect(m.getSettings().autoDetect).toBe(DEFAULT_I18N_SETTINGS.autoDetect);
  });

  it('updateSettings 触发 settingsChange 监听器（传入合并后设置）', () => {
    const m = new I18nManager();
    const fn = vi.fn();
    m.onSettingsChange(fn);
    m.updateSettings({ showOriginal: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].showOriginal).toBe(true);
  });

  it('updateSettings 传 language 触发 setLanguage：切换语言并加载翻译', () => {
    const m = new I18nManager();
    m.updateSettings({ autoDetect: false, language: 'en-US' });
    expect(m.getLanguage()).toBe('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('persist=false：updateSettings 不写 localStorage', () => {
    const m = new I18nManager();
    m.updateSettings({ persist: false });
    localStorage.clear();
    m.updateSettings({ showOriginal: true });
    expect(localStorage.getItem('i18n_settings')).toBeNull();
  });
});

describe('I18nManager — 语言管理', () => {
  it('setLanguage 切换到新语言：currentLanguage 变更 + 翻译重载 + 触发监听器', () => {
    const m = makeManagerWithDefaults();
    const fn = vi.fn();
    m.onLanguageChange(fn);
    m.setLanguage('en-US');
    expect(m.getLanguage()).toBe('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toBe('en-US');
  });

  it('setLanguage 相同语言：早返回，不触发监听器', () => {
    const m = makeManagerWithDefaults();
    const fn = vi.fn();
    m.onLanguageChange(fn);
    m.setLanguage('zh-CN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('setLanguage 同步更新 settings.language', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    expect(m.getSettings().language).toBe('en-US');
  });

  it('setLanguage 持久化到 localStorage', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    const saved = JSON.parse(localStorage.getItem('i18n_settings')!);
    expect(saved.language).toBe('en-US');
  });

  it('setLanguage 设置 document.documentElement lang 与 dir=ltr', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('applyLanguage 对 ltr 语言设置 dir=ltr（已支持语言均为 ltr）', () => {
    // SUPPORTED_LANGUAGES 中 5 种语言 isRTL 均为 false，故 applyLanguage 恒走 ltr 分支。
    // 此处锁定 isRTLLanguage 对已支持语言返回 false，并验证 setLanguage 后 dir=ltr。
    expect(isRTLLanguage('zh-CN')).toBe(false);
    expect(isRTLLanguage('en-US')).toBe(false);
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('isLanguageSupported：已支持 true / 未支持 false', () => {
    const m = new I18nManager();
    expect(m.isLanguageSupported('zh-CN')).toBe(true);
    expect(m.isLanguageSupported('en-US')).toBe(true);
    expect(m.isLanguageSupported('ja-JP')).toBe(true);
    expect(m.isLanguageSupported('fr-FR')).toBe(false);
    expect(m.isLanguageSupported('unknown')).toBe(false);
  });
});

describe('I18nManager — 翻译 t()', () => {
  it('命中当前语言：返回翻译字符串', () => {
    const m = makeManagerWithDefaults();
    expect(m.t('common.confirm')).toBe(ZH_CONFIRM);
  });

  it('命中嵌套键（点分路径）', () => {
    const m = makeManagerWithDefaults();
    expect(m.t('common.cancel')).toBe('取消');
  });

  it('切换语言后翻译随之变更', () => {
    const m = makeManagerWithDefaults();
    expect(m.t('common.confirm')).toBe(ZH_CONFIRM);
    m.setLanguage('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('缺失键：返回 key 本身', () => {
    const m = makeManagerWithDefaults();
    expect(m.t('__definitely_missing_key__')).toBe('__definitely_missing_key__');
  });

  it('缺失键 + missingKeyWarning=true：记录到 missingKeys 并 console.warn', () => {
    const m = makeManagerWithDefaults();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.t('__missing_warn_key__');
    expect(m.getMissingKeys()).toContain('__missing_warn_key__');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('__missing_warn_key__'));
  });

  it('缺失键 + missingKeyWarning=false：不记录、不 warn', () => {
    const m = makeManagerWithDefaults();
    m.updateSettings({ missingKeyWarning: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.t('__missing_silent_key__');
    expect(m.getMissingKeys()).not.toContain('__missing_silent_key__');
    expect(warn).not.toHaveBeenCalled();
  });

  it('缺失键去重：同一 key 多次查找只记录一次', () => {
    const m = makeManagerWithDefaults();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.t('__dedup_key__');
    m.t('__dedup_key__');
    m.t('__dedup_key__');
    expect(m.getMissingKeys().filter(k => k === '__dedup_key__')).toHaveLength(1);
  });

  it('回退语言：当前语言缺失时回退到 fallbackLanguage（en-US）', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG); // ja-JP 无 JSON → 当前翻译为 {}（不含 common.confirm）
    // fallbackLanguage 仍为 en-US
    expect(m.getSettings().fallbackLanguage).toBe('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('当前与回退均缺失：返回 key', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    expect(m.t('__no_such_key_anywhere__')).toBe('__no_such_key_anywhere__');
  });

  it('插值：{placeholder} 替换为参数值', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { greet: 'Hello {name}' });
    expect(m.t('greet', { name: 'World' })).toBe('Hello World');
  });

  it('插值：多占位符同时替换', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { msg: '{a} + {b} = {c}' });
    expect(m.t('msg', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('插值：占位符无对应参数时保留原样', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { msg: 'Hi {name}' });
    expect(m.t('msg')).toBe('Hi {name}');
    expect(m.t('msg', { other: 'x' })).toBe('Hi {name}');
  });

  it('插值：无 params 时直接返回原字符串', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { raw: 'no placeholders here' });
    expect(m.t('raw')).toBe('no placeholders here');
  });

  it('数组值：join(", ")', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { list: ['a', 'b', 'c'] });
    expect(m.t('list')).toBe('a, b, c');
  });

  it('非字符串非数组值：String(value)', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    // TranslationValue 类型不含 number，此处用 as any 注入以覆盖 String(value) 分支
    m.addTranslations(SANDBOX_LANG, { num: 42 as any, flag: true as any });
    expect(m.t('num')).toBe('42');
    expect(m.t('flag')).toBe('true');
  });

  it('null 值视为缺失：回退或返回 key', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { nul: null as any });
    expect(m.t('nul')).toBe('nul'); // 回退 en-US 也无 → key
  });

  it('getNestedValue 中途遇 null 中止：返回 key', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { parent: null as any });
    expect(m.t('parent.child')).toBe('parent.child');
  });

  it('空字符串 key：返回空字符串（split 得 [""]，obj[""] undefined → key ""）', () => {
    const m = makeManagerWithDefaults();
    expect(m.t('')).toBe('');
  });

  it('has：当前或回退命中即 true', () => {
    const m = makeManagerWithDefaults();
    expect(m.has('common.confirm')).toBe(true);
    m.setLanguage(SANDBOX_LANG);
    // ja-JP 无 common.confirm，但回退 en-US 有
    expect(m.has('common.confirm')).toBe(true);
    expect(m.has('__never_exists__')).toBe(false);
  });

  it('getTranslations 返回拷贝：改副本不影响内部', () => {
    const m = makeManagerWithDefaults();
    const tr = m.getTranslations();
    (tr as any).injected = 'x';
    expect((m.getTranslations() as any).injected).toBeUndefined();
  });
});

describe('I18nManager — addTranslations 与 deepMerge', () => {
  it('addTranslations 到非当前语言：建立条目但不重载当前翻译', () => {
    const m = makeManagerWithDefaults();
    m.addTranslations(SANDBOX_LANG, { only_ja: 'ジャパニーズ' });
    // 当前仍为 zh-CN，不重载 → only_ja 不可见
    expect(m.t('only_ja')).toBe('only_ja');
    // 切到 ja-JP 后可见
    m.setLanguage(SANDBOX_LANG);
    expect(m.t('only_ja')).toBe('ジャパニーズ');
  });

  it('addTranslations 到当前语言：立即重载，新键可见', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { greet: 'こんにちは' });
    expect(m.t('greet')).toBe('こんにちは');
  });

  it('addTranslations deepMerge：嵌套对象合并而非整体替换', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { group: { a: '1', b: '2' } });
    m.addTranslations(SANDBOX_LANG, { group: { b: '22', c: '3' } });
    expect(m.t('group.a')).toBe('1'); // 旧键保留
    expect(m.t('group.b')).toBe('22'); // 同键覆盖
    expect(m.t('group.c')).toBe('3'); // 新键加入
  });

  it('addTranslations deepMerge：数组值整体替换（非深合并）', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { list: ['x', 'y'] });
    m.addTranslations(SANDBOX_LANG, { list: ['z'] });
    expect(m.t('list')).toBe('z');
  });

  it('addTranslations 多次合并累积', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage(SANDBOX_LANG);
    m.addTranslations(SANDBOX_LANG, { k1: 'v1' });
    m.addTranslations(SANDBOX_LANG, { k2: 'v2' });
    expect(m.t('k1')).toBe('v1');
    expect(m.t('k2')).toBe('v2');
  });
});

describe('I18nManager — missingKeys 管理', () => {
  it('getMissingKeys 返回数组形式', () => {
    const m = makeManagerWithDefaults();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.t('__mk1__');
    m.t('__mk2__');
    expect(m.getMissingKeys()).toEqual(expect.arrayContaining(['__mk1__', '__mk2__']));
    expect(m.getMissingKeys()).toHaveLength(2);
  });

  it('clearMissingKeys 清空记录', () => {
    const m = makeManagerWithDefaults();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    m.t('__mk3__');
    expect(m.getMissingKeys()).toHaveLength(1);
    m.clearMissingKeys();
    expect(m.getMissingKeys()).toEqual([]);
  });
});

describe('I18nManager — 格式化方法（委托 ./types 并传 currentLanguage）', () => {
  it('formatNumber：分组千分位', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatNumber(1234.5)).toContain('1,234');
  });

  it('formatNumber：useGrouping=false 不分组', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatNumber(1234.5, { useGrouping: false })).toBe('1234.5');
  });

  it('formatFileSize：0 → "0 B"', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatFileSize(0)).toBe('0 B');
  });

  it('formatFileSize：1024 → "1 KB"', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatFileSize(1024)).toContain('1');
    expect(m.formatFileSize(1024)).toContain('KB');
  });

  it('formatFileSize：decimals 控制小数位', () => {
    const m = makeManagerWithDefaults();
    // 1536 = 1.5 KB
    expect(m.formatFileSize(1536, 2)).toBe('1.5 KB');
    expect(m.formatFileSize(1536, 0)).toBe('2 KB'); // toFixed(0) 四舍五入
  });

  it('formatDuration：含小时 h:mm:ss', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatDuration(3661)).toBe('1:01:01');
  });

  it('formatDuration：不足小时 m:ss', () => {
    const m = makeManagerWithDefaults();
    expect(m.formatDuration(65)).toBe('1:05');
    expect(m.formatDuration(0)).toBe('0:00');
  });

  it('pluralize：count=1 单数，其余复数', () => {
    const m = makeManagerWithDefaults();
    expect(m.pluralize(1, 'item', 'items')).toBe('item');
    expect(m.pluralize(0, 'item', 'items')).toBe('items');
    expect(m.pluralize(2, 'item', 'items')).toBe('items');
  });

  it('formatDate：返回含年份的字符串', () => {
    const m = makeManagerWithDefaults();
    const d = new Date('2026-01-15T10:00:00Z');
    const out = m.formatDate(d);
    expect(typeof out).toBe('string');
    expect(out).toContain('2026');
  });

  it('formatDate：自定义 options 生效', () => {
    const m = makeManagerWithDefaults();
    const d = new Date('2026-01-15T10:00:00Z');
    const out = m.formatDate(d, { year: 'numeric', month: 'numeric', day: 'numeric' });
    expect(out).toContain('2026');
  });

  it('formatRelativeTime：过去日期返回相对时间字符串', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const m = makeManagerWithDefaults();
    const past = new Date('2026-07-13T10:00:00Z'); // 2 天前
    const out = m.formatRelativeTime(past);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('2');
  });

  it('formatRelativeTime：未来日期返回相对时间字符串', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const m = makeManagerWithDefaults();
    const future = new Date('2026-07-16T10:00:00Z'); // 1 天后
    const out = m.formatRelativeTime(future);
    expect(typeof out).toBe('string');
    expect(out).toContain('1');
  });
});

describe('I18nManager — 事件监听', () => {
  it('onLanguageChange：返回取消订阅函数，调用后不再触发', () => {
    const m = makeManagerWithDefaults();
    const fn = vi.fn();
    const off = m.onLanguageChange(fn);
    m.setLanguage('en-US');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    m.setLanguage('zh-CN');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onSettingsChange：返回取消订阅函数，调用后不再触发', () => {
    const m = new I18nManager();
    const fn = vi.fn();
    const off = m.onSettingsChange(fn);
    m.updateSettings({ showOriginal: true });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    m.updateSettings({ showOriginal: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('多个 languageChange 监听器均被触发', () => {
    const m = makeManagerWithDefaults();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    m.onLanguageChange(fn1);
    m.onLanguageChange(fn2);
    m.setLanguage('en-US');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('destroy：清空全部监听器与 missingKeys', () => {
    const m = makeManagerWithDefaults();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn();
    const sfn = vi.fn();
    m.onLanguageChange(fn);
    m.onSettingsChange(sfn);
    m.t('__will_be_cleared__');
    expect(m.getMissingKeys()).toHaveLength(1);
    m.destroy();
    // destroy 后动作不再触发监听器
    m.setLanguage('en-US');
    m.updateSettings({ showOriginal: true });
    expect(fn).not.toHaveBeenCalled();
    expect(sfn).not.toHaveBeenCalled();
    expect(m.getMissingKeys()).toEqual([]);
  });
});

describe('I18nManager — resetToDefault', () => {
  it('从变更状态恢复默认设置与语言', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    m.updateSettings({ showOriginal: true, autoDetect: false });
    expect(m.getLanguage()).toBe('en-US');
    m.resetToDefault();
    expect(m.getLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(m.getSettings()).toEqual(DEFAULT_I18N_SETTINGS);
  });

  it('resetToDefault 重载 zh-CN 翻译', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US');
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
    m.resetToDefault();
    expect(m.t('common.confirm')).toBe(ZH_CONFIRM);
  });

  it('resetToDefault 触发 languageChange 与 settingsChange 监听器', () => {
    const m = makeManagerWithDefaults();
    m.setLanguage('en-US'); // 先偏离默认
    const lfn = vi.fn();
    const sfn = vi.fn();
    m.onLanguageChange(lfn);
    m.onSettingsChange(sfn);
    m.resetToDefault();
    expect(lfn).toHaveBeenCalledWith('zh-CN');
    expect(sfn).toHaveBeenCalledTimes(1);
  });
});

describe('I18nManager — exportSettings / importSettings', () => {
  it('exportSettings：返回当前设置的 JSON 字符串', () => {
    const m = new I18nManager();
    const json = m.exportSettings();
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(DEFAULT_I18N_SETTINGS);
  });

  it('importSettings：合法 JSON 合并设置并切换语言', () => {
    const m = makeManagerWithDefaults();
    const payload = JSON.stringify({ ...DEFAULT_I18N_SETTINGS, language: 'en-US', showOriginal: true });
    const ok = m.importSettings(payload);
    expect(ok).toBe(true);
    expect(m.getLanguage()).toBe('en-US');
    expect(m.getSettings().showOriginal).toBe(true);
    expect(m.t('common.confirm')).toBe(EN_CONFIRM);
  });

  it('importSettings：language 变更触发 languageChange 监听器', () => {
    const m = makeManagerWithDefaults();
    const lfn = vi.fn();
    const sfn = vi.fn();
    m.onLanguageChange(lfn);
    m.onSettingsChange(sfn);
    const payload = JSON.stringify({ ...DEFAULT_I18N_SETTINGS, language: 'en-US' });
    m.importSettings(payload);
    expect(lfn).toHaveBeenCalledWith('en-US');
    expect(sfn).toHaveBeenCalledTimes(1);
  });

  it('importSettings：损坏 JSON 返回 false 且保持现有设置', () => {
    const m = makeManagerWithDefaults();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = m.getSettings();
    const ok = m.importSettings('{ broken');
    expect(ok).toBe(false);
    expect(m.getSettings()).toEqual(before);
    expect(warn).toHaveBeenCalled();
  });

  it('importSettings：持久化到 localStorage', () => {
    const m = makeManagerWithDefaults();
    const payload = JSON.stringify({ ...DEFAULT_I18N_SETTINGS, showOriginal: true });
    m.importSettings(payload);
    const saved = JSON.parse(localStorage.getItem('i18n_settings')!);
    expect(saved.showOriginal).toBe(true);
  });
});

describe('I18nManager — 单例导出 i18n / t', () => {
  it('i18n 为 I18nManager 实例', () => {
    expect(i18n).toBeInstanceOf(I18nManager);
  });

  it('t 为函数：未 init 的单例翻译未加载，缺失键返回 key 本身', () => {
    // 单例构造器为空、未调用 init → translations 为 {} → common.confirm 视为缺失返回 key。
    // （单例为模块级共享状态，不在此断言其已加载，仅锁定「未加载时回退 key」行为。）
    expect(typeof t).toBe('function');
    expect(t('__singleton_uninitialized_key__')).toBe('__singleton_uninitialized_key__');
  });
});

describe('I18nManager — detectBrowserLanguage（./types 纯函数）', () => {
  it('navigator.language 精确匹配', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    expect(detectBrowserLanguage()).toBe('zh-CN');
  });

  it('navigator.language 前缀匹配（en → en-US）', () => {
    Object.defineProperty(navigator, 'language', { value: 'en', configurable: true });
    expect(detectBrowserLanguage()).toBe('en-US');
  });

  it('navigator.language 未支持：回退默认 zh-CN', () => {
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
    expect(detectBrowserLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('navigator.language 空字符串：回退默认', () => {
    Object.defineProperty(navigator, 'language', { value: '', configurable: true });
    expect(detectBrowserLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
