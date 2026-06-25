"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  Loader2,
  Key,
  Globe,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiProviderType } from "@/lib/ai/providers/base";

interface ProviderConfig {
  id: string;
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  hasKey: boolean;
  updatedAt: string;
}

const PROVIDER_INFO: Record<string, { name: string; desc: string; needsKey: boolean; defaultBaseUrl: string; defaultModel: string }> = {
  zhipu: { name: "智谱AI", desc: "GLM-4，零配置即可使用", needsKey: false, defaultBaseUrl: "", defaultModel: "glm-4-flash" },
  deepseek: { name: "DeepSeek", desc: "高性价比，需要 API Key", needsKey: true, defaultBaseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat" },
  openai: { name: "OpenAI", desc: "GPT-4o，需要 API Key", needsKey: true, defaultBaseUrl: "https://api.openai.com", defaultModel: "gpt-4o" },
  ollama: { name: "Ollama", desc: "本地部署，无需 API Key", needsKey: false, defaultBaseUrl: "http://localhost:11434", defaultModel: "llama3" },
};

export function AiProviderSettings() {
  const { token } = useAppStore();
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { apiKey: string; baseUrl: string; model: string }>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/ai/providers", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.configs) setConfigs(data.configs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const getEditValue = (provider: string) => {
    if (editValues[provider]) return editValues[provider];
    const existing = configs.find((c) => c.provider === provider);
    return {
      apiKey: "",
      baseUrl: existing?.baseUrl || PROVIDER_INFO[provider]?.defaultBaseUrl || "",
      model: existing?.model || PROVIDER_INFO[provider]?.defaultModel || "",
    };
  };

  const handleSave = async (provider: string) => {
    if (!token) return;
    setSaving(provider);
    setSaved(null);

    const values = getEditValue(provider);
    try {
      const res = await fetch("/api/ai/providers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          apiKey: values.apiKey || undefined,
          baseUrl: values.baseUrl || undefined,
          model: values.model || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfigs((prev) => {
          const idx = prev.findIndex((c) => c.provider === provider);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = data.config;
            return updated;
          }
          return [...prev, data.config];
        });
        setSaved(provider);
        setEditValues((prev) => {
          const next = { ...prev };
          delete next[provider];
          return next;
        });
        setTimeout(() => setSaved(null), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(Object.entries(PROVIDER_INFO) as [string, typeof PROVIDER_INFO[string]][]).map(([key, info]) => {
        const existing = configs.find((c) => c.provider === key);
        const values = getEditValue(key);

        return (
          <Card key={key} className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                {info.name}
                {existing?.hasKey && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Key className="h-2.5 w-2.5" />
                    已配置
                  </Badge>
                )}
                {!info.needsKey && (
                  <Badge variant="secondary" className="text-[10px]">免配置</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{info.desc}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* API Key */}
              {info.needsKey && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Key className="h-3 w-3" />
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKeys[key] ? "text" : "password"}
                        placeholder={existing?.hasKey ? "已保存，留空保持不变" : "输入 API Key"}
                        value={values.apiKey}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            [key]: { ...getEditValue(key), apiKey: e.target.value },
                          }))
                        }
                        className="text-xs h-8 pr-8"
                      />
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }))}
                      >
                        {showKeys[key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Base URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  API 地址
                </label>
                <Input
                  type="text"
                  placeholder={info.defaultBaseUrl || "默认地址"}
                  value={values.baseUrl}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [key]: { ...getEditValue(key), baseUrl: e.target.value },
                    }))
                  }
                  className="text-xs h-8"
                />
              </div>

              {/* Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3 w-3" />
                  模型名称
                </label>
                <Input
                  type="text"
                  placeholder={info.defaultModel || "默认模型"}
                  value={values.model}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [key]: { ...getEditValue(key), model: e.target.value },
                    }))
                  }
                  className="text-xs h-8"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSave(key)}
                  disabled={saving === key}
                  className="text-xs h-7"
                >
                  {saving === key ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : saved === key ? (
                    <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  {saved === key ? "已保存" : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
