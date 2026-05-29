import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";

// GET: Return analytics data for the current user
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Quick stats via SQL aggregation
    const [statsRow] = await db.$queryRaw<Array<{ totalCount: bigint; totalSize: bigint }>>`
      SELECT COUNT(*) as "totalCount", COALESCE(SUM("fileSize"), 0) as "totalSize"
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
    `;
    const totalFiles = Number(statsRow.totalCount);
    const totalSize = Number(statsRow.totalSize);
    const avgFileSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0;

    const [weekRow] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "File"
      WHERE "userId" = ${userId} AND "isDeleted" = false AND "createdAt" >= ${weekStart.toISOString()}
    `;
    const filesThisWeek = Number(weekRow.count);

    const [monthRow] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "File"
      WHERE "userId" = ${userId} AND "isDeleted" = false AND "createdAt" >= ${monthStart.toISOString()}
    `;
    const filesThisMonth = Number(monthRow.count);

    // File growth by month (SQL GROUP BY)
    const monthlyGrowthRaw = await db.$queryRaw<Array<{ month: string; count: bigint }>>`
      SELECT strftime('%Y-%m', "createdAt") as month, COUNT(*) as count
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      GROUP BY month ORDER BY month ASC
    `;
    const fileGrowth = monthlyGrowthRaw.map((r) => ({
      month: r.month,
      count: Number(r.count),
    }));

    // Storage by type (SQL GROUP BY)
    const storageByTypeRaw = await db.$queryRaw<Array<{ fileType: string; totalSize: bigint }>>`
      SELECT "fileType" as "fileType", COALESCE(SUM("fileSize"), 0) as "totalSize"
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      GROUP BY "fileType"
    `;
    const storageByType: Record<string, number> = {};
    for (const row of storageByTypeRaw) {
      storageByType[row.fileType] = Number(row.totalSize);
    }

    // File type distribution by month (SQL GROUP BY)
    const monthlyTypeRaw = await db.$queryRaw<Array<{ month: string; fileType: string; count: bigint }>>`
      SELECT strftime('%Y-%m', "createdAt") as month, "fileType", COUNT(*) as count
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      GROUP BY month, "fileType" ORDER BY month ASC
    `;
    const monthlyTypeMap: Record<string, Record<string, number>> = {};
    for (const row of monthlyTypeRaw) {
      if (!monthlyTypeMap[row.month]) monthlyTypeMap[row.month] = {};
      monthlyTypeMap[row.month][row.fileType] = Number(row.count);
    }
    const fileTypeTrend = Object.entries(monthlyTypeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, types]) => ({ month, ...types }));

    // Top 10 largest files (limited query)
    const topFilesRaw = await db.$queryRaw<Array<{ id: string; fileName: string; fileSize: number; fileType: string }>>`
      SELECT "id", "fileName", "fileSize", "fileType"
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      ORDER BY "fileSize" DESC LIMIT 10
    `;
    const topFiles = topFilesRaw;

    // Activity data - by hour and day of week (SQL GROUP BY)
    const activityHourRaw = await db.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT CAST(strftime('%H', "createdAt") AS INTEGER) as hour, COUNT(*) as count
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      GROUP BY hour
    `;
    const activityByHour: number[] = new Array(24).fill(0);
    for (const row of activityHourRaw) {
      if (row.hour >= 0 && row.hour < 24) activityByHour[row.hour] = Number(row.count);
    }

    const activityDayRaw = await db.$queryRaw<Array<{ dow: number; count: bigint }>>`
      SELECT CAST(strftime('%w', "createdAt") AS INTEGER) as dow, COUNT(*) as count
      FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false
      GROUP BY dow
    `;
    const activityByDayOfWeek: number[] = new Array(7).fill(0);
    for (const row of activityDayRaw) {
      // SQLite %w: 0=Sun, convert to Mon=0
      const idx = row.dow === 0 ? 6 : row.dow - 1;
      if (idx >= 0 && idx < 7) activityByDayOfWeek[idx] = Number(row.count);
    }

    // Most used tags - fetch only active files' tags column (limited data)
    const tagsRaw = await db.$queryRaw<Array<{ tags: string | null }>>`
      SELECT "tags" FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false AND "tags" IS NOT NULL AND "tags" != '[]'
    `;
    const tagCount: Record<string, number> = {};
    for (const row of tagsRaw) {
      if (row.tags) {
        const tags = safeJsonParseArray(row.tags) as string[];
        for (const tag of tags) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
    }
    const topTags = Object.entries(tagCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Storage prediction (simple linear regression based on recent monthly data)
    const months = fileGrowth.length;
    let predicted1Month = 0;
    let predicted3Months = 0;
    let predicted6Months = 0;

    if (months >= 2) {
      // Estimate recent size growth using storage stats
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const [recentSizeRow] = await db.$queryRaw<Array<{ totalSize: bigint }>>`
        SELECT COALESCE(SUM("fileSize"), 0) as "totalSize"
        FROM "File" WHERE "userId" = ${userId} AND "isDeleted" = false AND "createdAt" >= ${threeMonthsAgo.toISOString()}
      `;
      const recentSizeGrowth = Number(recentSizeRow.totalSize);
      const avgMonthlySize = recentSizeGrowth / 3;

      predicted1Month = totalSize + avgMonthlySize;
      predicted3Months = totalSize + avgMonthlySize * 3;
      predicted6Months = totalSize + avgMonthlySize * 6;
    }

    // Storage efficiency score
    const [taggedRow] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "File"
      WHERE "userId" = ${userId} AND "isDeleted" = false AND "tags" IS NOT NULL AND "tags" != '[]'
    `;
    const tagUsageRatio = totalFiles > 0 ? Number(taggedRow.count) / totalFiles : 0;
    const efficiencyScore = Math.min(100, Math.round(
      (tagUsageRatio * 40) + (totalFiles > 0 ? 30 : 0) + (topTags.length > 0 ? 30 : 0)
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
        totalFiles,
        totalSize,
        avgFileSize,
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
