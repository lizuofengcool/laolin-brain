"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * 键盘快捷键速查面板
 * 按 `?` 或 `Ctrl+/` 唤出，`Esc` 关闭
 * 显示所有可用的键盘快捷键列表
 */

interface ShortcutItem {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // 导航
  { keys: ["1"], description: "仪表板", category: "导航" },
  { keys: ["2"], description: "文件管理", category: "导航" },
  { keys: ["3"], description: "收藏夹", category: "导航" },
  { keys: ["4"], description: "时间线", category: "导航" },
  { keys: ["5"], description: "搜索", category: "导航" },
  { keys: ["6"], description: "回收站", category: "导航" },
  { keys: ["7"], description: "设置", category: "导航" },
  { keys: ["Esc"], description: "返回仪表板 / 关闭弹窗", category: "导航" },
  // 搜索
  { keys: ["Ctrl", "K"], description: "快速搜索", category: "搜索" },
  // 文件操作
  { keys: ["Ctrl", "N"], description: "新建文件视图", category: "文件" },
  { keys: ["Ctrl", "D"], description: "仪表板视图", category: "文件" },
  { keys: ["Ctrl", "F"], description: "收藏夹", category: "文件" },
  { keys: ["Ctrl", "T"], description: "时间线", category: "文件" },
  // 帮助
  { keys: ["?"], description: "显示快捷键面板", category: "帮助" },
];

const CATEGORIES = ["导航", "搜索", "文件", "帮助"] as const;

export function ShortcutHelpPanel() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      if (isEditable) return;

      // ? 键唤出
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Ctrl+/ 唤出
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Esc 关闭
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fadeIn 0.15s ease-out" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">键盘快捷键</h3>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm"
          >
            ESC
          </button>
        </div>

        {/* Shortcuts by category */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {CATEGORIES.map((category) => (
            <div key={category}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h4>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === category).map(
                  (shortcut, idx) => (
                    <div
                      key={`${category}-${idx}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, kIdx) => (
                          <span key={kIdx} className="flex items-center gap-1">
                            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-mono font-medium text-muted-foreground">
                              {key}
                            </kbd>
                            {kIdx < shortcut.keys.length - 1 && (
                              <span className="text-xs text-muted-foreground">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t text-center">
          <p className="text-xs text-muted-foreground">
            按
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted px-1 text-xs font-mono mx-0.5">?</kbd>
            或
            <kbd className="inline-flex h-5 items-center justify-center rounded border border-border bg-muted px-1 text-xs font-mono mx-0.5">Ctrl+/</kbd>
            随时唤出此面板
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
