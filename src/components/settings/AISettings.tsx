"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Brain, Sparkles, FileText, Image, Tag, MessageSquare, Settings, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// AI功能列表
const aiFeatures = [
  {
    id: "summarize",
    name: "文档智能摘要",
    description: "自动为文档生成摘要和关键要点",
    icon: FileText,
    defaultEnabled: true,
  },
  {
    id: "ocr",
    name: "OCR文字识别",
    description: "从图片中提取文字内容",
    icon: Image,
    defaultEnabled: true,
  },
  {
    id: "describe",
    name: "图像描述生成",
    description: "为图片生成自然语言描述",
    icon: Image,
    defaultEnabled: true,
  },
  {
    id: "tags",
    name: "智能标签生成",
    description: "自动为文件生成相关标签",
    icon: Tag,
    defaultEnabled: true,
  },
  {
    id: "face",
    name: "人脸检测识别",
    description: "自动检测和识别人脸",
    icon: Sparkles,
    defaultEnabled: true,
  },
  {
    id: "graph",
    name: "知识图谱生成",
    description: "自动生成知识关系图谱",
    icon: Brain,
    defaultEnabled: true,
  },
];

export function AISettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // AI功能开关
  const [featureSettings, setFeatureSettings] = useState<Record<string, boolean>>(
    () => {
      const settings: Record<string, boolean> = {};
      aiFeatures.forEach((feature) => {
        settings[feature.id] = feature.defaultEnabled;
      });
      return settings;
    }
  );

  // 自动处理设置
  const [autoProcess, setAutoProcess] = useState(true);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [autoOcr, setAutoOcr] = useState(true);
  const [autoTags, setAutoTags] = useState(true);

  // AI模型选择
  const [model, setModel] = useState("default");

  // 配额使用情况
  const quotaUsage = {
    total: 1000,
    used: 342,
    percentage: 34.2,
    resetDate: "2026-07-01",
  };

  // 保存设置
  const saveSettings = async () => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "设置已保存",
        description: "AI设置已更新",
      });
    } catch (error) {
      toast({
        title: "保存失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 切换功能
  const toggleFeature = (featureId: string) => {
    setFeatureSettings((prev) => ({
      ...prev,
      [featureId]: !prev[featureId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* AI功能开关 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI功能
          </CardTitle>
          <CardDescription>
            选择你想要启用的AI功能
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                className="flex items-center justify-between space-x-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label htmlFor={`feature-${feature.id}`} className="font-medium">
                      {feature.name}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={`feature-${feature.id}`}
                  checked={featureSettings[feature.id]}
                  onCheckedChange={() => toggleFeature(feature.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 自动处理设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            自动处理
          </CardTitle>
          <CardDescription>
            文件上传后自动进行AI处理
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-process" className="font-medium">
                启用自动处理
              </Label>
              <p className="text-sm text-muted-foreground">
                上传文件后自动进行AI分析
              </p>
            </div>
            <Switch
              id="auto-process"
              checked={autoProcess}
              onCheckedChange={setAutoProcess}
            />
          </div>

          {autoProcess && (
            <>
              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-summarize" className="font-medium">
                    自动生成摘要
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    文档上传后自动生成摘要
                  </p>
                </div>
                <Switch
                  id="auto-summarize"
                  checked={autoSummarize}
                  onCheckedChange={setAutoSummarize}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-ocr" className="font-medium">
                    自动OCR识别
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    图片上传后自动识别文字
                  </p>
                </div>
                <Switch
                  id="auto-ocr"
                  checked={autoOcr}
                  onCheckedChange={setAutoOcr}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-tags" className="font-medium">
                    自动生成标签
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    文件上传后自动生成标签
                  </p>
                </div>
                <Switch
                  id="auto-tags"
                  checked={autoTags}
                  onCheckedChange={setAutoTags}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI模型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            模型设置
          </CardTitle>
          <CardDescription>
            选择AI模型和相关参数
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="model-select">AI模型</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model-select">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认模型（平衡）</SelectItem>
                <SelectItem value="fast">快速模型（速度优先）</SelectItem>
                <SelectItem value="quality">高质量模型（质量优先）</SelectItem>
                <SelectItem value="custom">自定义模型</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              不同模型在速度和质量上有不同表现
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 使用配额 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            使用配额
          </CardTitle>
          <CardDescription>
            查看AI功能使用情况
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">本月已使用</span>
              <span className="font-medium">
                {quotaUsage.used} / {quotaUsage.total} 次
              </span>
            </div>
            <Progress value={quotaUsage.percentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{quotaUsage.percentage}% 已使用</span>
              <span>重置日期: {quotaUsage.resetDate}</span>
            </div>
          </div>

          <Button variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            升级套餐获取更多配额
          </Button>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              保存设置
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
