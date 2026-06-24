/**
 * 智能推荐系统
 * 支持基于内容、基于协同过滤、基于访问历史的混合推荐
 */

import { db } from "@/lib/db";

// 推荐类型
export type RecommendationType =
  | "home" // 首页推荐
  | "related" // 相关文件推荐
  | "search" // 搜索推荐
  | "daily"; // 每日推荐

// 推荐算法类型
export type RecommendationAlgorithm =
  | "content-based" // 基于内容
  | "collaborative" // 协同过滤
  | "history-based" // 基于访问历史
  | "hybrid"; // 混合推荐

// 推荐结果
export interface Recommendation {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  score: number;
  reasons: string[]; // 推荐理由
  algorithm: RecommendationAlgorithm;
  tags?: string[];
  thumbnailUrl?: string;
}

// 推荐选项
export interface RecommendationOptions {
  type: RecommendationType;
  limit?: number;
  algorithm?: RecommendationAlgorithm;
  fileId?: string; // 相关文件推荐时的源文件ID
  searchQuery?: string; // 搜索推荐时的查询词
  includeReasons?: boolean;
}

// 用户行为类型
export type UserActionType =
  | "view" // 查看
  | "download" // 下载
  | "favorite" // 收藏
  | "share" // 分享
  | "search" // 搜索
  | "comment"; // 评论

// 行为权重
const ACTION_WEIGHTS: Record<UserActionType, number> = {
  view: 1,
  download: 3,
  favorite: 5,
  share: 4,
  search: 2,
  comment: 2,
};

/**
 * 获取首页推荐
 */
export async function getHomeRecommendations(
  userId: string,
  tenantId: string,
  limit: number = 10
): Promise<Recommendation[]> {
  // 混合推荐：60%基于访问历史 + 40%基于内容
  const historyRecs = await getHistoryBasedRecommendations(userId, tenantId, limit);
  const contentRecs = await getContentBasedRecommendations(userId, tenantId, limit);

  // 合并并去重
  const merged = mergeRecommendations([
    { recs: historyRecs, weight: 0.6 },
    { recs: contentRecs, weight: 0.4 },
  ]);

  return merged.slice(0, limit);
}

/**
 * 获取相关文件推荐
 */
export async function getRelatedRecommendations(
  fileId: string,
  userId: string,
  tenantId: string,
  limit: number = 10
): Promise<Recommendation[]> {
  // 获取源文件信息
  const sourceFile = await db.file.findFirst({
    where: { id: fileId, tenantId, userId, isDeleted: false },
  });

  if (!sourceFile) {
    return [];
  }

  const sourceTags = sourceFile.tags ? JSON.parse(sourceFile.tags) : [];

  // 基于内容推荐（标签、类型相似）
  const files = await db.file.findMany({
    where: {
      tenantId,
      userId,
      isDeleted: false,
      id: { not: fileId },
    },
    take: limit * 3, // 多取一些用于排序
    orderBy: { createdAt: "desc" },
  });

  const recommendations: Recommendation[] = files
    .map((file) => {
      const fileTags = file.tags ? JSON.parse(file.tags) : [];

      // 计算相似度
      let score = 0;
      const reasons: string[] = [];

      // 标签相似度
      const commonTags = sourceTags.filter((tag: string) => fileTags.includes(tag));
      const tagSimilarity =
        sourceTags.length > 0
          ? commonTags.length / Math.max(sourceTags.length, fileTags.length)
          : 0;

      if (tagSimilarity > 0) {
        score += tagSimilarity * 5;
        if (commonTags.length > 0) {
          reasons.push(`有 ${commonTags.length} 个相同标签`);
        }
      }

      // 文件类型相同
      if (file.fileType === sourceFile.fileType) {
        score += 2;
        reasons.push("相同文件类型");
      }

      // 同一文件夹
      if (file.folderId && file.folderId === sourceFile.folderId) {
        score += 1.5;
        reasons.push("同一文件夹");
      }

      // 时间接近（最近创建的权重稍高）
      const daysDiff =
        Math.abs(
          new Date(file.createdAt).getTime() - new Date(sourceFile.createdAt).getTime()
        ) / (1000 * 60 * 60 * 24);
      if (daysDiff < 30) {
        score += (30 - daysDiff) / 30;
      }

      return {
        fileId: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        score,
        reasons,
        algorithm: "content-based" as RecommendationAlgorithm,
        tags: fileTags,
        thumbnailUrl: file.thumbnailUrl || undefined,
      };
    })
    .filter((rec) => rec.score > 0)
    .sort((a, b) => b.score - a.score);

  return recommendations.slice(0, limit);
}

/**
 * 获取搜索推荐
 */
export async function getSearchRecommendations(
  query: string,
  userId: string,
  tenantId: string,
  limit: number = 5
): Promise<Recommendation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // 简单的搜索推荐：基于关键词匹配文件名和标签
  const files = await db.file.findMany({
    where: {
      tenantId,
      userId,
      isDeleted: false,
      OR: [
        {
          fileName: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          tags: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return files.map((file) => {
    const tags = file.tags ? JSON.parse(file.tags) : [];
    const reasons: string[] = [];

    if (file.fileName.toLowerCase().includes(query.toLowerCase())) {
      reasons.push("文件名匹配");
    }
    if (tags.some((tag: string) => tag.toLowerCase().includes(query.toLowerCase()))) {
      reasons.push("标签匹配");
    }

    return {
      fileId: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      score: 1,
      reasons,
      algorithm: "content-based" as RecommendationAlgorithm,
      tags,
      thumbnailUrl: file.thumbnailUrl || undefined,
    };
  });
}

/**
 * 获取每日推荐
 */
export async function getDailyRecommendations(
  userId: string,
  tenantId: string,
  limit: number = 5
): Promise<Recommendation[]> {
  // 每日推荐：随机选择一些用户可能感兴趣的文件
  // 优先选择最近上传但还没看过的文件
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 获取最近30天的文件
  const files = await db.file.findMany({
    where: {
      tenantId,
      userId,
      isDeleted: false,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (files.length === 0) {
    return [];
  }

  // 获取用户最近访问的文件
  const recentAccesses = await db.accessHistory.findMany({
    where: {
      tenantId,
      userId,
      lastAccessedAt: { gte: thirtyDaysAgo },
    },
    select: { fileId: true },
  });

  const accessedFileIds = new Set(recentAccesses.map((a) => a.fileId));

  // 优先推荐未访问过的文件
  const unaccessedFiles = files.filter((f) => !accessedFileIds.has(f.id));
  const candidates = unaccessedFiles.length > 0 ? unaccessedFiles : files;

  // 随机选择
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, limit);

  return selected.map((file) => ({
    fileId: file.id,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    score: 1,
    reasons: ["每日精选", "近期上传"],
    algorithm: "history-based" as RecommendationAlgorithm,
    tags: file.tags ? JSON.parse(file.tags) : [],
    thumbnailUrl: file.thumbnailUrl || undefined,
  }));
}

/**
 * 基于内容的推荐
 */
async function getContentBasedRecommendations(
  userId: string,
  tenantId: string,
  limit: number
): Promise<Recommendation[]> {
  // 获取用户的标签偏好
  const userFiles = await db.file.findMany({
    where: { tenantId, userId, isDeleted: false },
    select: { tags: true, fileType: true },
    take: 100,
  });

  // 统计用户偏好的标签和类型
  const tagCount = new Map<string, number>();
  const typeCount = new Map<string, number>();

  for (const file of userFiles) {
    const tags = file.tags ? JSON.parse(file.tags) : [];
    for (const tag of tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
    typeCount.set(file.fileType, (typeCount.get(file.fileType) || 0) + 1);
  }

  // 获取所有文件并计算推荐分数
  const allFiles = await db.file.findMany({
    where: { tenantId, userId, isDeleted: false },
    take: limit * 5,
    orderBy: { createdAt: "desc" },
  });

  const recommendations: Recommendation[] = allFiles.map((file) => {
    const tags = file.tags ? JSON.parse(file.tags) : [];
    let score = 0;
    const reasons: string[] = [];

    // 标签匹配度
    for (const tag of tags) {
      if (tagCount.has(tag)) {
        score += tagCount.get(tag)! * 0.1;
      }
    }

    // 类型匹配
    if (typeCount.has(file.fileType)) {
      score += typeCount.get(file.fileType)! * 0.05;
      reasons.push("符合你的文件类型偏好");
    }

    // 新文件加分
    const daysOld =
      (Date.now() - new Date(file.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) {
      score += (7 - daysOld) / 7;
      reasons.push("最近上传");
    }

    return {
      fileId: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      score,
      reasons,
      algorithm: "content-based" as RecommendationAlgorithm,
      tags,
      thumbnailUrl: file.thumbnailUrl || undefined,
    };
  });

  return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * 基于访问历史的推荐
 */
async function getHistoryBasedRecommendations(
  userId: string,
  tenantId: string,
  limit: number
): Promise<Recommendation[]> {
  // 获取用户的访问历史
  const accessHistory = await db.accessHistory.findMany({
    where: { tenantId, userId },
    orderBy: { lastAccessedAt: "desc" },
    take: 50,
    include: { file: true },
  });

  if (accessHistory.length === 0) {
    return [];
  }

  // 计算每个文件的兴趣分数
  const fileScores = new Map<string, { score: number; file: any; reasons: string[] }>();

  for (const access of accessHistory) {
    if (!access.file || access.file.isDeleted) continue;

    const existing = fileScores.get(access.fileId) || {
      score: 0,
      file: access.file,
      reasons: [],
    };

    // 基于访问次数和最近访问时间计算分数
    const recencyScore =
      1 /
      (1 +
        (Date.now() - new Date(access.lastAccessedAt).getTime()) /
          (1000 * 60 * 60 * 24 * 7)); // 7天半衰期
    const frequencyScore = Math.log10(access.accessCount + 1);

    existing.score += recencyScore * 2 + frequencyScore;
    existing.reasons.push("你经常访问");

    fileScores.set(access.fileId, existing);
  }

  // 转换为推荐列表
  const recommendations: Recommendation[] = Array.from(fileScores.values())
    .map((item) => ({
      fileId: item.file.id,
      fileName: item.file.fileName,
      fileType: item.file.fileType,
      fileSize: item.file.fileSize,
      score: item.score,
      reasons: Array.from(new Set(item.reasons)),
      algorithm: "history-based" as RecommendationAlgorithm,
      tags: item.file.tags ? JSON.parse(item.file.tags) : [],
      thumbnailUrl: item.file.thumbnailUrl || undefined,
    }))
    .sort((a, b) => b.score - a.score);

  return recommendations.slice(0, limit);
}

/**
 * 合并多个推荐结果
 */
function mergeRecommendations(
  sources: Array<{ recs: Recommendation[]; weight: number }>
): Recommendation[] {
  const merged = new Map<string, Recommendation>();

  for (const source of sources) {
    for (const rec of source.recs) {
      const existing = merged.get(rec.fileId);

      if (existing) {
        // 合并分数
        existing.score += rec.score * source.weight;
        existing.reasons = [...new Set([...existing.reasons, ...rec.reasons])];
      } else {
        merged.set(rec.fileId, {
          ...rec,
          score: rec.score * source.weight,
          algorithm: "hybrid",
        });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

/**
 * 记录用户行为
 */
export async function recordUserAction(
  userId: string,
  tenantId: string,
  fileId: string,
  actionType: UserActionType,
  details?: any
): Promise<void> {
  try {
    // 更新访问历史
    if (actionType === "view") {
      await db.accessHistory.upsert({
        where: {
          tenantId_userId_fileId_accessType: {
            tenantId,
            userId,
            fileId,
            accessType: "view",
          },
        },
        update: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
        create: {
          tenantId,
          userId,
          fileId,
          accessType: "view",
          accessCount: 1,
          lastAccessedAt: new Date(),
        },
      });
    }

    // 记录活动日志
    await db.activityLog.create({
      data: {
        tenantId,
        userId,
        action: actionType,
        resourceType: "file",
        resourceId: fileId,
        details: details ? JSON.stringify(details) : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to record user action:", error);
  }
}

/**
 * 获取用户兴趣标签
 */
export async function getUserInterestTags(
  userId: string,
  tenantId: string,
  limit: number = 10
): Promise<Array<{ tag: string; score: number }>> {
  // 基于用户的文件和访问历史计算兴趣标签
  const files = await db.file.findMany({
    where: { tenantId, userId, isDeleted: false },
    select: { tags: true },
    take: 200,
  });

  const tagScores = new Map<string, number>();

  for (const file of files) {
    const tags = file.tags ? JSON.parse(file.tags) : [];
    for (const tag of tags) {
      tagScores.set(tag, (tagScores.get(tag) || 0) + 1);
    }
  }

  // 转换为数组并排序
  const result = Array.from(tagScores.entries())
    .map(([tag, score]) => ({ tag, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return result;
}
