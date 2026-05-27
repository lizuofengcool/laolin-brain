import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RULE_TEMPLATES,
  getDefaultRules,
  shouldAutoTag,
  shouldAutoOrganize,
  getOrganizeRules,
  getCleanupThreshold,
  updateLastRun,
  loadRules,
  saveRules,
  type AutomationRule,
} from "@/lib/automation/engine";

describe("automation engine", () => {
  describe("RULE_TEMPLATES", () => {
    it("has 4 entries", () => {
      expect(RULE_TEMPLATES).toHaveLength(4);
    });

    it("each template has required fields", () => {
      for (const template of RULE_TEMPLATES) {
        expect(template).toHaveProperty("id");
        expect(template).toHaveProperty("type");
        expect(template).toHaveProperty("name");
        expect(template).toHaveProperty("description");
        expect(template).toHaveProperty("icon");
        expect(template).toHaveProperty("defaultConfig");
        expect(typeof template.id).toBe("string");
        expect(typeof template.name).toBe("string");
        expect(typeof template.description).toBe("string");
        expect(typeof template.icon).toBe("string");
        expect(typeof template.defaultConfig).toBe("object");
      }
    });

    it("has one of each type", () => {
      const types = RULE_TEMPLATES.map((t) => t.type);
      expect(types).toContain("auto_cleanup");
      expect(types).toContain("auto_tag");
      expect(types).toContain("auto_organize");
      expect(types).toContain("auto_backup");
    });

    it("has correct default config for auto_cleanup", () => {
      const cleanup = RULE_TEMPLATES.find((t) => t.type === "auto_cleanup");
      expect(cleanup!.defaultConfig).toEqual({ daysThreshold: 30 });
    });

    it("has correct default config for auto_tag", () => {
      const tag = RULE_TEMPLATES.find((t) => t.type === "auto_tag");
      expect(tag!.defaultConfig).toEqual({ autoTagImages: true });
    });

    it("has correct default config for auto_organize", () => {
      const org = RULE_TEMPLATES.find((t) => t.type === "auto_organize");
      expect(org!.defaultConfig.rules).toBeInstanceOf(Array);
      expect(org!.defaultConfig.rules.length).toBeGreaterThan(0);
    });

    it("has correct default config for auto_backup", () => {
      const backup = RULE_TEMPLATES.find((t) => t.type === "auto_backup");
      expect(backup!.defaultConfig).toEqual({ frequencyHours: 24 });
    });
  });

  describe("getDefaultRules", () => {
    it("returns 4 rules", () => {
      const rules = getDefaultRules();
      expect(rules).toHaveLength(4);
    });

    it("each rule has an AutomationRule shape", () => {
      const rules = getDefaultRules();
      for (const rule of rules) {
        expect(rule).toHaveProperty("id");
        expect(rule).toHaveProperty("type");
        expect(rule).toHaveProperty("enabled");
        expect(rule).toHaveProperty("config");
        expect(rule).toHaveProperty("createdAt");
      }
    });

    it("only auto-tag is enabled by default", () => {
      const rules = getDefaultRules();
      const enabledRules = rules.filter((r) => r.enabled);
      expect(enabledRules).toHaveLength(1);
      expect(enabledRules[0].type).toBe("auto_tag");
    });

    it("createdAt is a valid ISO date string", () => {
      const rules = getDefaultRules();
      for (const rule of rules) {
        expect(rule.createdAt).toBeDefined();
        expect(() => new Date(rule.createdAt!)).not.toThrow();
      }
    });

    it("lastRun is undefined for all default rules", () => {
      const rules = getDefaultRules();
      for (const rule of rules) {
        expect(rule.lastRun).toBeUndefined();
      }
    });

    it("config is a copy of defaultConfig (not shared reference)", () => {
      const rules = getDefaultRules();
      const orgRule = rules.find((r) => r.type === "auto_organize");
      // Modify the rule config and check the template is unchanged
      (orgRule!.config as any).rules = [];
      const rules2 = getDefaultRules();
      const orgRule2 = rules2.find((r) => r.type === "auto_organize");
      expect((orgRule2!.config as any).rules.length).toBeGreaterThan(0);
    });
  });

  describe("shouldAutoTag", () => {
    it("returns true when auto_tag rule is enabled with autoTagImages=true", () => {
      const rules: AutomationRule[] = [
        { id: "t", type: "auto_tag", enabled: true, config: { autoTagImages: true }, createdAt: "" },
      ];
      expect(shouldAutoTag(rules)).toBe(true);
    });

    it("returns false when auto_tag rule is disabled", () => {
      const rules: AutomationRule[] = [
        { id: "t", type: "auto_tag", enabled: false, config: { autoTagImages: true }, createdAt: "" },
      ];
      expect(shouldAutoTag(rules)).toBe(false);
    });

    it("returns false when auto_tag rule has autoTagImages=false", () => {
      const rules: AutomationRule[] = [
        { id: "t", type: "auto_tag", enabled: true, config: { autoTagImages: false }, createdAt: "" },
      ];
      expect(shouldAutoTag(rules)).toBe(false);
    });

    it("returns false when autoTagImages is missing from config", () => {
      const rules: AutomationRule[] = [
        { id: "t", type: "auto_tag", enabled: true, config: {}, createdAt: "" },
      ];
      expect(shouldAutoTag(rules)).toBe(false);
    });

    it("returns false for empty rules array", () => {
      expect(shouldAutoTag([])).toBe(false);
    });
  });

  describe("shouldAutoOrganize", () => {
    it("returns true when auto_organize rule is enabled", () => {
      const rules: AutomationRule[] = [
        { id: "o", type: "auto_organize", enabled: true, config: {}, createdAt: "" },
      ];
      expect(shouldAutoOrganize(rules)).toBe(true);
    });

    it("returns false when auto_organize rule is disabled", () => {
      const rules: AutomationRule[] = [
        { id: "o", type: "auto_organize", enabled: false, config: {}, createdAt: "" },
      ];
      expect(shouldAutoOrganize(rules)).toBe(false);
    });

    it("returns false for empty rules array", () => {
      expect(shouldAutoOrganize([])).toBe(false);
    });
  });

  describe("getOrganizeRules", () => {
    it("returns file type mappings when auto_organize is enabled", () => {
      const rules: AutomationRule[] = [
        {
          id: "o",
          type: "auto_organize",
          enabled: true,
          config: {
            rules: [
              { fileType: "image", folderName: "照片" },
              { fileType: "pdf", folderName: "PDF 文档" },
            ],
          },
          createdAt: "",
        },
      ];
      const mappings = getOrganizeRules(rules);
      expect(mappings).toHaveLength(2);
      expect(mappings[0]).toEqual({ fileType: "image", folderName: "照片" });
      expect(mappings[1]).toEqual({ fileType: "pdf", folderName: "PDF 文档" });
    });

    it("returns empty array when auto_organize is disabled", () => {
      const rules: AutomationRule[] = [
        {
          id: "o",
          type: "auto_organize",
          enabled: false,
          config: { rules: [{ fileType: "image", folderName: "照片" }] },
          createdAt: "",
        },
      ];
      expect(getOrganizeRules(rules)).toEqual([]);
    });

    it("returns empty array when no auto_organize rule exists", () => {
      expect(getOrganizeRules([])).toEqual([]);
    });

    it("returns empty array when rules config is missing", () => {
      const rules: AutomationRule[] = [
        { id: "o", type: "auto_organize", enabled: true, config: {}, createdAt: "" },
      ];
      expect(getOrganizeRules(rules)).toEqual([]);
    });

    it("returns default organize rules from template config", () => {
      const defaultRules = getDefaultRules();
      // auto_organize is disabled by default, so we enable it
      const enabledRules = defaultRules.map((r) =>
        r.type === "auto_organize" ? { ...r, enabled: true } : r
      );
      const mappings = getOrganizeRules(enabledRules);
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings[0]).toHaveProperty("fileType");
      expect(mappings[0]).toHaveProperty("folderName");
    });
  });

  describe("getCleanupThreshold", () => {
    it("returns configured days when auto_cleanup is enabled", () => {
      const rules: AutomationRule[] = [
        { id: "c", type: "auto_cleanup", enabled: true, config: { daysThreshold: 14 }, createdAt: "" },
      ];
      expect(getCleanupThreshold(rules)).toBe(14);
    });

    it("defaults to 30 when daysThreshold is not set", () => {
      const rules: AutomationRule[] = [
        { id: "c", type: "auto_cleanup", enabled: true, config: {}, createdAt: "" },
      ];
      expect(getCleanupThreshold(rules)).toBe(30);
    });

    it("returns 0 when auto_cleanup is disabled", () => {
      const rules: AutomationRule[] = [
        { id: "c", type: "auto_cleanup", enabled: false, config: { daysThreshold: 14 }, createdAt: "" },
      ];
      expect(getCleanupThreshold(rules)).toBe(0);
    });

    it("returns 0 when no auto_cleanup rule exists", () => {
      expect(getCleanupThreshold([])).toBe(0);
    });
  });

  describe("updateLastRun", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("updates the lastRun field of the matching rule", () => {
      const rules: AutomationRule[] = [
        { id: "a", type: "auto_cleanup", enabled: true, config: {}, createdAt: "2025-01-01" },
        { id: "b", type: "auto_tag", enabled: true, config: {}, createdAt: "2025-01-01" },
      ];
      const result = updateLastRun(rules, "a");
      expect(result[0].lastRun).toBe("2025-06-01T12:00:00.000Z");
    });

    it("does not modify other rules", () => {
      const rules: AutomationRule[] = [
        { id: "a", type: "auto_cleanup", enabled: true, config: {}, createdAt: "2025-01-01" },
        { id: "b", type: "auto_tag", enabled: true, config: {}, createdAt: "2025-01-01" },
      ];
      const result = updateLastRun(rules, "a");
      expect(result[1].lastRun).toBeUndefined();
    });

    it("returns a new array (immutable)", () => {
      const rules: AutomationRule[] = [
        { id: "a", type: "auto_cleanup", enabled: true, config: {}, createdAt: "2025-01-01" },
      ];
      const result = updateLastRun(rules, "a");
      expect(result).not.toBe(rules);
    });

    it("returns rules unchanged when ruleId does not match", () => {
      const rules: AutomationRule[] = [
        { id: "a", type: "auto_cleanup", enabled: true, config: {}, createdAt: "2025-01-01" },
      ];
      const result = updateLastRun(rules, "nonexistent");
      expect(result[0].lastRun).toBeUndefined();
      expect(result).not.toBe(rules); // Still creates new references
    });
  });

  describe("loadRules", () => {
    const originalLocalStorage = globalThis.localStorage;

    beforeEach(() => {
      // jsdom already provides localStorage, just clear it
      localStorage.clear();
    });

    it("returns default rules when localStorage is empty", () => {
      const rules = loadRules();
      expect(rules).toHaveLength(4);
    });

    it("returns parsed rules from localStorage", () => {
      const defaultRules = getDefaultRules();
      localStorage.setItem("kb_automation_rules", JSON.stringify(defaultRules));
      const rules = loadRules();
      expect(rules).toHaveLength(4);
      expect(rules[0].id).toBe(defaultRules[0].id);
    });

    it("returns default rules when localStorage has empty array", () => {
      localStorage.setItem("kb_automation_rules", JSON.stringify([]));
      const rules = loadRules();
      expect(rules).toHaveLength(4);
    });

    it("returns default rules when localStorage has invalid JSON", () => {
      localStorage.setItem("kb_automation_rules", "not-json");
      const rules = loadRules();
      expect(rules).toHaveLength(4);
    });

    it("returns default rules when localStorage has non-array JSON", () => {
      localStorage.setItem("kb_automation_rules", JSON.stringify({ not: "an array" }));
      const rules = loadRules();
      expect(rules).toHaveLength(4);
    });
  });

  describe("saveRules", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("calls localStorage.setItem with JSON", () => {
      const rules = getDefaultRules();
      const spy = vi.spyOn(Storage.prototype, "setItem");
      saveRules(rules);
      expect(spy).toHaveBeenCalledWith("kb_automation_rules", JSON.stringify(rules));
      spy.mockRestore();
    });

    it("persists rules that can be loaded back", () => {
      const rules = getDefaultRules();
      saveRules(rules);
      const loaded = loadRules();
      expect(loaded).toEqual(rules);
    });
  });
});
