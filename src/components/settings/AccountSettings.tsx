"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { User, Camera, Globe, Clock, Calendar } from "lucide-react";

// 支持的语言列表
const LANGUAGES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
  { value: "ja-JP", label: "日本語" },
];

// 支持的时区列表（常用）
const TIMEZONES = [
  { value: "Asia/Shanghai", label: "中国标准时间 (UTC+8)" },
  { value: "Asia/Tokyo", label: "日本标准时间 (UTC+9)" },
  { value: "America/New_York", label: "美国东部时间 (UTC-5)" },
  { value: "America/Los_Angeles", label: "美国太平洋时间 (UTC-8)" },
  { value: "Europe/London", label: "伦敦时间 (UTC+0)" },
  { value: "Europe/Paris", label: "巴黎时间 (UTC+1)" },
];

// 日期格式选项
const DATE_FORMATS = [
  { value: "YYYY-MM-DD", label: "2024-01-15" },
  { value: "DD/MM/YYYY", label: "15/01/2024" },
  { value: "MM/DD/YYYY", label: "01/15/2024" },
  { value: "YYYY年MM月DD日", label: "2024年01月15日" },
];

// 时间格式选项
const TIME_FORMATS = [
  { value: "24h", label: "24小时制 (14:30)" },
  { value: "12h", label: "12小时制 (2:30 PM)" },
];

export function AccountSettings() {
  const { user, updateUser } = useAppStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    language: user?.settings?.language || "zh-CN",
    timezone: user?.settings?.timezone || "Asia/Shanghai",
    dateFormat: user?.settings?.dateFormat || "YYYY-MM-DD",
    timeFormat: user?.settings?.timeFormat || "24h",
  });

  // 处理输入变化
  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      // 调用API保存设置
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          settings: {
            language: formData.language,
            timezone: formData.timezone,
            dateFormat: formData.dateFormat,
            timeFormat: formData.timeFormat,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        updateUser(data.data);
        toast({
          title: "保存成功",
          description: "个人设置已更新",
        });
      } else {
        throw new Error("保存失败");
      }
    } catch (error) {
      toast({
        title: "保存失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // 处理头像上传
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件大小（最大2MB）
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "文件过大",
        description: "头像图片不能超过2MB",
        variant: "destructive",
      });
      return;
    }

    // 检查文件类型
    if (!file.type.startsWith("image/")) {
      toast({
        title: "文件类型错误",
        description: "请上传图片文件",
        variant: "destructive",
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        updateUser({ ...user, avatar: data.data.avatarUrl });
        toast({
          title: "上传成功",
          description: "头像已更新",
        });
      } else {
        throw new Error("上传失败");
      }
    } catch (error) {
      toast({
        title: "上传失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    }
  };

  // 获取头像首字母
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* 个人信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            个人信息
          </CardTitle>
          <CardDescription>
            管理你的个人信息和头像
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 头像 */}
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="text-lg">
                  {getInitials(user?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Camera className="h-4 w-4" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>
            <div>
              <h3 className="font-medium">{user?.name || "未设置昵称"}</h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                支持 JPG、PNG 格式，最大 2MB
              </p>
            </div>
          </div>

          <Separator />

          {/* 姓名 */}
          <div className="space-y-2">
            <Label htmlFor="name">昵称</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="请输入昵称"
              maxLength={50}
            />
          </div>

          {/* 邮箱（只读） */}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              value={formData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              邮箱是你的登录账号，暂不支持修改
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 显示设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            显示设置
          </CardTitle>
          <CardDescription>
            自定义语言、时区和日期格式
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 语言 */}
          <div className="space-y-2">
            <Label>语言</Label>
            <Select
              value={formData.language}
              onValueChange={(value) => handleChange("language", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择语言" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 时区 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              时区
            </Label>
            <Select
              value={formData.timezone}
              onValueChange={(value) => handleChange("timezone", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择时区" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 日期格式 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              日期格式
            </Label>
            <Select
              value={formData.dateFormat}
              onValueChange={(value) => handleChange("dateFormat", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择日期格式" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value}>
                    {fmt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 时间格式 */}
          <div className="space-y-2">
            <Label>时间格式</Label>
            <Select
              value={formData.timeFormat}
              onValueChange={(value) => handleChange("timeFormat", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择时间格式" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((fmt) => (
                  <SelectItem key={fmt.value} value={fmt.value}>
                    {fmt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </div>
  );
}
