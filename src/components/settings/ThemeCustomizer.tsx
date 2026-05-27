"use client";

import { useState, useEffect } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * 主题自定义组件
 * 支持 8 种预设主题色 + 自定义强调色
 * 基于 CSS 自定义属性，与 next-themes 暗色/亮色模式兼容
 */

const THEME_COLORS = [
  { name: "默认蓝", value: "hsl(221, 83%, 53%)" },
  { name: "翡翠绿", value: "hsl(142, 71%, 45%)" },
  { name: "琥珀橙", value: "hsl(32, 95%, 44%)" },
  { name: "玫瑰红", value: "hsl(346, 77%, 50%)" },
  { name: "紫罗兰", value: "hsl(262, 83%, 58%)" },
  { name: "靛蓝", value: "hsl(239, 84%, 67%)" },
  { name: "青色", value: "hsl(186, 72%, 56%)" },
  { name: "石墨黑", value: "hsl(215, 14%, 34%)" },
];

const THEME_STORAGE_KEY = "kb_theme_color";

export function ThemeCustomizer() {
  const [selectedColor, setSelectedColor] = useState(THEME_COLORS[0].value);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) {
        setSelectedColor(saved);
        applyThemeColor(saved);
      }
    } catch {}
  }, []);

  const applyThemeColor = (color: string) => {
    // 设置 CSS 自定义属性，shadcn/ui 的 primary 色会自动跟随
    const root = document.documentElement;

    // 解析 HSL 值
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (hslMatch) {
      const [, h, s, l] = hslMatch.map(Number);
      root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
      root.style.setProperty("--primary-foreground", `${(h + 180) % 360} 10% 98%`);

      // 生成较浅的 primary 变体用于 hover/bg
      root.style.setProperty("--primary-hover", `${h} ${Math.min(s + 5, 100)}% ${Math.max(l - 5, 10)}%`);

      // 确保重新渲染 Tailwind
      root.classList.add("theme-customized");
    }
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    applyThemeColor(color);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, color);
    } catch {}
  };

  const handleReset = () => {
    setSelectedColor(THEME_COLORS[0].value);
    const root = document.documentElement;
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--primary-hover");
    root.classList.remove("theme-customized");
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
  };

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
        <div className="grid grid-cols-4 gap-2">
          {THEME_COLORS.map((theme) => (
            <button
              key={theme.value}
              onClick={() => handleColorSelect(theme.value)}
              className={`group relative h-10 rounded-lg border-2 transition-all ${
                selectedColor === theme.value
                  ? "border-foreground scale-105"
                  : "border-transparent hover:border-muted-foreground/30"
              }`}
              style={{ backgroundColor: theme.value }}
              title={theme.name}
            >
              {selectedColor === theme.value && (
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

        <div className="pt-2">
          <Label className="text-xs text-muted-foreground">自定义强调色</Label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={hslToHex(selectedColor)}
              onChange={(e) => {
                const hex = e.target.value;
                const hsl = hexToHsl(hex);
                handleColorSelect(hsl);
              }}
              className="h-8 w-8 rounded border cursor-pointer"
            />
            <span className="text-xs text-muted-foreground font-mono">{selectedColor}</span>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
          恢复默认主题
        </Button>
      </CardContent>
    </Card>
  );
}

// HSL → Hex 转换
function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return "#3B82F6";
  let [, h, s, l] = match.map(Number);
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Hex → HSL 转换
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}
