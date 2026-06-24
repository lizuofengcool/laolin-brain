"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Bell, Mail, MessageSquare, Calendar, Clock, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// 通知类型配置
const notificationTypes = [
  {
    id: "system",
    name: "系统通知",
    description: "系统更新、维护通知等",
    icon: Bell,
    defaultEnabled: true,
  },
  {
    id: "payment",
    name: "支付通知",
    description: "订阅、订单、支付相关通知",
    icon: MessageSquare,
    defaultEnabled: true,
  },
  {
    id: "storage",
    name: "存储通知",
    description: "存储空间不足、配额预警",
    icon: Calendar,
    defaultEnabled: true,
  },
  {
    id: "ai",
    name: "AI处理通知",
    description: "AI处理完成、任务状态通知",
    icon: MessageSquare,
    defaultEnabled: true,
  },
  {
    id: "share",
    name: "分享通知",
    description: "文件分享、协作相关通知",
    icon: Mail,
    defaultEnabled: true,
  },
  {
    id: "comment",
    name: "评论通知",
    description: "新评论、@提及通知",
    icon: MessageSquare,
    defaultEnabled: true,
  },
  {
    id: "security",
    name: "安全通知",
    description: "登录提醒、安全事件通知",
    icon: Bell,
    defaultEnabled: true,
  },
];

// 通知渠道
const notificationChannels = [
  {
    id: "inapp",
    name: "站内通知",
    description: "应用内通知中心",
    defaultEnabled: true,
  },
  {
    id: "email",
    name: "邮件通知",
    description: "发送到注册邮箱",
    defaultEnabled: true,
  },
  {
    id: "browser",
    name: "浏览器推送",
    description: "桌面通知推送",
    defaultEnabled: false,
  },
];

export function NotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // 通知类型设置
  const [typeSettings, setTypeSettings] = useState<Record<string, boolean>>(
    () => {
      const settings: Record<string, boolean> = {};
      notificationTypes.forEach((type) => {
        settings[type.id] = type.defaultEnabled;
      });
      return settings;
    }
  );

  // 通知渠道设置
  const [channelSettings, setChannelSettings] = useState<Record<string, boolean>>(
    () => {
      const settings: Record<string, boolean> = {};
      notificationChannels.forEach((channel) => {
        settings[channel.id] = channel.defaultEnabled;
      });
      return settings;
    }
  );

  // 免打扰设置
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [dndStart, setDndStart] = useState("22:00");
  const [dndEnd, setDndEnd] = useState("08:00");
  const [allowImportant, setAllowImportant] = useState(true);

  // 保存设置
  const saveSettings = async () => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "设置已保存",
        description: "通知设置已更新",
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

  // 切换通知类型
  const toggleType = (typeId: string) => {
    setTypeSettings((prev) => ({
      ...prev,
      [typeId]: !prev[typeId],
    }));
  };

  // 切换通知渠道
  const toggleChannel = (channelId: string) => {
    setChannelSettings((prev) => ({
      ...prev,
      [channelId]: !prev[channelId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* 通知类型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知类型
          </CardTitle>
          <CardDescription>
            选择你想要接收的通知类型
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationTypes.map((type) => {
            const Icon = type.icon;
            return (
              <div
                key={type.id}
                className="flex items-center justify-between space-x-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label htmlFor={`type-${type.id}`} className="font-medium">
                      {type.name}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {type.description}
                    </p>
                  </div>
                </div>
                <Switch
                  id={`type-${type.id}`}
                  checked={typeSettings[type.id]}
                  onCheckedChange={() => toggleType(type.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 通知渠道设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            通知渠道
          </CardTitle>
          <CardDescription>
            选择通知的发送方式
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationChannels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between space-x-4"
            >
              <div>
                <Label htmlFor={`channel-${channel.id}`} className="font-medium">
                  {channel.name}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {channel.description}
                </p>
              </div>
              <Switch
                id={`channel-${channel.id}`}
                checked={channelSettings[channel.id]}
                onCheckedChange={() => toggleChannel(channel.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 免打扰设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            免打扰设置
          </CardTitle>
          <CardDescription>
            设置免打扰时间段，此期间不会收到通知提醒
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="dnd-toggle" className="font-medium">
                启用免打扰
              </Label>
              <p className="text-sm text-muted-foreground">
                在指定时间段内静音通知
              </p>
            </div>
            <Switch
              id="dnd-toggle"
              checked={doNotDisturb}
              onCheckedChange={setDoNotDisturb}
            />
          </div>

          {doNotDisturb && (
            <>
              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dnd-start">开始时间</Label>
                  <Input
                    id="dnd-start"
                    type="time"
                    value={dndStart}
                    onChange={(e) => setDndStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dnd-end">结束时间</Label>
                  <Input
                    id="dnd-end"
                    type="time"
                    value={dndEnd}
                    onChange={(e) => setDndEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-important" className="font-medium">
                    允许重要通知
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    安全和支付相关通知不受免打扰限制
                  </p>
                </div>
                <Switch
                  id="allow-important"
                  checked={allowImportant}
                  onCheckedChange={setAllowImportant}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={loading}>
          {loading ? (
            <>
              <Clock className="mr-2 h-4 w-4 animate-spin" />
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
