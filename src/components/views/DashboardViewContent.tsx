"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppStore } from "@/stores/app-store";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentFiles } from "@/components/dashboard/RecentFiles";
import { EmptyDashboard } from "@/components/shared/EmptyDashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Image as ImageIcon, HardDrive, Star, BarChart3 } from "lucide-react";
import { formatSize } from "@/lib/file-utils";

const StorageCharts = dynamic(
  () => import("@/components/dashboard/StorageCharts"),
  { loading: () => <Skeleton className="h-48 rounded-lg" /> }
);

export function DashboardViewContent() {
  const { files, user, setFileTypeFilter } = useAppStore();
  const router = useRouter();
  const activeFiles = useMemo(() => files.filter((f) => !f.isDeleted), [files]);
  const docCount = useMemo(() => activeFiles.filter((f) => f.fileType === "word" || f.fileType === "pdf" || f.fileType === "pptx").length, [activeFiles]);
  const imageCount = useMemo(() => activeFiles.filter((f) => f.fileType === "image").length, [activeFiles]);
  const favCount = useMemo(() => activeFiles.filter((f) => f.isFavorite).length, [activeFiles]);
  const totalSize = useMemo(() => activeFiles.reduce((acc, f) => acc + f.fileSize, 0), [activeFiles]);

  const handleStatClick = (filterType: string | null) => {
    setFileTypeFilter(filterType);
    router.push("/files");
  };

  if (activeFiles.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            欢迎回来，{user?.name || "用户"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            这是你的知识库概览，快速了解文件情况
          </p>
        </div>
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">
          欢迎回来，{user?.name || "用户"} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          这是你的知识库概览，快速了解文件情况
        </p>
      </div>

      {/* Stats - clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="文档"
          value={docCount}
          icon={FileText}
          description="Word & PDF & PPT"
          onClick={() => handleStatClick("document")}
        />
        <StatsCard
          title="图片"
          value={imageCount}
          icon={ImageIcon}
          description="照片 & 图片"
          onClick={() => handleStatClick("image")}
        />
        <StatsCard
          title="收藏"
          value={favCount}
          icon={Star}
          description="标记的重要文件"
          onClick={() => handleStatClick("favorite")}
        />
        <StatsCard
          title="存储"
          value={formatSize(totalSize)}
          icon={HardDrive}
          description={`${activeFiles.length} 个文件`}
          onClick={() => handleStatClick(null)}
        />
      </div>

      {/* Charts */}
      <StorageCharts files={activeFiles} />

      {/* View Analytics Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => router.push("/analytics")}
          className="gap-2"
        >
          <BarChart3 className="h-4 w-4" />
          查看详细分析
        </Button>
      </div>

      {/* Recent files */}
      <RecentFiles />
    </div>
  );
}
