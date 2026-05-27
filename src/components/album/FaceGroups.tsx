"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  ScanFace,
  Loader2,
  Check,
  X,
  Pencil,
  Trash2,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

interface FaceGroup {
  id: string;
  name: string | null;
  thumbnail: string | null;
  faceCount: number;
  photoCount: number;
  createdAt: string;
}

interface FaceGroupsProps {
  onSelectGroup: (groupId: string, groupName: string | null) => void;
}

export default function FaceGroups({ onSelectGroup }: FaceGroupsProps) {
  const { user, files } = useAppStore();
  const [groups, setGroups] = useState<FaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/faces/groups?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (err) {
      console.error("Failed to fetch face groups:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const imageFiles = files.filter(
    (f) => f.fileType === "image" && !f.isDeleted
  );

  const handleScanFaces = async () => {
    if (!user || processing) return;
    setProcessing(true);
    setProgress({ processed: 0, total: 0 });

    try {
      const res = await fetch("/api/faces/process-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setProgress({ processed: 0, total: data.total || 0 });

        if (data.isProcessing || data.total > 0) {
          // Poll for progress
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(
                `/api/faces/process-all?userId=${user.id}`
              );
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                setProgress({
                  processed: statusData.processed || 0,
                  total: statusData.total || 0,
                });

                if (!statusData.isProcessing) {
                  clearInterval(pollInterval);
                  setProcessing(false);
                  fetchGroups();
                }
              }
            } catch {
              clearInterval(pollInterval);
              setProcessing(false);
              fetchGroups();
            }
          }, 2000);
        } else {
          setProcessing(false);
        }
      }
    } catch (err) {
      console.error("Failed to start face scan:", err);
      setProcessing(false);
    }
  };

  const handleRename = async (groupId: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/faces/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (res.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId ? { ...g, name: editName.trim() } : g
          )
        );
      }
    } catch (err) {
      console.error("Failed to rename group:", err);
    }

    setEditingId(null);
  };

  const handleDelete = async (groupId: string) => {
    try {
      const res = await fetch(`/api/faces/groups/${groupId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
      }
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
  };

  // Empty state
  if (!loading && groups.length === 0 && !processing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">人脸识别</h2>
              <p className="text-sm text-muted-foreground">
                智能识别和分组照片中的人物
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 px-4">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
            <Users className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            开始人脸识别
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
            AI 将自动扫描你的图片，识别其中的人物面孔并进行智能分组，让你可以快速找到某个人的所有照片。
          </p>
          {imageFiles.length > 0 ? (
            <Button onClick={handleScanFaces} className="gap-2">
              <ScanFace className="w-4 h-4" />
              扫描 {imageFiles.length} 张图片中的人脸
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              上传包含人物的图片后即可开始人脸识别
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
            <ScanFace className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">人脸识别</h2>
            <p className="text-sm text-muted-foreground">
              {groups.length} 个分组 · {groups.reduce((s, g) => s + g.photoCount, 0)} 张照片
            </p>
          </div>
        </div>

        {!processing && imageFiles.length > 0 && (
          <Button
            variant="outline"
            onClick={handleScanFaces}
            className="gap-2"
          >
            <ScanFace className="w-4 h-4" />
            扫描人脸
          </Button>
        )}
      </div>

      {/* Progress */}
      {processing && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
              <span className="text-sm font-medium">
                正在扫描人脸...
              </span>
              <span className="text-sm text-muted-foreground ml-auto">
                {progress.total > 0
                  ? `${progress.processed} / ${progress.total}`
                  : "准备中..."}
              </span>
            </div>
            <Progress
              value={
                progress.total > 0
                  ? (progress.processed / progress.total) * 100
                  : 0
              }
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Face Groups Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="aspect-square bg-muted animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {groups.map((group) => {
            const thumbnailFile = group.thumbnail
              ? files.find((f) => f.id === group.thumbnail)
              : null;

            return (
              <Card
                key={group.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-all duration-200 group"
              >
                <div
                  className="aspect-square relative overflow-hidden"
                  onClick={() => onSelectGroup(group.id, group.name)}
                >
                  {thumbnailFile ? (
                    <img
                      src={
                        thumbnailFile.thumbnailUrl ||
                        thumbnailFile.previewUrl ||
                        thumbnailFile.filePath
                      }
                      alt={group.name || "未命名"}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="absolute bottom-2 right-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(group.id);
                          setEditName(group.name || "");
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(group.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                      <ChevronRight className="w-4 h-4 text-white/70" />
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  {editingId === group.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="输入姓名"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(group.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleRename(group.id)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">
                        {group.name || "未命名"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {group.photoCount} 张照片
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {group.faceCount} 张人脸
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
