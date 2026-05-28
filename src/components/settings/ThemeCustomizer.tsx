"use client";

import { useState, useEffect, useCallback } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * 主题自定义组件
 * 支持 8 种预设主题色 + 自定义强调色
 * 使用 oklch 格式写入 CSS 自定义属性，与 globals.css 保持一致
 * 与 next-themes 暗色/亮色模式兼容
 */

const THEME_COLORS = [
  { name: "默认蓝", light: "oklch(0.546 0.245 262.881)", dark: "oklch(0.623 0.214 259.815)" },
  { name: "翡翠绿", light: "oklch(0.585 0.169 163.223)", dark: "oklch(0.627 0.194 149.214)" },
  { name: "琥珀橙", light: "oklch(0.696 0.17 56.357)", dark: "oklch(0.732 0.191 70.08)" },
  { name: "玫瑰红", light: "oklch(0.585 0.222 18.585)", dark: "oklch(0.645 0.246 16.439)" },
  { name: "紫罗兰", light: "oklch(0.541 0.281 293.009)", dark: "oklch(0.637 0.237 295.003)" },
  { name: "靛蓝", light: "oklch(0.623 0.214 259.815)", dark: "oklch(0.708 0.165 254.624)" },
  { name: "青色", light: "oklch(0.646 0.149 193.774)", dark: "oklch(0.696 0.17 162.48)" },
  { name: "石墨黑", light: "oklch(0.398 0.014 256.848)", dark: "oklch(0.556 0.014 256.848)" },
];

const THEME_STORAGE_KEY = "kb_theme_color";

export function ThemeCustomizer() {
  const [selectedColor, setSelectedColor] = useState(THEME_COLORS[0].name);
  const [mounted, setMounted] = useState(false);

  const applyThemeColor = useCallback((colorName: string) => {
    const theme = THEME_COLORS.find((t) => t.name === colorName);
    if (!theme) return;

    const root = document.documentElement;
    const isDark = root.classList.contains("dark");

    const primary = isDark ? theme.dark : theme.light;
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-foreground", isDark ? "oklch(0.985 0 0)" : "oklch(0.985 0 0)");
    root.style.setProperty("--ring", isDark ? theme.dark : theme.light);
    root.style.setProperty("--sidebar-primary", isDark ? theme.dark : theme.light);

    root.classList.add("theme-customized");
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- setMounted is a hydration guard pattern */
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        setSelectedColor(saved);
        applyThemeColor(saved);
      }
    } catch {}
  }, [applyThemeColor]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleColorSelect = (colorName: string) => {
    setSelectedColor(colorName);
    applyThemeColor(colorName);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, colorName);
    } catch {}
  };

  const handleReset = () => {
    setSelectedColor(THEME_COLORS[0].name);
    const root = document.documentElement;
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--sidebar-primary");
    root.classList.remove("theme-customized");
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
  };

  // Re-apply theme on dark/light toggle
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) applyThemeColor(saved);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [applyThemeColor]);

  if (!mounted) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4" />
          主题色
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {THEME_COLORS.map((theme) => (
            <button
              key={theme.name}
              onClick={() => handleColorSelect(theme.name)}
              className={`group relative h-12 rounded-lg border-2 transition-all ${
                selectedColor === theme.name
                  ? "border-foreground scale-105"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              style={{ backgroundColor: theme.light }}
              title={theme.name}
            >
              {selectedColor === theme.name && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow-md">
                  ✓
                </span>
              )}
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {theme.name}
              </span>
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
          恢复默认主题
        </Button>
      </CardContent>
    </Card>
  );
}
