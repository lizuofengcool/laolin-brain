export interface AutomationRule {
  id: string;
  type: "auto_tag" | "auto_cleanup" | "auto_backup" | "auto_organize";
  enabled: boolean;
  config: Record<string, unknown>;
  lastRun?: string;
  createdAt: string;
}

export interface RuleTemplate {
  id: string;
  type: AutomationRule["type"];
  name: string;
  description: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
}

// Pre-built rule templates
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "auto-cleanup",
    type: "auto_cleanup",
    name: "自动清理回收站",
    description: "自动删除回收站中超过指定天数的文件",
    icon: "🗑️",
    defaultConfig: { daysThreshold: 30 },
  },
  {
    id: "auto-tag-images",
    type: "auto_tag",
    name: "图片自动标签",
    description: "上传图片时自动通过 AI 分析并添加标签",
    icon: "🏷️",
    defaultConfig: { autoTagImages: true },
  },
  {
    id: "auto-organize",
    type: "auto_organize",
    name: "文档自动分类",
    description: "根据文件类型自动移动到对应文件夹",
    icon: "📁",
    defaultConfig: {
      rules: [
        { fileType: "image", folderName: "照片" },
        { fileType: "pdf", folderName: "PDF 文档" },
        { fileType: "word", folderName: "Word 文档" },
        { fileType: "pptx", folderName: "演示文稿" },
      ],
    },
  },
  {
    id: "auto-backup",
    type: "auto_backup",
    name: "每日数据备份",
    description: "每天自动导出数据备份（客户端本地）",
    icon: "💾",
    defaultConfig: { frequencyHours: 24 },
  },
];

// Get default rules from templates
export function getDefaultRules(): AutomationRule[] {
  const now = new Date().toISOString();
  return RULE_TEMPLATES.map((template) => ({
    id: template.id,
    type: template.type,
    enabled: template.id === "auto-tag-images", // Only auto-tag enabled by default
    config: { ...template.defaultConfig },
    lastRun: undefined,
    createdAt: now,
  }));
}

// Storage keys
const RULES_STORAGE_KEY = "kb_automation_rules";

// Load rules from localStorage
export function loadRules(): AutomationRule[] {
  if (typeof window === "undefined") return getDefaultRules();
  try {
    const stored = localStorage.getItem(RULES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fall through
  }
  return getDefaultRules();
}

// Save rules to localStorage
export function saveRules(rules: AutomationRule[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Storage full or unavailable
  }
}

// Check if auto_tag rule should run on file upload
export function shouldAutoTag(rules: AutomationRule[]): boolean {
  return rules.some(
    (r) => r.type === "auto_tag" && r.enabled && (r.config as { autoTagImages?: boolean }).autoTagImages
  );
}

// Check if auto_organize rule should run on file upload
export function shouldAutoOrganize(rules: AutomationRule[]): boolean {
  return rules.some(
    (r) => r.type === "auto_organize" && r.enabled
  );
}

// Get auto_organize rules (file type -> folder mapping)
export function getOrganizeRules(rules: AutomationRule[]): Array<{ fileType: string; folderName: string }> {
  const rule = rules.find((r) => r.type === "auto_organize" && r.enabled);
  if (!rule) return [];
  return (rule.config as { rules?: Array<{ fileType: string; folderName: string }> }).rules || [];
}

// Get cleanup threshold in days
export function getCleanupThreshold(rules: AutomationRule[]): number {
  const rule = rules.find((r) => r.type === "auto_cleanup" && r.enabled);
  if (!rule) return 0;
  return (rule.config as { daysThreshold?: number }).daysThreshold || 30;
}

// Update lastRun time for a rule
export function updateLastRun(rules: AutomationRule[], ruleId: string): AutomationRule[] {
  return rules.map((r) =>
    r.id === ruleId ? { ...r, lastRun: new Date().toISOString() } : r
  );
}
