"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import type { FileData } from "@/lib/storage/base";
import { cn } from "@/lib/utils";

interface FaceGroupPhotosProps {
  groupId: string;
  groupName: string | null;
  onBack: () => void;
}

export default function FaceGroupPhotos({
  groupId,
  groupName,
  onBack,
}: FaceGroupPhotosProps) {
  const { openLightbox, files } = useAppStore();
  const [photos, setPhotos] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const token = useAppStore.getState().token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        `/api/faces/groups/${groupId}/photos?page=${page}&limit=${pageSize}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.photos || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch face group photos:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId, page]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handlePhotoClick = (photo: FileData, index: number) => {
    openLightbox(photos, index);
  };

  // Merge fetched photos with store files to get full data
  const enrichedPhotos = photos.map((p) => {
    const storeFile = files.find((f) => f.id === p.id);
    return storeFile || p;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {groupName || "未命名"}的照片
          </h2>
          <p className="text-sm text-muted-foreground">
            共 {total} 张照片包含此人
          </p>
        </div>
      </div>

      {/* Photos Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-lg overflow-hidden bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : enrichedPhotos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">暂无照片</p>
          <p className="text-xs mt-1">该分组暂无关联的照片</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {enrichedPhotos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative rounded-lg overflow-hidden aspect-square cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => handlePhotoClick(photo, index)}
              >
                <img
                  src={
                    photo.thumbnailUrl ||
                    photo.previewUrl ||
                    photo.filePath
                  }
                  alt={photo.fileName}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-xs text-white font-medium truncate">
                      {photo.fileName}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
