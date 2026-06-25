/**
 * 主题系统类型定义
 * 支持多种主题、自定义主题、主题切换等
 */

// ==================== 主题类型 ====================

/**
 * 主题模式
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * 主题类型
 */
export type ThemeType =
  | 'default'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'midnight'
  | 'rose'
  | 'lavender'
  | 'emerald'
  | 'amber'
  | 'slate'
  | 'custom';

/**
 * 颜色调色板
 */
export interface ColorPalette {
  // 主色调
  primary: string;
  primaryForeground: string;
  primaryLight: string;
  primaryDark: string;

  // 辅助色
  secondary: string;
  secondaryForeground: string;

  // 强调色
  accent: string;
  accentForeground: string;

  // 背景色
  background: string;
  foreground: string;

  // 卡片
  card: string;
  cardForeground: string;

  // 弹窗
  popover: string;
  popoverForeground: string;

  // 边框
  border: string;
  input: string;
  ring: string;

  // 中性色
  muted: string;
  mutedForeground: string;

  // 状态色
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  error: string;
  errorForeground: string;
  info: string;
  infoForeground: string;

  // 渐变
  gradientStart: string;
  gradientEnd: string;
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  id: string;
  name: string;
  type: ThemeType;
  description: string;
  author?: string;
  version?: string;
  isBuiltin: boolean;
  isCustom: boolean;

  // 颜色配置
  light: ColorPalette;
  dark: ColorPalette;

  // 其他配置
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };

  boxShadow: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    inner: string;
  };

  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };

  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };

  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
  };

  transition: {
    fast: string;
    normal: string;
    slow: string;
  };
}

// ==================== 内置主题 ====================

/**
 * 默认主题（浅色/深色）
 */
export const DEFAULT_THEME: ThemeConfig = {
  id: 'default',
  name: '默认主题',
  type: 'default',
  description: '简洁现代的默认主题',
  isBuiltin: true,
  isCustom: false,

  light: {
    primary: '#3b82f6',
    primaryForeground: '#ffffff',
    primaryLight: '#60a5fa',
    primaryDark: '#2563eb',
    secondary: '#64748b',
    secondaryForeground: '#ffffff',
    accent: '#8b5cf6',
    accentForeground: '#ffffff',
    background: '#ffffff',
    foreground: '#0f172a',
    card: '#ffffff',
    cardForeground: '#0f172a',
    popover: '#ffffff',
    popoverForeground: '#0f172a',
    border: '#e2e8f0',
    input: '#e2e8f0',
    ring: '#3b82f6',
    muted: '#f1f5f9',
    mutedForeground: '#64748b',
    success: '#22c55e',
    successForeground: '#ffffff',
    warning: '#f59e0b',
    warningForeground: '#ffffff',
    error: '#ef4444',
    errorForeground: '#ffffff',
    info: '#3b82f6',
    infoForeground: '#ffffff',
    gradientStart: '#3b82f6',
    gradientEnd: '#8b5cf6',
  },

  dark: {
    primary: '#60a5fa',
    primaryForeground: '#0f172a',
    primaryLight: '#93c5fd',
    primaryDark: '#3b82f6',
    secondary: '#94a3b8',
    secondaryForeground: '#0f172a',
    accent: '#a78bfa',
    accentForeground: '#0f172a',
    background: '#0f172a',
    foreground: '#f8fafc',
    card: '#1e293b',
    cardForeground: '#f8fafc',
    popover: '#1e293b',
    popoverForeground: '#f8fafc',
    border: '#334155',
    input: '#334155',
    ring: '#60a5fa',
    muted: '#334155',
    mutedForeground: '#94a3b8',
    success: '#4ade80',
    successForeground: '#0f172a',
    warning: '#fbbf24',
    warningForeground: '#0f172a',
    error: '#f87171',
    errorForeground: '#0f172a',
    info: '#60a5fa',
    infoForeground: '#0f172a',
    gradientStart: '#60a5fa',
    gradientEnd: '#a78bfa',
  },

  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },

  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  },

  fontFamily: {
    sans: 'system-ui, -apple-system, sans-serif',
    serif: 'Georgia, serif',
    mono: 'ui-monospace, monospace',
  },

  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },

  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },

  transition: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },
};

/**
 * 海洋主题
 */
export const OCEAN_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  id: 'ocean',
  name: '海洋主题',
  type: 'ocean',
  description: '清新的海洋蓝色调',
  light: {
    ...DEFAULT_THEME.light,
    primary: '#0ea5e9',
    primaryForeground: '#ffffff',
    primaryLight: '#38bdf8',
    primaryDark: '#0284c7',
    accent: '#06b6d4',
    gradientStart: '#0ea5e9',
    gradientEnd: '#06b6d4',
  },
  dark: {
    ...DEFAULT_THEME.dark,
    primary: '#38bdf8',
    primaryForeground: '#0c4a6e',
    primaryLight: '#7dd3fc',
    primaryDark: '#0ea5e9',
    accent: '#22d3ee',
    gradientStart: '#38bdf8',
    gradientEnd: '#22d3ee',
  },
};

/**
 * 森林主题
 */
export const FOREST_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  id: 'forest',
  name: '森林主题',
  type: 'forest',
  description: '自然的森林绿色调',
  light: {
    ...DEFAULT_THEME.light,
    primary: '#22c55e',
    primaryForeground: '#ffffff',
    primaryLight: '#4ade80',
    primaryDark: '#16a34a',
    accent: '#84cc16',
    gradientStart: '#22c55e',
    gradientEnd: '#84cc16',
  },
  dark: {
    ...DEFAULT_THEME.dark,
    primary: '#4ade80',
    primaryForeground: '#14532d',
    primaryLight: '#86efac',
    primaryDark: '#22c55e',
    accent: '#a3e635',
    gradientStart: '#4ade80',
    gradientEnd: '#a3e635',
  },
};

/**
 * 日落主题
 */
export const SUNSET_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  id: 'sunset',
  name: '日落主题',
  type: 'sunset',
  description: '温暖的日落橙色调',
  light: {
    ...DEFAULT_THEME.light,
    primary: '#f97316',
    primaryForeground: '#ffffff',
    primaryLight: '#fb923c',
    primaryDark: '#ea580c',
    accent: '#ef4444',
    gradientStart: '#f97316',
    gradientEnd: '#ef4444',
  },
  dark: {
    ...DEFAULT_THEME.dark,
    primary: '#fb923c',
    primaryForeground: '#7c2d12',
    primaryLight: '#fdba74',
    primaryDark: '#f97316',
    accent: '#f87171',
    gradientStart: '#fb923c',
    gradientEnd: '#f87171',
  },
};

/**
 * 午夜主题
 */
export const MIDNIGHT_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  id: 'midnight',
  name: '午夜主题',
  type: 'midnight',
  description: '深邃的午夜紫色调',
  light: {
    ...DEFAULT_THEME.light,
    primary: '#8b5cf6',
    primaryForeground: '#ffffff',
    primaryLight: '#a78bfa',
    primaryDark: '#7c3aed',
    accent: '#ec4899',
    gradientStart: '#8b5cf6',
    gradientEnd: '#ec4899',
  },
  dark: {
    ...DEFAULT_THEME.dark,
    primary: '#a78bfa',
    primaryForeground: '#3b0764',
    primaryLight: '#c4b5fd',
    primaryDark: '#8b5cf6',
    accent: '#f472b6',
    gradientStart: '#a78bfa',
    gradientEnd: '#f472b6',
  },
};

/**
 * 玫瑰主题
 */
export const ROSE_THEME: ThemeConfig = {
  ...DEFAULT_THEME,
  id: 'rose',
  name: '玫瑰主题',
  type: 'rose',
  description: '优雅的玫瑰粉色调',
  light: {
    ...DEFAULT_THEME.light,
    primary: '#f43f5e',
    primaryForeground: '#ffffff',
    primaryLight: '#fb7185',
    primaryDark: '#e11d48',
    accent: '#ec4899',
    gradientStart: '#f43f5e',
    gradientEnd: '#ec4899',
  },
  dark: {
    ...DEFAULT_THEME.dark,
    primary: '#fb7185',
    primaryForeground: '#4c0519',
    primaryLight: '#fda4af',
    primaryDark: '#f43f5e',
    accent: '#f472b6',
    gradientStart: '#fb7185',
    gradientEnd: '#f472b6',
  },
};

/**
 * 内置主题列表
 */
export const BUILTIN_THEMES: ThemeConfig[] = [
  DEFAULT_THEME,
  OCEAN_THEME,
  FOREST_THEME,
  SUNSET_THEME,
  MIDNIGHT_THEME,
  ROSE_THEME,
];

// ==================== 主题设置 ====================

/**
 * 主题设置
 */
export interface ThemeSettings {
  mode: ThemeMode;
  currentTheme: string;
  customThemes: ThemeConfig[];
  followSystem: boolean;
  autoSwitch: boolean; // 自动切换日夜间
  autoSwitchTime?: {
    lightStart: string; // HH:mm
    darkStart: string; // HH:mm
  };
  animations: boolean; // 主题切换动画
  highContrast: boolean; // 高对比度模式
  reducedMotion: boolean; // 减少动画
}

/**
 * 默认主题设置
 */
export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'system',
  currentTheme: 'default',
  customThemes: [],
  followSystem: true,
  autoSwitch: false,
  animations: true,
  highContrast: false,
  reducedMotion: false,
};

// ==================== CSS变量 ====================

/**
 * CSS变量映射
 */
export const CSS_VARIABLE_MAP: Record<string, keyof ColorPalette> = {
  '--primary': 'primary',
  '--primary-foreground': 'primaryForeground',
  '--primary-light': 'primaryLight',
  '--primary-dark': 'primaryDark',
  '--secondary': 'secondary',
  '--secondary-foreground': 'secondaryForeground',
  '--accent': 'accent',
  '--accent-foreground': 'accentForeground',
  '--background': 'background',
  '--foreground': 'foreground',
  '--card': 'card',
  '--card-foreground': 'cardForeground',
  '--popover': 'popover',
  '--popover-foreground': 'popoverForeground',
  '--border': 'border',
  '--input': 'input',
  '--ring': 'ring',
  '--muted': 'muted',
  '--muted-foreground': 'mutedForeground',
  '--success': 'success',
  '--success-foreground': 'successForeground',
  '--warning': 'warning',
  '--warning-foreground': 'warningForeground',
  '--error': 'error',
  '--error-foreground': 'errorForeground',
  '--info': 'info',
  '--info-foreground': 'infoForeground',
  '--gradient-start': 'gradientStart',
  '--gradient-end': 'gradientEnd',
};

// ==================== 工具函数 ====================

/**
 * 判断是否为深色模式
 */
export function isDarkMode(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;

  // system模式，检测系统主题
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  return false;
}

/**
 * 获取当前颜色调色板
 */
export function getColorPalette(theme: ThemeConfig, mode: ThemeMode): ColorPalette {
  return isDarkMode(mode) ? theme.dark : theme.light;
}

/**
 * 调整颜色亮度
 */
export function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * 计算相对亮度
 */
export function getLuminance(color: string): number {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const rsRGB = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gsRGB = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bsRGB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
}

/**
 * 计算对比度
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 判断颜色是否为浅色
 */
export function isLightColor(color: string): boolean {
  return getLuminance(color) > 0.5;
}

/**
 * 根据背景色获取合适的前景色
 */
export function getContrastColor(background: string, lightColor = '#ffffff', darkColor = '#000000'): string {
  return isLightColor(background) ? darkColor : lightColor;
}

/**
 * 生成随机颜色
 */
export function generateRandomColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

/**
 * HSL转HEX
 */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * 创建自定义主题
 */
export function createCustomTheme(
  id: string,
  name: string,
  primaryColor: string,
  baseTheme: ThemeConfig = DEFAULT_THEME
): ThemeConfig {
  const isLight = isLightColor(primaryColor);

  const createPalette = (base: ColorPalette, primary: string): ColorPalette => {
    const foreground = getContrastColor(primary);
    return {
      ...base,
      primary,
      primaryForeground: foreground,
      primaryLight: adjustColor(primary, 30),
      primaryDark: adjustColor(primary, -30),
      ring: primary,
      gradientStart: primary,
      gradientEnd: adjustColor(primary, 40),
    };
  };

  return {
    ...baseTheme,
    id,
    name,
    type: 'custom',
    description: `自定义主题 - ${name}`,
    isBuiltin: false,
    isCustom: true,
    light: createPalette(baseTheme.light, primaryColor),
    dark: createPalette(baseTheme.dark, primaryColor),
  };
}
