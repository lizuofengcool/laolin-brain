/**
 * AI 工具执行器
 * 接收 Function Calling 的调用请求，执行对应操作并返回结果
 */

import { db } from "@/lib/db";

interface ToolExecutionResult {
  success: boolean;
  data: unknown;
  error?: string;
}

/** 解析 tags 字符串为数组 */
function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  return tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
}

/** 将 tags 数组序列化为字符串 */
function serializeTags(tags: string[]): string {
  return tags.join(",");
}

/**
 * 执行 AI 工具调用
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  try {
    switch (toolName) {
      case "search_files":
        return await searchFiles(args, userId, tenantId);
      case "list_files":
        return await listFiles(args, userId, tenantId);
      case "add_tags":
        return await addTags(args, userId, tenantId);
      case "toggle_favorite":
        return await toggleFavorite(args, userId, tenantId);
      case "delete_file":
        return await deleteFile(args, userId, tenantId);
      case "get_file_info":
        return await getFileInfo(args, userId, tenantId);
      case "get_analytics":
        return await getAnalytics(userId, tenantId);
      case "summarize_file":
        return await summarizeFile(args, userId, tenantId);
      case "create_folder":
        return await createFolder(args, userId, tenantId);
      case "list_folders":
        return await listFolders(args, userId, tenantId);
      case "move_file":
        return await moveFile(args, userId, tenantId);
      case "rename_file":
        return await renameFile(args, userId, tenantId);
      case "batch_tag":
        return await batchTag(args, userId, tenantId);
      case "batch_delete":
        return await batchDelete(args, userId, tenantId);
      case "get_recent_files":
        return await getRecentFiles(args, userId, tenantId);
      default:
        return { success: false, data: null, error: `未知工具: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "工具执行失败",
    };
  }
}

async function searchFiles(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const query = String(args.query || "");
  const fileType = args.fileType as string | undefined;
  const limit = Number(args.limit) || 10;

  const where: Record<string, unknown> = {
    userId,
    tenantId,
    isDeleted: false,
  };

  if (fileType) {
    where.fileType = fileType;
  }

  const nameResults = await db.file.findMany({
    where: {
      ...where,
      OR: [
        { fileName: { contains: query } },
        { tags: { contains: query } },
        { summary: { contains: query } },
        { textContent: { contains: query } },
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      tags: true,
      summary: true,
      textContent: true,
      updatedAt: true,
      isFavorite: true,
    },
  });

  const files = nameResults.map((f) => {
    let contentPreview: string | null = null;
    if (f.textContent) {
      const idx = f.textContent.toLowerCase().indexOf(query.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(f.textContent.length, idx + query.length + 50);
        contentPreview = (start > 0 ? "..." : "") + f.textContent.slice(start, end) + (end < f.textContent.length ? "..." : "");
      } else {
        contentPreview = f.textContent.slice(0, 80) + (f.textContent.length > 80 ? "..." : "");
      }
    }

    return {
      id: f.id,
      name: f.fileName,
      type: f.fileType,
      size: formatSize(f.fileSize),
      tags: parseTags(f.tags),
      summary: f.summary ? f.summary.slice(0, 100) + (f.summary.length > 100 ? "..." : "") : null,
      contentPreview,
      updatedAt: f.updatedAt.toISOString().split("T")[0],
      isFavorite: f.isFavorite,
    };
  });

  return {
    success: true,
    data: {
      total: files.length,
      files,
    },
  };
}

async function listFiles(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileType = args.fileType as string | undefined;
  const favoriteOnly = args.favoriteOnly as boolean | undefined;
  const tag = args.tag as string | undefined;
  const sortBy = (args.sortBy as string) || "dateDesc";
  const limit = Number(args.limit) || 20;

  const where: Record<string, unknown> = {
    userId,
    tenantId,
    isDeleted: false,
  };

  if (fileType) where.fileType = fileType;
  if (favoriteOnly) where.isFavorite = true;
  if (tag) where.tags = { contains: tag };

  const orderMap: Record<string, Record<string, string>> = {
    dateDesc: { updatedAt: "desc" },
    dateAsc: { updatedAt: "asc" },
    nameAsc: { fileName: "asc" },
    nameDesc: { fileName: "desc" },
    sizeDesc: { fileSize: "desc" },
    sizeAsc: { fileSize: "asc" },
  };

  const files = await db.file.findMany({
    where,
    take: limit,
    orderBy: orderMap[sortBy] || { updatedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      tags: true,
      summary: true,
      updatedAt: true,
      isFavorite: true,
    },
  });

  return {
    success: true,
    data: {
      total: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.fileName,
        type: f.fileType,
        size: formatSize(f.fileSize),
        tags: parseTags(f.tags),
        summary: f.summary ? f.summary.slice(0, 100) : null,
        updatedAt: f.updatedAt.toISOString().split("T")[0],
        isFavorite: f.isFavorite,
      })),
    },
  };
}

async function addTags(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);
  const tagsStr = String(args.tags);

  const file = await db.file.findFirst({
    where: { id: fileId, userId, tenantId, isDeleted: false },
  });

  if (!file) {
    return { success: false, data: null, error: "文件不存在" };
  }

  const existingTags = parseTags(file.tags);
  const newTags = tagsStr.split(/[,，、]/).map((t) => t.trim()).filter(Boolean);
  const mergedTags = [...new Set([...existingTags, ...newTags])];

  await db.file.update({
    where: { id: fileId },
    data: { tags: serializeTags(mergedTags) },
  });

  return {
    success: true,
    data: {
      fileId,
      fileName: file.fileName,
      tags: mergedTags,
      added: newTags,
    },
  };
}

async function toggleFavorite(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);
  const favorite = args.favorite as boolean;

  const file = await db.file.findFirst({
    where: { id: fileId, userId, tenantId, isDeleted: false },
  });

  if (!file) {
    return { success: false, data: null, error: "文件不存在" };
  }

  await db.file.update({
    where: { id: fileId },
    data: { isFavorite: favorite },
  });

  return {
    success: true,
    data: {
      fileId,
      fileName: file.fileName,
      isFavorite: favorite,
      action: favorite ? "已收藏" : "已取消收藏",
    },
  };
}

async function deleteFile(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);

  const file = await db.file.findFirst({
    where: { id: fileId, userId, tenantId, isDeleted: false },
  });

  if (!file) {
    return { success: false, data: null, error: "文件不存在" };
  }

  await db.file.update({
    where: { id: fileId },
    data: { isDeleted: true },
  });

  return {
    success: true,
    data: {
      fileId,
      fileName: file.fileName,
      action: "已移到回收站",
    },
  };
}

async function getFileInfo(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);

  const file = await db.file.findFirst({
    where: { id: fileId, userId, tenantId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      tags: true,
      summary: true,
      textContent: true,
      isFavorite: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
      folderId: true,
      storageMode: true,
    },
  });

  if (!file) {
    return { success: false, data: null, error: "文件不存在" };
  }

  return {
    success: true,
    data: {
      ...file,
      tags: parseTags(file.tags),
      fileSize: formatSize(file.fileSize),
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    },
  };
}

async function getAnalytics(userId: string, tenantId: string): Promise<ToolExecutionResult> {
  const [totalFiles, totalSize, typeBreakdown, favoriteCount, trashCount] = await Promise.all([
    db.file.count({ where: { userId, tenantId, isDeleted: false } }),
    db.file.aggregate({ where: { userId, tenantId, isDeleted: false }, _sum: { fileSize: true } }),
    db.file.groupBy({
      by: ["fileType"],
      where: { userId, tenantId, isDeleted: false },
      _count: { fileType: true },
      _sum: { fileSize: true },
    }),
    db.file.count({ where: { userId, tenantId, isDeleted: false, isFavorite: true } }),
    db.file.count({ where: { userId, tenantId, isDeleted: true } }),
  ]);

  return {
    success: true,
    data: {
      totalFiles,
      totalSize: formatSize(totalSize._sum.fileSize || 0),
      favoriteCount,
      trashCount,
      typeBreakdown: typeBreakdown.map((t) => ({
        type: t.fileType,
        count: t._count.fileType,
        size: formatSize(t._sum.fileSize || 0),
      })),
    },
  };
}

async function summarizeFile(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);

  const file = await db.file.findFirst({
    where: { id: fileId, userId, tenantId, isDeleted: false },
    select: {
      id: true,
      fileName: true,
      summary: true,
      fileType: true,
      textContent: true,
    },
  });

  if (!file) {
    return { success: false, data: null, error: "文件不存在" };
  }

  if (file.summary) {
    return {
      success: true,
      data: {
        fileId: file.id,
        fileName: file.fileName,
        summary: file.summary,
        source: "cached",
      },
    };
  }

  return {
    success: true,
    data: {
      fileId: file.id,
      fileName: file.fileName,
      summary: file.textContent ? file.textContent.slice(0, 200) + "..." : "暂无摘要，请先在文件管理中处理该文件以生成摘要。",
      source: "fallback",
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

async function createFolder(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const name = String(args.name);
  const parentId = args.parentId ? String(args.parentId) : null;

  const existing = await db.folder.findFirst({
    where: { userId, tenantId, name, parentId },
  });
  if (existing) {
    return { success: false, data: null, error: `文件夹"${name}"已存在` };
  }

  const folder = await db.folder.create({
    data: { userId, tenantId, name, parentId },
  });

  return {
    success: true,
    data: { id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt.toISOString() },
  };
}

async function listFolders(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const parentId = args.parentId ? String(args.parentId) : null;

  const folders = await db.folder.findMany({
    where: { userId, tenantId, parentId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      _count: { select: { files: { where: { isDeleted: false } } } },
    },
  });

  return {
    success: true,
    data: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      fileCount: f._count.files,
    })),
  };
}

async function moveFile(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);
  const folderId = args.folderId === "null" ? null : (args.folderId ? String(args.folderId) : null);

  const file = await db.file.findFirst({ where: { id: fileId, userId, tenantId, isDeleted: false } });
  if (!file) return { success: false, data: null, error: "文件不存在" };

  if (folderId) {
    const folder = await db.folder.findFirst({ where: { id: folderId, userId, tenantId } });
    if (!folder) return { success: false, data: null, error: "目标文件夹不存在" };
  }

  await db.file.update({ where: { id: fileId }, data: { folderId } });

  return {
    success: true,
    data: { fileId, fileName: file.fileName, folderId, action: folderId ? "已移动到文件夹" : "已移到根目录" },
  };
}

async function renameFile(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileId = String(args.fileId);
  const newName = String(args.newName);

  const file = await db.file.findFirst({ where: { id: fileId, userId, tenantId, isDeleted: false } });
  if (!file) return { success: false, data: null, error: "文件不存在" };

  await db.file.update({ where: { id: fileId }, data: { fileName: newName } });

  return {
    success: true,
    data: { fileId, oldName: file.fileName, newName, action: "已重命名" },
  };
}

async function batchTag(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileIds = String(args.fileIds).split(",").map((s) => s.trim()).filter(Boolean);
  const tagsStr = String(args.tags);
  const newTags = tagsStr.split(/[,，、]/).map((t) => t.trim()).filter(Boolean);

  const files = await db.file.findMany({
    where: { id: { in: fileIds }, userId, tenantId, isDeleted: false },
    select: { id: true, fileName: true, tags: true },
  });

  if (files.length === 0) return { success: false, data: null, error: "未找到匹配的文件" };

  const results: { fileId: string; name: string; tags: string[] }[] = [];
  for (const file of files) {
    const existingTags = parseTags(file.tags);
    const mergedTags = [...new Set([...existingTags, ...newTags])];
    await db.file.update({ where: { id: file.id }, data: { tags: serializeTags(mergedTags) } });
    results.push({ fileId: file.id, name: file.fileName, tags: mergedTags });
  }

  return {
    success: true,
    data: { processed: results.length, skipped: fileIds.length - files.length, results },
  };
}

async function batchDelete(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const fileIds = String(args.fileIds).split(",").map((s) => s.trim()).filter(Boolean);

  const result = await db.file.updateMany({
    where: { id: { in: fileIds }, userId, tenantId, isDeleted: false },
    data: { isDeleted: true },
  });

  return {
    success: true,
    data: { deleted: result.count, total: fileIds.length, action: "已移到回收站" },
  };
}

async function getRecentFiles(
  args: Record<string, unknown>,
  userId: string,
  tenantId: string,
): Promise<ToolExecutionResult> {
  const limit = Number(args.limit) || 10;

  const files = await db.file.findMany({
    where: { userId, tenantId, isDeleted: false },
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      tags: true,
      summary: true,
      updatedAt: true,
    },
  });

  return {
    success: true,
    data: {
      total: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.fileName,
        type: f.fileType,
        size: formatSize(f.fileSize),
        tags: parseTags(f.tags),
        summary: f.summary ? f.summary.slice(0, 100) : null,
        updatedAt: f.updatedAt.toISOString().split("T")[0],
      })),
    },
  };
}
