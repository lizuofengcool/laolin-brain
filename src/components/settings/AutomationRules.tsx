"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type AutomationRule,
  RULE_TEMPLATES,
  loadRules,
  saveRules,
} from "@/lib/automation/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Trash2,
  RefreshCw,
  Plus,
  Clock,
  Settings2,
} from "lucide-react";

interface AutomationRulesProps {
  compact?: boolean;
}

export default function AutomationRules({ compact = false }: AutomationRulesProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loaded = loadRules();
    setRules(loaded);
    setLoading(false);
  }, []);

  const updateRules = useCallback((newRules: AutomationRule[]) => {
    setRules(newRules);
    saveRules(newRules);
  }, []);

  const toggleRule = (ruleId: string) => {
    const updated = rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    updateRules(updated);
    const rule = updated.find((r) => r.id === ruleId);
    const template = RULE_TEMPLATES.find((t) => t.id === ruleId);
    toast({
      title: rule?.enabled ? "规则已启用" : "规则已禁用",
      description: `「${template?.name || ruleId}」已${rule?.enabled ? "启用" : "禁用"}`,
    });
  };

  const updateRuleConfig = (ruleId: string, key: string, value: unknown) => {
    const updated = rules.map((r) =>
      r.id === ruleId ? { ...r, config: { ...r.config, [key]: value } } : r
    );
    updateRules(updated);
  };

  const resetRules = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDefaultRules } = require("@/lib/automation/engine") as { getDefaultRules: () => AutomationRule[] };
    updateRules(getDefaultRules());
    toast({ title: "已重置", description: "自动化规则已恢复默认设置" });
  };

  const formatLastRun = (dateStr?: string) => {
    if (!dateStr) return "从未运行";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  if (loading) {
    return <div className="animate-pulse space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-lg bg-muted" />)}</div>;
  }

  const templates = RULE_TEMPLATES;

  return (
    <div className="space-y-4">
      {templates.map((template) => {
        const rule = rules.find((r) => r.id === template.id);
        const enabled = rule?.enabled || false;
        const config = rule?.config || template.defaultConfig;

        return (
          <Card key={template.id} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-2xl shrink-0">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{template.name}</h3>
                      <Badge
                        variant={enabled ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {enabled ? "已启用" : "已禁用"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {template.description}
                    </p>

                    {/* Config options */}
                    {enabled && template.type === "auto_cleanup" && (
                      <div className="flex items-center gap-2 mt-3">
                        <Label className="text-xs text-muted-foreground shrink-0">
                          删除超过
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={(config as { daysThreshold?: number }).daysThreshold || 30}
                          onChange={(e) =>
                            updateRuleConfig(
                              template.id,
                              "daysThreshold",
                              parseInt(e.target.value) || 30
                            )
                          }
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">天的文件</span>
                      </div>
                    )}

                    {enabled && template.type === "auto_backup" && (
                      <div className="flex items-center gap-2 mt-3">
                        <Label className="text-xs text-muted-foreground shrink-0">
                          频率
                        </Label>
                        <Select
                          value={String((config as { frequencyHours?: number }).frequencyHours || 24)}
                          onValueChange={(v) =>
                            updateRuleConfig(
                              template.id,
                              "frequencyHours",
                              parseInt(v)
                            )
                          }
                        >
                          <SelectTrigger className="w-32 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="12">每 12 小时</SelectItem>
                            <SelectItem value="24">每天</SelectItem>
                            <SelectItem value="168">每周</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Last run */}
                    {rule?.lastRun && (
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        上次运行: {formatLastRun(rule.lastRun)}
                      </div>
                    )}
                  </div>
                </div>

                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleRule(template.id)}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={resetRules}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          恢复默认
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          自定义规则（即将推出）
        </Button>
      </div>
    </div>
  );
}
