import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: Return analytics data for the current user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "缺少 userId 参数" }, { status: 400 });
    }

    // Get all files for user (including deleted for analytics)
    const allFiles = await db.file.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    const activeFiles = allFiles.filter((f) => !f.isDeleted);

    // File growth by month
    const monthlyGrowth: Record<string, number> = {};
    for (const file of allFiles) {
      const date = new Date(file.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyGrowth[key] = (monthlyGrowth[key] || 0) + 1;
    }
    const fileGrowth = Object.entries(monthlyGrowth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // Storage by type
    const storageByType: Record<string, number> = {};
    for (const file of activeFiles) {
      storageByType[file.fileType] = (storageByType[file.fileType] || 0) + file.fileSize;
    }

    // File type distribution by month (for stacked bar)
    const monthlyTypeDist: Record<string, Record<string, number>> = {};
    for (const file of activeFiles) {
      const date = new Date(file.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyTypeDist[key]) monthlyTypeDist[key] = {};
      monthlyTypeDist[key][file.fileType] = (monthlyTypeDist[key][file.fileType] || 0) + 1;
    }
    const fileTypeTrend = Object.entries(monthlyTypeDist)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, types]) => ({ month, ...types }));

    // Top 10 largest files
    const topFiles = [...activeFiles]
      .sort((a, b) => b.fileSize - a.fileSize)
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileSize: f.fileSize,
        fileType: f.fileType,
      }));

    // Activity data - upload by hour of day and day of week
    const activityByHour: number[] = new Array(24).fill(0);
    const activityByDayOfWeek: number[] = new Array(7).fill(0);
    for (const file of allFiles) {
      const date = new Date(file.createdAt);
      activityByHour[date.getHours()]++;
      activityByDayOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1]++; // Mon=0
    }

    // Quick stats
    const totalSize = activeFiles.reduce((acc, f) => acc + f.fileSize, 0);
    const avgFileSize = activeFiles.length > 0 ? totalSize / activeFiles.length : 0;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const filesThisWeek = activeFiles.filter(
      (f) => new Date(f.createdAt) >= weekStart
    ).length;
    const filesThisMonth = activeFiles.filter(
      (f) => new Date(f.createdAt) >= monthStart
    ).length;

    // Most used tags
    const tagCount: Record<string, number> = {};
    for (const file of activeFiles) {
      if (file.tags) {
        const tags = typeof file.tags === "string" ? file.tags.split(",").map((t) => t.trim()).filter(Boolean) : file.tags;
        for (const tag of tags) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
    }
    const topTags = Object.entries(tagCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Storage prediction (simple linear regression)
    const months = fileGrowth.length;
    let predicted1Month = 0;
    let predicted3Months = 0;
    let predicted6Months = 0;

    if (months >= 2) {
      const recentCounts = fileGrowth.slice(-3).map((m) => m.count);
      const avgMonthlyFiles = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
      const avgMonthlySize = months > 0 ? totalSize / months : 0;

      predicted1Month = totalSize + avgMonthlySize;
      predicted3Months = totalSize + avgMonthlySize * 3;
      predicted6Months = totalSize + avgMonthlySize * 6;
    }

    // Storage efficiency score (0-100): lower average size + better tag usage = higher score
    const tagUsageRatio = activeFiles.length > 0
      ? activeFiles.filter((f) => f.tags && f.tags.length > 0).length / activeFiles.length
      : 0;
    const efficiencyScore = Math.min(100, Math.round(
      (tagUsageRatio * 40) + (activeFiles.length > 0 ? 30 : 0) + (topTags.length > 0 ? 30 : 0)
    ));

    return NextResponse.json({
      fileGrowth,
      storageByType,
      fileTypeTrend,
      topFiles,
      activity: {
        byHour: activityByHour,
        byDayOfWeek: activityByDayOfWeek,
      },
      stats: {
        totalFiles: activeFiles.length,
        totalSize,
        avgFileSize: Math.round(avgFileSize),
        filesThisWeek,
        filesThisMonth,
        topTags,
        efficiencyScore,
      },
      predictions: {
        oneMonth: Math.round(predicted1Month),
        threeMonths: Math.round(predicted3Months),
        sixMonths: Math.round(predicted6Months),
      },
    });
  } catch (error) {
    console.error("Analytics fetch failed:", error);
    return NextResponse.json({ error: "获取分析数据失败" }, { status: 500 });
  }
}
